import { z } from 'zod'
import { Id, SemanticModel } from './model'
import { View } from './views'
import { Presentation } from './presentation'
import { Walkthrough } from './walkthrough'
import type { InlineView } from './views'
import { DEFAULT_PRESENTATION } from '../defaults'

export const PONEY_VERSION = '0.2.0'

export const Project = z.object({
  id: Id,
  name: z.string(),
  description: z.string().default(''),
  repository: z.string().optional(),
  /** The view to open first. */
  defaultView: Id.optional(),
})

/** An extension this document uses. */
export const ExtensionUse = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string(),
  /**
   * Required extensions change meaning: a reader that does not know one must
   * refuse the document. Optional ones may be ignored (but must be preserved).
   */
  required: z.boolean().default(false),
})
export type ExtensionUse = z.infer<typeof ExtensionUse>

/**
 * A complete Poney document: one model, its views, its walkthroughs and a
 * presentation.
 *
 * Parsing returns the canonical form: defaults filled in, and views written
 * inside walkthrough scenes moved into `views` with ids of their own, so
 * every reader sees one shape.
 */
const DocumentShape = z.object({
  poneyVersion: z.literal(PONEY_VERSION),
  project: Project,
  extensions: z.array(ExtensionUse).default([]),
  model: SemanticModel.default({}),
  views: z.array(View).default([]),
  /** Stories that explain one change each (section 5.8). */
  walkthroughs: z.array(Walkthrough).default([]),
  presentation: Presentation.default(DEFAULT_PRESENTATION),
})

export const PoneyDocument = DocumentShape.transform((doc) => {
  const views = [...doc.views]
  const place = (view: string | InlineView | undefined, id: string, title: string): string | undefined => {
    if (view === undefined || typeof view === 'string') return view
    const placed = { ...view, id: view.id ?? id, title: view.title ?? title } as (typeof views)[number]
    views.push(placed)
    return placed.id
  }
  const walkthroughs = doc.walkthroughs.map((w) => ({
    ...w,
    overview: place(w.overview, `${w.id}.overview`, w.title),
    scenes: w.scenes.map((s) => ({ ...s, view: place(s.view, `${w.id}.${s.id}`, s.title) })),
  }))
  return { ...doc, views, walkthroughs }
})
export type PoneyDocument = z.output<typeof PoneyDocument>
export type Walkthrough = PoneyDocument['walkthroughs'][number]
export type Scene = Walkthrough['scenes'][number]
/** The shape authors write: defaults may be omitted. */
export type PoneyDocumentInput = z.input<typeof PoneyDocument>

export * from './model'
export * from './views'
export * from './presentation'
export * from './walkthrough'
