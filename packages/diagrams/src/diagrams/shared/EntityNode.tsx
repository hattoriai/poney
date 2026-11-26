/** @jsxRuntime automatic */
/** @jsxImportSource @hattoriai/poney-diagrams */
import { useMemo } from '../../runtime'
import { clip, wrap } from '@hattoriai/poney-layout'
import type { Entity, ResolvedStyle } from '@hattoriai/poney-core'
import { Glyph } from './icons'
import { toneColor, toneWash } from './tone'
import { useRenderZoom } from '../../render'

/**
 * Semantic zoom: the font size, in diagram units, that keeps text at least
 * `screen` pixels tall on screen, in steps so layouts can be cached.
 */
export function useReadableSize(base: number, screen = 11.5, max = 30) {
  const k = useRenderZoom()
  const wanted = screen / k
  return wanted <= base ? base : Math.min(max, Math.ceil(wanted / 2) * 2)
}

export type Emphasis = 'normal' | 'selected' | 'dim'

interface Props {
  entity: Entity
  style: ResolvedStyle
  w: number
  h: number
  emphasis: Emphasis
  /** Show the summary text (level of detail). */
  detail: boolean
  /** Footer text, for example "17 parts inside". */
  footer?: string
}

/** Selection ring and keyboard focus ring around a node box. */
export function Rings({ w, h, rx = 12, selected }: { w: number; h: number; rx?: number; selected: boolean }) {
  return (
    <>
      {selected && (
        <>
          <rect x={-5} y={-5} width={w + 10} height={h + 10} rx={rx + 5} fill="none" stroke="var(--poney-accent-ring)" strokeWidth={6} />
          <rect x={-2.5} y={-2.5} width={w + 5} height={h + 5} rx={rx + 2.5} fill="none" stroke="var(--poney-accent)" strokeWidth={1.75} />
        </>
      )}
      <rect className="poney-focus" x={-5} y={-5} width={w + 10} height={h + 10} rx={rx + 5} fill="none" stroke="var(--poney-accent)" strokeWidth={2} strokeDasharray="4 3" />
    </>
  )
}

/**
 * The visual treatment of one entity, by shape: card, cylinder (stores),
 * stack (queues), person, chip (code modules) and frame (a closed system).
 * Drawn at the origin; the caller positions it.
 */
