import { toJSON, validateDocument, type PoneyDocument } from '@hattoriai/poney-core'
import { knownExtensions } from './extensions'
import { useStudio, type OpenDocument } from './store'
import { openFile } from './agent'

/**
 * Recent documents, kept in this browser so a reload or a return visit
 * finds the work where it was. Only a convenience: storage may be missing.
 */
export interface Recent {
  id: string
  name: string
  description: string
  origin: OpenDocument['origin']
  at: string
  json: string
  /** The file the document is saved to, when Poney on this computer keeps it. */
  path?: string
}

const KEY = 'poney:recent'
/** The document open in this tab: kept per tab, so a reload keeps it and a new tab starts empty. */
const LAST = 'poney:last'
const MAX = 8

export function listRecent(): Recent[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Recent[]) : []
  } catch {
    return []
  }
}

function write(list: Recent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* full or blocked storage: keep going without recents */
  }
}

export function saveRecent(doc: PoneyDocument, origin: OpenDocument['origin'], path?: string) {
  const entry: Recent = { id: doc.project.id, name: doc.project.name, description: doc.project.description, origin, at: new Date().toISOString(), json: toJSON(doc), ...(path ? { path } : {}) }
  write([entry, ...listRecent().filter((r) => r.id !== doc.project.id)])
  try {
    sessionStorage.setItem(LAST, doc.project.id)
  } catch {
    /* see above */
  }
}

export function forgetRecent(id: string) {
  write(listRecent().filter((r) => r.id !== id))
}

export function forgetLast() {
  try {
    sessionStorage.removeItem(LAST)
  } catch {
    /* see above */
  }
}

/** The file a document is saved to, when Poney on this computer keeps it. */
export function fileOfDocument(id: string): string | undefined {
  const s = useStudio.getState()
  if (s.live.state !== 'on') return undefined
  if (id === s.projectId && s.liveFile) return s.liveFile
  return listRecent().find((r) => r.id === id)?.path
}

/** Opens a recent document: from its file when Poney on this computer can, else the copy kept here. Returns false if it does not open. */
export async function openRecent(r: Recent): Promise<boolean> {
  if (r.path && useStudio.getState().live.state === 'on') {
    try {
      await openFile(r.path)
      return true
    } catch {
      /* the file moved or broke: fall back to the copy */
    }
  }
  const result = validateDocument(JSON.parse(r.json), { extensions: knownExtensions() })
  if (!result.ok || !result.document) return false
  useStudio.getState().loadDocument(result.document, r.origin)
  return true
}

/** After a reload, reopens the document this tab had open. A new tab or a new start opens the start page. */
export function restoreLast(): boolean {
  // The address names the document (?doc=<id>), as Livebook's session links do; else the tab's last one.
  let last: string | null = new URLSearchParams(window.location.search).get('doc')
  try {
    last ??= sessionStorage.getItem(LAST)
  } catch {
    if (!last) return false
  }
  const r = listRecent().find((x) => x.id === last && x.origin !== 'example')
  if (!r) return false
  void openRecent(r)
  return true
}

/** Keeps the open document in the recent list as it changes. */
export function trackRecent() {
  let timer = 0
  let seen: unknown
  useStudio.subscribe((s) => {
    writeDocParam(s.history && !s.startOpen && s.projects.find((x) => x.id === s.projectId)?.origin !== 'example' ? s.projectId : null)
    if (!s.history || s.startOpen || s.history.present === seen) return
    seen = s.history.present
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      const st = useStudio.getState()
      const p = st.projects.find((x) => x.id === st.projectId)
      // The example is opened from the start page only; it is not a recent document.
      if (st.history && p?.origin !== 'example') saveRecent(st.history.present, p?.origin ?? 'imported', st.live.state === 'on' ? st.liveFile ?? undefined : undefined)
    }, 600)
  })
}

/** Keeps ?doc=<id> in the address for the open document, so the link opens it again. */
function writeDocParam(id: string | null) {
  const url = new URL(window.location.href)
  if ((url.searchParams.get('doc') ?? null) === id) return
  if (id) url.searchParams.set('doc', id)
  else url.searchParams.delete('doc')
  window.history.replaceState(window.history.state, '', url)
}

/** The sample project, loaded only when asked for. */
export async function openExample() {
  const { commerce } = await import('@hattoriai/poney-examples')
  const result = validateDocument(commerce, { extensions: knownExtensions() })
  if (!result.ok || !result.document) throw new Error(`The example is invalid: ${result.issues[0]?.path} ${result.issues[0]?.message}`)
  useStudio.getState().loadDocument(result.document, 'example')
}
