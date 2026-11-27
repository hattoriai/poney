import { Fragment, type ReactNode } from 'react'
import { paragraphsOf, parseInline, type InlineSpan } from '@hattoriai/poney-core'

/**
 * Text from a Poney document, with its inline Markdown shown as formatting:
 * bold, italic, code and links. Paragraphs, when the field may hold several,
 * are blocks with space between them.
 */
export function Prose({ text, multiline = false }: { text: string; multiline?: boolean }) {
  const paragraphs = multiline ? paragraphsOf(text) : [text]
  if (paragraphs.length <= 1) return <Inline text={paragraphs[0] ?? ''} />
  return (
    <>
      {paragraphs.map((p, i) => (
        <span key={i} className={`block ${i > 0 ? 'mt-[0.8em]' : ''}`}>
          <Inline text={p} />
        </span>
      ))}
    </>
  )
}

export function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((s, i) => (
        <Fragment key={i}>{render(s)}</Fragment>
      ))}
    </>
  )
}

function render(s: InlineSpan): ReactNode {
  let node: ReactNode = s.text
  if (s.marks.includes('code')) node = <code className="rounded-[4px] bg-sunken px-1 py-px font-mono text-[0.88em] [font-variant-ligatures:none]">{node}</code>
  if (s.marks.includes('italic')) node = <em>{node}</em>
  if (s.marks.includes('bold')) node = <strong className="font-semibold text-ink">{node}</strong>
  // Only web and mail links: text from an agent or a file must not run script.
  if (s.href && /^(https?:|mailto:)/i.test(s.href))
    node = (
      <a href={s.href} target="_blank" rel="noreferrer" className="text-poney underline decoration-poney/40 underline-offset-2 hover:decoration-poney">
        {node}
      </a>
    )
  return node
}
