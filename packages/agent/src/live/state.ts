/**
 * The live state of one Studio session: the document on show, what the
 * person reports, and the conversation with an agent.
 *
 * It knows no transport. The HTTP server shows it to the Studio; an MCP
 * server reads and writes it (in this process, or over HTTP from another);
 * the ACP bridge answers the person's questions through it.
 */
import { EventEmitter } from 'node:events'
import type { OverlayResult } from '../plugins/types'
import type { AgentStatus, Message, MessageInput, Place, StudioState } from './types'
import { intoWorkspace, type WorkspaceProject } from './workspace-project'

/** Answers the person's questions: an agent the Studio started. */
export type Responder = (question: Extract<Message, { from: 'person' }>) => void

/** Where a document came from: an agent or the Studio, its file on disk, or a workspace that starts empty. */
export type Source = 'agent' | 'file' | 'workspace'

interface Events {
  document: [revision: number, document: unknown, source: Source]
  /** The person changed the open document in the Studio. */
  edited: [document: unknown]
  /** The file the open document is saved to, if any. */
  file: [path: string | undefined]
  workspace: [workspace: WorkspaceProject | undefined, keep: boolean]
  message: [message: Message]
  agent: [status: AgentStatus]
  /** Overlay results the Studio shows, by overlay id. */
  overlays: [overlays: Record<string, OverlayResult>]
}

export class LiveState extends EventEmitter<Events> {
  private document?: unknown
  private source: Source = 'agent'
  private revision = 0
  private messages: Message[] = []
  /** Questions an agent took over MCP (poney_wait). */
  private delivered = 0
  private waiters = new Set<() => void>()
  private responder: Responder | null = null
  private session: AgentStatus['session'] = null
  private workspace?: WorkspaceProject
  private path?: string
  studio?: StudioState
  private shownOverlays: Record<string, OverlayResult> = {}

  /* ─── The document ──────────────────────────────────────────────────── */

  /** Shows a document in every open Studio. Returns its revision. While an agent works in a folder, the document joins that folder's project. */
  open(document: unknown, source: Source = 'agent'): number {
    // What an agent opens joins the open project when that project belongs to the agent's folder (its file is there, or it has none);
    // otherwise it is the folder's own project. A file opens as it is.
    const joins = !this.path || (this.workspace && this.path.startsWith(`${this.workspace.cwd}/`))
    this.document = this.workspace && source === 'agent' ? intoWorkspace(document, { ...this.workspace, id: (joins ? this.openProjectId : undefined) ?? this.workspace.id }) : document
    this.source = source
    this.revision++
    this.studio = undefined
    this.emit('document', this.revision, this.document, source)
    return this.revision
  }

  /** Overlay results shown in the Studio, by id. */
  get overlays() {
    return this.shownOverlays
  }
  /** Shows an overlay's result, or with null, stops showing it. */
  setOverlay(id: string, result: OverlayResult | null) {
    const { [id]: _, ...rest } = this.shownOverlays
    this.shownOverlays = result ? { ...rest, [id]: result } : rest
    this.emit('overlays', this.shownOverlays)
  }

  /** The file the open document is saved to. */
  get file() {
    return this.path
  }
  setFile(path: string | undefined) {
    this.path = path
    this.emit('file', path)
  }

  /** The open document and its revision, if any. */
  shown(): { revision: number; document: unknown; source: Source } | undefined {
    return this.document === undefined ? undefined : { revision: this.revision, document: this.document, source: this.source }
  }

  /** The document the person is looking at: their edits if any, else what was opened. */
  current(): unknown {
    return this.studio?.document ?? this.document
  }

  report(state: Omit<StudioState, 'receivedAt'>) {
    this.studio = { ...state, receivedAt: new Date().toISOString() }
    if (state.document !== undefined) {
      // The person's edits are the document now: a reload, another window or an agent sees them.
      this.document = state.document
      this.emit('edited', state.document)
    }
  }

