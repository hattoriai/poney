import { classesOf, crossings, inZone, protectionOf, security, zoneOf, CLASS_LABEL, ZONE_KIND, type Trust } from '@poney/ext-security'
import { readFacet } from '@poney/core'
import { EntityLink, Facts } from '@/components/inspector/parts'
import type { StudioExtension } from '@/features/extensions'

const TRUST: Record<Trust, string> = { public: 'Public: anyone can reach it', internal: 'Internal', restricted: 'Restricted' }

/** A plain answer for a protection the document may not state. */
const stated = (v: boolean | undefined, yes: string, no: string) => (v === undefined ? 'Not stated' : v ? yes : no)

/**
 * The security extension in the Studio: an inspector section. Zones are drawn
 * with the core views (an architecture view's groups), so there is no
 * renderer of its own.
 */
export const securityStudio: StudioExtension = {
  core: security,
  inspector: [
    {
      id: 'security',
      title: 'Security',
      render({ ref, doc, idx }) {
        if (!doc.extensions.some((e) => e.name === 'security')) return null
        if (ref.kind === 'entity') {
          const entity = idx.entities.get(ref.id)
          if (!entity) return null
          if (entity.kind === ZONE_KIND) {
            const trust = readFacet(security, 'entity', entity)?.trust
            const members = inZone(doc, entity.id)
            return (
              <div>
                <Facts items={[['Trust', trust && TRUST[trust]]]} />
                <p className="mb-1 mt-3 text-[11.5px] text-ink-3">In this zone: {members.length}</p>
                {members.map((e) => (
                  <EntityLink key={e.id} id={e.id} />
                ))}
              </div>
            )
          }
          const zone = zoneOf(doc, entity)
          return zone ? <EntityLink id={zone.id} secondary="Trust zone" /> : null
        }
        if (ref.kind === 'relationship') {
          const c = crossings(doc).find((x) => x.relationship.id === ref.id)
          const p = protectionOf(idx.relationships.get(ref.id))
          if (!c && !p) return null
          return (
            <Facts
              items={[
                ['Crosses', c && `${c.fromZone.name} → ${c.toZone.name}`],
                ['Carries', c?.classes.length ? c.classes.map((k) => CLASS_LABEL[k]).join(', ') : undefined],
                ['Encrypted', stated(p?.encrypted, 'Yes', 'No')],
                ['Auth', p?.auth ?? 'Not stated'],
              ]}
            />
          )
        }
        if (ref.kind === 'dataType') {
          const classes = classesOf(idx.dataTypes.get(ref.id))
          return classes.length ? <Facts items={[['Sensitive', classes.map((k) => CLASS_LABEL[k]).join(', ')]]} /> : null
        }
        return null
      },
    },
  ],
}
