/**
 * What Poney remembers about agents between runs: the default agent, and the
 * session of the agent in each project. It is a small JSON file in the Poney
 * home. The file is read on each call, because two hubs may share it.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { poneyHome } from '../home'

/** An agent as the Studio names it: a known one by id, or one the person added by command. */
export type AgentChoice = { providerId: string } | { custom: { name: string; command: string } }

export interface DefaultAgent {
  agent: AgentChoice
  settings: Record<string, string | boolean>
}

export interface ProjectSession {
  agentKey: string
  sessionId: string
  at: string
}

interface SessionFile {
  version: 1
  defaultAgent?: DefaultAgent
  projects: Record<string, ProjectSession>
}

/** The name of an agent in the store: its provider id, or `custom:<name>`. */
export const agentKey = (a: AgentChoice): string => ('custom' in a ? `custom:${a.custom.name}` : a.providerId)

export class SessionStore {
  constructor(private file = join(poneyHome(), 'sessions.json')) {}

  defaultAgent(): DefaultAgent | undefined {
    return this.read().defaultAgent
  }

  setDefaultAgent(d: DefaultAgent): void {
    const f = this.read()
    f.defaultAgent = d
    this.write(f)
  }

  session(project: string): ProjectSession | undefined {
    return this.read().projects[project]
  }

  setSession(project: string, s: ProjectSession): void {
    const f = this.read()
    f.projects[project] = s
    this.write(f)
  }

  forget(project: string): void {
    const f = this.read()
    delete f.projects[project]
    this.write(f)
  }

  private read(): SessionFile {
    const empty: SessionFile = { version: 1, projects: {} }
    if (!existsSync(this.file)) return empty
    try {
      const v = JSON.parse(readFileSync(this.file, 'utf8'))
      if (!v || typeof v !== 'object' || Array.isArray(v)) return empty
      const projects = v.projects && typeof v.projects === 'object' && !Array.isArray(v.projects) ? v.projects : {}
      return { version: 1, ...(v.defaultAgent ? { defaultAgent: v.defaultAgent } : {}), projects }
    } catch {
      return empty
    }
  }

  private write(f: SessionFile): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(f, null, 2))
    renameSync(tmp, this.file)
  }
}