  /* ─── The conversation ──────────────────────────────────────────────── */

  thread(): Message[] {
    return [...this.messages]
  }

  /** Adds a message, or replaces the one with the same id. */
  put(input: MessageInput | Message): Message {
    const existing = 'id' in input ? this.messages.findIndex((m) => m.id === input.id) : -1
    const message = (existing >= 0 ? input : { ...input, id: this.messages.length + 1, at: new Date().toISOString() }) as Message
    if (existing >= 0) this.messages[existing] = message
    else this.messages.push(message)
    this.emit('message', message)
    return message
  }

  /**
   * A question from the person. An agent the Studio started answers at once;
   * otherwise it waits for an agent that listens over MCP.
   */
  ask(text: string, place: Place = {}): Message {
    const m = this.put({ from: 'person', text, ...place }) as Extract<Message, { from: 'person' }>
    if (this.responder) {
      this.delivered = m.id
      this.responder(m)
    } else for (const wake of this.waiters) wake()
    return m
  }

  /** An answer written by an agent in its own session (poney_reply). */
  reply(text: string, extra: Place & { inReplyTo?: number } = {}): Message {
    return this.put({ from: 'agent', text, done: true, ...extra })
  }

  /**
   * Questions no agent has taken yet. If there are none, waits up to
   * `timeoutMs` for the next one. Returns an empty list when time runs out.
   */
  async waitForQuestions(timeoutMs: number): Promise<Extract<Message, { from: 'person' }>[]> {
    // An agent the Studio started takes the questions; one that waits over MCP would only keep its turn open.
    if (this.responder) return []
    const pending = () => this.messages.filter((m): m is Extract<Message, { from: 'person' }> => m.from === 'person' && m.id > this.delivered)
    if (!pending().length) {
      let wake = () => {}
      const woken = new Promise<void>((resolve) => (wake = resolve))
      this.waiters.add(wake)
      this.emitAgent()
      const timer = setTimeout(wake, timeoutMs)
      await woken
      clearTimeout(timer)
      this.waiters.delete(wake)
      this.emitAgent()
    }
    const out = pending()
    if (out.length) this.delivered = Math.max(this.delivered, ...out.map((m) => m.id))
    return out
  }

  /* ─── The workspace ─────────────────────────────────────────────────── */

  /** The project folder: the folder the open document belongs to, where agents work. */
  get project(): WorkspaceProject | undefined {
    return this.workspace
  }

  /**
   * Opens a folder as the project, or, with a document tied to it, records
   * the folder it belongs to. What opens for it (its file, the document already
   * open, or an empty project) is decided where files are known. With
   * `keep`, the folder is only where agents work: the open document stays.
   */
  setWorkspace(w: WorkspaceProject | undefined, keep = false) {
    // The same folder again: nothing to do, unless it is now opened as the project (it may have been only the agent's folder).
    if (w?.cwd === this.workspace?.cwd && (keep || !w)) return
    this.workspace = w
    this.emit('workspace', w, keep)
  }

  /** The id of the open document's project. */
  get openProjectId(): string | undefined {
    return (this.document as { project?: { id?: string } } | undefined)?.project?.id
  }

  /* ─── Who answers ───────────────────────────────────────────────────── */

  /** An agent the Studio started takes over the questions; null gives them back to MCP agents. */
  setSession(session: AgentStatus['session'], responder: Responder | null) {
    this.session = session
    this.responder = responder
    // Agents that wait over MCP stop waiting: the Studio's own agent answers now.
    if (responder) for (const wake of this.waiters) wake()
    this.emitAgent()
  }

  status(): AgentStatus {
    return { session: this.session, listening: this.waiters.size > 0 }
  }

  private emitAgent() {
    this.emit('agent', this.status())
  }

  /** Releases agents that wait for a question. */
  close() {
    for (const wake of this.waiters) wake()
  }
}
