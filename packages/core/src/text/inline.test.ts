import { describe, expect, it } from 'vitest'
import { parseInline, plainText, toInlineMarkdown } from './inline'

describe('inline Markdown', () => {
  it('reads bold, italic, code and links', () => {
    expect(parseInline('A **bold** and *new* `ctx.scope` [docs](https://x.dev) here')).toEqual([
      { text: 'A ', marks: [] },
      { text: 'bold', marks: ['bold'] },
      { text: ' and ', marks: [] },
      { text: 'new', marks: ['italic'] },
      { text: ' ', marks: [] },
      { text: 'ctx.scope', marks: ['code'] },
      { text: ' ', marks: [] },
      { text: 'docs', marks: [], href: 'https://x.dev' },
      { text: ' here', marks: [] },
    ])
  })

  it('leaves words with stars or underscores alone', () => {
    expect(parseInline('snake_case_name and 2*3*4')).toEqual([{ text: 'snake_case_name and 2*3*4', marks: [] }])
  })

  it('writes back what it reads', () => {
    for (const t of ['Plain text.', 'A **bold** and *italic* word.', 'See [the **docs**](https://x.dev) and `code`.', '**Bold *and italic***'])
      expect(toInlineMarkdown(parseInline(t))).toBe(t)
  })

  it('keeps spaces outside the markers', () => {
    expect(toInlineMarkdown([{ text: 'bold ', marks: ['bold'] }, { text: 'end', marks: [] }])).toBe('**bold** end')
  })

  it('gives plain text for places that cannot draw marks', () => {
    expect(plainText('The **plug** checks `scope`.\n\nThen [it](https://x) runs.')).toBe('The plug checks scope.\n\nThen it runs.')
  })
})
