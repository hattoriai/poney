import { z } from 'zod'

/**
 * Layer 1 — the semantic model.
 *
 * Describes the software itself, independent of any diagram. Every element
 * has a stable identifier so that views, presentation, commands and external
 * tools can reference it without duplicating its definition.
 */

/** Stable identifiers: lowercase, readable, and safe to use in URLs. */
export const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-_.]*$/, 'Identifiers use lowercase letters, digits, "-", "_" and "."')
export type Id = z.infer<typeof Id>

export const SourceRef = z.object({
  /** Repository-relative path. */
  path: z.string(),
  line: z.number().int().positive().optional(),
  symbol: z.string().optional(),
  repository: z.string().optional(),
})
export type SourceRef = z.infer<typeof SourceRef>

export const Metadata = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

/**
 * Extension data ("facets") on an element, keyed by extension name. Core
 * readers that do not know an extension must keep its data unchanged.
 */
export const Ext = z.record(z.string(), z.unknown())
export type Ext = z.infer<typeof Ext>

/** An extension-defined kind: "<extension>/<kind>", e.g. "ownership/team". */
export const ExtensionKind = z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/, 'Extension kinds look like "extension/kind"')

export const CoreEntityKind = z.enum([
  'person', // a human who uses the system
  'system', // a software system, often containing other entities
  'web-app', // a user interface
  'service', // a deployable backend process
  'gateway', // an edge proxy or API gateway
  'database', // a relational or document store
  'cache', // an in-memory key-value store
  'message-broker', // a message queue, broker or event bus (RabbitMQ, Kafka, NATS…)
  'external', // a system outside our ownership
  'component', // a part of the code inside a running program (C4's component): a module, class or package
  'interface', // a contract implemented by modules
  'library', // a shared library
])
export type CoreEntityKind = z.infer<typeof CoreEntityKind>
/** A core kind, or a kind defined by an extension. */
export const EntityKind = z.union([CoreEntityKind, ExtensionKind])
export type EntityKind = CoreEntityKind | (string & {})

export const Entity = z.object({
  id: Id,
  kind: EntityKind,
  name: z.string().min(1),
  /** One line that says what this is for, in plain language. */
  summary: z.string(),
  description: z.string().optional(),
  /** Containment: a service inside a system, a module inside a service. */
  parent: Id.optional(),
  technology: z.string().optional(),
  tags: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceRef).default([]),
  metadata: Metadata.default({}),
  ext: Ext.default({}),
})
export type Entity = z.infer<typeof Entity>

export const CoreRelationshipKind = z.enum([
  'uses', // a person uses an interface
  'calls', // synchronous request / response
  'reads',
  'writes',
  'reads-writes',
  'publishes', // asynchronous, fire-and-forget
  'subscribes',
  'depends-on', // compile-time / structural dependency
  'implements',
])
export type CoreRelationshipKind = z.infer<typeof CoreRelationshipKind>
export const RelationshipKind = z.union([CoreRelationshipKind, ExtensionKind])
export type RelationshipKind = CoreRelationshipKind | (string & {})

export const Relationship = z.object({
  id: Id,
  kind: RelationshipKind,
  source: Id,
  target: Id,
  /** Short verb phrase, e.g. "Authorizes payments". */
  label: z.string(),
  description: z.string().optional(),
  protocol: z.string().optional(),
  /** Data types that travel along this relationship. */
  data: z.array(Id).default([]),
  metadata: Metadata.default({}),
  ext: Ext.default({}),
})
export type Relationship = z.infer<typeof Relationship>

export const Field = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  primaryKey: z.boolean().default(false),
  nullable: z.boolean().default(false),
  unique: z.boolean().default(false),
  /** A foreign key to another data type (table) and field. */
  references: z.object({ dataType: Id, field: z.string() }).optional(),
})
export type Field = z.infer<typeof Field>

export const DataTypeKind = z.enum(['table', 'record', 'event', 'document'])

export const DataType = z.object({
  id: Id,
  kind: DataTypeKind,
  name: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  fields: z.array(Field).default([]),
  /** The entity that owns this data (writes the source of truth). */
  ownedBy: Id.optional(),
  /** Where the data is stored, for tables and documents. */
  storedIn: Id.optional(),
  sourceRefs: z.array(SourceRef).default([]),
  ext: Ext.default({}),
})
export type DataType = z.infer<typeof DataType>

/** Ends of a relationship between tables, as crow's foot notation names them. */
export const Cardinality = z.enum(['exactly-one', 'zero-or-one', 'one-or-many', 'zero-or-many'])
export type Cardinality = z.infer<typeof Cardinality>

export const DataRelation = z.object({
  id: Id,
  from: Id,
  to: Id,
  fromCardinality: Cardinality,
  toCardinality: Cardinality,
  label: z.string(),
  /** The foreign key field on `from` or `to` that implements the relation. */
  via: z.string().optional(),
  /** Logical relations cross a service boundary and have no database constraint. */
  logical: z.boolean().default(false),
})
export type DataRelation = z.infer<typeof DataRelation>

