import { describe, expect, it } from 'vitest'
import { blocksOf } from './blocks'

describe('blocksOf', () => {
  it('reads a reply with a heading, a list and a paragraph', () => {
    const reply = ['The **Knowledge base** is a folder.', '', '**What it does**', '- Each file holds one `###` heading.', '- `shared/` holds facts.', '', '## Where', 'In git.'].join('\n')
    expect(blocksOf(reply)).toEqual([
      { kind: 'paragraph', text: 'The **Knowledge base** is a folder.' },
      { kind: 'paragraph', text: '**What it does**' },
      { kind: 'list', ordered: false, start: 1, items: [{ text: 'Each file holds one `###` heading.' }, { text: '`shared/` holds facts.' }] },
      { kind: 'heading', level: 2, text: 'Where' },
      { kind: 'paragraph', text: 'In git.' },
    ])
  })

  it('reads numbered and nested lists, and lines that go on from an item', () => {
    expect(blocksOf('3. One\n   more\n4. Two\n   - inside\n   - also\n5. Three\n- other')).toEqual([
      {
        kind: 'list',
        ordered: true,
        start: 3,
        items: [{ text: 'One\nmore' }, { text: 'Two', list: { kind: 'list', ordered: false, start: 1, items: [{ text: 'inside' }, { text: 'also' }] } }, { text: 'Three' }],
      },
      { kind: 'list', ordered: false, start: 1, items: [{ text: 'other' }] },
    ])
  })

  it('keeps a code block as it is, with no inline Markdown read in it', () => {
    expect(blocksOf('```ruby\n# not a heading\n- not an item\n```\nAfter.')).toEqual([
      { kind: 'code', lang: 'ruby', text: '# not a heading\n- not an item' },
      { kind: 'paragraph', text: 'After.' },
    ])
  })

  it('reads a code block with no closing fence to the end', () => {
    expect(blocksOf('```\nopen')).toEqual([{ kind: 'code', lang: '', text: 'open' }])
  })

  it('reads tables, quotes and rules', () => {
    expect(blocksOf('| A | B |\n|---|:-:|\n| 1 | `2` |\n\n> said\n> twice\n\n---')).toEqual([
      { kind: 'table', head: ['A', 'B'], rows: [['1', '`2`']] },
      { kind: 'quote', text: 'said\ntwice' },
      { kind: 'rule' },
    ])
  })

  it('keeps HTML as text', () => {
    expect(blocksOf('<script>x</script>')).toEqual([{ kind: 'paragraph', text: '<script>x</script>' }])
  })
})
