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

  constructor(
    private readonly state: LiveState,
    /** Known once the hub listens. */
    private readonly mcp: () => McpLaunch,
    private readonly store = new SessionStore(),
    private readonly max = 2,
    private readonly providers: () => ProviderSpec[] = builtInProviders,
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

  /** Gives the person the open project's agent: the one that runs, or the default agent, started now. Never throws. */
  async activate(): Promise<void> {
    const project = this.state.projectKey()
    // No project: no agent answers.
    if (!project) return this.state.setSession(null, null)
    let agent = this.agents.get(project)
    if (agent) {
      this.agents.delete(project)
      this.agents.set(project, agent)
    } else {
      const d = this.store.defaultAgent()
      if (d) agent = this.start(project, d.agent, this.state.project!.cwd)
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
    if (!project) throw new Error('Open a project first.')
    const key = agentKey(choice)
    const d = this.store.defaultAgent()
    // The same agent keeps the person's settings.
    this.store.setDefaultAgent({ agent: choice, settings: d && agentKey(d.agent) === key ? d.settings : {} })
    const running = this.agents.get(project)
    if (running && running.agentKey !== key) {
      this.agents.delete(project)
      running.stop()
    }
    await this.activate()
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

  private start(project: string, choice: AgentChoice, cwd: string): ProjectAgent {
    const agent = new ProjectAgent(this.state, project, this.mcp, this.store)
    agent.onChange = () => this.changed(agent)
    this.agents.set(project, agent)
    const spec = providerFor(choice, this.providers)
    const started = spec ? agent.start(spec, choice, cwd) : Promise.reject(new Error(`Poney does not know the agent "${agentKey(choice)}".`))
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
