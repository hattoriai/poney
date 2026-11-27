import { indexOf, refKey, validateDocument, plainText } from '@hattoriai/poney-core'
import { knownExtensions } from './extensions'
import { useStudio, walkId, type AgentStatus, type Message } from './store'
import type { WorkspaceDocuments } from '@hattoriai/poney/live'
import { listRecent } from './recent'
import { readLocation } from './location'

/** The document the address named when the page opened (?doc=<id>); the start page may remove it from the address. */
const REQUESTED = new URLSearchParams(window.location.search).get('doc')
/** The view the address named when the page opened (#/<view>), for a document that only the local server has. */
const REQUESTED_VIEW = window.location.hash

/**
 * The live link to an agent session (see poney).
 *
 * The Studio connects when it is served by the agent's hub, or when the
 * address has ?live=<hub address>. It receives documents as the agent opens
 * them, and reports what the person sees and does, so the agent can read it.
 */
export function installLive() {
  const param = new URLSearchParams(window.location.search).get('live')
  const base = param ?? window.location.origin
  void fetch(`${base}/api/live`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no hub'))))
    .then(() => connect(base))
    .catch(() => {
      if (param) useStudio.getState().setLive({ state: 'lost', url: base })
    })
}

function connect(base: string, attempt = 0) {
  const s = useStudio.getState()
  if (attempt === 0) s.setLive({ state: 'connecting', url: base })
  const events = new EventSource(`${base}/api/live/events`)
  events.onopen = () => {
    attempt = 0
    useStudio.getState().setLive({ ...useStudio.getState().live, state: 'on', url: base })
    void giveBack(base)
  }
  events.onerror = () => {
    useStudio.getState().setLive({ ...useStudio.getState().live, state: 'lost' })
    // The browser retries a dropped connection by itself, but gives up for good when the server answers with an error,
    // as while the local server restarts. Then a new connection is opened, waiting longer each time (up to 10 seconds).
    if (events.readyState !== EventSource.CLOSED) return
    events.close()
    window.setTimeout(() => connect(base, attempt + 1), Math.min(10_000, 500 * 2 ** attempt))
  }
  let first = true
  events.addEventListener('document', (e) => {
    const { revision, document, source } = JSON.parse((e as MessageEvent).data) as { revision: number; document: unknown; source?: 'agent' | 'file' | 'workspace' }
    // No document shown: the folder has several, and the person selects one (see the documents event).
    if (document === null) {
      first = false
      return useStudio.getState().setLive({ ...useStudio.getState().live, state: 'on', url: base, revision })
    }
    const result = validateDocument(document, { extensions: knownExtensions() })
    const st = useStudio.getState()
    if (!result.ok || !result.document) return st.notify('The agent sent a document with errors. It was not opened.')
    // On connecting, what the local server already holds never replaces a different document opened here on purpose.
    // A document the person asked for (a file, a folder, a new document) always shows.
    const opening = first && !st.documentWanted
    first = false
    if (st.documentWanted) useStudio.setState({ documentWanted: false })
    if (opening && st.history && !st.startOpen && st.projectId !== result.document.project.id) {
      st.keepProject(result.document, 'live')
      st.setLive({ state: 'on', url: base, revision })
      return st.notify(`“${result.document.project.name}” from Poney on this computer is in the document menu.`)
    }
    // The start page stays, and the document waits in its list, unless the address names this document (?doc=<id>).
    const named = REQUESTED === result.document.project.id
    if (opening && st.startOpen && !named) {
      st.keepProject(result.document, 'live')
      return st.setLive({ state: 'on', url: base, revision })
    }
    // An empty project for a folder whose work this Studio already has: keep the work, and give it back to the agent.
    const mine = st.projects.find((p) => p.id === result.document!.project.id)?.doc
    if (isEmpty(result.document) && mine && !isEmpty(mine)) {
      st.reviseDocument(mine, 'live')
      st.setLive({ state: 'on', url: base, revision })
      void fetch(`${base}/api/live/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ document: mine }) }).catch(() => undefined)
      return
    }
    st.reviseDocument(result.document, 'live')
    // The document the address named, arriving from the local server: show the view the address named too.
    if (opening && named && REQUESTED_VIEW.startsWith('#/') && REQUESTED_VIEW !== '#/start') {
      window.history.replaceState(window.history.state, '', REQUESTED_VIEW)
      readLocation()
    }
    st.setLive({ state: 'on', url: base, revision })
    st.notify(
      isEmpty(result.document)
        ? `Opened “${result.document.project.name}”. Ask the agent for a tour to fill it.`
        : source === 'file'
          ? `Opened “${result.document.project.name}” from its file.`
          : `The agent opened “${plainText(result.document.walkthroughs[0]?.title ?? result.document.project.name)}” (revision ${revision}).`,
    )
    lastSent = ''
    report(base)
  })

  // The conversation and who answers: a snapshot on connect, then each change.
  events.addEventListener('thread', (e) => useStudio.getState().setConversation((JSON.parse((e as MessageEvent).data) as { messages: Message[] }).messages))
  events.addEventListener('message', (e) => useStudio.getState().putMessage(JSON.parse((e as MessageEvent).data) as Message))
  events.addEventListener('agent', (e) => useStudio.getState().setAgent(JSON.parse((e as MessageEvent).data) as AgentStatus))
  events.addEventListener('project', (e) => {
    const p = JSON.parse((e as MessageEvent).data) as { root: string | null; name: string | null }
    useStudio.getState().setProject(p.root ? { root: p.root, name: p.name ?? p.root } : null)
  })
  events.addEventListener('overlays', (e) => useStudio.getState().setOverlays(JSON.parse((e as MessageEvent).data)))
  events.addEventListener('file', (e) => useStudio.getState().setLiveFile((JSON.parse((e as MessageEvent).data) as { path: string | null }).path))
  events.addEventListener('workspace', (e) => useStudio.getState().setWorkspace(JSON.parse((e as MessageEvent).data)))
  events.addEventListener('documents', (e) => useStudio.getState().setFolderDocuments(JSON.parse((e as MessageEvent).data) as WorkspaceDocuments))

  // Report what the person does, a moment after they do it.
  let timer = 0
  useStudio.subscribe(() => {
    clearTimeout(timer)
    timer = window.setTimeout(() => report(base), 400)
  })
  window.addEventListener('poney:local', () => {
    clearTimeout(timer)
    timer = window.setTimeout(() => report(base), 400)
  })
}

let lastSent = ''

function readLocal<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function report(base: string) {
  const s = useStudio.getState()
  if (!s.history) return
  const doc = s.history.present
  const w = walkId(s.viewId)
  const key = (kind: string) => `poney:${kind}:${doc.project.id}:${w ?? ''}`
  const idx = indexOf(doc)
  const described = s.selection && idx.exists(s.selection) ? idx.describe(s.selection) : undefined
  const state = {
    projectId: doc.project.id,
    viewId: s.viewId,
    walkthrough: w,
    scene: w ? s.activeScene ?? undefined : undefined,
    selection: s.selection ? { ref: refKey(s.selection), title: described?.title ?? '', kind: described?.kind ?? s.selection.kind } : undefined,
    answers: w ? readLocal<Record<string, string>>(key('answers')) : undefined,
    notes: w ? readLocal<Record<string, string>>(key('notes')) : undefined,
    read: w ? readLocal<string[]>(key('read')) : undefined,
    // Any change, or an undo back to where it started, so the file always holds what the person sees.
    document: s.history.past.length || s.history.future.length ? doc : undefined,
  }
  const body = JSON.stringify(state)
  if (body === lastSent) return
  lastSent = body
  void fetch(`${base}/api/live/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => undefined)
}

/** A document with nothing drawn yet: a workspace's project before the agent opens anything. */
const isEmpty = (doc: { views: unknown[]; walkthroughs: unknown[] }) => doc.views.length === 0 && doc.walkthroughs.length === 0

/**
 * A local server that restarted knows no document. The one open here goes
 * back to it: from its file when this Studio knows the file (which also tells
 * it the project folder), else as it is, so agents can read it.
 */
async function giveBack(base: string) {
  const s = useStudio.getState()
  const doc = s.history?.present
  const origin = s.projects.find((p) => p.id === s.projectId)?.origin
  if (!doc || origin === 'example' || s.startOpen) return
  const info = (await fetch(`${base}/api/live`).then((r) => r.json()).catch(() => ({}))) as { revision?: number }
  if (info.revision !== 0) return
  const path = s.liveFile ?? listRecent().find((r) => r.id === doc.project.id)?.path
  const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  // With the document: a file not written yet still brings its project back, and with it the project's agent.
  const opened = path ? await post('/api/files/open', { path, document: doc }).then((r) => r.ok).catch(() => false) : false
  if (!opened) await post('/api/live/open', { document: doc }).catch(() => undefined)
}
