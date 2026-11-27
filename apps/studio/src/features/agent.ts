import { indexOf, refKey, validateDocument } from '@hattoriai/poney-core'
import { knownExtensions } from './extensions'
import type { OverlayResult, PluginItem, Provider, SessionSetting, SignInStatus } from '@hattoriai/poney/live'
import { useStudio, walkId, type ContextItem } from './store'

/**
 * Talking to agents through the live hub (see poney): ask a question,
 * start or stop an agent, answer its permission requests, pick a workspace.
 * Every call needs the Studio to be live; without a hub there is no agent.
 */

export type { Provider, SessionSetting, SignInStatus }

export interface Folder {
  path: string
  parent?: string
  git: boolean
  folders: { name: string; path: string; git: boolean }[]
  files: { name: string; path: string }[]
}

/** The local server's address once linked; a link that is coming back (a restart) is waited for, up to 15 seconds. */
function linked(): Promise<string | undefined> {
  const now = useStudio.getState().live
  if (now.state === 'on' && now.url) return Promise.resolve(now.url)
  if (now.state === 'off') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => (stop(), resolve(undefined)), 15000)
    const stop = useStudio.subscribe((s) => {
      if (s.live.state === 'on' && s.live.url) {
        window.clearTimeout(timer)
        stop()
        resolve(s.live.url)
      }
    })
  })
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const url = await linked()
  if (!url) throw new Error('The Studio cannot reach Poney on this computer. Run "npm run studio" in the Poney folder.')
  const res = await fetch(`${url}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Poney answered ${res.status}`)
  return data
}

/** Sends a question with where the person is and what they point at, so "what is this?" is enough. */
export function ask(text: string, context: ContextItem[] = []) {
  const s = useStudio.getState()
  const w = walkId(s.viewId)
  const doc = s.history?.present
  const described = doc && s.selection && indexOf(doc).exists(s.selection) ? indexOf(doc).describe(s.selection) : undefined
  return call('/api/live/ask', {
    text,
    walkthrough: s.startOpen ? undefined : w,
    scene: !s.startOpen && w ? s.activeScene ?? undefined : undefined,
    selection: !s.startOpen && s.selection ? { ref: refKey(s.selection), title: described?.title ?? '', kind: described?.kind ?? s.selection.kind } : undefined,
    ...(context.length ? { context } : {}),
  })
}

export const listAgents = () => call<{ providers: Provider[]; canStart: boolean; defaultAgent: AgentChoice | null; mcpServer?: { command: string; args: string[] } }>('/api/agent')
/** An agent as the Studio names it: a known one, or one the person added by command. */
export type AgentChoice = { providerId: string } | { custom: { name: string; command: string } }
/** Starts the agent for the open project, or for `folder`, which opens as the project first. */
export const connectAgent = async (agent: AgentChoice, folder?: string) => {
  const r = await call<{ choose?: string[] }>('/api/agent/connect', { ...agent, ...(folder ? { folder } : {}) })
  if (r?.choose) throw new Error('This folder has several workspaces. Open one with Open a workspace, then connect the agent.')
  return r
}
/** Asks whether an agent is signed in (its own CLI), or whether a test session opens. */
export const checkAgent = (agent: AgentChoice, fresh = false) => call<SignInStatus>('/api/agent/check', { ...agent, fresh })
export const disconnectAgent = () => call('/api/agent/disconnect', {})
export const cancelAgent = () => call('/api/agent/cancel', {})
export const choosePermission = (messageId: number, optionId: string) => call('/api/agent/permission', { messageId, optionId })
export const listFolders = (path?: string) => call<Folder>(`/api/workspace/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`)
/** Changes one of the agent's session settings: the model, the effort, the mode… */
export const setSetting = (id: string, value: string | boolean) => call('/api/agent/setting', { id, value })

/** A request that opens a document: the document it sends next shows, even from the start page. */
async function wanted<T>(request: () => Promise<T>): Promise<T> {
  useStudio.setState({ documentWanted: true })
  try {
    const result = await request()
    // The document asked for is shown already: no new one comes, so it shows now, as Poney on this computer has it.
    const revision = (result as { revision?: number | null } | null)?.revision
    if (useStudio.getState().documentWanted && revision != null && revision === useStudio.getState().live.revision) {
      useStudio.setState({ documentWanted: false })
      const { current } = await call<{ current?: unknown }>('/api/live/read')
      const checked = current == null ? undefined : validateDocument(current, { extensions: knownExtensions() })
      if (checked?.ok && checked.document) useStudio.getState().reviseDocument(checked.document, 'live')
    }
    return result
  } catch (e) {
    useStudio.setState({ documentWanted: false })
    throw e
  }
}

