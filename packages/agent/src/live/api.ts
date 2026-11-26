/**
 * What an agent's tools need from the live link, whether the hub runs in this
 * process or in another one (a Studio started with `poney studio`, or another
 * agent's MCP server). The MCP server uses only this.
 */
import type { LiveState } from './state'
import type { Message, Place, StudioState } from './types'

export interface LiveRead {
  viewers: number
  studio?: StudioState
  /** The document the person is looking at. */
  current?: unknown
  thread: Message[]
}

export interface LiveApi {
  /** Where the person opens the Studio. */
  readonly studioUrl: string
  open(document: unknown): Promise<{ revision: number; viewers: number; saved?: boolean }>
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
  ) {}
  get studioUrl() {
    return this.server.studioUrl
  }
  async open(document: unknown) {
    return { revision: this.state.open(document), viewers: this.server.viewers }
  }
  async read(): Promise<LiveRead> {
    return { viewers: this.server.viewers, studio: this.state.studio, current: this.state.current(), thread: this.state.thread() }
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
  open(document: unknown) {
    // An agent the Studio started names its project: the hub shows the document only when that project is open.
    const project = process.env.PONEY_PROJECT
    return this.call<{ revision: number; viewers: number; saved?: boolean }>('/api/live/open', { body: { document, ...(project ? { project } : {}) } })
  }
  read() {
    return this.call<LiveRead>('/api/live/read')
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
