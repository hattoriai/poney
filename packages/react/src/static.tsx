/** @jsxRuntime automatic @jsxImportSource react */
/**
 * Headless rendering: a walkthrough scene to SVG or PNG, in Node.
 *
 * Text is measured with the same font files the PNG is drawn with, so labels
 * fit their boxes. The SVG is self-contained: colours are resolved (no CSS
 * variables), opacity is inlined, and fonts are embedded on request.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import * as fontkit from 'fontkit'
import { indexOf, marksOf, parseRef, plainText, type PoneyDocument, type Scene, type View } from '@poney/core'
import { layoutView, setTextMeasurer, wrap, type FontFamily } from '@poney/layout'
import { StoryProvider, type Mode } from './context'
import { RenderProvider } from './render'
import { findScene, fit, sceneFrame, sceneLayoutOptions, storyState } from './scene'
import { FONTS, THEMES, type ThemeName } from './theme'
import { SceneStory } from './SceneStory'
import { stepLetter } from './emphasis'
import { diagramFor } from './diagrams/registry'

/** View types drawn as walkthrough stories; the others draw with their diagram renderer. */
const STORY_TYPES: string[] = ['map', 'sequence', 'state']

const require = createRequire(import.meta.url)

/* ─── Fonts ───────────────────────────────────────────────────────────────── */

const SANS_FILES: Record<number, string> = {
  400: '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-400-normal.woff2',
  500: '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-500-normal.woff2',
  600: '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-600-normal.woff2',
  700: '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-700-normal.woff2',
}
const MONO_FILE = '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'

type Font = { layout(text: string): { advanceWidth: number }; unitsPerEm: number }
let fonts: { sans: Record<number, Font>; mono: Font; files: Record<string, Buffer> } | undefined

function loadFonts() {
  if (fonts) return fonts
  const files: Record<string, Buffer> = {}
  const sans: Record<number, Font> = {}
  for (const [w, f] of Object.entries(SANS_FILES)) {
    files[`sans-${w}`] = readFileSync(require.resolve(f))
    sans[Number(w)] = fontkit.create(files[`sans-${w}`]) as unknown as Font
  }
  files.mono = readFileSync(require.resolve(MONO_FILE))
  fonts = { sans, mono: fontkit.create(files.mono) as unknown as Font, files }
  return fonts
}

const nearest = (weight: number) => [400, 500, 600, 700].reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a))

/** Measures text with the real font files. Call before laying out in Node. */
export function useNodeTextMeasurer() {
  const f = loadFonts()
  setTextMeasurer((text: string, size: number, weight: number, family: FontFamily) => {
    const font = family === 'mono' ? f.mono : f.sans[nearest(weight)]
    return (font.layout(text).advanceWidth / font.unitsPerEm) * size
  })
}

/* ─── Rendering ───────────────────────────────────────────────────────────── */

export interface RenderSceneOptions {
  /** Walkthrough id. Default: the first. */
  walkthrough?: string
  /** Scene id, or "overview". Default: the overview, else the first scene with a view. */
  scene?: string
  /** Render a view directly, outside any walkthrough. */
  view?: string
  mode?: Mode
  theme?: ThemeName
  /** Width of the output in pixels. Height follows the scene. */
  width?: number
  /** Embed the fonts in the SVG, so it looks the same everywhere. */
  embedFonts?: boolean
  /** Write the numbered callout notes under the picture. Default: true. */
  legend?: boolean
}

export interface RenderedScene {
  svg: string
  width: number
  height: number
  title: string
}

const PAD = 40

/** A plain name for a ref, for a step without a caption. */
function describeRef(idx: ReturnType<typeof indexOf>, key: string): string | undefined {
  const r = parseRef(key)
  if (!r || !idx.exists(r)) return undefined
  return idx.describe(r).title
}

