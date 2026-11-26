import { Hash, PhoneCall } from 'lucide-react'
import { ownedBy, ownership, ownershipOf, teamOf, TEAM_KIND } from '@poney/ext-ownership'
import { layoutTeamMap } from '@poney/ext-ownership/layout'
import { teamMap } from '@poney/ext-ownership/diagram'
import { EntityLink, Facts } from '@/components/inspector/parts'
import type { StudioExtension } from '@/features/extensions'

/** The ownership extension in the studio: a renderer, a layout and an inspector section. */
export const ownershipStudio: StudioExtension = {
  core: ownership,
  diagrams: [teamMap],
  layouts: { 'ownership/team-map': layoutTeamMap },
  inspector: [
    {
      id: 'ownership',
      title: 'Ownership',
      render({ ref, doc, idx }) {
        if (ref.kind !== 'entity') return null
        const entity = idx.entities.get(ref.id)
        if (!entity) return null
        if (entity.kind === TEAM_KIND) {
          const facet = ownershipOf(entity)
          const items = ownedBy(doc, entity.id)
          return (
            <div>
              <Facts
                items={[
                  ['On call', facet?.oncall && <span className="inline-flex items-center gap-1.5"><PhoneCall size={12} className="text-ink-3" />{facet.oncall}</span>],
                  ['Channel', facet?.channel && <span className="inline-flex items-center gap-1.5"><Hash size={12} className="text-ink-3" />{facet.channel.replace(/^#/, '')}</span>],
                ]}
              />
              <p className="mb-1 mt-3 text-[11.5px] text-ink-3">Owns {items.length}</p>
              {items.map((e) => <EntityLink key={e.id} id={e.id} />)}
            </div>
          )
        }
        const team = teamOf(doc, entity)
        if (!team) return null
        const facet = ownershipOf(team)
        return (
          <div>
            <EntityLink id={team.id} secondary="Owning team" />
            <div className="mt-2">
              <Facts items={[['On call', facet?.oncall], ['Channel', facet?.channel]]} />
            </div>
          </div>
        )
      },
    },
  ],
}
