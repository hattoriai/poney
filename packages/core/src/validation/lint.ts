import type { PoneyDocument, View, Walkthrough } from '../schema/document'
import { indexOf, type ModelIndex } from '../model/query'
import { parseRef, refKey, type Ref } from '../model/refs'
import { validateDocument, type ValidateOptions, type ValidationIssue } from './validate'

/**
 * Lints: a valid document can still read badly. These checks warn about what
 * makes a walkthrough hard to read — scenes that show too much, notes that
 * point outside the picture, claims without proof — and say how to fix it.
 * They never make a document invalid.
 */

export const LIMITS = {
  mapEntities: 12,
  sequenceMessages: 16,
  sequenceParticipants: 7,
  states: 10,
  viewEntities: 14,
  callouts: 5,
  entityName: 32,
  relationshipLabel: 36,
  messageLabel: 48,
  transitionEvent: 32,
  storyText: 60,
  badge: 18,
  traceSteps: 12,
  /** A changed message also carries a tag, so its label has less room. */
  markedMessageLabel: 40,
} as const

/** View types that walkthroughs draw in the story style, in the Studio and as PNG. */
export const STORY_VIEWS = ['map', 'sequence', 'state'] as const

export function lintDocument(doc: PoneyDocument): ValidationIssue[] {
  const idx = indexOf(doc)
  const out: ValidationIssue[] = []
  const warn = (path: string, code: string, message: string, hint: string) => out.push({ path, message, severity: 'warning', code, hint })

  doc.model.entities.forEach((e, i) => {
    if (e.name.length > LIMITS.entityName)
      warn(`model.entities.${i}.name`, 'long-name', `"${e.name}" is ${e.name.length} characters`, `Keep names under ${LIMITS.entityName} characters; put detail in "summary".`)
  })
  doc.model.relationships.forEach((r, i) => {
    if (r.label.length > LIMITS.relationshipLabel)
      warn(`model.relationships.${i}.label`, 'long-label', `The label "${r.label}" is ${r.label.length} characters`, `Labels sit on lines: keep them under ${LIMITS.relationshipLabel} characters, as a short verb phrase.`)
  })
  doc.model.behaviors.forEach((b, i) => {
    if (b.kind === 'interaction')
      idx.messages(b.id).forEach(({ message }) => {
        if (message.label.length > LIMITS.messageLabel)
          warn(`model.behaviors.${i}`, 'long-label', `Message "${message.id}" has a ${message.label.length}-character label`, `Keep message labels under ${LIMITS.messageLabel} characters; use "description" for detail.`)
      })
    if (b.kind === 'state-machine')
      b.transitions.forEach((t, j) => {
        if (t.event.length > LIMITS.transitionEvent)
          warn(`model.behaviors.${i}.transitions.${j}.event`, 'long-label', `The event "${t.event}" is ${t.event.length} characters`, `Keep events under ${LIMITS.transitionEvent} characters; put conditions in "guard".`)
      })
  })

  doc.walkthroughs.forEach((w, wi) => lintWalkthrough(w, `walkthroughs.${wi}`, idx, warn))

  // Behaviours that no view shows are left over from an earlier draft.
  const shown = new Set(doc.views.flatMap((v) => (v.type === 'sequence' ? [v.interaction] : v.type === 'activity' ? [v.process] : v.type === 'state' ? [v.stateMachine] : [])))
  doc.model.behaviors.forEach((b, i) => {
    if (!shown.has(b.id)) warn(`model.behaviors.${i}`, 'unused-behavior', `No view shows the behavior "${b.id}"`, 'Show it in a scene, or remove it from the model.')
  })
  return out
}

