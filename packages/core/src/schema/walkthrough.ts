import { z } from 'zod'
import { Entity, Id, Relationship, Transition } from './model'
import { InlineView } from './views'
import { Tone } from './presentation'

/**
 * Walkthroughs — a story that explains one change, or a tour of a codebase.
 *
 * A walkthrough reads like a guided tour: what changes for a person, a
 * verdict, then scenes in reading order. Each scene points the camera at part
 * of a view, numbers what matters, and carries the proof and the code. Marks
 * say which elements the change adds, changes or removes, so every diagram
 * can show the change without a second model.
 */

/**
 * A reference to a model element as text: "<kind>:<id>",
 * "<kind>:<behavior>:<id>" for steps, states and transitions, and
 * "dataType:<id>#<field>" for a field. See SPEC section 5.8.
 */
export const RefKey = z.string().regex(/^[a-zA-Z]+:[a-z0-9][a-z0-9-_.:#]*$/, 'A ref looks like "entity:order-service"')

export const ChangeState = z.enum(['new', 'changed', 'removed'])
export type ChangeState = z.infer<typeof ChangeState>

export const Mark = z.object({
  ref: RefKey,
  state: ChangeState,
  note: z.string().optional(),
})

export const DiffLine = z.object({
  kind: z.enum(['add', 'del', 'ctx']),
  /** Line number on the old side, for "del" and "ctx". */
  old: z.number().int().positive().optional(),
  /** Line number on the new side, for "add" and "ctx". */
  new: z.number().int().positive().optional(),
  text: z.string(),
})
export type DiffLine = z.infer<typeof DiffLine>

const Hunk = z.object({ header: z.string().optional(), lines: z.array(DiffLine).min(1) })

/**
 * Code to read: diff hunks, or an excerpt of a file as it is.
 * An excerpt gives `start` (the number of its first line) and `text`; it
 * becomes one hunk of unchanged lines, so every renderer draws one shape.
 */
export const CodeBlock = z
  .object({
    path: z.string(),
    /** What this part of the code does, e.g. "Order.Decline". */
    title: z.string().optional(),
    hunks: z.array(Hunk).min(1).optional(),
    /** Excerpt: the line number of the first line of `text`. */
    start: z.number().int().positive().optional(),
    /** Excerpt: the lines, as they are in the file. */
    text: z.string().optional(),
    /** Notes under a line, by its (new) line number. */
    notes: z.array(z.object({ line: z.number().int().positive(), text: z.string() })).default([]),
  })
  .refine((b) => (b.hunks ? b.text === undefined && b.start === undefined : b.text !== undefined && b.start !== undefined), {
    message: 'Give "hunks" (a diff), or "start" and "text" (an excerpt), not both',
  })
  .transform(({ start, text, hunks, ...rest }) => ({
    ...rest,
    hunks: hunks ?? ([{ lines: text!.replace(/\n$/, '').split('\n').map((t, i) => ({ kind: 'ctx' as const, new: start! + i, text: t })) }] as z.infer<typeof Hunk>[]),
  }))
export type CodeBlock = z.output<typeof CodeBlock>

export const Risk = z.enum(['look', 'routine'])

/**
 * What a reader must see on an element, by meaning. Renderers choose how:
 * the Studio animates, a picture draws it still, and readers who ask for less
 * motion get no motion.
 *
 * - `flow`: data moves along a line, in its direction.
 * - `attention`: look here first.
 * - `hot-path`: the main path; the line or box stands out.
 * - `slow`: this takes time (a slow call, a long job).
 * - `failing`: this fails, or is where an error comes from.
 * - `blocked`: nothing gets through here (a closed door, a lock, a limit).
 */
export const EffectKind = z.enum(['flow', 'attention', 'hot-path', 'slow', 'failing', 'blocked'])
export type EffectKind = z.infer<typeof EffectKind>

export const Effect = z.object({ target: RefKey, as: EffectKind, tone: Tone.optional() })
export type Effect = z.infer<typeof Effect>

/** A short fact pinned on a box or a line: a count, a latency, an error rate, a size. */
export const Badge = z.object({ target: RefKey, text: z.string().min(1), tone: Tone.optional() })
export type Badge = z.infer<typeof Badge>

/** One step of a path the reader can play: a line, a message, a transition, or a box to stop at. */
export const TraceStep = z.object({ ref: RefKey, caption: z.string().optional() })
export type TraceStep = z.infer<typeof TraceStep>

export const Scene = z.object({
  id: Id,
  title: z.string(),
  /** The point of the scene, in plain words. */
  text: z.string(),
  risk: Risk.default('routine'),
  /** The view the scene shows: the id of a view, or a view written here. Omit for a scene of code only. */
  view: z.union([Id, InlineView]).optional(),
  /** Elements to frame and keep bright; everything else in the view dims. */
  focus: z.array(RefKey).default([]),
  /** Numbered notes pinned to elements, in reading order. */
  callouts: z.array(z.object({ target: RefKey, text: z.string() })).default([]),
  /** What the code does in each case. */
  cases: z.array(z.object({ when: z.string(), then: z.string(), note: z.string().optional() })).default([]),
  /**
   * Evidence: a test, a check, a run. `source` is the file, `test` the name of
   * the test in it. `missing` marks proof that does not exist yet.
   */
  proof: z.array(z.object({ text: z.string(), source: z.string().optional(), test: z.string().optional(), missing: z.boolean().default(false) })).default([]),
  /** A question for the reader: a decision in a change, a check of understanding in a tour. */
  question: z.string().optional(),
  /** More questions, when one is not enough. */
  questions: z.array(z.string()).default([]),
  code: z.array(CodeBlock).default([]),
  /** A path through the picture, in order, that the reader can play step by step (e.g. one request moving through the system). */
  trace: z.array(TraceStep).default([]),
  /** Emphasis by meaning: what flows, what is slow, what fails. */
  effects: z.array(Effect).default([]),
  /** Short facts on elements: "p95 1.2 s", "3 retries", "40 k rows". */
  badges: z.array(Badge).default([]),
})
export type SceneInput = z.input<typeof Scene>

/**
 * A "change" walkthrough explains one change: marks, before and after.
 * A "tour" explains code as it is, to someone new to it: no marks, no modes.
 */
export const WalkthroughKind = z.enum(['change', 'tour'])
export type WalkthroughKind = z.infer<typeof WalkthroughKind>

export const Walkthrough = z.object({
  id: Id,
  kind: WalkthroughKind.default('change'),
  title: z.string(),
  summary: z.string(),
  /** Where the change (or, for a tour, the code) comes from, e.g. a merge request or a repository. */
  source: z
    .object({
      kind: z.string(),
      ref: z.string().optional(),
      head: z.string().optional(),
      url: z.string().optional(),
      /** The repository, so paths can be tied to a version. */
      repository: z.string().optional(),
      /** The commit the change starts from. */
      base: z.string().optional(),
      author: z.string().optional(),
      files: z.number().int().nonnegative().optional(),
      added: z.number().int().nonnegative().optional(),
      removed: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /** What changes for a person (a change), or what the code is for and who uses it (a tour). A change also gives `before` and `after`. */
  story: z.object({ text: z.string(), before: z.string().optional(), after: z.string().optional() }),
  /** The view shown next to the story, before and after: an id, or a view written here. */
  overview: z.union([Id, InlineView]).optional(),
  verdict: z
    .object({
      risk: Risk,
      facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
      /**
       * What the reviewer found: risks to weigh, and notes. A risk is not a
       * question; it needs no answer, only attention. `scene` points at where it shows.
       */
      findings: z.array(z.object({ text: z.string(), severity: z.enum(['risk', 'note']).default('risk'), scene: Id.optional() })).default([]),
    })
    .optional(),
  marks: z.array(Mark).default([]),
  /**
   * Elements the change removes. The model describes the system after the
   * change, so removed elements live here, to be drawn as they were.
   */
  removed: z
    .object({
      entities: z.array(Entity).default([]),
      relationships: z.array(Relationship).default([]),
      transitions: z.array(z.object({ stateMachine: Id, transition: Transition })).default([]),
    })
    .default({}),
  scenes: z.array(Scene).min(1),
})
export type WalkthroughInput = z.input<typeof Walkthrough>
