import { useMemo } from 'react'
import { Hash, PhoneCall, Users } from 'lucide-react'
import { ownedBy, ownership, ownershipOf, teamOf, TEAM_KIND } from '@poney/ext-ownership'
import { layoutTeamMap, type TeamMapScene } from '@poney/ext-ownership/layout'
import type { View } from '@poney/core'
import { useIndex } from '@/features/store'
import { useBind, useSubject } from '@/renderers/shared/interaction'
import { EntityNode, Rings } from '@/renderers/shared/EntityNode'
import { Glyph } from '@/renderers/shared/icons'
import { toneColor, toneWash } from '@/renderers/shared/tone'
import { EntityLink, Facts } from '@/components/inspector/parts'
import type { StudioExtension } from '@/features/extensions'
import type { DiagramModule } from '@/renderers/types'

type TeamMapView = Extract<View, { type: 'extension' }>

function TeamMap({ scene }: { scene: TeamMapScene; view: TeamMapView }) {
  const idx = useIndex()
  const bind = useBind()
  const { subject, selection } = useSubject()
  const focusTeam = useMemo(() => {
    if (subject?.kind !== 'entity') return null
    const e = idx.entities.get(subject.id)
    if (e?.kind === TEAM_KIND) return e.id
    return ownershipOf(e)?.team ?? null
  }, [subject, idx])

  return (
    <g>
      {scene.teams.map((t) => {
        const team = idx.entities.get(t.entityId)!
        const s = idx.style(team)
        const tone = toneColor(s.tone)
        const dim = focusTeam && focusTeam !== t.entityId
        const selected = selection?.kind === 'entity' && selection.id === t.entityId
        return (
          <g key={t.entityId} className={`transition-opacity ${dim ? 'dg-dim' : ''}`}>
            <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={16} fill="var(--paper)" fillOpacity={0.6} stroke="var(--rule-strong)" />
            <g transform={`translate(${t.x} ${t.y})`} {...bind({ kind: 'entity', id: team.id }, `${team.name}. ${team.summary}`)}>
              <path d={`M 0 16 Q 0 0 16 0 H ${t.w - 16} Q ${t.w} 0 ${t.w} 16 V ${t.header} H 0 Z`} fill={toneWash(s.tone, 12)} />
              <Glyph name={s.icon} x={16} y={16} size={16} color={tone} />
              <text x={40} y={29} fontSize={14} fontWeight={650} fill="var(--ink)">
                {team.name}
              </text>
              {t.mission.map((line, i) => (
                <text key={i} x={16} y={52 + i * 15} fontSize={12} fill="var(--ink-2)">
                  {line}
                </text>
              ))}
              <text x={16} y={t.header - 12} fontSize={11} fill="var(--ink-3)">
                On call: {t.oncall ?? 'none'}
              </text>
              <Rings w={t.w} h={t.header} rx={16} selected={selected} />
            </g>
          </g>
        )
      })}
      {scene.owned.map((o) => {
        const e = idx.entities.get(o.entityId)!
        const dim = focusTeam && focusTeam !== o.team
        const selected = selection?.kind === 'entity' && selection.id === e.id
        return (
          <g key={o.entityId} transform={`translate(${o.x} ${o.y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}, owned by ${idx.entities.get(o.team)?.name}`)} className={`dg-el ${dim ? 'dg-dim' : ''}`}>
            <EntityNode entity={e} style={{ ...idx.style(e), shape: 'chip' }} w={o.w} h={o.h} emphasis={selected ? 'selected' : 'normal'} detail={false} />
          </g>
        )
      })}
    </g>
  )
}

const teamMap: DiagramModule<TeamMapView, TeamMapScene> = {
  key: 'ownership/team-map',
  label: 'Team map',
  icon: Users,
  howToRead: 'One column per team, with everything it owns. Select a part anywhere in the studio to see its team and who is on call.',
  Renderer: TeamMap,
}

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
