/**
 * Text in a Poney document: plain strings, with a little inline Markdown.
 *
 * Prose fields (titles, summaries, scene text, notes) may use **bold**,
 * *italic* (or _italic_), `code` and [links](https://example.com). Blank lines
 * separate paragraphs where a field holds more than one. Nothing else: no
 * headings, lists or HTML. A reader that ignores this still shows readable text.
 */

export type InlineMark = 'bold' | 'italic' | 'code'

/** A run of text with the same marks. */
export interface InlineSpan {
  text: string
  marks: InlineMark[]
  href?: string
}

const TOKEN = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/gs

/** Reads inline Markdown into spans. */
export function parseInline(text: string, marks: InlineMark[] = [], href?: string): InlineSpan[] {
  const out: InlineSpan[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), marks, ...(href ? { href } : {}) })
    if (m[1] !== undefined) out.push({ text: m[1], marks: [...marks, 'code'], ...(href ? { href } : {}) })
    else if (m[2] !== undefined) out.push(...parseInline(m[2], marks, m[3]))
    else if (m[4] !== undefined) out.push(...parseInline(m[4], add(marks, 'bold'), href))
    else out.push(...parseInline(m[5] ?? m[6], add(marks, 'italic'), href))
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), marks, ...(href ? { href } : {}) })
  return merge(out)
}

/** The paragraphs of a field. */
export const paragraphsOf = (text: string): string[] => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

/** The text without Markdown: for places that draw plain text, such as an SVG label. */
export const plainText = (text: string): string =>
  paragraphsOf(text)
    .map((p) => parseInline(p).map((s) => s.text).join(''))
    .join('\n\n')

/** Writes spans back as inline Markdown. */
export function toInlineMarkdown(spans: InlineSpan[]): string {
  const groups: InlineSpan[][] = []
  for (const s of merge(spans)) {
    const g = groups[groups.length - 1]
    if (g && g[0].href === s.href) g.push(s)
    else groups.push([s])
  }
  return groups
    .map((g) => {
      const inner = g.map(mark).join('')
      return g[0].href ? `[${inner}](${g[0].href})` : inner
    })
    .join('')
}

function mark(s: InlineSpan): string {
  if (!s.text) return ''
  // Spaces stay outside the markers, so "**bold **" never happens.
  const [, lead, body, trail] = /^(\s*)(.*?)(\s*)$/s.exec(s.text)!
  if (!body) return s.text
  let t = body
  if (s.marks.includes('code')) t = `\`${t}\``
  if (s.marks.includes('italic')) t = `*${t}*`
  if (s.marks.includes('bold')) t = `**${t}**`
  return `${lead}${t}${trail}`
}

const add = (marks: InlineMark[], m: InlineMark) => (marks.includes(m) ? marks : [...marks, m])
const same = (a: InlineSpan, b: InlineSpan) => a.href === b.href && a.marks.length === b.marks.length && a.marks.every((m) => b.marks.includes(m))

function merge(spans: InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = []
  for (const s of spans) {
    if (!s.text) continue
    const prev = out[out.length - 1]
    if (prev && same(prev, s)) prev.text += s.text
    else out.push({ ...s, marks: [...s.marks] })
  }
  return out
}
