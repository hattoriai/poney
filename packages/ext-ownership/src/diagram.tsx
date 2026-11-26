/** @jsxRuntime automatic @jsxImportSource react */
import { useMemo } from 'react'
import { Users } from 'lucide-react'
import type { View } from '@hattoriai/poney-core'
import { EntityNode, Glyph, Rings, toneColor, toneWash, useRenderBind, useRenderIndex, useRenderSubject, type DiagramModule } from '@hattoriai/poney-react'
import { ownershipOf, TEAM_KIND } from './index'
import type { TeamMapScene } from './layout'

/**
 * The team map, drawn with @hattoriai/poney-react: one column per team, with what it
 * owns. Register it (registerDiagram(teamMap)) and its layout
 * (registerExtensionLayout('ownership/team-map', layoutTeamMap)) to draw
 * "ownership/team-map" views.
 */

type TeamMapView = Extract<View, { type: 'extension' }>

function TeamMap({ scene }: { scene: TeamMapScene; view: TeamMapView }) {
  const idx = useRenderIndex()
  const bind = useRenderBind()
  const { subject, selection } = useRenderSubject()
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
          <g key={t.entityId} className={`poney-fade ${dim ? 'poney-dim' : ''}`}>
            <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={16} fill="var(--poney-paper)" fillOpacity={0.6} stroke="var(--poney-rule-strong)" />
            <g transform={`translate(${t.x} ${t.y})`} {...bind({ kind: 'entity', id: team.id }, `${team.name}. ${team.summary}`)}>
              <path d={`M 0 16 Q 0 0 16 0 H ${t.w - 16} Q ${t.w} 0 ${t.w} 16 V ${t.header} H 0 Z`} fill={toneWash(s.tone, 12)} />
              <Glyph name={s.icon} x={16} y={16} size={16} color={tone} />
              <text x={40} y={29} fontSize={14} fontWeight={650} fill="var(--poney-ink)">
                {team.name}
              </text>
              {t.mission.map((line, i) => (
                <text key={i} x={16} y={52 + i * 15} fontSize={12} fill="var(--poney-ink-2)">
                  {line}
                </text>
              ))}
              <text x={16} y={t.header - 12} fontSize={11} fill="var(--poney-ink-3)">
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
          <g key={o.entityId} transform={`translate(${o.x} ${o.y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}, owned by ${idx.entities.get(o.team)?.name}`)} className={`poney-el ${dim ? 'poney-dim' : ''}`}>
            <EntityNode entity={e} style={{ ...idx.style(e), shape: 'chip' }} w={o.w} h={o.h} emphasis={selected ? 'selected' : 'normal'} detail={false} />
          </g>
        )
      })}
    </g>
  )
}

export const teamMap: DiagramModule<TeamMapView, TeamMapScene> = {
  key: 'ownership/team-map',
  label: 'Team map',
  icon: Users,
  howToRead: 'One column per team, with everything it owns. Select a part anywhere in the studio to see its team and who is on call.',
  Renderer: TeamMap,
}

