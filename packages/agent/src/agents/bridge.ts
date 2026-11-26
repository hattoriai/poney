/**
 * The agent of one project: starts an agent for the Studio in the project's
 * folder and carries the conversation both ways.
 *
 * The agent runs with the Poney MCP server attached to this hub, so what it
 * opens shows in the Studio at once. The person's questions go to it as
 * prompts; its words, its tool calls and its requests for permission come
 * back as messages in the project's thread, also while another project is
 * open. It continues the project's earlier session when the agent can. The
 * agent pool (pool.ts) decides which agent answers the person.
 */
import { methods, type ClientConnection, type RequestPermissionRequest, type RequestPermissionResponse, type SessionNotification } from '@agentclientprotocol/sdk'
import { startAgent, type RunningAgent } from './acp'
import type { LiveState } from '../live/state'
import type { AgentSession, Message, SessionSetting } from '../live/types'
import { applySetting, fromConfigOptions, fromLists } from './settings'
import type { ProviderSpec } from './providers'
import { agentKey, type AgentChoice, type SessionStore } from './sessions'

/** How the agent starts the Poney MCP server, attached to this hub. */
export interface McpLaunch {
  command: string
  args: string[]
  hubUrl: string
}

export type Question = Extract<Message, { from: 'person' }>

export class ProjectAgent {
  private agent?: RunningAgent
  private connection?: ClientConnection
  /** The session whose updates this agent shows: the running one, or the one it resumes. */
  private sessionId?: string
  private spec?: ProviderSpec
  private key = ''
  private cwd = ''
  /** Counts starts and stops, so a start that a stop overtook does not keep its agent. */
  private run = 0
  private queue: Question[] = []
  private working = false
  private settings: SessionSetting[] = []
  private briefed = false
  /** The agent took the briefing as system instructions; else each request carries a short reminder. */
  private systemPrompt = false
  /** The agent message being written in this turn, and tool calls by their ACP id. */
  private writing?: Extract<Message, { from: 'agent' }>
  private tools = new Map<string, Extract<Message, { from: 'tool' }>>()
  private choices = new Map<number, (optionId: string | null) => void>()
  /** Called when the status changes: started, busy or not, settings, stopped. */
  onChange?: () => void

  constructor(
    private readonly state: LiveState,
    /** The project's key: its folder (see LiveState.projectKey). */
    readonly project: string,
    /** Known once the hub listens. */
    private readonly mcp: () => McpLaunch,
    private readonly store: SessionStore,
  ) {}

  /** The agent's name in the session store. */
  get agentKey() {
    return this.key
  }

  get connected() {
    return !!this.agent
  }

  /** True while the agent works on a request. */
  get busy() {
    return this.working
  }

  /** Permission requests that wait for the person. */
  get pendingChoices() {
    return this.choices.size
  }

  /** Starts the agent in a folder with the Poney tools, in the project's earlier session when it can. */
  async start(spec: ProviderSpec, choice: AgentChoice, cwd: string): Promise<void> {
    this.stop()
    const run = this.run
    this.spec = spec
    this.key = agentKey(choice)
    this.cwd = cwd
    const saved = this.store.session(this.project)
    // A thread with messages shows the session already; an empty one gets its history from the agent.
    const resume = saved?.agentKey === this.key ? { sessionId: saved.sessionId, how: this.state.thread(this.project).length ? ('resume' as const) : ('load' as const) } : undefined
    // A loaded session replays its history before the agent answers.
    this.sessionId = resume?.sessionId
    const mcp = this.mcp()
    let agent: RunningAgent
    try {
      agent = await startAgent(spec, cwd, {
        mcpServers: [{ name: 'poney', command: mcp.command, args: mcp.args, env: [{ name: 'PONEY_HUB_URL', value: mcp.hubUrl }] }],
        systemPrompt: briefing(cwd),
        resume,
        onUpdate: (n) => this.onUpdate(n),
        onPermission: (p) => this.onPermission(p),
      })
    } catch (e) {
      if (run === this.run) {
        this.sessionId = undefined
        this.writing = undefined
      }
      throw e
    }
    if (run !== this.run) return agent.stop()
    const lost = !!resume && agent.how === 'new'
    // What a failed load replayed is not the conversation; else the replayed answer is complete.
    if (lost && resume.how === 'load') this.state.clearThread(this.project)
    else if (this.writing) this.state.put({ ...this.writing, done: true }, this.project)
    this.writing = undefined
    this.tools.clear()
    this.agent = agent
    this.sessionId = agent.sessionId
    this.connection = agent.connection
    const offered = fromConfigOptions(agent.session.configOptions ?? [])
    const raw = agent.session as { models?: unknown; modes?: unknown }
    // What each setting was at the start is the agent's own choice.
    this.settings = [...offered, ...fromLists(raw.models as never, raw.modes as never, offered)].map((s) => ({ ...s, initial: s.current }))
    agent.child.once('exit', () => {
      if (this.agent !== agent) return
      this.state.put({ from: 'notice', text: `${spec.name} stopped. ${agent.stderr().slice(-2).join(' ')}`.trim(), tone: 'error' }, this.project)
      this.stop()
    })
    // An agent that took the briefing as system instructions, or a session that had it, needs no briefing in the next prompt.
    this.briefed = agent.systemPromptApplied || agent.how !== 'new'
    this.systemPrompt = agent.systemPromptApplied
    this.store.setSession(this.project, { agentKey: this.key, sessionId: agent.sessionId, at: new Date().toISOString() })
    if (lost) this.state.put({ from: 'notice', text: 'The earlier session did not resume. This is a new session.', tone: 'info' }, this.project)
    await this.applyDefaults()
    this.onChange?.()
  }

