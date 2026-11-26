import { z } from 'zod'
import { Id, defineExtension, readFacet, type Entity, type PoneyDocument } from '@hattoriai/poney-core'

/**
 * The ownership extension — an example of extending Poney.
 *
 * It adds:
 * - an entity kind, "ownership/team";
 * - an entity facet, `ext.ownership`, that says which team owns an element,
 *   and for teams, how to reach them;
 * - a view type, "ownership/team-map", that shows every team and what it owns.
 *
 * Nothing here is React. A studio, a CLI or a service in another language can
 * read the same JSON. The studio's renderer for the team map lives in the
 * studio, not in this package.
 */

export const OwnershipFacet = z
  .object({
    /** The team that owns this element: an entity of kind "ownership/team". */
    team: Id.optional(),
    /** For teams: the current on-call rotation. */
    oncall: z.string().optional(),
    /** For teams: where to ask questions. */
    channel: z.string().optional(),
    /** For teams: one line on what the team is for. */
    mission: z.string().optional(),
  })
  .strict()
export type OwnershipFacet = z.infer<typeof OwnershipFacet>

export const TeamMapData = z.object({
  /** Teams, in display order. */
  teams: z.array(Id).min(1),
  /** Also show a column of elements that have no owner. */
  showUnowned: z.boolean().default(false),
})
export type TeamMapData = z.infer<typeof TeamMapData>

export const TEAM_KIND = 'ownership/team'

export const ownership = defineExtension({
  name: 'ownership',
  version: '0.1.0',
  description: 'Teams, who owns what, and how to reach them.',
  entityKinds: {
    team: { label: 'Team', description: 'A group of people who own and run parts of the system.' },
  },
  facets: { entity: OwnershipFacet },
  views: {
    'team-map': { label: 'Team map', description: 'Every team and the parts of the system it owns.', schema: TeamMapData },
  },
  validate(doc, { index, report }) {
    doc.model.entities.forEach((e, i) => {
      const facet = readFacet(ownership, 'entity', e)
      if (!facet?.team) return
      const team = index.entities.get(facet.team)
      if (!team) report(`model.entities.${i}.ext.ownership.team`, `Unknown team "${facet.team}"`)
      else if (team.kind !== TEAM_KIND) report(`model.entities.${i}.ext.ownership.team`, `"${facet.team}" is not a team`)
    })
    doc.views.forEach((v, i) => {
      if (v.type !== 'extension' || v.extension !== 'ownership/team-map') return
      const data = TeamMapData.safeParse(v.data)
      if (!data.success) return
      data.data.teams.forEach((t, j) => {
        if (index.entities.get(t)?.kind !== TEAM_KIND) report(`views.${i}.data.teams.${j}`, `"${t}" is not a team`)
      })
    })
  },
})

/** The facet of an element, if it has one. */
export const ownershipOf = (entity: Entity | undefined) => readFacet(ownership, 'entity', entity)

/** The team entity that owns an element. */
export function teamOf(doc: PoneyDocument, entity: Entity | undefined): Entity | undefined {
  const id = ownershipOf(entity)?.team
  return id ? doc.model.entities.find((e) => e.id === id) : undefined
}

/** Everything a team owns, in model order. */
export function ownedBy(doc: PoneyDocument, teamId: string): Entity[] {
  return doc.model.entities.filter((e) => ownershipOf(e)?.team === teamId)
}