/** Opens a folder (a repository) as the project: agents work there, and its document is saved there. */
/** Opens a workspace: a .poney-workspace file, or a folder (its own workspace file, else the folder alone). `choose`: the folder has several workspace files. */
export const openProjectFolder = async (path: string) => {
  const r = await wanted(() => call<{ root?: string; choose?: string[] }>('/api/project/open', { path }))
  if (r.choose) useStudio.setState({ documentWanted: false })
  return r
}
/** Opens a new, blank workspace: no folders and no documents yet. It shows on the start page. */
export const newWorkspace = async () => {
  const w = await call<unknown>('/api/workspace/new', {})
  useStudio.getState().showStart(true)
  return w
}
/** Saves the open workspace as a .poney-workspace file. Its conversation and agent session move with it. */
export const saveWorkspace = (file: string, name?: string) => call<{ key: string }>('/api/workspace/save', { file, ...(name ? { name } : {}) })
/** Adds a folder to the open workspace, which must be saved. */
export const addFolder = (path: string) => call('/api/workspace/folders', { add: path })
export const removeFolder = (path: string) => call('/api/workspace/folders', { remove: path })
/** Removes a document from a saved workspace. The file stays. */
export const removeDocument = (path: string) => call('/api/workspace/documents/remove', { path })
/** Opens a .poney file on this computer; the Studio keeps it saved. */
export const openFile = (path: string) => wanted(() => call<{ path: string }>('/api/files/open', { path }))
/** Deletes a .poney file for good. The server deletes it only when it holds the document `project`. */
export const deleteFile = (path: string, project: string) => call('/api/files/delete', { path, project })
/** Makes a new, empty document in the open folder's docs/poney/, and shows it. */
export const newDocument = (name: string, folder?: string) => wanted(() => call<{ path: string }>('/api/documents/new', { name, ...(folder ? { folder } : {}) }))
export const cloneRepository = (url: string) => call<{ path: string }>('/api/workspace/clone', { url })

/** Importers and overlays, with what each would read in the project's folder. */
export const listPlugins = (folder?: string) => call<{ root: string | null; importers: PluginItem[]; overlays: PluginItem[]; problems: string[] }>(`/api/plugins${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`)
/** Adds what an importer reads to the open document. */
export const runImporter = (importer: string, folder?: string) => call<{ summary: string }>('/api/import', { importer, ...(folder ? { folder } : {}) })
/** Reads an overlay's facts and shows them in scenes; `clearOverlay` stops showing them. */
export const showOverlay = (id: string) => call<OverlayResult>('/api/overlays/run', { id })
export const clearOverlay = (id: string) => call('/api/overlays/clear', { id })
export type { OverlayResult, PluginItem }

/** Requests the Studio offers once an agent works in a folder. */
export const STARTERS = [
  { label: 'Give me a tour of this codebase', prompt: 'Give me a Poney tour of this codebase: what it is for, its main parts, one main flow end to end, and where to start a change. Open it in the Studio.' },
  { label: 'Walk me through the last commit', prompt: 'Write a Poney walkthrough of the last commit in this repository, check it against the code, and open it in the Studio.' },
  { label: 'How is this code organised?', prompt: 'Show me how this codebase is organised: its parts and how they connect, as a Poney map with groups. Open it in the Studio.' },
] as const

/** Requests for a document that already has content: they answer from it, or add to it, and keep what is there. */
export const MORE_STARTERS = [
  { label: 'What should I read first?', prompt: 'Using the open Poney document and the code, tell me in a few sentences what to read first and why. Do not change the document.' },
  { label: 'Explain this scene', prompt: 'Explain the scene I am on in plain words: what it shows and why it matters. Do not change the document.' },
  { label: 'Add the last commit', prompt: 'Add a walkthrough of the last commit in this repository to the open Poney document. Get the document with poney_read first and keep everything in it. Check it against the code, and open it again.' },
] as const

/** The starters that fit the open document. */
export const startersFor = (doc: { walkthroughs: unknown[]; views: unknown[] } | undefined) => (doc && (doc.walkthroughs.length || doc.views.length) ? MORE_STARTERS : STARTERS)

/** Agents the person added by command, kept in this browser. */
const CUSTOM = 'poney:agents'
export function customAgents(): { name: string; command: string }[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM) ?? '[]') as { name: string; command: string }[]
  } catch {
    return []
  }
}
export function saveCustomAgents(list: { name: string; command: string }[]) {
  try {
    localStorage.setItem(CUSTOM, JSON.stringify(list))
  } catch {
    /* a convenience only */
  }
}

/** The last folder the person worked in, kept in this browser. */
const FOLDER = 'poney:workspace'
export const lastFolder = () => {
  try {
    return localStorage.getItem(FOLDER) ?? undefined
  } catch {
    return undefined
  }
}
export const rememberFolder = (path: string) => {
  try {
    localStorage.setItem(FOLDER, path)
  } catch {
    /* a convenience only */
  }
}

/** The project's folder, as the Poney hub on this computer says: one rule for every way a project opens. */
export function useProjectRoot(): { root: string; name: string } | null {
  // A string, so the store returns the same value while nothing changes.
  const root = useStudio((s) => s.project?.root ?? null)
  return root ? { root, name: root.split('/').pop() ?? root } : null
}
