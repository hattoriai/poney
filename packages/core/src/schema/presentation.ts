import { z } from 'zod'

/**
 * Layer 3 — presentation.
 *
 * How things look, separate from what they mean. A renderer reads these
 * hints; the semantic model never contains colors or sizes. Interaction
 * state (selection, hover, viewport) is not part of the document at all.
 */

/** Named pigments. Renderers map tones to theme-aware colors. */
export const NamedTone = z.enum(['lapis', 'malachite', 'ochre', 'umber', 'tyrian', 'slate', 'accent', 'verdigris'])
/** A named pigment, or a hex color for anything the palette does not cover. */
export const Tone = z.union([NamedTone, z.string().regex(/^#[0-9a-fA-F]{6}$/)])
export type Tone = z.infer<typeof NamedTone> | (string & {})

export const NodeShape = z.enum(['card', 'cylinder', 'person', 'stack', 'frame', 'chip'])

export const KindStyle = z.object({
  /** Node renderer variant. */
  shape: NodeShape,
  tone: Tone,
  /** Lucide icon name, in kebab case. */
  icon: z.string(),
  /** Human label for the kind, e.g. "Data store". */
  label: z.string(),
})
export type KindStyle = z.infer<typeof KindStyle>

export const LineStyle = z.object({
  pattern: z.enum(['solid', 'dashed', 'dotted']),
  /** Marker at the target end. */
  head: z.enum(['arrow', 'open-arrow', 'none', 'triangle']),
})
export type LineStyle = z.infer<typeof LineStyle>

export const ElementOverride = z.object({
  tone: Tone.optional(),
  icon: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  /** Emphasized elements draw a stronger outline. */
  emphasis: z.boolean().optional(),
})

export const Presentation = z.object({
  /** Style per entity kind, including extension kinds. */
  kinds: z.record(z.string(), KindStyle),
  relationships: z.record(z.string(), LineStyle),
  /** Per-element overrides, keyed by element id. Apply to every view. */
  elements: z.record(z.string(), ElementOverride).default({}),
  /** Per-view overrides, keyed by view id, then element id. */
  views: z.record(z.string(), z.record(z.string(), ElementOverride)).default({}),
})
export type Presentation = z.infer<typeof Presentation>
