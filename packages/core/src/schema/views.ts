import { z } from 'zod'
import { Ext, Id } from './model'

/**
 * Layer 2 — diagram views.
 *
 * A view chooses which parts of the semantic model appear in one diagram and
 * how they are organized. Views reference canonical ids; they never copy an
 * entity's definition. Each diagram type has its own shape, because a sequence
 * diagram, an ERD and a state machine do not share one universal graph.
 */

export const DiagramType = z.enum([
  'extension',
  'map',
  'architecture',
  'sequence',
  'dataflow',
  'activity',
  'erd',
  'state',
  'usecase',
  'dependency',
])
export type DiagramType = z.infer<typeof DiagramType>

/** Core categories. Extensions may use their own category names. */
export const CORE_CATEGORIES = ['overview', 'behavior', 'data', 'structure', 'use-cases'] as const
export const Category = z.string().min(1)
export type Category = (typeof CORE_CATEGORIES)[number] | (string & {})

export const Direction = z.enum(['right', 'down'])

export const Point = z.object({ x: z.number(), y: z.number() })

const ViewBase = z.object({
  id: Id,
  title: z.string(),
  description: z.string(),
  category: Category,
  /**
   * Manually assigned positions keyed by element id. A layout engine uses
   * them as fixed points; everything else is computed.
   */
  positions: z.record(z.string(), Point).default({}),
  ext: Ext.default({}),
})

export const Group = z.object({
  id: Id,
  label: z.string(),
  description: z.string().optional(),
  members: z.array(Id),
})
export type Group = z.infer<typeof Group>

export const ArchitectureView = ViewBase.extend({
  type: z.literal('architecture'),
  entities: z.array(Id).min(1),
  /** Relationships to show. Omit to include all relationships between shown entities. */
  relationships: z.array(Id).optional(),
  /** Visual groups inside containers (zones, tiers). */
  groups: z.array(Group).default([]),
  /** Container entities shown closed; their children's edges are lifted to them. */
  collapsed: z.array(Id).default([]),
  layout: z.object({ direction: Direction.default('right') }).default({}),
})

/**
 * A small, composed map of how things connect: at most a dozen entities,
 * chosen for one explanation. Walkthrough scenes use it most.
 */
export const MapView = ViewBase.extend({
  type: z.literal('map'),
  entities: z.array(Id).min(1),
  /** Relationships to draw. Omit to draw every relationship between shown entities. */
  relationships: z.array(Id).optional(),
  /**
   * Entities the map leaves out. A relationship into one and a relationship
   * out of it are drawn as a single line "through" it, e.g. through an API
   * gateway that does not matter to the explanation.
   */
  passThrough: z.array(Id).default([]),
  /**
   * Groups drawn closed. An entity whose `parent` is also in the map is drawn
   * inside it; a closed group is one box, and its lines join at that box.
   */
  collapsed: z.array(Id).default([]),
  layout: z.object({ direction: Direction.default('right') }).default({}),
})

export const SequenceView = ViewBase.extend({
  type: z.literal('sequence'),
  interaction: Id,
})

export const DataFlowView = ViewBase.extend({
  type: z.literal('dataflow'),
  flows: z.array(Id).min(1),
  /** Show relationships without data as faint control-flow lines. */
  showControlFlow: z.boolean().default(true),
})

export const ActivityView = ViewBase.extend({
  type: z.literal('activity'),
  activity: Id,
  swimlanes: z.boolean().default(true),
})

export const ErdView = ViewBase.extend({
  type: z.literal('erd'),
  dataTypes: z.array(Id).min(1),
  /** Group tables by the entity they are stored in. */
  groupByStore: z.boolean().default(true),
  /** Fields shown before a table collapses the rest. */
  fieldLimit: z.number().int().positive().default(6),
})

export const StateView = ViewBase.extend({
  type: z.literal('state'),
  stateMachine: Id,
})

export const UseCaseView = ViewBase.extend({
  type: z.literal('usecase'),
  useCases: z.array(Id).min(1),
})

export const DependencyView = ViewBase.extend({
  type: z.literal('dependency'),
  entities: z.array(Id).min(1),
  relationships: z.array(Id).optional(),
  /** Layers, top to bottom. Dependencies should point downward. */
  layers: z.array(Group).min(1),
})

/**
 * A view whose type an extension defines. `extension` names it as
 * "<extension>/<view type>"; `data` holds whatever that extension needs and
 * is validated by the extension, when the reader knows it.
 */
export const ExtensionView = ViewBase.extend({
  type: z.literal('extension'),
  extension: z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/),
  /**
   * Entities this view shows. Lets readers that do not know the extension
   * still search, link and navigate to it.
   */
  entities: z.array(Id).default([]),
  data: z.unknown(),
})

export const View = z.discriminatedUnion('type', [
  ArchitectureView,
  MapView,
  SequenceView,
  DataFlowView,
  ActivityView,
  ErdView,
  StateView,
  UseCaseView,
  DependencyView,
  ExtensionView,
])
export type View = z.infer<typeof View>
export type ViewOf<T extends DiagramType> = Extract<View, { type: T }>

/**
 * A view written inside a walkthrough scene. It needs no id, title or
 * category: the reader names it after its scene. Readers move inline views
 * into `views` when they load a document (section 5.8).
 */
const inline = {
  id: Id.optional(),
  title: z.string().optional(),
  description: z.string().default(''),
  category: Category.default('walkthrough'),
}
export const InlineView = z.discriminatedUnion('type', [
  MapView.extend(inline),
  SequenceView.extend(inline),
  StateView.extend(inline),
  ActivityView.extend(inline),
  ArchitectureView.extend(inline),
  DataFlowView.extend(inline),
  ErdView.extend(inline),
  UseCaseView.extend(inline),
  DependencyView.extend(inline),
])
export type InlineView = z.infer<typeof InlineView>
