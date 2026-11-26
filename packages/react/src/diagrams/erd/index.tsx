/** @jsxRuntime automatic @jsxImportSource react */
import { useMemo } from 'react'
import { KeyRound, Link2, Table2 } from 'lucide-react'
import type { Cardinality, ViewOf } from '@hattoriai/poney-core'
import { clip, ERD, measure, roundedPath, type ErdScene, type Point } from '@hattoriai/poney-layout'
import { Rings } from '../shared/EntityNode'
import { Glyph } from '../shared/icons'
import { toneColor, toneWash } from '../shared/tone'
import { LegendRow } from '../shared/Legend'
import type { DiagramModule } from '../types'
import { useRenderBind, useRenderIndex, useRenderSubject, useViewState } from '../../render'

type View = ViewOf<'erd'>

/** Crow's-foot notation at one end of a relation. `p` is on the table edge; `d` points into the table. */
function Cardinal({ p, d, card, color }: { p: Point; d: Point; card: Cardinality; color: string }) {
  const perp = { x: -d.y, y: d.x }
  const at = (back: number, side = 0) => ({ x: p.x - d.x * back + perp.x * side, y: p.y - d.y * back + perp.y * side })
  const bar = (back: number) => {
    const a = at(back, 6)
    const b = at(back, -6)
    return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1.4} />
  }
  const circle = (back: number) => {
    const c = at(back)
    return <circle cx={c.x} cy={c.y} r={4} fill="var(--poney-paper-raised)" stroke={color} strokeWidth={1.3} />
  }
  const crow = () => {
    const root = at(13)
    return (
      <>
        {[-6.5, 0, 6.5].map((s) => {
          const tip = at(0, s)
          return <line key={s} x1={root.x} y1={root.y} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={1.3} />
        })}
      </>
    )
  }
  return (
    <g>
      {card === 'one' && (
        <>
          {bar(6)}
          {bar(11)}
        </>
      )}
      {card === 'zero-or-one' && (
        <>
          {bar(6)}
          {circle(15)}
        </>
      )}
      {card === 'many' && (
        <>
          {crow()}
          {circle(18)}
        </>
      )}
      {card === 'one-or-many' && (
        <>
          {crow()}
          {bar(17)}
        </>
      )}
    </g>
  )
}

const unit = (a: Point, b: Point) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
}

