/**
 * The shapes the live link shares between the hub, the agents that talk to
 * it (over MCP or ACP), and Poney Studio. Plain JSON: the Studio reads them as
 * they come over HTTP.
 */

/** What the person is doing in the Studio, as it last reported. */
export interface StudioState {
  receivedAt: string
  projectId?: string
  viewId?: string
  walkthrough?: string
  scene?: string
  selection?: { ref: string; title: string; kind: string }
  answers?: Record<string, string>
  notes?: Record<string, string>
  read?: string[]
  /** The document as the person left it, when they changed it. */
  document?: unknown
}

/** Something the person points at in a question: an element of the model, or a piece of text. */
export interface ContextItem {
  /** The element's ref, e.g. "entity:db"; none for quoted text. */
  ref?: string
  title: string
  kind: string
  /** Quoted text from the page. */
  quote?: string
}

/** Where the person was when they wrote: so "what is this?" is enough. */
export interface Place {
  walkthrough?: string
  scene?: string
  selection?: { ref: string; title: string; kind: string }
  /** What the person pointed at for this question (chips in the message). */
  context?: ContextItem[]
}

/**
 * One item of the conversation between the person and an agent.
 *
 * - `person`: a question or request from the person.
 * - `agent`: the agent's words. While the agent writes, the same item grows.
 * - `tool`: something the agent does (reads a file, runs a check).
 * - `permission`: the agent asks before it acts; the person picks an option.
 * - `notice`: a line from Poney itself (connected, stopped, failed).
 */
export type Message =
  | (Place & { id: number; at: string; from: 'person'; text: string })
  | (Place & { id: number; at: string; from: 'agent'; text: string; inReplyTo?: number; done?: boolean })
  | { id: number; at: string; from: 'tool'; title: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; kind?: string }
  | { id: number; at: string; from: 'permission'; title: string; options: { id: string; name: string; kind: string }[]; chosen?: string }
  | { id: number; at: string; from: 'notice'; text: string; tone?: 'info' | 'error' }

export type MessageInput = Message extends infer M ? (M extends Message ? Omit<M, 'id' | 'at'> : never) : never

/** An agent Poney can start over ACP. */
export interface Provider {
  id: string
  name: string
  /** Shown when it cannot start: what to install. */
  install: string
  available: boolean
  /** What to run to sign in. */
  signIn: string
  /** Added by the person, with their own command. */
  custom?: boolean
}

/** Whether an agent can work: signed in, not signed in, or not sure. */
export interface SignInStatus {
  state: 'ready' | 'sign-in' | 'unsure' | 'error'
  detail: string
}

/** A choice the agent offers for its session: the model, the effort, the mode, fast mode… */
export interface SessionSetting {
  id: string
  name: string
  /**
   * What the setting is for. Poney Studio shows the model, the effort and
   * `speed` (fast mode): what matters for explaining code. The rest (modes,
   * subagents, coding workflows) stays as the agent's own settings.
   */
  category: 'model' | 'effort' | 'mode' | 'speed' | 'other'
  kind: 'select' | 'boolean'
  current: string | boolean
  /** The value when the session started: the person's own setting for this agent. */
  initial?: string | boolean
  /** `recommended`: the agent itself recommends this choice. */
  options: { value: string; name: string; description?: string; group?: string; recommended?: boolean }[]
  /** How the agent offers it (ACP config option, or the older model and mode lists). */
  via: 'config' | 'model' | 'mode'
}

/** The agent session the Studio started, if any. */
export interface AgentSession {
  providerId: string
  name: string
  /** The folder the agent works in. */
  cwd: string
  /** True while the agent works on a request. */
  busy: boolean
  /** The choices the agent offers for this session. */
  settings: SessionSetting[]
}

/** Who answers the person's questions now. */
export interface AgentStatus {
  /** An agent the Studio started (ACP). */
  session: AgentSession | null
  /** An agent in its own session waits for questions over MCP (poney_wait). */
  listening: boolean
}
