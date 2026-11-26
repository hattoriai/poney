import { refKey, type PoneyDocument, type View } from '@poney/core'
import { wrap, type Rect, type SceneBase } from '@poney/layout'
import { ownedBy, ownershipOf, ownership, TeamMapData } from './index'

/**
 * Team map layout: one column per team in a grid, the team card on top and
 * what it owns below. Plain data, like every Poney scene.
 */
export interface TeamMapScene extends SceneBase {
  teams: (Rect & { entityId: string; mission: string[]; oncall?: string; channel?: string; header: number })[]
  owned: (Rect & { entityId: string; team: string })[]
}

const COL = 248
const GAP = 28
const HEADER = 104
const ITEM = 50
const PER_ROW = 4

export function layoutTeamMap(doc: PoneyDocument, view: Extract<View, { type: 'extension' }>): TeamMapScene {
  const parsed = TeamMapData.safeParse(view.data)
  if (!parsed.success) throw new Error(`The ${ownership.name} team map has invalid data`)
  const teams: TeamMapScene['teams'] = []
  const owned: TeamMapScene['owned'] = []
  let rowTop = 24
  for (let start = 0; start < parsed.data.teams.length; start += PER_ROW) {
    const row = parsed.data.teams.slice(start, start + PER_ROW)
    let tallest = 0
    row.forEach((teamId, i) => {
      const team = doc.model.entities.find((e) => e.id === teamId)
      if (!team) return
      const facet = ownershipOf(team)
      const x = 24 + i * (COL + GAP)
      const items = ownedBy(doc, teamId)
      items.forEach((e, j) => owned.push({ entityId: e.id, team: teamId, x: x + 12, y: rowTop + HEADER + 12 + j * (ITEM + 8), w: COL - 24, h: ITEM }))
      const h = HEADER + 12 + items.length * (ITEM + 8) + 8
      tallest = Math.max(tallest, h)
      teams.push({ entityId: teamId, x, y: rowTop, w: COL, h, header: HEADER, mission: wrap(facet?.mission ?? team.summary, COL - 32, 12, 400, 2), oncall: facet?.oncall, channel: facet?.channel })
    })
    for (const t of teams.filter((t) => t.y === rowTop)) t.h = tallest
    rowTop += tallest + GAP
  }
  const anchors: Record<string, Rect> = {}
  for (const t of teams) anchors[refKey({ kind: 'entity', id: t.entityId })] = t
  for (const o of owned) anchors[refKey({ kind: 'entity', id: o.entityId })] = o
  const cols = Math.min(PER_ROW, parsed.data.teams.length)
  return { width: 48 + cols * COL + (cols - 1) * GAP, height: rowTop, teams, owned, anchors }
}