function lintWalkthrough(w: Walkthrough, path: string, idx: ModelIndex, warn: (path: string, code: string, message: string, hint: string) => void) {
  const removed = new Set<string>([
    ...w.removed.entities.map((e) => `entity:${e.id}`),
    ...w.removed.relationships.map((r) => `relationship:${r.id}`),
    ...w.removed.transitions.map((t) => `transition:${t.stateMachine}:${t.transition.id}`),
  ])
  const shows = (view: View, key: string) => {
    const ref = parseRef(key)
    if (!ref) return false
    if (removed.has(refKey(ref))) return removedShownBy(view, ref, w)
    return idx.viewShows(view, ref)
  }

  const tour = w.kind === 'tour'
  if (w.story.text.length < LIMITS.storyText)
    warn(`${path}.story.text`, 'thin-story', 'The story is very short', tour ? 'Say what the code is for and who uses it, in two or three plain sentences.' : 'Say what changes for a person, in two or three plain sentences: who notices, and how.')
  if (!tour && w.marks.length === 0) warn(`${path}.marks`, 'no-marks', 'Nothing is marked new, changed or removed', 'Mark the elements the change adds, changes or removes, so the diagrams can show the change.')

  const shownSomewhere = new Set<string>()
  const views = [w.overview, ...w.scenes.map((s) => s.view)].map((id) => (id ? idx.views.get(id) : undefined)).filter((v): v is View => !!v)
  for (const m of w.marks) if (views.some((v) => shows(v, m.ref))) shownSomewhere.add(m.ref)
  w.marks.forEach((m, i) => {
    if (!shownSomewhere.has(m.ref)) warn(`${path}.marks.${i}`, 'mark-not-shown', `No scene shows "${m.ref}"`, 'Add it to a scene\'s view, or drop the mark if it does not matter to the reader.')
  })

  const marked = new Set(w.marks.filter((m) => m.state !== 'removed').map((m) => m.ref))
  const notDrawn = (view: View | undefined, at: string) => {
    if (view && !(STORY_VIEWS as readonly string[]).includes(view.type))
      warn(at, 'view-not-drawn', `${/^[aeiou]/.test(view.type) ? 'An' : 'A'} ${view.type} view is not drawn in the story style`, `Scenes draw map, sequence and state views, in the Studio and as PNG. The Studio shows this view in the explorer style, and "render" cannot draw it. Prefer one of: ${STORY_VIEWS.join(', ')}.`)
  }
  notDrawn(w.overview ? idx.views.get(w.overview) : undefined, `${path}.overview`)
  for (const b of idx.doc.model.behaviors)
    if (b.kind === 'interaction')
      idx.messages(b.id).forEach(({ message }) => {
        if (marked.has(`message:${b.id}:${message.id}`) && message.label.length > LIMITS.markedMessageLabel && message.label.length <= LIMITS.messageLabel)
          warn(`${path}.marks`, 'long-label', `Message "${message.id}" is marked and its label is ${message.label.length} characters`, `A marked message carries a "New" or "Changed" tag after its label: keep it under ${LIMITS.markedMessageLabel} characters.`)
      })

  w.scenes.forEach((s, si) => {
    const sp = `${path}.scenes.${si}`
    const view = s.view ? idx.views.get(s.view) : undefined
    notDrawn(view, `${sp}.view`)
    if (!view && s.code.length === 0) warn(sp, 'empty-scene', `Scene "${s.id}" has no view and no code`, 'Give the scene a view to look at, or code to read.')
    if (s.callouts.length > LIMITS.callouts)
      warn(`${sp}.callouts`, 'too-many-callouts', `${s.callouts.length} callouts`, `Keep to ${LIMITS.callouts} numbered notes; split the scene if it needs more.`)
    if (s.risk === 'look' && s.proof.length === 0) warn(`${sp}.proof`, 'no-proof', `Scene "${s.id}" asks for a close look but lists no proof`, 'List the tests or checks that prove each case, or mark missing ones with "missing": true.')
    if (!view) return
    const size = sceneSize(view, s.focus, idx)
    if (size) warn(`${sp}.view`, 'scene-too-big', size, 'A scene should fit at a glance. Focus on fewer elements, or split it into two scenes.')
    s.focus.forEach((f, k) => {
      if (!shows(view, f)) warn(`${sp}.focus.${k}`, 'focus-outside-view', `The view "${view.id}" does not show "${f}"`, 'Add the element to the view, or remove it from "focus".')
    })
    s.callouts.forEach((c, k) => {
      if (!shows(view, c.target)) warn(`${sp}.callouts.${k}.target`, 'callout-outside-view', `The view "${view.id}" does not show "${c.target}"`, 'The number would have nothing to sit on. Point the callout at something in the view.')
      else if (s.focus.length && !s.focus.includes(c.target) && !(view.type === 'sequence' && c.target.startsWith('entity:')))
        warn(`${sp}.callouts.${k}.target`, 'callout-not-focused', `"${c.target}" is not in the scene's focus`, 'It will be dimmed. Add it to "focus".')
    })
    // Emphasis must sit on something in the picture, and on the right kind of thing.
    const LINE = /^(relationship|message|transition|activityFlow|dataFlow):/
    s.trace.forEach((t, k) => {
      if (!shows(view, t.ref)) warn(`${sp}.trace.${k}.ref`, 'trace-outside-view', `The view "${view.id}" does not show "${t.ref}"`, 'Every step of a trace must be in the picture.')
    })
    if (s.trace.length > LIMITS.traceSteps) warn(`${sp}.trace`, 'long-trace', `The trace has ${s.trace.length} steps`, `Keep to ${LIMITS.traceSteps}; split the path over two scenes.`)
    s.effects.forEach((e, k) => {
      if (!shows(view, e.target)) warn(`${sp}.effects.${k}.target`, 'effect-outside-view', `The view "${view.id}" does not show "${e.target}"`, 'Put the effect on something in the picture.')
      else if (e.as === 'flow' && !LINE.test(e.target)) warn(`${sp}.effects.${k}.as`, 'flow-on-box', `"flow" is for lines, but "${e.target}" is a box`, 'Put "flow" on a relationship, message or transition; use "attention" or "hot-path" for a box.')
    })
    s.badges.forEach((b, k) => {
      if (!shows(view, b.target)) warn(`${sp}.badges.${k}.target`, 'badge-outside-view', `The view "${view.id}" does not show "${b.target}"`, 'Put the badge on something in the picture.')
      if (b.text.length > LIMITS.badge) warn(`${sp}.badges.${k}.text`, 'long-label', `The badge "${b.text}" is ${b.text.length} characters`, `A badge is a short fact: keep it under ${LIMITS.badge} characters.`)
    })
    if (tour) {
      // A tour teaches where things live: a scene should lead the reader to the code.
      const about = entitiesOf(s.focus.length ? s.focus : s.callouts.map((c) => c.target), idx)
      const sourced = s.code.length > 0 || s.proof.some((p) => p.source) || about.some((k) => idx.entities.get(k)?.sourceRefs.length)
      if (!sourced) warn(sp, 'no-source', `Scene "${s.id}" does not say where the code is`, 'Show an excerpt in "code", or give the focused entities "sourceRefs", so the reader can open the code.')
      return
    }
    const marked = w.marks.some((m) => shows(view, m.ref))
    if (!marked && s.code.length === 0) warn(sp, 'no-change-shown', `Scene "${s.id}" shows nothing that the change touches`, 'Mark what changed in this view, or explain why the reader needs this scene.')
  })
}