/** A movement of data between two entities. Direction is the data's direction. */
export const DataFlow = z.object({
  id: Id,
  source: Id,
  target: Id,
  data: z.array(Id).min(1),
  label: z.string(),
  description: z.string().optional(),
  /** The relationship that carries this flow, when one exists. */
  via: Id.optional(),
})
export type DataFlow = z.infer<typeof DataFlow>

// ─── Behaviors ──────────────────────────────────────────────────────────────

export const MessageKind = z.enum(['call', 'return', 'async', 'self'])

export const Message = z.object({
  type: z.literal('message'),
  id: Id,
  kind: MessageKind,
  from: Id,
  to: Id,
  label: z.string(),
  description: z.string().optional(),
  relationship: Id.optional(),
  data: z.array(Id).default([]),
})
export type Message = z.infer<typeof Message>

export type Fragment = {
  type: 'fragment'
  id: string
  kind: 'alt' | 'opt' | 'loop' | 'par'
  label: string
  branches: { guard: string; steps: Step[] }[]
}
export type Step = Message | Fragment

export const Fragment: z.ZodType<Fragment, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    type: z.literal('fragment'),
    id: Id,
    kind: z.enum(['alt', 'opt', 'loop', 'par']),
    label: z.string(),
    branches: z.array(z.object({ guard: z.string(), steps: z.array(Step) })).min(1),
  }),
)
export const Step: z.ZodType<Step, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([Message, Fragment]),
)

export const Interaction = z.object({
  kind: z.literal('interaction'),
  id: Id,
  name: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  /** Ordered participants, left to right. */
  participants: z.array(Id).min(2),
  steps: z.array(Step).min(1),
})
export type Interaction = z.infer<typeof Interaction>

export const ActivityNode = z.object({
  id: Id,
  kind: z.enum(['initial', 'final', 'action', 'decision', 'merge', 'fork', 'join']),
  label: z.string(),
  description: z.string().optional(),
  /** The entity that performs this step — becomes a swimlane. */
  performedBy: Id.optional(),
  /** A terminal node that ends in failure. */
  outcome: z.enum(['success', 'failure']).optional(),
})
export type ActivityNode = z.infer<typeof ActivityNode>

export const ActivityFlow = z.object({
  id: Id,
  from: Id,
  to: Id,
  guard: z.string().optional(),
})
export type ActivityFlow = z.infer<typeof ActivityFlow>

/** A UML activity: actions, decisions and the flows between them. */
export const Activity = z.object({
  kind: z.literal('activity'),
  id: Id,
  name: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  nodes: z.array(ActivityNode).min(2),
  flows: z.array(ActivityFlow).min(1),
})
export type Activity = z.infer<typeof Activity>

export const State = z.object({
  id: Id,
  kind: z.enum(['initial', 'state', 'final']),
  name: z.string(),
  description: z.string().optional(),
  entryActions: z.array(z.string()).default([]),
  outcome: z.enum(['success', 'failure', 'neutral']).default('neutral'),
})
export type State = z.infer<typeof State>

export const Transition = z.object({
  id: Id,
  from: Id,
  to: Id,
  event: z.string(),
  guard: z.string().optional(),
  actions: z.array(z.string()).default([]),
  description: z.string().optional(),
  /** The entity that raises the event. */
  triggeredBy: Id.optional(),
})
export type Transition = z.infer<typeof Transition>

export const StateMachine = z.object({
  kind: z.literal('state-machine'),
  id: Id,
  name: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  /** The data type whose lifecycle this describes, when there is one. */
  subject: Id.optional(),
  /** The entity that owns the lifecycle. */
  owner: Id.optional(),
  states: z.array(State).min(2),
  transitions: z.array(Transition).min(1),
})
export type StateMachine = z.infer<typeof StateMachine>

export const Behavior = z.discriminatedUnion('kind', [Interaction, Activity, StateMachine])
export type Behavior = z.infer<typeof Behavior>

/** A use case (UML): something an actor does with the system. */
export const UseCase = z.object({
  id: Id,
  name: z.string(),
  summary: z.string(),
  area: z.string(),
  actors: z.array(Id).min(1),
  /** Supporting actors, usually external systems. */
  supporting: z.array(Id).default([]),
  realizedBy: z.array(Id).default([]),
  behaviors: z.array(Id).default([]),
  includes: z.array(Id).default([]),
  ext: Ext.default({}),
})
export type UseCase = z.infer<typeof UseCase>

export const SemanticModel = z.object({
  entities: z.array(Entity).default([]),
  relationships: z.array(Relationship).default([]),
  dataTypes: z.array(DataType).default([]),
  dataRelations: z.array(DataRelation).default([]),
  dataFlows: z.array(DataFlow).default([]),
  behaviors: z.array(Behavior).default([]),
  useCases: z.array(UseCase).default([]),
})
export type SemanticModel = z.infer<typeof SemanticModel>
