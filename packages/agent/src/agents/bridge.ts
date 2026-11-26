/**
 * The ACP bridge: starts an agent for the Studio and carries the
 * conversation both ways.
 *
 * The agent runs in the workspace folder with the Poney MCP server attached to
 * this hub, so what it opens shows in the Studio at once. The person's
 * questions go to it as prompts; its words, its tool calls and its requests
 * for permission come back as messages in the live state.
 */
import { methods, type ClientConnection, type RequestPermissionRequest, type RequestPermissionResponse, type SessionNotification } from '@agentclientprotocol/sdk'
import { startAgent, type RunningAgent } from './acp'
import type { LiveState } from '../live/state'
import type { Message, SessionSetting } from '../live/types'
import { applySetting, fromConfigOptions, fromLists } from './settings'
import { workspaceProject } from '../live/workspace-project'
import type { ProviderSpec } from './providers'

/** How the agent starts the Poney MCP server, attached to this hub. */
export interface McpLaunch {
  command: string
  args: string[]
  hubUrl: string
}

type Question = Extract<Message, { from: 'person' }>

export class AgentBridge {
  private agent?: RunningAgent
  private connection?: ClientConnection
  private sessionId?: string
  private spec?: ProviderSpec
  private cwd = ''
  private queue: Question[] = []
  private busy = false
  private settings: SessionSetting[] = []
  private briefed = false
  /** The agent took the briefing as system instructions; else each request carries a short reminder. */
  private systemPrompt = false
  /** The agent message being written in this turn, and tool calls by their ACP id. */
  private writing?: Extract<Message, { from: 'agent' }>
  private tools = new Map<string, Extract<Message, { from: 'tool' }>>()
  private choices = new Map<number, (optionId: string | null) => void>()

  constructor(
    private readonly state: LiveState,
    /** Known once the hub listens. */
    private readonly mcp: () => McpLaunch,
  ) {}

  get connected() {
    return !!this.sessionId
  }

  /** Starts the agent in a folder and opens a session with the Poney tools. */
  async connect(spec: ProviderSpec, cwd: string): Promise<void> {
    await this.disconnect()
    const mcp = this.mcp()
    const agent = await startAgent(spec, cwd, {
      mcpServers: [{ name: 'poney', command: mcp.command, args: mcp.args, env: [{ name: 'PONEY_HUB_URL', value: mcp.hubUrl }] }],
      systemPrompt: briefing(cwd),
      onUpdate: (n) => this.onUpdate(n),
      onPermission: (p) => this.onPermission(p),
    })
    this.agent = agent
    this.spec = spec
    this.cwd = cwd
    this.sessionId = agent.sessionId
    this.connection = agent.connection
    const offered = fromConfigOptions(agent.session.configOptions ?? [])
    const raw = agent.session as { models?: unknown; modes?: unknown }
    // What each setting was at the start is the person's own choice for this agent.
    this.settings = [...offered, ...fromLists(raw.models as never, raw.modes as never, offered)].map((s) => ({ ...s, initial: s.current }))
    agent.child.once('exit', () => {
      if (this.agent !== agent) return
      this.state.put({ from: 'notice', text: `${spec.name} stopped. ${agent.stderr().slice(-2).join(' ')}`.trim(), tone: 'error' })
      this.reset()
    })
    // An agent that took the briefing as system instructions needs no briefing in the first prompt.
    this.briefed = agent.systemPromptApplied
    this.systemPrompt = agent.systemPromptApplied
    // The agent's folder; the document open in the Studio stays.
    this.state.setWorkspace(workspaceProject(cwd), true)
    // The panel's header says which agent is connected and where; the conversation is for what matters.
    this.publish()
  }

  /** Stops the agent. Questions go back to agents that listen over MCP. */
  async disconnect() {
    const agent = this.agent
    for (const choose of this.choices.values()) choose(null)
    this.reset()
    agent?.stop()
  }