  /** Stops the agent. Its permission requests are cancelled. */
  stop() {
    this.run++
    const agent = this.agent
    for (const choose of this.choices.values()) choose(null)
    this.agent = undefined
    this.connection = undefined
    this.sessionId = undefined
    this.queue = []
    this.working = false
    this.writing = undefined
    this.tools.clear()
    this.choices.clear()
    agent?.stop()
    if (agent) this.onChange?.()
  }

  /** Stops the current request; the session stays. */
  async cancel() {
    if (!this.sessionId || !this.connection) return
    this.queue = []
    for (const choose of this.choices.values()) choose(null)
    await this.connection.agent.notify(methods.agent.session.cancel, { sessionId: this.sessionId })
  }

  /** Changes one of the session's settings (model, effort, mode…). The person's choice is the new default for this agent. */
  async setSetting(id: string, value: string | boolean) {
    if (!this.sessionId || !this.connection) throw new Error('No agent is connected.')
    this.settings = keepInitial(await applySetting(this.connection, this.sessionId, this.settings, id, value), this.settings)
    const d = this.store.defaultAgent()
    if (d && agentKey(d.agent) === this.key) this.store.setDefaultAgent({ ...d, settings: { ...d.settings, [id]: value } })
    this.onChange?.()
  }

  /** The person's answer to a permission request. False when no request has this id. */
  choose(messageId: number, optionId: string): boolean {
    const choose = this.choices.get(messageId)
    choose?.(optionId)
    return !!choose
  }

  status(): AgentSession {
    return { providerId: this.spec?.id ?? '', name: this.spec?.name ?? '', cwd: this.cwd, busy: this.working, settings: this.settings }
  }

  /** A question from the person. */
  ask(q: Question) {
    this.queue.push(q)
    void this.drain()
  }

  /** The default agent's settings, where the session's differ. A setting the agent does not offer, or refuses, stays as it is. */
  private async applyDefaults() {
    const d = this.store.defaultAgent()
    if (!d || agentKey(d.agent) !== this.key) return
    for (const [id, value] of Object.entries(d.settings)) {
      const s = this.settings.find((x) => x.id === id)
      if (!s || s.current === value || !this.sessionId || !this.connection) continue
      try {
        this.settings = keepInitial(await applySetting(this.connection, this.sessionId, this.settings, id, value), this.settings)
      } catch {
        /* the agent's own value stays */
      }
    }
  }

  /** Sends questions one at a time: an agent answers one prompt per turn. */
  private async drain() {
    if (this.working || !this.sessionId || !this.connection) return
    const q = this.queue.shift()
    if (!q) return
    const run = this.run
    this.working = true
    this.onChange?.()
    this.writing = undefined
    try {
      await this.connection.agent.request(methods.agent.session.prompt, { sessionId: this.sessionId, prompt: [{ type: 'text', text: this.promptFor(q) }] })
    } catch (e) {
      if (run === this.run) this.state.put({ from: 'notice', text: `The request failed: ${e instanceof Error ? e.message : String(e)}`, tone: 'error' }, this.project)
    } finally {
      if (run === this.run) {
        // Updates arrive while the prompt runs, so TypeScript cannot see that `writing` changed.
        const last = this.writing as Extract<Message, { from: 'agent' }> | undefined
        if (last) this.state.put({ ...last, done: true }, this.project)
        this.writing = undefined
        this.working = false
        this.onChange?.()
        void this.drain()
      }
    }
  }

