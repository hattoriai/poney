/**
 * <poney-diagram>: one Poney view or walkthrough scene in any web page, with
 * no framework. The page gives the document and says what to draw; the
 * element lays it out, draws it, frames it and tells the page what the
 * reader points at and clicks.
 *
 *   <poney-diagram walkthrough="payment-retry" scene="checkout" mode="change">
 *     <script type="application/json">{ …the .poney document… }</script>
 *   </poney-diagram>
 *
 * Attributes:
 *   view                     a view on its own, as in an explorer
 *   walkthrough, scene       a walkthrough scene ("overview" for its overview);
 *                            without a view or scene: the first walkthrough's
 *                            overview, else the document's default view
 *   mode                     before | change | after (scenes; default change)
 *   hot                      a ref key the page points at, e.g. from the text
 *   selection                a ref key to show as selected
 *   trace-step               the trace step to show (0-based); empty: not playing
 *   theme                    light | dark
 *   still                    a picture: no controls, no interaction
 *   fill                     fill the element's own box; without it the
 *                            element takes the height of the scene
 *
 * Property `document`: the document as an object or JSON text. Without it
 * the element reads a <script type="application/json"> child.
 *
 * Events (bubbling, composed): poney-select { ref }, poney-hover { ref },
 * poney-ready { title, view }, poney-error { message, issues? }.
 */
import { indexOf, marksOf, parseRef, refKey, validateDocument, type ModelIndex, type PoneyDocument, type PoneyExtension, type Ref, type ValidationIssue } from '@hattoriai/poney-core'
import { layoutView, setFonts, type Rect, type SceneBase, type ViewLayoutOptions } from '@hattoriai/poney-layout'
import {
  createElement,
  diagramFor,
  drawInto,
  findTarget,
  fit,
  followFrame,
  Icon,
  LUCIDE,
  panViewBox,
  resolve,
  sceneFrame,
  sceneLayoutOptions,
  SceneStory,
  storyState,
  STORY_TYPES,
  toMarkup,
  zoomViewBox,
  type BindFn,
  type Component,
  type Drawing,
  type FoundTarget,
  type Mode,
  type RenderValue,
  type StoryState,
  type ViewBox,
  type ViewState,
} from '@hattoriai/poney-diagrams'

const SVG = 'http://www.w3.org/2000/svg'
const PAD = 32
const MAX_SCALE = 1.25
const GLIDE_MS = 700
/** A pointer must move this far before a press becomes a drag. */
const DRAG_PX = 4

const extensions: PoneyExtension[] = []

