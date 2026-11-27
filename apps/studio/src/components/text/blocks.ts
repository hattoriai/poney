/**
 * The Markdown blocks an agent writes in its replies: headings, lists, code
 * blocks, quotes, tables and paragraphs. The text in each block is inline
 * Markdown, which Prose shows. No HTML: anything else stays as text.
 */
export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | ListBlock
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'rule' }

export interface ListBlock {
  kind: 'list'
  ordered: boolean
  start: number
  items: { text: string; list?: ListBlock }[]
}

interface RawItem {
  indent: number
  ordered: boolean
  start: number
  text: string
}

/** Items at the first item's indent make this list; deeper items make a list inside the item above them. */
function listOf(raw: RawItem[]): ListBlock {
  const base = raw[0].indent
  const list: ListBlock = { kind: 'list', ordered: raw[0].ordered, start: raw[0].start, items: [] }
  let i = 0
  while (i < raw.length) {
    const item: ListBlock['items'][number] = { text: raw[i].text }
    i++
    const inner: RawItem[] = []
    while (i < raw.length && raw[i].indent > base) inner.push(raw[i++])
    if (inner.length) item.list = listOf(inner)
    list.items.push(item)
  }
  return list
}

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const ITEM = /^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s*>\s?(.*)$/
const ROW = /^\s*\|.*\|\s*$/
const DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function blocksOf(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = line.match(FENCE)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i].trim().startsWith(fence[1]) && lines[i].trim().replace(/[`~]/g, '') === '')) body.push(lines[i++])
      i++ // the closing fence, when there is one
      out.push({ kind: 'code', lang: fence[2], text: body.join('\n') })
      continue
    }
    const heading = line.match(HEADING)
    if (heading) {
      out.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }
    if (RULE.test(line)) {
      out.push({ kind: 'rule' })
      i++
      continue
    }
    if (ROW.test(line) && i + 1 < lines.length && DIVIDER.test(lines[i + 1])) {
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && ROW.test(lines[i])) rows.push(cells(lines[i++]))
      out.push({ kind: 'table', head, rows })
      continue
    }
    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].match(QUOTE)![1])
      out.push({ kind: 'quote', text: body.join('\n') })
      continue
    }
    const first = line.match(ITEM)
    if (first) {
      const base = first[1].length
      const ordered = first[3] !== undefined
      const raw: RawItem[] = []
      while (i < lines.length) {
        const m = lines[i].match(ITEM)
        // A list ends at an item of the other kind at its own indent.
        if (m && (m[1].length > base || (m[1].length === base && (m[3] !== undefined) === ordered))) {
          raw.push({ indent: Math.max(base, m[1].length), ordered: m[3] !== undefined, start: m[3] !== undefined ? Number(m[3]) : 1, text: m[4] })
          i++
        } else if (!m && raw.length && /^\s+\S/.test(lines[i])) {
          // A line that goes on from the item above it.
          raw[raw.length - 1].text += '\n' + lines[i].trim()
          i++
        } else break
      }
      out.push(listOf(raw))
      continue
    }
    const body: string[] = []
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !ITEM.test(lines[i]) && !QUOTE.test(lines[i]) && !RULE.test(lines[i])) body.push(lines[i++])
    out.push({ kind: 'paragraph', text: body.join('\n') })
  }
  return out
}
