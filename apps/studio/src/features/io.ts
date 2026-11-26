import {
  detectMermaid,
  fromJSON,
  fromMermaid,
  looksLikePoney,
  MermaidImportError,
  toJSON,
  type PoneyDocument,
  type ValidationIssue,
} from '@hattoriai/poney-core'
import { knownExtensions } from './extensions'
import { useStudio } from './store'

/** What a piece of text is, for the import dialog. */
export function detectFormat(text: string): { kind: 'poney' | 'mermaid' | 'json' | 'unknown'; label: string } {
  const t = text.trim()
  if (!t) return { kind: 'unknown', label: 'Paste Poney JSON or a Mermaid diagram' }
  if (looksLikePoney(t)) return { kind: 'poney', label: 'Poney document' }
  const m = detectMermaid(t)
  if (m) return { kind: 'mermaid', label: { sequence: 'Mermaid sequence diagram', flowchart: 'Mermaid flowchart', state: 'Mermaid state diagram', er: 'Mermaid ER diagram' }[m] }
  if (t.startsWith('{')) return { kind: 'json', label: 'JSON, but not a Poney document (no "poneyVersion")' }
  return { kind: 'unknown', label: 'Not recognized' }
}

export type ImportResult = { ok: true; doc: PoneyDocument; warnings: ValidationIssue[] } | { ok: false; issues: { path: string; message: string }[] }

/** Converts text to a document: Poney JSON as is, Mermaid through the adapter. */
export function importText(text: string): ImportResult {
  const format = detectFormat(text)
  if (format.kind === 'poney' || format.kind === 'json') {
    const result = fromJSON(text, { extensions: knownExtensions() })
    if (!result.ok) return { ok: false, issues: result.issues.filter((i) => i.severity === 'error') }
    return { ok: true, doc: result.document, warnings: result.issues }
  }
  if (format.kind === 'mermaid') {
    try {
      return { ok: true, doc: fromMermaid(text).document, warnings: [] }
    } catch (e) {
      return { ok: false, issues: [{ path: '', message: e instanceof MermaidImportError ? e.message : String(e) }] }
    }
  }
  return { ok: false, issues: [{ path: '', message: 'Paste a Poney document (JSON with "poneyVersion") or a Mermaid diagram.' }] }
}

/** Opens text as a project, or shows the import dialog with the problems. */
export function openText(text: string, origin: 'pasted' | 'imported'): boolean {
  const s = useStudio.getState()
  const result = importText(text)
  if (!result.ok) {
    s.setImportOpen(true, text)
    return false
  }
  s.loadDocument(result.doc, origin)
  s.setImportOpen(false)
  s.notify(`Opened “${result.doc.project.name}”.${result.warnings.length ? ` ${result.warnings.length} note${result.warnings.length > 1 ? 's' : ''} in the inspector.` : ''}`)
  return true
}

export async function copyDocument() {
  const s = useStudio.getState()
  const json = toJSON(s.history.present)
  try {
    await navigator.clipboard.writeText(json)
    s.notify('Copied the model to the clipboard as Poney JSON.')
  } catch {
    s.notify('The browser blocked clipboard access. Use “Download JSON” instead.')
  }
}

export function downloadDocument() {
  const doc = useStudio.getState().history.present
  const blob = new Blob([toJSON(doc)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.project.id}.poney`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')

/** Pasting Poney JSON or Mermaid anywhere outside a text field opens it. */
export function installPasteHandler() {
  const onPaste = (e: ClipboardEvent) => {
    if (isTyping(e.target) || useStudio.getState().importOpen) return
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text.trim()) return
    const format = detectFormat(text)
    if (format.kind === 'unknown') {
      useStudio.getState().notify('The clipboard has no Poney JSON or Mermaid diagram.')
      return
    }
    e.preventDefault()
    openText(text, 'pasted')
  }
  window.addEventListener('paste', onPaste)
  return () => window.removeEventListener('paste', onPaste)
}

export { isTyping }