export async function renderScene(doc: PoneyDocument, options: RenderSceneOptions = {}): Promise<RenderedScene> {
  useNodeTextMeasurer()
  const idx = indexOf(doc)
  let view: View | undefined
  let focus: string[] = []
  let callouts: string[] = []
  let notes: string[] = []
  let title = ''
  let sceneData: Scene | undefined
  let walkthrough = options.walkthrough ? doc.walkthroughs.find((w) => w.id === options.walkthrough) : doc.walkthroughs[0]
  if (options.view) {
    view = idx.views.get(options.view)
    if (!view) throw new Error(`No view "${options.view}". Views: ${doc.views.map((v) => v.id).join(', ')}`)
    title = view.title
    walkthrough = options.walkthrough ? walkthrough : undefined
  } else {
    const found = findScene(doc, options.walkthrough, options.scene)
    if (!found) {
      const w = walkthrough
      const ids = w ? ['overview', ...w.scenes.filter((s) => s.view).map((s) => s.id)].join(', ') : 'none'
      throw new Error(`No scene "${options.scene ?? '(default)'}" with a view. Scenes: ${ids}`)
    }
    walkthrough = found.walkthrough
    view = idx.views.get(found.viewId)!
    focus = found.focus
    callouts = found.callouts
    notes = found.notes
    title = found.title
    sceneData = found.scene
  }
  // Map, sequence and state views draw as stories (marks, focus, callouts); every other view type draws with its diagram renderer, still.
  const story = STORY_TYPES.includes(view.type)
  const module = story ? undefined : diagramFor(view)
  if (!story && !module) throw new Error(`No renderer for "${view.id}", a ${view.type === 'extension' ? view.extension : view.type} view. Register one with registerDiagram.`)
  const scene = await layoutView(doc, view, story ? sceneLayoutOptions(view, walkthrough, focus) : {})
  const frame = story ? sceneFrame(scene, view, focus, idx, walkthrough) : { x: 0, y: 0, w: scene.width, h: scene.height }
  const natural = { w: frame.w + PAD * 2, h: frame.h + PAD * 2 }
  const width = Math.round(options.width ?? Math.min(1600, Math.max(720, natural.w)))
  const height = Math.round((width * natural.h) / natural.w)
  const vb = fit(frame, width, height, PAD, 10)
  const theme = options.theme ?? 'light'
  const storyValue = storyState({
    marks: walkthrough ? marksOf(walkthrough) : new Map(),
    mode: options.mode ?? 'change',
    view,
    focus,
    callouts,
    idx,
    walkthrough,
    effects: sceneData?.effects,
    badges: sceneData?.badges,
    trace: sceneData?.trace,
    animate: false,
    numberSteps: true,
  })

  const body = renderToStaticMarkup(
    <RenderProvider value={{ idx, still: true }}>
      {module ? (
        <module.Renderer scene={scene} view={view} />
      ) : (
        <StoryProvider value={storyValue}>
          <SceneStory view={view} scene={scene} extra={walkthrough?.removed.entities} />
        </StoryProvider>
      )}
    </RenderProvider>,
  )

  const colors = THEMES[theme]
  // The key: each callout's number and note, under the picture.
  // The key under the picture: numbered notes (round marks), then the steps of the path (square marks).
  const steps = (sceneData?.trace ?? []).map((t, i) => (t.caption ? plainText(t.caption) : (describeRef(idx, t.ref) ?? `Step ${i + 1}`)))
  // A picture draws plain text: inline Markdown in the notes shows without its markers.
  const entries = [...notes.map((text, i) => ({ text: plainText(text), n: i + 1, step: false })), ...steps.map((text, i) => ({ text, n: i + 1, step: true }))]
  const showLegend = options.legend !== false && entries.length > 0
  const scale = vb.w / width
  const textW = width - 2 * 40 - 34
  const legendLines = showLegend ? entries.map((e) => wrap(e.text, textW, 14, 400, 4)) : []
  const legendH = showLegend ? (legendLines.reduce((s, l) => s + l.length, 0) * 20 + entries.length * 8 + 40) * scale : 0
  let ly = vb.y + vb.h + 16 * scale
  const legend = legendLines
    .map((lines, i) => {
      const y = ly
      ly += (lines.length * 20 + 8) * scale
      const x = vb.x + 40 * scale
      const e = entries[i]
      const mark = e.step ? `<rect x="1" y="1" width="20" height="20" rx="6" fill="${colors.accent}"/>` : `<circle cx="11" cy="11" r="11" fill="${colors.ink}"/>`
      return (
        `<g transform="translate(${x} ${y}) scale(${scale})">${mark}` +
        `<text x="11" y="15" text-anchor="middle" font-size="12" font-weight="700" fill="${colors['paper-raised']}">${e.step ? stepLetter(e.n - 1) : e.n}</text>` +
        lines.map((l, k) => `<text x="34" y="${15 + k * 20}" font-size="14" fill="${colors.ink}">${escapeXml(l)}</text>`).join('') +
        `</g>`
      )
    })
    .join('')
  const fontFace = options.embedFonts
    ? `<style>${[400, 500, 600, 700]
        .map((w) => `@font-face{font-family:"Hanken Grotesk";font-weight:${w};src:url(data:font/woff2;base64,${loadFonts().files[`sans-${w}`].toString('base64')}) format("woff2")}`)
        .join('')}</style>`
    : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(height + legendH / scale)}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h + legendH}" font-family="Hanken Grotesk, Helvetica, Arial, sans-serif" role="img">` +
    `<title>${escapeXml(title)}</title>${fontFace}` +
    `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h + legendH}" fill="${colors['paper-raised']}"/>` +
    flatten(body, colors) +
    (showLegend ? `<line x1="${vb.x + 40 * scale}" x2="${vb.x + vb.w - 40 * scale}" y1="${vb.y + vb.h}" y2="${vb.y + vb.h}" stroke="${colors['story-rule']}" stroke-width="${scale}"/>` + legend : '') +
    `</svg>`
  return { svg, width, height: Math.round(height + legendH / scale), title }
}

