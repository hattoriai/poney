/**
 * The agents the Studio runs: one for each project, at most a few at a time.
 *
 * When a project opens, its agent answers the person: the one that runs, or
 * the default agent, started in the project's folder. An agent in another
 * project keeps working on its answer, in its own thread. Above the limit,
 * the agent activated longest ago stops, unless it is busy or waits for the
 * person; it continues its session when its project opens again.
 */
import type { LiveState } from '../live/state'
import { presentFolders } from '../live/workspace-file'
import { builtInProviders, customProvider, type ProviderSpec } from './providers'
import { ProjectAgent, type McpLaunch } from './bridge'
import { agentKey, SessionStore, type AgentChoice } from './sessions'

/** How to start an agent the Studio names. */
export const providerFor = (r: AgentChoice, providers: () => ProviderSpec[] = builtInProviders): ProviderSpec | undefined =>
  'custom' in r && r.custom ? customProvider(r.custom.name, r.custom.command) : providers().find((p) => p.id === ('providerId' in r ? r.providerId : undefined))

export class AgentPool {
  /** By project, the agent activated longest ago first. */
  private agents = new Map<string, ProjectAgent>()
  /** Settles when the agent has started, or failed to. */
  private ready = new WeakMap<ProjectAgent, Promise<void>>()
  /** A workspace whose agent stopped to move to a new key or new folders: it starts again there. */
  private restart = new Set<string>()

  constructor(
    private readonly state: LiveState,
    /** Known once the hub listens. */
    private readonly mcp: () => McpLaunch,
    private readonly store = new SessionStore(),
    private readonly max = 2,
    private readonly providers: () => ProviderSpec[] = builtInProviders,
    /** Start the default agent by itself when a project opens. Only a hub the person started for the Studio does; one an MCP server started leaves the questions to that agent. */
    private readonly autoStart = false,
  ) {
    state.on('workspace', () => void this.activate())
  }

  /** The agent of a project, if it runs or starts. */
  get(project: string): ProjectAgent | undefined {
    return this.agents.get(project)
  }

  /** The open project's agent. */
  active(): ProjectAgent | undefined {
    return this.agents.get(this.state.projectKey())
  }

  /**
   * Gives the person the open project's agent: the one that runs, or the default agent, started now
   * when `start` (by default: when the pool may start agents by itself and no agent listens over MCP). Never throws.
   */
  async activate(start = this.autoStart && !this.state.status().listening): Promise<void> {
    try {
      await this.activateNow(start)
    } catch (e) {
      // Activation runs on every project change, with no one to catch it: report, and no agent answers.
      this.state.put({ from: 'notice', text: e instanceof Error ? e.message : String(e), tone: 'error' })
      this.state.setSession(null, null)
    }
  }

  private async activateNow(start: boolean): Promise<void> {
    const project = this.state.projectKey()
    // No project, or a workspace with no folder yet: no agent answers.
    if (!project || !this.state.project) return this.state.setSession(null, null)
    const folders = presentFolders(this.state.workspace!).map((f) => f.cwd)
    let agent = this.agents.get(project)
    // The workspace's folders changed: the agent starts again with them, in the same session, when it is not working.
    if (agent?.connected && !agent.busy && agent.folders.join('\n') !== folders.join('\n')) {
      this.agents.delete(project)
      agent.stop()
      agent = undefined
      this.restart.add(project)
    }
    if (agent) {
      this.agents.delete(project)
      this.agents.set(project, agent)
    } else if (start || this.restart.has(project)) {
      this.restart.delete(project)
      const d = this.store.defaultAgent()
      if (d) agent = this.start(project, d.agent, folders)
    }
    // Until this project's agent runs, no other project's agent answers here.
    if (!agent) return this.state.setSession(null, null)
    this.publish(agent)
    await this.ready.get(agent)
    this.publish(agent)
    this.trim()
  }