function Renderer({ scene, view }: { scene: ErdScene; view: View }) {
  const idx = useRenderIndex()
  const bind = useRenderBind()
  const { subject, selection } = useRenderSubject()
  const [ui, update] = useViewState(view.id)
  const expanded = ui.expandedTables ?? []

  const focus = useMemo(() => {
    if (!subject) return null
    const tables = new Set<string>()
    const rels = new Set<string>()
    const rows = new Set<string>()
    if (subject.kind === 'dataType') {
      if (!scene.tables.some((t) => t.dataTypeId === subject.id)) return null
      tables.add(subject.id)
      for (const r of scene.relations) {
        if (r.from !== subject.id && r.to !== subject.id) continue
        if (subject.field) {
          const t = scene.tables.find((x) => x.dataTypeId === subject.id)!
          const field = t.rows.find((f) => f.name === subject.field)
          const linked = r.via === subject.field || (field?.primaryKey && r.from === subject.id)
          if (!linked) continue
          rows.add(`${r.from}#${r.from === subject.id ? subject.field : r.via}`)
          rows.add(`${r.to}#${r.to === subject.id ? subject.field : r.via}`)
        }
        rels.add(r.id)
        tables.add(r.from)
        tables.add(r.to)
      }
      if (subject.field) rows.add(`${subject.id}#${subject.field}`)
    } else if (subject.kind === 'dataRelation') {
      const r = scene.relations.find((x) => x.id === subject.id)
      if (!r) return null
      rels.add(r.id)
      tables.add(r.from)
      tables.add(r.to)
      if (r.via) {
        rows.add(`${r.to}#${r.via}`)
        rows.add(`${r.from}#${r.via}`)
      }
    } else if (subject.kind === 'entity') {
      scene.tables.forEach((t) => t.store === subject.id && tables.add(t.dataTypeId))
      if (!tables.size) return null
      scene.relations.forEach((r) => tables.has(r.from) && tables.has(r.to) && rels.add(r.id))
    } else return null
    return { tables, rels, rows }
  }, [subject, scene])

  const toggle = (id: string) => update({ expandedTables: expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id] })

  return (
    <g>
      {scene.stores.map((s) => {
        const e = idx.entities.get(s.entityId)!
        const st = idx.style(e)
        const selected = selection?.kind === 'entity' && selection.id === e.id
        return (
          <g key={s.entityId}>
            <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={16} fill={toneWash(st.tone, 5)} stroke="var(--poney-rule-strong)" />
            <g transform={`translate(${s.x} ${s.y})`} {...bind({ kind: 'entity', id: e.id }, `${e.name}, ${e.technology ?? 'database'}`)}>
              <rect x={10} y={8} width={Math.min(s.w - 20, 320)} height={26} rx={7} fill="transparent" />
              <Glyph name={st.icon} x={18} y={13} size={15} color={toneColor(st.tone)} />
              <text x={40} y={25} fontSize={12.5} fontWeight={650} fill="var(--poney-ink)">
                {e.name}
              </text>
              <text x={50 + measure(e.name, 12.5, 650)} y={25} fontSize={11.5} fill="var(--poney-ink-3)">
                {e.technology}
              </text>
              {selected && <rect x={6} y={4} width={Math.min(s.w - 12, 330)} height={34} rx={9} fill="none" stroke="var(--poney-accent)" strokeWidth={1.5} />}
            </g>
          </g>
        )
      })}

      {scene.relations.map((r) => {
        const hot = focus?.rels.has(r.id)
        const selected = selection?.kind === 'dataRelation' && selection.id === r.id
        const color = hot || selected ? 'var(--poney-accent)' : 'var(--poney-ink-3)'
        const pts = r.points
        const n = pts.length
        return (
          <g key={r.id} {...bind({ kind: 'dataRelation', id: r.id }, idx.describe({ kind: 'dataRelation', id: r.id }).title)} className={`poney-el ${focus && !hot ? 'poney-dim' : ''}`}>
            <path d={roundedPath(pts, 8)} fill="none" stroke="transparent" strokeWidth={14} />
            <path d={roundedPath(pts, 8)} fill="none" stroke={color} strokeWidth={hot || selected ? 1.8 : 1.2} strokeDasharray={r.logical ? '6 4' : undefined} className="poney-edge" />
            <Cardinal p={pts[0]} d={unit(pts[1], pts[0])} card={r.fromCardinality} color={color} />
            <Cardinal p={pts[n - 1]} d={unit(pts[n - 2], pts[n - 1])} card={r.toCardinality} color={color} />
          </g>
        )
      })}

      {scene.tables.map((t) => {
        const d = idx.dataTypes.get(t.dataTypeId)!
        const dim = focus && !focus.tables.has(t.dataTypeId)
        const tableSelected = selection?.kind === 'dataType' && selection.id === t.dataTypeId && !selection.field
        const tone = d.storedIn ? idx.style(d.storedIn).tone : 'malachite'
        return (
          <g key={t.dataTypeId} transform={`translate(${t.x} ${t.y})`} className={`poney-fade ${dim ? 'poney-dim' : ''}`}>
            <rect width={t.w} height={t.h} rx={10} fill="var(--poney-paper-raised)" stroke={focus?.tables.has(t.dataTypeId) && subject?.kind === 'dataType' && subject.id === t.dataTypeId ? toneColor(tone) : 'var(--poney-rule-strong)'} />
            <g {...bind({ kind: 'dataType', id: t.dataTypeId }, `Table ${t.name}, ${d.fields.length} fields`)}>
              <path d={`M 0 10 Q 0 0 10 0 H ${t.w - 10} Q ${t.w} 0 ${t.w} 10 V ${ERD.header} H 0 Z`} fill={toneWash(tone, 9)} />
              <line x1={0} x2={t.w} y1={ERD.header} y2={ERD.header} stroke="var(--poney-rule)" />
              <g transform="translate(13 12)" color={toneColor(tone)}>
                <Table2 width={16} height={16} strokeWidth={1.8} />
              </g>
              <text x={38} y={25} fontSize={13.5} fontWeight={650} fontFamily="var(--poney-font-mono)" fill="var(--poney-ink)">
                {t.name}
              </text>
              <text x={t.w - 12} y={25} textAnchor="end" fontSize={11} fill="var(--poney-ink-3)" className="poney-numbers">
                {d.fields.length} fields
              </text>
            </g>
            {t.rows.map((f) => {
              const ry = f.y - t.y
              const hot = focus?.rows.has(`${t.dataTypeId}#${f.name}`)
              const selected = selection?.kind === 'dataType' && selection.id === t.dataTypeId && selection.field === f.name
              return (
                <g key={f.name} {...bind({ kind: 'dataType', id: t.dataTypeId, field: f.name }, `Field ${f.name}, ${f.type}${f.primaryKey ? ', primary key' : ''}${f.foreign ? ', foreign key' : ''}`)}>
                  <rect x={1} y={ry} width={t.w - 2} height={ERD.row} fill={selected ? 'var(--poney-accent-wash)' : hot ? toneWash(tone, 10) : 'transparent'} className="poney-row" />
                  {f.primaryKey && (
                    <g transform={`translate(13 ${ry + 6})`} color="var(--poney-ochre)">
                      <KeyRound width={13} height={13} strokeWidth={2} />
                    </g>
                  )}
                  {!f.primaryKey && f.foreign && (
                    <g transform={`translate(13 ${ry + 6})`} color="var(--poney-lapis)">
                      <Link2 width={13} height={13} strokeWidth={2} />
                    </g>
                  )}
                  <text x={38} y={ry + 17} fontSize={12.5} fontFamily="var(--poney-font-mono)" fontWeight={f.primaryKey ? 600 : 450} fill={selected ? 'var(--poney-accent)' : 'var(--poney-ink)'}>
                    {f.name}
                  </text>
                  <text x={t.w - 12} y={ry + 17} textAnchor="end" fontSize={11.5} fontFamily="var(--poney-font-mono)" fill="var(--poney-ink-3)">
                    {clip(f.type, t.w / 2 - 20, 11.5, 400, 'mono')}
                    {f.nullable ? '?' : ''}
                  </text>
                </g>
              )
            })}
            {(t.hiddenCount > 0 || t.expanded) && (
              <g
                role="button"
                tabIndex={0}
                data-ref="toggle"
                aria-label={t.expanded ? `Show fewer fields of ${t.name}` : `Show ${t.hiddenCount} more fields of ${t.name}`}
                className="poney-control"
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(t.dataTypeId)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggle(t.dataTypeId)
                  }
                }}
              >
                <rect x={1} y={t.h - ERD.more - ERD.bottom} width={t.w - 2} height={ERD.more} fill="transparent" />
                <line x1={0} x2={t.w} y1={t.h - ERD.more - ERD.bottom} y2={t.h - ERD.more - ERD.bottom} stroke="var(--poney-rule)" />
                <text x={t.w / 2} y={t.h - ERD.bottom - 10} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--poney-ink-2)">
                  {t.expanded ? 'Show fewer fields' : `Show ${t.hiddenCount} more field${t.hiddenCount === 1 ? '' : 's'}`}
                </text>
                <rect className="poney-focus" x={4} y={t.h - ERD.more - ERD.bottom + 2} width={t.w - 8} height={ERD.more - 4} rx={6} fill="none" stroke="var(--poney-accent)" strokeWidth={2} />
              </g>
            )}
            <Rings w={t.w} h={t.h} rx={10} selected={tableSelected} />
          </g>
        )
      })}
    </g>
  )
}

