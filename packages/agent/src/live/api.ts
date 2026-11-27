/**
 * What an agent's tools need from the live link, whether the hub runs in this
 * process or in another one (a Studio started with `poney studio`, or another
 * agent's MCP server). The MCP server uses only this.
 */
import type { LiveState } from './state'
import type { DocumentFiles } from './files'
import type { Message, Place, StudioState, WorkspaceDocuments } from './types'

export interface LiveRead {
  viewers: number
  studio?: StudioState
  /** The document the person is looking at. */
  current?: unknown
  thread: Message[]
  /** The project's file exists but is not a valid document. */
  invalid?: string
  /** The open folder: its documents, and the one shown (its path). */
  workspace?: WorkspaceDocuments & { folder: string }
}

/** What opening a document did. `saved`: kept in its project, not shown. `refused`: why nothing was saved. */
export interface Opened {
  revision: number
  viewers: number
  saved?: boolean
  refused?: string
}

export interface LiveApi {
  /** Where the person opens the Studio. */
  readonly studioUrl: string
  /** `file`: the target document (a path, relative to the folder). Default: the shown one. */
  open(document: unknown, file?: string): Promise<Opened>
  read(): Promise<LiveRead>
  /** `answeredInStudio`: an agent the Studio started takes the questions, so there is nothing to wait for. */
  waitForQuestions(timeoutMs: number): Promise<{ questions: Extract<Message, { from: 'person' }>[]; viewers: number; place?: Place; answeredInStudio?: boolean }>
  reply(text: string, extra?: Place & { inReplyTo?: number }): Promise<Message>
}

/** The hub in this process. */
export class LocalLive implements LiveApi {
  constructor(
    private readonly state: LiveState,
    private readonly server: { studioUrl: string; viewers: number },
    private readonly files?: DocumentFiles,
  ) {}
  get studioUrl() {
    return this.server.studioUrl
  }
  async open(document: unknown, file?: string): Promise<Opened> {
    if (!this.files) return { revision: this.state.open(document), viewers: this.server.viewers }
    const { revision, saved, refused } = this.files.agentOpen(document, { file })
    return { revision: revision ?? this.state.shown()?.revision ?? 0, viewers: this.server.viewers, ...(saved ? { saved } : {}), ...(refused ? { refused } : {}) }
  }
  async read(): Promise<LiveRead> {
    const folder = this.state.project?.cwd
    return { viewers: this.server.viewers, studio: this.state.studio, current: this.state.current(), thread: this.state.thread(), ...(folder ? { workspace: { folder, ...this.state.documents } } : {}) }
  }
  async waitForQuestions(timeoutMs: number) {
    const questions = await this.state.waitForQuestions(timeoutMs)
    return { questions, viewers: this.server.viewers, place: { walkthrough: this.state.studio?.walkthrough, scene: this.state.studio?.scene }, answeredInStudio: !!this.state.status().session }
  }
  async reply(text: string, extra: Place & { inReplyTo?: number } = {}) {
    return this.state.reply(text, extra)
  }
}

/** A hub in another process, reached over HTTP on this machine. */
export class RemoteLive implements LiveApi {
  constructor(readonly url: string) {}
  get studioUrl() {
    return `${this.url}/`
  }
  private async call<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
    const res = await fetch(`${this.url}${path}`, {
      method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
    })
    if (!res.ok) throw new Error(`The Poney hub at ${this.url} answered ${res.status}: ${await res.text()}`)
    return (await res.json()) as T
  }
  open(document: unknown, file?: string) {
    // An agent the Studio started names its project: the hub shows the document only when that project is open.
    const project = process.env.PONEY_PROJECT
    return this.call<Opened>('/api/live/open', { body: { document, ...(project ? { project } : {}), ...(file ? { file } : {}) } })
  }
  read() {
    const project = process.env.PONEY_PROJECT
    return this.call<LiveRead>(`/api/live/read${project ? `?project=${encodeURIComponent(project)}` : ''}`)
  }
  waitForQuestions(timeoutMs: number) {
    return this.call<{ questions: Extract<Message, { from: 'person' }>[]; viewers: number; place?: Place; answeredInStudio?: boolean }>(`/api/live/wait?timeout=${timeoutMs}`, { timeoutMs: timeoutMs + 10_000 })
  }
  reply(text: string, extra: Place & { inReplyTo?: number } = {}) {
    return this.call<Message>('/api/live/reply', { body: { text, ...extra } })
  }
}

/** True when a Poney hub answers at this address. */
export async function isPoneyHub(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/live`, { signal: AbortSignal.timeout(800) })
    if (!res.ok) return false
    const body = (await res.json()) as { poney?: boolean }
    return body.poney === true
  } catch {
    return false
  }
}