/** The entities that refs are about: named directly, or at the ends of a line or a message. */
function entitiesOf(refs: string[], idx: ModelIndex): string[] {
  return refs.map(parseRef).flatMap((r) => {
    if (r?.kind === 'entity') return [r.id]
    if (r?.kind === 'relationship') {
      const rel = idx.relationships.get(r.id)
      return rel ? [rel.source, rel.target] : []
    }
    if (r?.kind === 'message') {
      const m = idx.messages(r.behavior).find((x) => x.message.id === r.id)?.message
      return m ? [m.from, m.to] : []
    }
    return []
  })
}

/** Removed elements are drawn by the view that holds their kind. */
function removedShownBy(view: View, ref: Ref, w: Walkthrough): boolean {
  if (ref.kind === 'transition') return view.type === 'state' && view.stateMachine === ref.behavior
  if (ref.kind === 'entity' || ref.kind === 'relationship') return view.type === 'map' && w.removed !== undefined
  return false
}

function sceneSize(view: View, focus: string[], idx: ModelIndex): string | undefined {
  switch (view.type) {
    case 'map': {
      const n = mapBoxes(view, idx)
      return n > LIMITS.mapEntities ? `The map shows ${n} boxes (keep to ${LIMITS.mapEntities}; close groups with "collapsed")` : undefined
    }
    case 'sequence': {
      const all = idx.messages(view.interaction)
      const focused = focus.map(parseRef).filter((r) => r?.kind === 'message').length
      const n = focused || all.length
      const people = new Set(all.flatMap((m) => [m.message.from, m.message.to])).size
      if (n > LIMITS.sequenceMessages) return `The scene shows ${n} messages (keep to ${LIMITS.sequenceMessages})`
      if (!focused && people > LIMITS.sequenceParticipants) return `The sequence has ${people} participants (keep to ${LIMITS.sequenceParticipants})`
      return undefined
    }
    case 'state': {
      const n = idx.stateMachine(view.stateMachine)?.states.length ?? 0
      return n > LIMITS.states && focus.length === 0 ? `The state machine has ${n} states and no focus` : undefined
    }
    case 'architecture':
    case 'dependency':
      return view.entities.length > LIMITS.viewEntities && focus.length === 0 ? `The view has ${view.entities.length} entities and no focus` : undefined
    default:
      return undefined
  }
}