/** Format extensions the element understands, for validation. Register before setting a document. */
export function registerElementExtensions(...ext: PoneyExtension[]) {
  for (const e of ext) if (!extensions.includes(e)) extensions.push(e)
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** What the element draws now: the target, its layout and how to draw it. */
interface Current {
  found: FoundTarget
  scene: SceneBase
  layoutKey: string
  /** A walkthrough scene draws as a story; a view on its own draws with its diagram renderer. */
  story: boolean
}

type Props = Record<string, unknown>

export class PoneyDiagramElement extends HTMLElement {
  static observedAttributes = ['view', 'walkthrough', 'scene', 'mode', 'hot', 'selection', 'trace-step', 'theme', 'still', 'fill']

  #doc?: PoneyDocument
  #idx?: ModelIndex
  #svg?: SVGSVGElement
  #message?: HTMLElement
  #drawing?: Drawing<Props>
  #component?: Component<Props>
  #current?: Current
  /** Open groups and expanded tables, by view, as the reader left them. */
  #viewState = new Map<string, ViewState>()
  /** Groups opened or closed in a scene's map. */
  #collapsed?: string[]
  #hot: string | null = null
  #hover: Ref | null = null
  /** What the page last heard the reader points at. */
  #pointed: string | null = null
  #viewBox?: ViewBox
  #raf = 0
  #gliding = false
  /** The view box that frames the scene; zoom and pan move away from it. */
  #home?: ViewBox
  /** The reader zoomed or panned: "Reset view" brings the frame back. */
  #moved = false
  #drag: { x: number; y: number; id: number; moved: boolean } | null = null
  #controls?: { root: HTMLElement; zoom: HTMLElement; reset: HTMLButtonElement }
  #resize?: ResizeObserver
  #pending = false
  #run = 0

  /* ─── The document ─────────────────────────────────────────────────────── */

  get document(): PoneyDocument | undefined {
    return this.#doc
  }

  set document(value: unknown) {
    let input = value
    if (typeof value === 'string') {
      try {
        input = JSON.parse(value)
      } catch (e) {
        this.#fail(`The document is not JSON: ${(e as Error).message}`)
        return
      }
    }
    const result = validateDocument(input, { extensions })
    if (!result.ok) {
      this.#fail('The document is not valid.', result.issues)
      return
    }
    this.#doc = result.document
    this.#idx = indexOf(result.document)
    this.#viewState.clear()
    this.#collapsed = undefined
    this.#current = undefined
    this.#schedule()
  }

  /* ─── Lifecycle ────────────────────────────────────────────────────────── */

  connectedCallback() {
    if (!this.#svg) {
      this.#svg = document.createElementNS(SVG, 'svg')
      this.#svg.setAttribute('class', 'poney-diagram-svg')
      this.#svg.setAttribute('role', 'img')
      this.append(this.#svg)
      this.#camera(this.#svg)
    }
    if (!this.#doc) {
      const script = this.querySelector('script[type="application/json"]')
      if (script?.textContent?.trim()) this.document = script.textContent
    }
    this.#theme()
    // A new size frames the scene again; during a glide, the glide goes to the new frame.
    this.#resize ??= new ResizeObserver(() => this.#frame(this.#gliding))
    this.#resize.observe(this)
    this.#schedule()
  }

  disconnectedCallback() {
    this.#resize?.disconnect()
    cancelAnimationFrame(this.#raf)
  }

  attributeChangedCallback(name: string, before: string | null, after: string | null) {
    if (before === after) return
    if (name === 'theme') return this.#theme()
    if (name === 'still') this.#updateControls()
    if (name === 'view' || name === 'walkthrough' || name === 'scene') {
      this.#collapsed = undefined
      this.#current = undefined
    }
    if (name === 'hot') this.#hot = after || null
    this.#schedule()
  }

  /** Draws again with the document's current state. Updates within one task are drawn once. */
  #schedule() {
    if (this.#pending) return
    this.#pending = true
    queueMicrotask(() => {
      this.#pending = false
      void this.#update()
    })
  }

  /* ─── Layout and drawing ───────────────────────────────────────────────── */

  async #update() {
    const doc = this.#doc
    const idx = this.#idx
    if (!doc || !idx || !this.isConnected || !this.#svg) return
    const run = ++this.#run
    let found: FoundTarget
    try {
      found = findTarget(doc, this.#target(doc))
    } catch (e) {
      return this.#fail((e as Error).message)
    }
    const story = !this.hasAttribute('view') && !!found.walkthrough
    const options = this.#layoutOptions(found, story)
    const layoutKey = JSON.stringify([found.view.id, found.walkthrough?.id, found.scene?.id, options])
    let scene = this.#current?.layoutKey === layoutKey ? this.#current.scene : undefined
    if (!scene) {
      try {
        await this.#fonts()
        scene = await layoutView(doc, found.view, options)
      } catch (e) {
        return this.#fail(`The view "${found.view.id}" could not be laid out: ${(e as Error).message}`)
      }
      // A newer update started while this one waited for the layout.
      if (run !== this.#run) return
    }
    const first = !this.#current || this.#current.found.view.id !== found.view.id
    this.#current = { found, scene, layoutKey, story }
    this.#message?.remove()
    this.#draw()
    this.#frame(!first)
    if (first) this.#emit('poney-ready', { title: found.title, view: found.view.id })
  }

  #target(doc: PoneyDocument) {
    const view = this.getAttribute('view') || undefined
    const walkthrough = this.getAttribute('walkthrough') || undefined
    const scene = this.getAttribute('scene') || undefined
    if (!view && !walkthrough && !scene && !doc.walkthroughs.length) return { view: doc.project.defaultView ?? doc.views[0]?.id }
    return { view, walkthrough, scene }
  }

  #layoutOptions(found: FoundTarget, story: boolean): ViewLayoutOptions {
    if (story) return { ...sceneLayoutOptions(found.view, found.walkthrough, found.focus), ...(this.#collapsed ? { collapsed: this.#collapsed } : {}) }
    const ui = this.#viewState.get(found.view.id)
    return { collapsed: ui?.collapsed, expanded: ui?.expandedTables, controlFlow: ui?.controlFlow }
  }

  /** Measures text with the fonts the page gives the diagrams, once they are loaded. */
  async #fonts() {
    const style = getComputedStyle(this)
    const sans = style.getPropertyValue('--poney-font-sans').trim()
    const mono = style.getPropertyValue('--poney-font-mono').trim()
    if (sans || mono) setFonts({ ...(sans ? { sans } : {}), ...(mono ? { mono } : {}) })
    if (!document.fonts) return
    await Promise.all(
      [sans && `400 13px ${sans}`, sans && `600 13px ${sans}`, mono && `400 12px ${mono}`].filter(Boolean).map((f) => document.fonts.load(f as string).catch(() => undefined)),
    )
  }

  #draw() {
    const cur = this.#current
    const idx = this.#idx
    if (!cur || !idx || !this.#svg) return
    const { found, scene } = cur
    const still = this.hasAttribute('still')
    const render: RenderValue = {
      idx,
      still,
      bind: still ? undefined : this.#bind,
      selection: parseRef(this.getAttribute('selection') ?? '') ?? null,
      hover: this.#hover,
      viewState: (id) => this.#viewState.get(id),
      setViewState: (id, patch) => {
        this.#viewState.set(id, { ...this.#viewState.get(id), ...patch })
        this.#schedule()
      },
    }
    let component: Component<Props>
    let props: Props
    let storyValue: StoryState | undefined
    if (cur.story) {
      component = (STORY_TYPES.includes(found.view.type) ? SceneStory : diagramFor(found.view)?.Renderer) as Component<Props>
      props = STORY_TYPES.includes(found.view.type) ? { view: found.view, scene, extra: found.walkthrough?.removed.entities } : { view: found.view, scene }
      storyValue = this.#story(found)
    } else {
      component = diagramFor(found.view)?.Renderer as Component<Props>
      props = { view: found.view, scene }
    }
    if (!component) return this.#fail(`No renderer for "${found.view.id}", a ${found.view.type === 'extension' ? found.view.extension : found.view.type} view.`)
    this.#svg.setAttribute('aria-label', found.title)
    // A new renderer starts a new drawing; the same renderer keeps its elements and its local state.
    if (this.#drawing && this.#component === component) this.#drawing.update({ render, story: storyValue }, props)
    else {
      this.#svg.replaceChildren()
      this.#drawing = drawInto(this.#svg, component, props, { render, story: storyValue })
      this.#component = component
    }
  }

  #story(found: FoundTarget): StoryState {
    const mode = (this.getAttribute('mode') as Mode | null) ?? 'change'
    const step = this.getAttribute('trace-step')
    const state = storyState({
      marks: found.walkthrough ? marksOf(found.walkthrough) : new Map(),
      mode: mode === 'before' || mode === 'after' ? mode : 'change',
      view: found.view,
      focus: found.focus,
      callouts: found.callouts,
      hot: this.#hot,
      setHot: (key) => {
        if (key === this.#hot) return
        this.#hot = key
        this.#point(key)
        this.#draw()
      },
      idx: this.#idx,
      walkthrough: found.walkthrough,
      effects: found.scene?.effects,
      badges: found.scene?.badges,
      trace: found.scene?.trace,
      traceStep: step === null || step === '' ? null : Number(step),
      animate: !reducedMotion(),
    })
    if (found.view.type !== 'map' || this.hasAttribute('still')) return state
    const view = found.view
    return {
      ...state,
      toggleGroup: (id: string) => {
        const base = this.#collapsed ?? view.collapsed
        this.#collapsed = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
        this.#schedule()
      },
    }
  }

  /** Interaction for every element a renderer draws: the page hears of clicks and hover. */
  #bind: BindFn = (ref, label) => {
    const key = refKey(ref)
    const select = () => {
      this.setAttribute('selection', key)
      this.#emit('poney-select', { ref: key })
    }
    return {
      'data-ref': key,
      'aria-label': label,
      role: 'button',
      tabIndex: 0,
      className: 'poney-el',
      onClick: (e) => {
        e.stopPropagation()
        select()
      },
      onKeyDown: (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        select()
      },
      onMouseEnter: () => this.#hoverOn(ref),
      onMouseLeave: () => this.#hoverOn(null),
    }
  }

  #hoverOn(ref: Ref | null) {
    const key = ref ? refKey(ref) : null
    if ((this.#hover ? refKey(this.#hover) : null) === key) return
    this.#hover = ref
    this.#point(key)
    this.#draw()
  }

  /** Tells the page what the reader points at, once per change: a story has two ways to point (its lines and its boxes). */
  #point(key: string | null) {
    if (key === this.#pointed) return
    this.#pointed = key
    this.#emit('poney-hover', { ref: key })
  }

  /* ─── The camera ───────────────────────────────────────────────────────── */

  /**
   * The part of the scene to show: the focus, or the trace step while it
   * plays (`rect`); and the whole scene's frame (`whole`), which gives the
   * element its height, so the page does not move while a trace plays.
   */
  #frames(): { rect: Rect; whole: Rect } | undefined {
    const cur = this.#current
    if (!cur || !this.#idx) return undefined
    const { found, scene } = cur
    if (!cur.story) {
      const all = { x: 0, y: 0, w: scene.width, h: scene.height }
      return { rect: all, whole: all }
    }
    const whole = sceneFrame(scene, found.view, found.focus, this.#idx, found.walkthrough)
    const step = this.getAttribute('trace-step')
    const ref = step === null || step === '' ? undefined : found.scene?.trace[Number(step)]?.ref
    return { rect: followFrame(scene, whole, ref, this.#idx, found.walkthrough), whole }
  }

  /** Frames the scene: at once, or with a glide from the last frame. */
  #frame(glide: boolean) {
    const svg = this.#svg
    const frames = this.#frames()
    if (!svg || !frames) return
    const { rect, whole } = frames
    if (!this.hasAttribute('fill')) this.style.aspectRatio = `${whole.w + PAD * 2} / ${whole.h + PAD * 2}`
    else this.style.removeProperty('aspect-ratio')
    const box = svg.getBoundingClientRect()
    const W = box.width || whole.w + PAD * 2
    const H = box.height || whole.h + PAD * 2
    const to = fit(rect, W, H, PAD, MAX_SCALE)
    const from = this.#viewBox
    this.#home = to
    this.#moved = false
    this.#updateControls()
    cancelAnimationFrame(this.#raf)
    this.#gliding = false
    if (!glide || !from || reducedMotion()) return this.#show(to)
    this.#gliding = true
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / GLIDE_MS)
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      this.#show({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e })
      if (p < 1) this.#raf = requestAnimationFrame(step)
      else this.#gliding = false
    }
    this.#raf = requestAnimationFrame(step)
  }

  #show(vb: ViewBox) {
    this.#viewBox = vb
    this.#svg?.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
    if (this.#controls) {
      const width = this.#svg?.getBoundingClientRect().width || vb.w
      this.#controls.zoom.textContent = `${Math.round((width / vb.w) * 100)}%`
    }
  }

  /* ─── Zoom and pan ─────────────────────────────────────────────────────── */

  /**
   * The reader's own camera, as in Poney Studio: pinch or ⌘/Ctrl + scroll
   * zooms around the pointer (never the page), dragging with a mouse pans,
   * a double click on empty space zooms in, and the buttons zoom and reset.
   * Plain scrolling scrolls the page, and touch drags scroll it too.
   */
  #camera(svg: SVGSVGElement) {
    const at = (e: { clientX: number; clientY: number }): [number, number] => {
      const r = svg.getBoundingClientRect()
      const fx = (e.clientX - r.left) / (r.width || 1)
      const fy = (e.clientY - r.top) / (r.height || 1)
      // Without a pointer position, the zoom goes around the centre.
      return [Number.isFinite(fx) ? fx : 0.5, Number.isFinite(fy) ? fy : 0.5]
    }
    this.addEventListener(
      'wheel',
      (e) => {
        if (this.hasAttribute('still') || !(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        this.#zoom(Math.exp(-Math.max(-24, Math.min(24, e.deltaY)) * 0.012), ...at(e))
      },
      { passive: false },
    )
    // Safari's pinch: the diagram zooms through the wheel events, so the page must not.
    for (const type of ['gesturestart', 'gesturechange']) this.addEventListener(type, (e) => !this.hasAttribute('still') && e.preventDefault())
    svg.addEventListener('pointerdown', (e) => {
      if (this.hasAttribute('still') || e.button !== 0 || e.pointerType === 'touch') return
      this.#drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }
    })
    svg.addEventListener('pointermove', (e) => {
      const d = this.#drag
      const cur = this.#viewBox
      if (!d || !cur) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return
      if (!d.moved) {
        try {
          svg.setPointerCapture(d.id)
        } catch {
          /* the pointer may already be gone */
        }
        this.classList.add('poney-diagram-dragging')
      }
      d.moved = true
      d.x = e.clientX
      d.y = e.clientY
      const r = svg.getBoundingClientRect()
      cancelAnimationFrame(this.#raf)
      this.#gliding = false
      this.#show(panViewBox(cur, dx, dy, r.width, r.height))
      this.#movedAway()
    })
    const end = () => {
      // A drag must not end as a click on the part under the pointer.
      if (this.#drag?.moved) {
        const swallow = (ev: Event) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      }
      this.#drag = null
      this.classList.remove('poney-diagram-dragging')
    }
    svg.addEventListener('pointerup', end)
    svg.addEventListener('pointercancel', end)
    svg.addEventListener('dblclick', (e) => {
      if (this.hasAttribute('still') || (e.target as Element).closest('[data-ref]')) return
      this.#zoom(1.6, ...at(e))
    })

    const icon = (data: typeof LUCIDE.plus) => toMarkup(resolve(createElement(Icon as Component<never>, { icon: data, size: 14 })))
    const button = (label: string, title: string, html: string, onClick: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.setAttribute('aria-label', label)
      b.title = title
      b.innerHTML = html
      b.addEventListener('click', onClick)
      return b
    }
    const root = document.createElement('div')
    root.className = 'poney-diagram-controls'
    root.setAttribute('role', 'group')
    root.setAttribute('aria-label', 'Zoom')
    // A press on the controls is not the start of a drag on the diagram.
    root.addEventListener('pointerdown', (e) => e.stopPropagation())
    const zoom = document.createElement('span')
    zoom.className = 'poney-diagram-zoom'
    const reset = button('Reset view', 'Reset view', 'Reset view', () => this.#reset())
    reset.className = 'poney-diagram-reset'
    root.append(
      button('Zoom out', 'Zoom out', icon(LUCIDE.minus), () => this.#zoom(1 / 1.3)),
      zoom,
      button('Zoom in', 'Zoom in (or pinch)', icon(LUCIDE.plus), () => this.#zoom(1.3)),
      reset,
    )
    this.append(root)
    this.#controls = { root, zoom, reset }
    this.#updateControls()
  }

  /** Zooms by `factor` around a point given as a fraction of the diagram. */
  #zoom(factor: number, fx = 0.5, fy = 0.5) {
    const cur = this.#viewBox
    const base = this.#home
    if (!cur || !base) return
    cancelAnimationFrame(this.#raf)
    this.#gliding = false
    this.#show(zoomViewBox(cur, base, factor, fx, fy))
    this.#movedAway()
  }

  #movedAway() {
    if (this.#moved) return
    this.#moved = true
    this.#updateControls()
  }

  /** Glides back to the frame of the scene. */
  #reset() {
    this.#frame(true)
  }

  #updateControls() {
    const c = this.#controls
    if (!c) return
    c.root.hidden = this.hasAttribute('still')
    c.reset.hidden = !this.#moved
  }

  /* ─── The page ─────────────────────────────────────────────────────────── */

  #theme() {
    const theme = this.getAttribute('theme')
    if (theme === 'light' || theme === 'dark') this.setAttribute('data-poney-theme', theme)
    else this.removeAttribute('data-poney-theme')
  }

  #emit(type: string, detail: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
  }

  #fail(message: string, issues?: ValidationIssue[]) {
    this.#emit('poney-error', { message, ...(issues ? { issues } : {}) })
    if (!this.#message) {
      this.#message = document.createElement('p')
      this.#message.className = 'poney-diagram-message'
      this.#message.setAttribute('role', 'alert')
    }
    const first = issues?.find((i) => i.severity === 'error')
    this.#message.textContent = first ? `${message} ${first.path ? `${first.path}: ` : ''}${first.message}` : message
    this.append(this.#message)
  }
}

/** Defines <poney-diagram>, once. */
export function definePoneyDiagram(name = 'poney-diagram') {
  if (!customElements.get(name)) customElements.define(name, class extends PoneyDiagramElement {})
}
