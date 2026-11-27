import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, mergeAttributes, Node, useEditor, type Editor, type JSONContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { useStudio, type ContextItem } from '@/features/store'

/**
 * A chip inside the message: something the person points at (a part, a line,
 * a diagram, a quote), placed in the sentence where they mean it, e.g.
 * "in the [Postgres] what is…". Backspace removes it like a character.
 */
const Chip = Node.create({
  name: 'chip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes: () => ({ ref: { default: null }, title: { default: '' }, kind: { default: '' }, quote: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-chip]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, {
      'data-chip': '',
      title: node.attrs.quote ?? node.attrs.ref ?? '',
      class: 'mx-px inline-flex max-w-[16rem] items-baseline gap-1 truncate rounded-md border border-poney/30 bg-poney-wash px-1.5 align-baseline text-[12.5px] leading-[1.45]',
    }),
    ['span', { class: 'text-ink-3' }, node.attrs.kind === 'text' ? '“' : node.attrs.kind],
    ['span', { class: 'font-medium text-ink' }, `${node.attrs.title}${node.attrs.kind === 'text' ? '”' : ''}`],
  ],
  renderText: ({ node }) => `“${node.attrs.title}”`,
})

/** The message as text for the agent (each chip as its quoted name, in place), and the chips themselves. */
export function readMessage(doc: JSONContent): { text: string; context: ContextItem[] } {
  const context: ContextItem[] = []
  const text = (doc.content ?? [])
    .map((p) =>
      (p.content ?? [])
        .map((n) => {
          if (n.type !== 'chip') return n.text ?? ''
          const a = n.attrs as ContextItem
          if (!context.some((c) => (a.ref ? c.ref === a.ref : c.quote === a.quote))) context.push({ ...(a.ref ? { ref: a.ref } : {}), title: a.title, kind: a.kind, ...(a.quote ? { quote: a.quote } : {}) })
          return `“${a.title}”`
        })
        .join(''),
    )
    .join('\n')
    .trim()
  return { text, context }
}

/**
 * The message box: text with chips inside it. Chips arrive from the context
 * menu, from pointing, or from selected text, and land where the caret is.
 * Enter sends; Shift+Enter starts a new line.
 */
export function MessageBox({
  placeholder,
  onSend,
  actions,
}: {
  placeholder: string
  onSend(message: { text: string; context: ContextItem[] }): Promise<boolean>
  /** The buttons next to the box; `send` sends what is in it. */
  actions(send: () => void, empty: boolean): ReactNode
}) {
  const [empty, setEmpty] = useState(true)
  const sendRef = useRef<() => void>(() => {})
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, Chip],
    immediatelyRender: true,
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'min-h-[112px] max-h-[45vh] overflow-y-auto px-3 py-2.5 text-[14px] leading-snug outline-none', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Your question' },
      handleKeyDown: (_view, e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          sendRef.current()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => setEmpty(editor.isEmpty),
  })

  // Chips added elsewhere (menu, pointing, selected text) go in where the caret is.
  const waiting = useStudio((s) => s.chips.length)
  useEffect(() => {
    if (!editor) return
    // Taken and cleared in one step: setup code that runs twice (React in development) cannot insert a chip twice.
    const chips = useStudio.getState().takeChips()
    if (!chips.length) return
    insertChips(editor, chips)
    setEmpty(false)
  }, [waiting, editor])

  // A suggested request goes in the box, for the person to read, change and send. It is never sent by itself.
  const draft = useStudio((s) => s.draft)
  useEffect(() => {
    if (!editor || draft === null) return
    const text = useStudio.getState().takeDraft()
    if (text === null) return
    editor.chain().setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }).focus('end').run()
    setEmpty(false)
  }, [draft, editor])

  sendRef.current = () => {
    if (!editor) return
    const message = readMessage(editor.getJSON())
    if (!message.text) return
    void onSend(message).then((ok) => {
      if (!ok) return
      editor.commands.clearContent()
      setEmpty(true)
    })
  }

  return (
    <div className="flex items-end gap-2">
      <div className="relative min-w-0 flex-1 rounded-xl border border-rule bg-paper focus-within:border-rule-strong [&_p]:m-0">
        {empty && <span className="pointer-events-none absolute left-3 top-2.5 text-[14px] text-ink-4">{placeholder}</span>}
        <EditorContent editor={editor} />
      </div>
      {actions(() => sendRef.current(), empty)}
    </div>
  )
}

function insertChips(editor: Editor, chips: ContextItem[]) {
  const content = chips.flatMap((c) => [{ type: 'chip', attrs: { ref: c.ref ?? null, title: c.title, kind: c.kind, quote: c.quote ?? null } }, { type: 'text', text: ' ' }])
  editor.chain().focus().insertContent(content).run()
}
