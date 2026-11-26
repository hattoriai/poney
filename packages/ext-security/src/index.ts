import { z } from 'zod'
import { Id, defineExtension, readFacet, type DataType, type Entity, type PoneyDocument, type Relationship } from '@poney/core'

/**
 * The security extension: where trust ends, which data is sensitive, and how
 * each connection is protected.
 *
 * It adds:
 * - an entity kind, "security/zone": a trust zone. Inside a zone, parts trust
 *   each other; a line between zones crosses a boundary;
 * - facets: an entity's zone, a data type's classes (personal, secret,
 *   payment, health), and a relationship's protection (encryption, auth);
 * - lints that read those together, e.g. "personal data leaves a zone
 *   without encryption".
 *
 * A part without a zone takes the zone of its parent. Zones are drawn with
 * the core views (an architecture view's groups); the extension adds no view
 * type of its own.
 */

/** Classes of sensitive data. */
export const DataClass = z.enum(['personal', 'secret', 'payment', 'health'])
export type DataClass = z.infer<typeof DataClass>

export const CLASS_LABEL: Record<DataClass, string> = { personal: 'Personal data', secret: 'Secrets', payment: 'Payment data', health: 'Health data' }

/** How much a zone is trusted: public (anyone can reach it), internal, restricted. */
export const Trust = z.enum(['public', 'internal', 'restricted'])
export type Trust = z.infer<typeof Trust>

export const EntityFacet = z
  .object({
    /** The trust zone this part runs in: an entity of kind "security/zone". */
    zone: Id.optional(),
    /** For zones: how much the zone is trusted. */
    trust: Trust.optional(),
  })
  .strict()
export type EntityFacet = z.infer<typeof EntityFacet>

export const DataTypeFacet = z
  .object({
    /** What kind of sensitive data this type holds. */
    classes: z.array(DataClass).min(1),
  })
  .strict()
export type DataTypeFacet = z.infer<typeof DataTypeFacet>

export const RelationshipFacet = z
  .object({
    /** The data is encrypted in transit (TLS counts). */
    encrypted: z.boolean().optional(),
    /** How the caller proves who it is, e.g. "mTLS", "OAuth token", "session cookie", or "none". */
    auth: z.string().min(1).optional(),
  })
  .strict()
export type RelationshipFacet = z.infer<typeof RelationshipFacet>

export const ZONE_KIND = 'security/zone'

export const security = defineExtension({
  name: 'security',
  version: '0.1.0',
  description: 'Trust zones, sensitive data, and how connections are protected.',
  entityKinds: {
    zone: { label: 'Trust zone', description: 'Where parts trust each other. A line between zones crosses a trust boundary.' },
  },
  facets: { entity: EntityFacet, dataType: DataTypeFacet, relationship: RelationshipFacet },
  validate(doc, { index, report }) {
    doc.model.entities.forEach((e, i) => {
      const zone = readFacet(security, 'entity', e)?.zone
      if (!zone) return
      const target = index.entities.get(zone)
      if (!target) report(`model.entities.${i}.ext.security.zone`, `Unknown zone "${zone}"`)
      else if (target.kind !== ZONE_KIND) report(`model.entities.${i}.ext.security.zone`, `"${zone}" is not a zone (kind "${ZONE_KIND}")`)
    })
  },
  lint(doc, { warn }) {
    for (const c of crossings(doc)) {
      if (!c.classes.length) continue
      const what = c.classes.map((k) => CLASS_LABEL[k].toLowerCase()).join(' and ')
      const where = `from ${c.from.name} to ${c.to.name}`
      if (c.protection?.encrypted !== true)
        warn(
          `model.relationships.${c.index}`,
          'security-unencrypted-crossing',
          `"${c.relationship.label}" carries ${what} ${where} without encryption.`,
          'If it is encrypted (TLS counts), set ext.security.encrypted to true on the relationship. If not, the data should not cross this boundary as it is.',
        )
      if (!c.protection?.auth)
        warn(
          `model.relationships.${c.index}`,
          'security-unknown-auth',
          `"${c.relationship.label}" carries ${what} ${where}, and the document does not say how the caller is authenticated.`,
          'Set ext.security.auth on the relationship, e.g. "mTLS", "OAuth token" or "none".',
        )
    }
    doc.model.relationships.forEach((r, i) => {
      const auth = readFacet(security, 'relationship', r)?.auth
      const target = doc.model.entities.find((e) => e.id === r.target)
      const zone = zoneOf(doc, target)
      if (auth?.toLowerCase() === 'none' && zone && readFacet(security, 'entity', zone)?.trust === 'restricted')
        warn(`model.relationships.${i}`, 'security-open-restricted', `"${r.label}" reaches the restricted zone ${zone.name} with no authentication.`, 'Name the authentication, or say why this part of a restricted zone is open.')
    })
    doc.model.dataTypes.forEach((d, i) => {
      if (!classesOf(d).length || !d.storedIn) return
      const store = doc.model.entities.find((e) => e.id === d.storedIn)
      const zone = zoneOf(doc, store)
      if (zone && readFacet(security, 'entity', zone)?.trust === 'public')
        warn(`model.dataTypes.${i}`, 'security-sensitive-in-public', `${d.name} holds ${classesOf(d).map((k) => CLASS_LABEL[k].toLowerCase()).join(' and ')}, and is stored in ${store!.name}, in the public zone ${zone.name}.`, 'Move the store to a zone that is not public, or check that the zone is right.')
    })
  },
})