  /** Makes an agent the default, and starts it for the open project. */
  async connect(choice: AgentChoice): Promise<void> {
    const project = this.state.projectKey()
    if (!project) throw new Error('Open a workspace first.')
    if (!this.state.project) throw new Error('Add a folder to the workspace first: the agent works in it.')
    const key = this.setDefault(choice)
    const running = this.agents.get(project)
    if (running && running.agentKey !== key) {
      this.agents.delete(project)
      running.stop()
    }
    await this.activate(true)
  }

  /** Makes an agent the default, without starting it. Returns its key. */
  setDefault(choice: AgentChoice): string {
    const key = agentKey(choice)
    const d = this.store.defaultAgent()
    // The same agent keeps the person's settings.
    this.store.setDefaultAgent({ agent: choice, settings: d && agentKey(d.agent) === key ? d.settings : {} })
    return key
  }

  /** The default agent, if the person chose one. */
  defaultAgent(): AgentChoice | undefined {
    return this.store.defaultAgent()?.agent
  }

  /** Stops the open project's agent. The default agent stays. */
  async disconnect(): Promise<void> {
    const project = this.state.projectKey()
    const agent = this.agents.get(project)
    this.agents.delete(project)
    agent?.stop()
    this.state.setSession(null, null)
  }

  stopAll(): void {
    const agents = [...this.agents.values()]
    this.agents.clear()
    for (const agent of agents) agent.stop()
    this.state.setSession(null, null)
  }

  /**
   * A workspace's new key (a folder saved as a workspace file): its agent session moves there, and
   * its agent starts again with the new key when the workspace opens.
   */
  rekey(from: string, to: string): void {
    if (from === to) return
    const saved = this.store.session(from)
    if (saved) {
      this.store.setSession(to, saved)
      this.store.forget(from)
    }
    const agent = this.agents.get(from)
    if (!agent) return
    this.agents.delete(from)
    agent.stop()
    this.restart.add(to)
  }

  private start(project: string, choice: AgentChoice, folders: string[]): ProjectAgent {
    const agent = new ProjectAgent(this.state, project, this.mcp, this.store)
    agent.onChange = () => this.changed(agent)
    this.agents.set(project, agent)
    let started: Promise<void>
    try {
      const spec = providerFor(choice, this.providers)
      started = spec ? agent.start(spec, choice, folders[0], folders.slice(1)) : Promise.reject(new Error(`Poney does not know the agent "${agentKey(choice)}".`))
    } catch (e) {
      // Any failure goes the same way: the agent leaves the pool, so the next activation tries again.
      started = Promise.reject(e)
    }
    this.ready.set(
      agent,
      started.catch((e) => {
        if (this.agents.get(project) !== agent) return
        this.agents.delete(project)
        this.state.put({ from: 'notice', text: e instanceof Error ? e.message : String(e), tone: 'error' }, project)
        if (this.state.projectKey() === project) this.state.setSession(null, null)
      }),
    )
    return agent
  }

  /** An agent's status changed: only the open project's agent shows. An agent that stopped leaves the pool. */
  private changed(agent: ProjectAgent) {
    if (this.agents.get(agent.project) !== agent) return
    if (agent.connected) return this.publish(agent)
    this.agents.delete(agent.project)
    if (this.state.projectKey() === agent.project) this.state.setSession(null, null)
  }

  private publish(agent: ProjectAgent) {
    if (agent.project !== this.state.projectKey() || this.agents.get(agent.project) !== agent) return
    if (!agent.connected) return this.state.setSession(null, null)
    this.state.setSession(agent.status(), (q) => agent.ask(q))
    // Questions asked while the agent started.
    for (const q of this.state.takeQuestions(agent.project, agent.history)) agent.ask(q)
  }

  /** Above the limit, stops the agents activated longest ago, but never one that works or waits for the person. */
  private trim() {
    const open = this.state.projectKey()
    for (const [project, agent] of this.agents) {
      if (this.agents.size <= this.max) return
      if (project === open || agent.busy || agent.pendingChoices) continue
      this.agents.delete(project)
      agent.stop()
    }
  }
}
