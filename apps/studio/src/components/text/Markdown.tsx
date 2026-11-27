import { blocksOf, type Block, type ListBlock } from './blocks'
import { Inline } from './Prose'

/** A reply from an agent, with its Markdown shown as formatting. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {blocksOf(text).map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </div>
  )
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'heading':
      return (
        <p role="heading" aria-level={Math.min(6, b.level + 2)} className={`font-semibold text-ink ${b.level <= 2 ? 'pt-1 text-[14.5px]' : 'text-[13.5px]'}`}>
          <Inline text={b.text} />
        </p>
      )
    case 'paragraph':
      return (
        <p className="whitespace-pre-line">
          <Inline text={b.text} />
        </p>
      )
    case 'list':
      return <List list={b} />
    case 'code':
      return (
        <pre className="scrollbar-quiet overflow-x-auto rounded-lg bg-sunken px-3 py-2 font-mono text-[12px] leading-snug [font-variant-ligatures:none]">
          <code>{b.text}</code>
        </pre>
      )
    case 'quote':
      return (
        <blockquote className="whitespace-pre-line border-l-2 border-rule-strong pl-3 text-ink-2">
          <Inline text={b.text} />
        </blockquote>
      )
    case 'table':
      return (
        <div className="scrollbar-quiet overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {b.head.map((c, i) => (
                  <th key={i} className="border-b border-rule-strong px-2 py-1 text-left font-semibold">
                    <Inline text={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-rule px-2 py-1 align-top">
                      <Inline text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'rule':
      return <hr className="border-rule" />
  }
}

function List({ list }: { list: ListBlock }) {
  const Tag = list.ordered ? 'ol' : 'ul'
  return (
    <Tag start={list.ordered && list.start !== 1 ? list.start : undefined} className={`space-y-1 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'} marker:text-ink-3`}>
      {list.items.map((it, i) => (
        <li key={i}>
          <span className="whitespace-pre-line">
            <Inline text={it.text} />
          </span>
          {it.list && (
            <div className="mt-1">
              <List list={it.list} />
            </div>
          )}
        </li>
      ))}
    </Tag>
  )
}
