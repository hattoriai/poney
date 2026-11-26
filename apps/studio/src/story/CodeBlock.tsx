import { Fragment } from 'react'
import { FileCode2, MessageCirclePlus, MessageSquareText } from 'lucide-react'
import type { CodeBlock as Block } from '@hattoriai/poney-core'
import { agentReady, useStudio, type ContextItem } from '@/features/store'
import { useTokens } from '@/features/highlight'
import { askAbout, codeChip, onCodeContextMenu } from '@/features/context'
import { EditableText } from '@/components/text/EditableText'

/**
 * A diff, read top to bottom, with the author's notes under their lines.
 * Code shown as it is (only unchanged lines, no old numbers) reads as a plain
 * excerpt: one column of line numbers, no signs, no counts.
 *
 * Code is coloured by the file's language. A line's number turns into an
 * "ask" button on hover: it puts the line in the message to the agent. Notes
 * are the document's text: like all text, a click edits them.
 */
export function CodeBlock({ block, onEditNote }: { block: Block; onEditNote?(index: number, value: string): void }) {
  const tokens = useTokens(block)
  const live = useStudio(agentReady)
  const lines = block.hunks.flatMap((h) => h.lines)
  const added = lines.filter((l) => l.kind === 'add').length
  const removed = lines.filter((l) => l.kind === 'del').length
  const plain = added === 0 && removed === 0 && lines.every((l) => l.old === undefined)
  const first = lines[0]?.new
  const last = lines[lines.length - 1]?.new
  const notesAt = new Map<number, { text: string; index: number }[]>()
  block.notes.forEach((n, index) => notesAt.set(n.line, [...(notesAt.get(n.line) ?? []), { text: n.text, index }]))
  const short = block.path.split('/').slice(-2).join('/')
  const chip = (line: number, text: string): ContextItem => codeChip(block.path, line, text)
  return (
    <figure className="overflow-hidden rounded-xl border border-rule bg-raised">
      <figcaption className="flex min-w-0 items-center gap-2 border-b border-rule px-3.5 py-2.5 text-[12.5px]">
        <FileCode2 size={14} className="shrink-0 text-ink-3" aria-hidden />
        <code className="min-w-0 truncate font-mono text-[12px] text-ink" title={block.path}>
          {short}
        </code>
        {block.title && <span className="shrink-0 text-ink-3">{block.title}</span>}
        <span className="flex-1" />
        {plain ? (
          first !== undefined && (
            <span className="font-tabular shrink-0 font-mono text-[11.5px] text-ink-3">
              {first === last ? `line ${first}` : `lines ${first}–${last}`}
            </span>
          )
        ) : (
          <span className="font-tabular shrink-0 font-mono text-[11.5px]">
            <span className="text-new">+{added}</span> <span className="text-removed">−{removed}</span>
          </span>
        )}
      </figcaption>
      <div className="scrollbar-quiet overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[12px] leading-[21px] [font-variant-ligatures:none]">
          <tbody>
            {block.hunks.map((h, hi) => (
              <Fragment key={hi}>
                {h.header && (
                  <tr>
                    <td colSpan={plain ? 2 : 4} className="bg-sunken/60 px-3.5 py-1 text-[11px] text-ink-3">
                      {h.header}
                    </td>
                  </tr>
                )}
                {h.lines.map((l, li) => {
                  const bg = l.kind === 'add' ? 'bg-new-wash' : l.kind === 'del' ? 'bg-removed-wash' : ''
                  const sign = l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''
                  const notes = l.kind !== 'del' && l.new ? notesAt.get(l.new) : undefined
                  return (
                    <Fragment key={li}>
                      <tr className={`group/line ${bg}`} onContextMenu={l.new !== undefined ? onCodeContextMenu(block.path, l.new, l.text) : undefined}>
                        {!plain && <td className="w-10 select-none pr-1 text-right align-top text-ink-4">{l.old ?? ''}</td>}
                        <td className={`relative w-10 select-none text-right align-top text-ink-4 ${plain ? 'pr-4' : 'pr-2'}`}>
                          <span className={live && l.new ? 'group-hover/line:invisible' : ''}>{l.new ?? ''}</span>
                          {live && l.new !== undefined && (
                            <button
                              type="button"
                              title="Ask the agent about this line"
                              aria-label={`Ask the agent about line ${l.new}`}
                              onClick={() => askAbout(chip(l.new!, l.text))}
                              className={`absolute inset-y-0 grid place-items-center text-poney opacity-0 focus-visible:opacity-100 group-hover/line:opacity-100 ${plain ? 'right-3' : 'right-1'}`}
                            >
                              <MessageCirclePlus size={14} />
                            </button>
                          )}
                        </td>
                        {!plain && <td className={`w-4 select-none align-top ${l.kind === 'add' ? 'text-new' : 'text-removed'}`}>{sign}</td>}
                        <td className="whitespace-pre pr-4 text-ink">
                          {tokens?.get(`${hi}:${li}`)?.map((t, ti) => (
                            <span key={ti} className="code-token" style={t.style}>
                              {t.content}
                            </span>
                          )) ?? (l.text || ' ')}
                        </td>
                      </tr>
                      {notes?.map((n) => (
                        <tr key={`n${n.index}`} onContextMenu={l.new !== undefined ? onCodeContextMenu(block.path, l.new, l.text, n.text) : undefined}>
                          <td colSpan={plain ? 1 : 3} />
                          <td className="py-1.5 pr-4">
                            <span className="inline-flex max-w-[56ch] items-start gap-2 whitespace-normal rounded-lg border border-rule bg-paper px-2.5 py-1.5 font-sans text-[12.5px] leading-snug text-ink-2">
                              <MessageSquareText size={13} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                              {onEditNote ? <EditableText label="Note on the code" value={n.text} onSave={(v) => onEditNote(n.index, v)} className="min-w-[8ch]" /> : n.text}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