function Legend() {
  const row = (card: Cardinality, label: string) => (
    <div className="poney-legend-row">
      <svg width="30" height="16" aria-hidden>
        <line x1="0" y1="8" x2="28" y2="8" stroke="var(--poney-ink-3)" strokeWidth="1.2" />
        <Cardinal p={{ x: 28, y: 8 }} d={{ x: 1, y: 0 }} card={card} color="var(--poney-ink-2)" />
      </svg>
      {label}
    </div>
  )
  return (
    <div className="poney-legend">
      {row('one', 'Exactly one')}
      {row('zero-or-one', 'Zero or one')}
      {row('one-or-many', 'One or more')}
      {row('many', 'Any number')}
      <LegendRow line="dashed" label="Across databases, kept by code" head={false} />
      <div className="poney-legend-row">
        <KeyRound size={13} style={{ margin: '0 4px', color: 'var(--poney-ochre)' }} /> Primary key
        <Link2 size={13} style={{ marginLeft: 8, color: 'var(--poney-lapis)' }} /> Reference
      </div>
    </div>
  )
}

export const erd: DiagramModule<View, ErdScene> = {
  key: 'erd',
  label: 'Entity relationships',
  icon: Table2,
  howToRead: 'Each box is a table; the symbols at the line ends say how many rows can be on each side. Tables show their keys first. Select a field to see what it links to.',
  Renderer,
  Legend,
}