  /** Stops the current request; the session stays. */
  async cancel() {
    if (!this.sessionId || !this.connection) return
    this.queue = []
    for (const choose of this.choices.values()) choose(null)
    await this.connection.agent.notify(methods.agent.session.cancel, { sessionId: this.sessionId })
  }

  /** Changes one of the session's settings (model, effort, mode…). */
  async setSetting(id: string, value: string | boolean) {
    if (!this.sessionId || !this.connection) throw new Error('No agent is connected.')
    this.settings = keepInitial(await applySetting(this.connection, this.sessionId, this.settings, id, value), this.settings)
    this.publish()
  }

  /** The person's answer to a permission request. */
  choose(messageId: number, optionId: string) {
    this.choices.get(messageId)?.(optionId)
  }

  private reset() {
    this.agent = undefined
    this.connection = undefined
    this.sessionId = undefined
    this.queue = []
    this.busy = false
    this.writing = undefined
    this.tools.clear()
    this.choices.clear()
    this.state.setSession(null, null)
  }

  private publish() {
    if (!this.spec || !this.sessionId) return this.state.setSession(null, null)
    this.state.setSession({ providerId: this.spec.id, name: this.spec.name, cwd: this.cwd, busy: this.busy, settings: this.settings }, (q) => this.enqueue(q))
  }

  private enqueue(q: Question) {
    this.queue.push(q)
    void this.drain()
  }

  /** Sends questions one at a time: an agent answers one prompt per turn. */
  private async drain() {
    if (this.busy || !this.sessionId || !this.connection) return
    const q = this.queue.shift()
    if (!q) return
    this.busy = true
    this.publish()
    this.writing = undefined
    try {
      await this.connection.agent.request(methods.agent.session.prompt, { sessionId: this.sessionId, prompt: [{ type: 'text', text: this.promptFor(q) }] })
    } catch (e) {
      this.state.put({ from: 'notice', text: `The request failed: ${e instanceof Error ? e.message : String(e)}`, tone: 'error' })
    } finally {
      // Updates arrive while the prompt runs, so TypeScript cannot see that `writing` changed.
      const last = this.writing as Extract<Message, { from: 'agent' }> | undefined
      if (last) this.state.put({ ...last, done: true })
      this.writing = undefined
      this.busy = false
      this.publish()
      void this.drain()
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
        this.writing = this.state.put(this.writing ? { ...this.writing, text } : { from: 'agent', text }) as Extract<Message, { from: 'agent' }>
        return
      }
      case 'tool_call': {
        // Words after a tool call start a new message, so the order reads true.
        if (this.writing) this.state.put({ ...this.writing, done: true })
        this.writing = undefined
        const m = this.state.put({ from: 'tool', title: u.title, status: u.status ?? 'pending', kind: u.kind }) as Extract<Message, { from: 'tool' }>
        this.tools.set(u.toolCallId, m)
        return
      }
      case 'config_option_update': {
        this.settings = keepInitial([...fromConfigOptions(u.configOptions), ...this.settings.filter((s) => s.via !== 'config')], this.settings)
        this.publish()
        return
      }
      case 'current_mode_update': {
        this.settings = this.settings.map((s) => (s.via === 'mode' ? { ...s, current: u.currentModeId } : s))
        this.publish()
        return
      }
      case 'tool_call_update': {
        const m = this.tools.get(u.toolCallId)
        if (!m) return
        this.tools.set(u.toolCallId, this.state.put({ ...m, title: u.title ?? m.title, status: u.status ?? m.status }) as Extract<Message, { from: 'tool' }>)
        return
      }
      default:
        return
    }
  }

  private async onPermission(p: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const m = this.state.put({ from: 'permission', title: p.toolCall.title ?? 'The agent asks to continue', options: p.options.map((o) => ({ id: o.optionId, name: o.name, kind: o.kind })) })
    const optionId = await new Promise<string | null>((resolve) => this.choices.set(m.id, resolve))
    this.choices.delete(m.id)
    this.state.put({ ...(m as Extract<Message, { from: 'permission' }>), chosen: optionId ?? 'cancelled' })
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