/** The zone of a part: its own, else its parent's, and so on up. */
export function zoneOf(doc: PoneyDocument, entity: Entity | undefined): Entity | undefined {
  const byId = new Map(doc.model.entities.map((e) => [e.id, e]))
  const seen = new Set<string>()
  for (let e = entity; e && !seen.has(e.id); e = e.parent ? byId.get(e.parent) : undefined) {
    seen.add(e.id)
    if (e.kind === ZONE_KIND) return e
    const zone = readFacet(security, 'entity', e)?.zone
    if (zone) return byId.get(zone)
  }
  return undefined
}

/** The sensitive data classes of a data type. */
export const classesOf = (d: DataType | undefined): DataClass[] => readFacet(security, 'dataType', d)?.classes ?? []

/** How a relationship is protected, as the document says. */
export const protectionOf = (r: Relationship | undefined) => readFacet(security, 'relationship', r)

export interface Crossing {
  index: number
  relationship: Relationship
  from: Entity
  to: Entity
  fromZone: Entity
  toZone: Entity
  /** Sensitive data on the line: from the relationship's data, and from data flows that go through it. */
  classes: DataClass[]
  protection?: RelationshipFacet
}

/** Every relationship whose ends are in different zones. */
export function crossings(doc: PoneyDocument): Crossing[] {
  const entities = new Map(doc.model.entities.map((e) => [e.id, e]))
  const dataTypes = new Map(doc.model.dataTypes.map((d) => [d.id, d]))
  const out: Crossing[] = []
  doc.model.relationships.forEach((r, index) => {
    const from = entities.get(r.source)
    const to = entities.get(r.target)
    const fromZone = zoneOf(doc, from)
    const toZone = zoneOf(doc, to)
    if (!from || !to || !fromZone || !toZone || fromZone.id === toZone.id) return
    const data = new Set([...r.data, ...doc.model.dataFlows.filter((f) => f.via === r.id).flatMap((f) => f.data)])
    const classes = [...new Set([...data].flatMap((id) => classesOf(dataTypes.get(id))))]
    out.push({ index, relationship: r, from, to, fromZone, toZone, classes, protection: protectionOf(r) })
  })
  return out
}

/** The parts in a zone, directly or through a parent. */
export function inZone(doc: PoneyDocument, zoneId: string): Entity[] {
  return doc.model.entities.filter((e) => e.id !== zoneId && e.kind !== ZONE_KIND && zoneOf(doc, e)?.id === zoneId)
}