  /** The person's words, with where they are, and the first time, how to work with Poney. */
  private promptFor(q: Question): string {
    const where = [
      q.walkthrough && `They are reading the walkthrough "${q.walkthrough}"${q.scene ? `, scene "${q.scene}"` : ''}.`,
      q.selection && !q.context?.length && `They selected ${q.selection.kind} "${q.selection.title}" (${q.selection.ref}).`,
    ].filter(Boolean)
    // What the person pointed at: elements by name and ref, text as a quote.
    const about = (q.context ?? []).map((c) => (c.quote ? `- this text from the page: "${c.quote}"` : `- ${c.kind} "${c.title}" (${c.ref})`))
    if (about.length) where.push(`The question is about:\n${about.join('\n')}`)
    const parts = [where.length ? `[${where.join(' ')}]` : '', q.text].filter(Boolean)
    if (!this.briefed) {
      this.briefed = true
      parts.unshift(briefing(this.cwd))
    } else if (!this.systemPrompt) parts.unshift(`[Poney Studio: explain the code in ${this.cwd}, with Poney documents when a picture helps. Say so briefly if the request is about something else.]`)
    return parts.join('\n\n')
  }

  private onUpdate(n: SessionNotification) {
    if (n.sessionId !== this.sessionId) return
    const u = n.update
    switch (u.sessionUpdate) {
      case 'agent_message_chunk': {
        if (u.content.type !== 'text') return
        const text = (this.writing?.text ?? '') + u.content.text
        this.writing = this.state.put(this.writing ? { ...this.writing, text } : { from: 'agent', text }, this.project) as Extract<Message, { from: 'agent' }>
        return
      }
      case 'tool_call': {
        // Words after a tool call start a new message, so the order reads true.
        if (this.writing) this.state.put({ ...this.writing, done: true }, this.project)
        this.writing = undefined
        const m = this.state.put({ from: 'tool', title: u.title, status: u.status ?? 'pending', kind: u.kind }, this.project) as Extract<Message, { from: 'tool' }>
        this.tools.set(u.toolCallId, m)
        return
      }
      case 'config_option_update': {
        this.settings = keepInitial([...fromConfigOptions(u.configOptions), ...this.settings.filter((s) => s.via !== 'config')], this.settings)
        this.onChange?.()
        return
      }
      case 'current_mode_update': {
        this.settings = this.settings.map((s) => (s.via === 'mode' ? { ...s, current: u.currentModeId } : s))
        this.onChange?.()
        return
      }
      case 'tool_call_update': {
        const m = this.tools.get(u.toolCallId)
        if (!m) return
        this.tools.set(u.toolCallId, this.state.put({ ...m, title: u.title ?? m.title, status: u.status ?? m.status }, this.project) as Extract<Message, { from: 'tool' }>)
        return
      }
      default:
        return
    }
  }

  private async onPermission(p: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const m = this.state.put({ from: 'permission', title: p.toolCall.title ?? 'The agent asks to continue', options: p.options.map((o) => ({ id: o.optionId, name: o.name, kind: o.kind })) }, this.project)
    const optionId = await new Promise<string | null>((resolve) => this.choices.set(m.id, resolve))
    this.choices.delete(m.id)
    this.state.put({ ...(m as Extract<Message, { from: 'permission' }>), chosen: optionId ?? 'cancelled' }, this.project)
    return { outcome: optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' } }
  }
}

/** Settings read again from the agent keep what each was at the start. */
const keepInitial = (next: SessionSetting[], before: SessionSetting[]) => next.map((s) => ({ ...s, initial: before.find((b) => b.id === s.id)?.initial ?? s.initial }))

/**
 * What an agent started by the Studio is told: its system prompt when it
 * accepts one, otherwise the start of its first request.
 */
export function briefing(cwd: string): string {
  return `You work for a person in Poney Studio. Poney Studio shows walkthroughs and tours of the code in ${cwd} as diagrams and scenes. Your job is to help the person understand this code, and the way you answer is with Poney documents.

How to work:
- Call poney_guide once before you write a document: topic "tour" to teach code as it is, topic "change" to explain a commit or a branch. Follow it.
- Read the code before you claim anything about it. Never invent files, functions, tests or numbers.
- Copy code with poney_excerpt. Check every document with poney_check (repo "${cwd}", rev "working") until it has no errors. Look at each scene with poney_render.
- Show the document with poney_open: the person sees it at once, and Poney saves it to docs/poney/ in this folder. Pass documents inline to these tools. Do not write or change other files in the repository.
- Keep one document for this folder, and never lose what is in it. To add to it, get it with poney_read (includeDocument: true), add walkthroughs, diagrams or scenes, and open it again. Remove things only when the person asks.

How to answer questions:
- Each question from the person comes to you as a new message. When you have answered or opened the document, end your turn. Do not call poney_wait or poney_reply: they are for agents in their own session.
- The person may ask about a scene or an element; the request says which.
- Answer in plain, short words. When a picture helps, add a scene to the open document, open it again, and name the scene in your answer.
- If the person asks for something outside this code, say so briefly.`
}