/** The boxes a map draws: closed groups count once, open groups not at all. */
export function mapBoxes(view: Extract<View, { type: 'map' }>, idx: ModelIndex): number {
  const shown = new Set(view.entities.filter((e) => !view.passThrough.includes(e)))
  const closed = new Set(view.collapsed)
  const inClosed = (id: string) => {
    for (let p = idx.entities.get(id)?.parent, guard = 0; p && guard < 32; p = idx.entities.get(p)?.parent, guard++) if (shown.has(p) && closed.has(p)) return true
    return false
  }
  const isGroup = (id: string) => [...shown].some((e) => idx.entities.get(e)?.parent === id)
  return [...shown].filter((id) => !inClosed(id) && (closed.has(id) || !isGroup(id))).length
}

export interface CheckResult {
  ok: boolean
  document?: PoneyDocument
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

/** The lints of the extensions the reader knows and the document declares. */
export function lintExtensions(doc: PoneyDocument, options: ValidateOptions = {}): ValidationIssue[] {
  const declared = new Set(doc.extensions.map((e) => e.name))
  const known = (options.extensions ?? []).filter((e) => e.lint && declared.has(e.name))
  if (!known.length) return []
  const index = indexOf(doc)
  const out: ValidationIssue[] = []
  for (const ext of known) ext.lint!(doc, { index, warn: (path, code, message, hint) => out.push({ path, code, message, hint, severity: 'warning' }) })
  return out
}

/** Validates and lints in one call: what a person or an agent runs on a file. */
export function checkDocument(input: unknown, options: ValidateOptions = {}): CheckResult {
  const result = validateDocument(input, options)
  const issues = [...result.issues, ...(result.document && result.ok ? [...lintDocument(result.document), ...lintExtensions(result.document, options)] : [])].map((i) => withScene(i, result.document))
  return { ok: result.ok, document: result.document, errors: issues.filter((i) => i.severity === 'error'), warnings: issues.filter((i) => i.severity === 'warning') }
}

/**
 * A view written inside a scene moves to "views" when the document loads, so
 * its issues have paths like "views.3". Say which scene wrote it.
 */
function withScene(issue: ValidationIssue, doc?: PoneyDocument): ValidationIssue {
  const m = /^views\.(\d+)/.exec(issue.path)
  const view = m && doc ? doc.views[Number(m[1])] : undefined
  if (!view || view.category !== 'walkthrough') return issue
  for (const [wi, w] of doc!.walkthroughs.entries()) {
    if (w.overview === view.id) return { ...issue, message: `${issue.message} (in the overview view of walkthroughs.${wi})` }
    const si = w.scenes.findIndex((x) => x.view === view.id)
    if (si >= 0) return { ...issue, message: `${issue.message} (in the view of scene "${w.scenes[si].id}", walkthroughs.${wi}.scenes.${si}.view)` }
  }
  return issue
}

/** Plain-text report of a check, for terminals and agents. */
export function formatCheck(result: CheckResult): string {
  const line = (i: ValidationIssue) => `  ${i.path || '(document)'}: ${i.message}${i.hint ? `\n    → ${i.hint}` : ''}`
  const parts: string[] = []
  parts.push(result.ok ? `Valid${result.warnings.length ? `, with ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}` : ''}.` : `Invalid: ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}.`)
  if (result.errors.length) parts.push('Errors:', ...result.errors.slice(0, 40).map(line))
  if (result.warnings.length) parts.push('Warnings:', ...result.warnings.slice(0, 40).map(line))
  return parts.join('\n')
}
