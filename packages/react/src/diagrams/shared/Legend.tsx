/** @jsxRuntime automatic @jsxImportSource react */
import { toneColor, toneWash } from './tone'

/** A miniature of a node shape with its label, for diagram keys. */
export function LegendShape({ shape, tone, label, dashed }: { shape: string; tone: string; label: string; dashed?: boolean }) {
  const c = toneColor(tone)
  const fill = toneWash(tone, 14)
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-ink-2">
      <svg width="22" height="16" aria-hidden className="shrink-0">
        {shape === 'person' && (
          <>
            <circle cx="11" cy="5" r="3.6" fill={fill} stroke={c} strokeWidth="1.2" />
            <path d="M4.5 15 Q4.5 9.5 11 9.5 Q17.5 9.5 17.5 15 Z" fill={fill} stroke={c} strokeWidth="1.2" />
          </>
        )}
        {shape === 'cylinder' && (
          <>
            <path d="M2 4 A9 2.6 0 0 1 20 4 V12 A9 2.6 0 0 1 2 12 Z" fill={fill} stroke={c} strokeWidth="1.2" />
            <ellipse cx="11" cy="4" rx="9" ry="2.6" fill={fill} stroke={c} strokeWidth="1.2" />
          </>
        )}
        {shape === 'stack' && (
          <>
            <rect x="5" y="1" width="15" height="10" rx="2.5" fill="none" stroke={c} strokeWidth="1" opacity="0.6" />
            <rect x="2" y="4" width="15" height="10" rx="2.5" fill={fill} stroke={c} strokeWidth="1.2" />
          </>
        )}
        {(shape === 'card' || shape === 'frame' || shape === 'chip') && (
          <rect x="2" y="2" width="18" height="12" rx="3" fill={fill} stroke={c} strokeWidth="1.2" strokeDasharray={dashed ? '3 2' : undefined} />
        )}
        {shape === 'pill' && <rect x="1" y="3" width="20" height="10" rx="5" fill={fill} stroke={c} strokeWidth="1.2" />}
        {shape === 'diamond' && <path d="M11 1 L20 8 L11 15 L2 8 Z" fill={fill} stroke={c} strokeWidth="1.2" />}
        {shape === 'dot' && <circle cx="11" cy="8" r="5" fill={c} />}
        {shape === 'bullseye' && (
          <>
            <circle cx="11" cy="8" r="6" fill="none" stroke={c} strokeWidth="1.2" />
            <circle cx="11" cy="8" r="3.4" fill={c} />
          </>
        )}
        {shape === 'store' && (
          <>
            <path d="M2 3 H20 M2 13 H20" stroke={c} strokeWidth="1.2" />
            <rect x="2" y="3" width="18" height="10" fill={fill} />
          </>
        )}
        {shape === 'bar' && <rect x="2" y="6" width="18" height="4" rx="2" fill={c} />}
      </svg>
      <span>{label}</span>
    </div>
  )
}

/** A line sample with its label. */
export function LegendRow({ line, label, color = 'var(--ink-3)', head = true }: { line: 'solid' | 'dashed' | 'dotted'; label: string; color?: string; head?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-ink-2">
      <svg width="22" height="16" aria-hidden className="shrink-0">
        <line x1="1" y1="8" x2={head ? 15 : 21} y2="8" stroke={color} strokeWidth="1.4" strokeDasharray={line === 'dashed' ? '4 3' : line === 'dotted' ? '1.4 3' : undefined} />
        {head && <path d="M14 4.5 L21 8 L14 11.5 Z" fill={color} />}
      </svg>
      <span>{label}</span>
    </div>
  )
}