export function EntityNode({ entity, style, w, h, emphasis, detail, footer }: Props) {
  const tone = toneColor(style.tone)
  const external = entity.kind === 'external'
  const selected = emphasis === 'selected'
  const summary = useMemo(
    () => (entity.summary ? wrap(entity.summary, style.shape === 'person' ? w - 12 : w - 30, style.shape === 'person' ? 11.5 : 12, 400, 2) : []),
    [entity.summary, w, style.shape],
  )
  const meta = entity.technology ?? style.label
  const nameSize = useReadableSize(14, 10.5)
  const compact = nameSize > 14 && style.shape !== 'person'
  const bigLines = useMemo(() => (compact ? wrap(entity.name, w - 28, nameSize, 650, 2) : []), [compact, entity.name, w, nameSize])
  const stroke = style.emphasis ? `color-mix(in srgb, ${tone} 55%, var(--poney-rule-strong))` : 'var(--poney-rule-strong)'

  if (style.shape === 'person') {
    const cx = w / 2
    return (
      <g>
        <rect width={w} height={h} rx={14} fill="transparent" />
        <circle cx={cx} cy={22} r={15} fill={toneWash(style.tone, 16)} stroke={tone} strokeWidth={1.4} />
        <path d={`M ${cx - 27} 64 Q ${cx - 27} 42 ${cx} 42 Q ${cx + 27} 42 ${cx + 27} 64 Z`} fill={toneWash(style.tone, 16)} stroke={tone} strokeWidth={1.4} strokeLinejoin="round" />
        <text x={cx} y={70 + Math.min(nameSize, 20)} textAnchor="middle" fontSize={Math.min(nameSize, 20)} fontWeight={650} fill="var(--poney-ink)">
          {clip(entity.name, w + 40, Math.min(nameSize, 20), 650)}
        </text>
        {detail &&
          !compact &&
          nameSize === 14 &&
          summary.map((line, i) => (
            <text key={i} x={cx} y={101 + i * 14} textAnchor="middle" fontSize={11.5} fill="var(--poney-ink-3)">
              {line}
            </text>
          ))}
        <Rings w={w} h={h} rx={14} selected={selected} />
      </g>
    )
  }

  const bigName = (dy = 0) =>
    bigLines.map((line, i) => (
      <text key={i} x={w / 2} y={dy + h / 2 + nameSize * 0.36 + (i - (bigLines.length - 1) / 2) * nameSize * 1.1} textAnchor="middle" fontSize={nameSize} fontWeight={650} fill="var(--poney-ink)">
        {line}
      </text>
    ))

  if (style.shape === 'chip') {
    const dashed = entity.kind === 'interface'
    return (
      <g>
        <rect className="poney-body" width={w} height={h} rx={10} fill={entity.kind === 'library' ? 'var(--poney-paper)' : 'var(--poney-paper-raised)'} stroke={dashed ? tone : stroke} strokeDasharray={dashed ? '5 3' : undefined} strokeWidth={1.1} />
        {compact ? (
          bigName()
        ) : (
          <>
        <rect x={11} y={(h - 30) / 2} width={30} height={30} rx={8} fill={toneWash(style.tone, 13)} />
        <Glyph name={style.icon} x={18} y={(h - 30) / 2 + 7} size={16} color={tone} />
        <text x={52} y={h / 2 - 3} fontSize={13.5} fontWeight={600} fill="var(--poney-ink)" fontFamily={entity.kind === 'interface' ? 'var(--poney-font-mono)' : undefined}>
          {clip(entity.name, w - 62, 13.5, 600, entity.kind === 'interface' ? 'mono' : 'sans')}
        </text>
        <text x={52} y={h / 2 + 13} fontSize={11.5} fill="var(--poney-ink-3)">
          {clip(meta, w - 62, 11.5)}
        </text>
          </>
        )}
        <Rings w={w} h={h} rx={10} selected={selected} />
      </g>
    )
  }

  const top = style.shape === 'cylinder' ? 12 : 0
  const body =
    style.shape === 'cylinder' ? (
      <>
        <path
          className="poney-body"
          d={`M 0 10 A ${w / 2} 10 0 0 1 ${w} 10 V ${h - 10} A ${w / 2} 10 0 0 1 0 ${h - 10} Z`}
          fill="var(--poney-paper-raised)"
          stroke={stroke}
          strokeWidth={1.1}
        />
        <ellipse cx={w / 2} cy={10} rx={w / 2} ry={10} fill={toneWash(style.tone, 9)} stroke={stroke} strokeWidth={1.1} />
      </>
    ) : (
      <>
        {style.shape === 'stack' && (
          <>
            <rect x={8} y={-8} width={w} height={h} rx={12} fill="var(--poney-paper)" stroke="var(--poney-rule-strong)" strokeWidth={1} />
            <rect x={4} y={-4} width={w} height={h} rx={12} fill="var(--poney-paper)" stroke="var(--poney-rule-strong)" strokeWidth={1} />
          </>
        )}
        <rect
          className="poney-body"
          width={w}
          height={h}
          rx={style.shape === 'frame' ? 16 : 12}
          fill={style.shape === 'frame' ? toneWash(style.tone, 6) : 'var(--poney-paper-raised)'}
          stroke={external ? tone : stroke}
          strokeDasharray={external ? '6 4' : undefined}
          strokeWidth={style.shape === 'frame' ? 1.5 : 1.1}
        />
      </>
    )

  const big = style.shape === 'frame'
  return (
    <g>
      {body}
      {compact && bigName(top / 2)}
      <g transform={`translate(0 ${top})`} display={compact ? 'none' : undefined}>
        <rect x={14} y={14} width={big ? 38 : 32} height={big ? 38 : 32} rx={9} fill={toneWash(style.tone, 14)} />
        <Glyph name={style.icon} x={big ? 23 : 21.5} y={big ? 23 : 21.5} size={big ? 20 : 17} color={tone} />
        <text x={big ? 64 : 56} y={big ? 31 : 29} fontSize={big ? 16 : 14} fontWeight={650} fill="var(--poney-ink)">
          {clip(entity.name, w - (big ? 76 : 68), big ? 16 : 14, 650)}
        </text>
        <text x={big ? 64 : 56} y={big ? 48 : 45.5} fontSize={11.5} fill="var(--poney-ink-3)">
          {clip(meta, w - (big ? 76 : 68), 11.5)}
        </text>
        {detail &&
          summary.map((line, i) => (
            <text key={i} x={14} y={(big ? 76 : 70) + i * 15} fontSize={12} fill="var(--poney-ink-2)">
              {line}
            </text>
          ))}
        {footer && (
          <text x={14} y={h - top - 16} fontSize={12} fontWeight={600} fill={tone}>
            {footer}
          </text>
        )}
      </g>
      <Rings w={w} h={h} rx={big ? 16 : 12} selected={selected} />
    </g>
  )
}
