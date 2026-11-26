import { useRef, useState, type ElementType, type KeyboardEvent } from 'react'
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Code from '@tiptap/extension-code'
import Link from '@tiptap/extension-link'
import { Bold as BoldIcon, Code as CodeIcon, Italic as ItalicIcon, Link as LinkIcon } from 'lucide-react'
import { paragraphsOf, parseInline, toInlineMarkdown, type InlineMark, type InlineSpan } from '@poney/core'
import { Prose } from './Prose'

interface Props {
  value: string
  onSave(value: string): void
  /** The element the text is shown in, e.g. "h1" or "p". */
  as?: ElementType
  className?: string
  /** The field may hold several paragraphs (Enter starts a new one). Else Enter saves. */
  multiline?: boolean
  /** What the field is, for screen readers: "title", "scene text"… */
  label: string
  id?: string
}

/**
 * Text you click to edit, in place. The editor (TipTap) knows only what a
 * Poney text field holds: paragraphs, bold, italic, code and links. Leaving
 * the field saves it as inline Markdown; Escape puts the old text back.
 */
export function EditableText({ value, onSave, as: Tag = 'span', className = '', multiline = false, label, id }: Props) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <Editing
        value={value}
        multiline={multiline}
        className={className}
        label={label}
        onDone={(next) => {
          setEditing(false)
          if (next !== undefined && next.trim() && next !== value) onSave(next)
        }}
      />
    )
  const start = () => {
    // Selecting text to copy it is not a request to edit.
    if (window.getSelection()?.toString()) return
    setEditing(true)
  }
  return (
    <Tag
      id={id}
      className={`${className} -mx-1 cursor-text rounded-md px-1 transition-[background-color] hover:bg-sunken/60 focus-visible:bg-sunken/60`}
      tabIndex={0}
      title="Click to edit"
      aria-description={`${label}. Press Enter to edit.`}
      onClick={(e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('a')) return
        start()
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault()
          setEditing(true)
        }
      }}
    >
      <Prose text={value} multiline={multiline} />
    </Tag>
  )
}

function Editing({ value, multiline, className, label, onDone }: { value: string; multiline: boolean; className: string; label: string; onDone(next?: string): void }) {
  const bar = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  const finish = (editor: Editor | null, keep: boolean) => {
    if (done.current) return
    done.current = true
    onDone(keep && editor ? fromEditor(editor.getJSON()) : undefined)
  }
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, Bold, Italic, Code, Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true })],
    content: toEditor(value, multiline),
    autofocus: 'end',
    immediatelyRender: true,
    editorProps: {
      attributes: { class: 'outline-none [&>p+p]:mt-[0.8em]', 'aria-label': label, role: 'textbox', 'aria-multiline': String(multiline) },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          finish(null, false)
          return true
        }
        if (event.key === 'Enter' && !event.shiftKey && (!multiline || event.metaKey || event.ctrlKey)) {
          finish(editorRef.current, true)
          return true
        }
        return false
      },
    },
    onBlur: ({ editor, event }) => {
      // Clicking the toolbar keeps the field open.
      if (event.relatedTarget instanceof Node && bar.current?.contains(event.relatedTarget)) return
      finish(editor, true)
    },
  })
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor
  return (
    <div className={`${className} relative -mx-1 rounded-md bg-raised px-1 ring-2 ring-poney/50`}>
      <Toolbar editor={editor} bar={bar} />
      <EditorContent editor={editor} />
    </div>
  )
}

/** Bold, italic, code, link: the marks a Poney text field can hold. */
function Toolbar({ editor, bar }: { editor: Editor | null; bar: React.RefObject<HTMLDivElement> }) {
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState('')
  if (!editor) return null
  const button = (on: boolean, label: string, icon: React.ReactNode, run: () => void, keys: string) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={`${label} (${keys})`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`grid h-7 w-7 place-items-center rounded-md ${on ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-sunken'}`}
    >
      {icon}
    </button>
  )
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
  return (
    <div ref={bar} className="absolute -top-10 left-0 z-20 flex items-center gap-0.5 rounded-lg border border-rule bg-raised p-0.5 font-sans text-[13px] font-normal leading-none tracking-normal shadow-float">
      {button(editor.isActive('bold'), 'Bold', <BoldIcon size={14} />, () => editor.chain().focus().toggleBold().run(), `${mod}B`)}
      {button(editor.isActive('italic'), 'Italic', <ItalicIcon size={14} />, () => editor.chain().focus().toggleItalic().run(), `${mod}I`)}
      {button(editor.isActive('code'), 'Code', <CodeIcon size={14} />, () => editor.chain().focus().toggleCode().run(), `${mod}E`)}
      {button(editor.isActive('link'), 'Link', <LinkIcon size={14} />, () => {
        if (editor.isActive('link')) return void editor.chain().focus().unsetLink().run()
        setHref('')
        setLinking(true)
      }, 'paste a URL on a selection')}
      {linking && (
        <form
          className="flex items-center gap-1 pl-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (href.trim()) editor.chain().focus().setLink({ href: href.trim() }).run()
            else editor.commands.focus()
            setLinking(false)
          }}
        >
          <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setLinking(false), editor.commands.focus())} placeholder="https://" aria-label="Link address" className="h-7 w-56 rounded-md border border-rule bg-paper px-2 text-[12.5px] outline-none focus:border-rule-strong" />
        </form>
      )}
    </div>
  )
}

/* ─── Inline Markdown ⇄ editor content ────────────────────────────────── */

function toEditor(text: string, multiline: boolean): JSONContent {
  const paragraphs = multiline ? paragraphsOf(text) : [text.replace(/\n+/g, ' ')]
  return {
    type: 'doc',
    content: (paragraphs.length ? paragraphs : ['']).map((p) => {
      const content = parseInline(p).map((s) => ({
        type: 'text',
        text: s.text,
        marks: [...s.marks.map((m) => ({ type: m })), ...(s.href ? [{ type: 'link', attrs: { href: s.href } }] : [])],
      }))
      return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
    }),
  }
}

function fromEditor(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((p) =>
      toInlineMarkdown(
        (p.content ?? []).map((n): InlineSpan => {
          const marks = (n.marks ?? []).map((m) => m.type).filter((m): m is InlineMark => m === 'bold' || m === 'italic' || m === 'code')
          const href = n.marks?.find((m) => m.type === 'link')?.attrs?.href as string | undefined
          return { text: n.text ?? '', marks, ...(href ? { href } : {}) }
        }),
      ).trim(),
    )
    .filter(Boolean)
    .join('\n\n')
}