/** Renders a scene to PNG at twice its size, with the bundled fonts. */
export async function renderScenePng(doc: PoneyDocument, options: RenderSceneOptions = {}): Promise<{ png: Buffer; width: number; height: number; title: string }> {
  const { svg, width, height, title } = await renderScene(doc, { ...options, embedFonts: false })
  const { Resvg } = await import('@resvg/resvg-js')
  const wawoff2 = (await import('wawoff2')).default
  const f = loadFonts()
  const buffers = await Promise.all([400, 500, 600, 700].map(async (w) => Buffer.from(await wawoff2.decompress(f.files[`sans-${w}`]))))
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width * 2 },
    // fontBuffers is supported at run time; the published types predate it.
    font: { fontBuffers: buffers, loadSystemFonts: false, defaultFontFamily: 'Hanken Grotesk' } as Record<string, unknown>,
  })
    .render()
    .asPng()
  return { png: Buffer.from(png), width: width * 2, height: height * 2, title }
}

/**
 * Makes the markup self-contained: CSS variables become colours, opacity
 * classes become attributes, and elements that only show on keyboard focus
 * are dropped.
 */
function flatten(markup: string, colors: Record<string, string>): string {
  return markup
    .replace(/<rect[^>]*class="poney-focus"[^>]*?(?:\/>|><\/rect>)/g, '')
    .replace(/var\(--poney-font-(sans|mono)\)/g, (_, f: 'sans' | 'mono') => FONTS[f].replace(/'/g, ''))
    .replace(/var\(--poney-([a-z0-9-]+)\)/g, (_, name: string) => colors[name] ?? '#888888')
    // Tints are CSS color-mix(); a picture gets the mixed color itself.
    .replace(/color-mix\(in srgb,\s*(#[0-9a-fA-F]{6})\s+([\d.]+)%,\s*(#[0-9a-fA-F]{6}|transparent)\s*\)/g, (_, a: string, pct: string, b: string) => mix(a, Number(pct) / 100, b))
    .replace(/<(\w+)([^>]*?) class="([^"]*)"/g, (all, tag: string, attrs: string, cls: string) => {
      const opacity = cls.includes('poney-story-hidden') ? '0' : cls.includes('poney-story-dim') ? '0.16' : cls.includes('poney-dim') ? '0.3' : undefined
      // A line that carries data flows in the Studio; a still picture draws it dashed.
      const dashed = cls.includes('poney-flowing') ? ' stroke-dasharray="6 4"' : ''
      return opacity || dashed ? `<${tag}${attrs}${opacity ? ` opacity="${opacity}"` : ''}${dashed}` : all
    })
}

/** `a` at `share` over `b` (or, over transparent, `a` with that alpha). */
function mix(a: string, share: number, b: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r, g, bl] = rgb(a)
  if (b === 'transparent') return `rgba(${r},${g},${bl},${share})`
  const [r2, g2, b2] = rgb(b)
  const c = (x: number, y: number) => Math.round(x * share + y * (1 - share)).toString(16).padStart(2, '0')
  return `#${c(r, r2)}${c(g, g2)}${c(bl, b2)}`
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
