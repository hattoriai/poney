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

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A default agent as the file has it, if it has the right shape: a file edited by hand must not stop the hub. */
function readDefault(v: unknown): DefaultAgent | undefined {
  if (!isObject(v) || !isObject(v.agent)) return undefined
  const a = v.agent
  const known = typeof a.providerId === 'string'
  const custom = isObject(a.custom) && typeof a.custom.name === 'string' && typeof a.custom.command === 'string'
  if (!known && !custom) return undefined
  return { agent: v.agent as AgentChoice, settings: isObject(v.settings) ? (v.settings as DefaultAgent['settings']) : {} }
}

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
      if (!isObject(v)) return empty
      const projects = isObject(v.projects) ? (v.projects as SessionFile['projects']) : {}
      const defaultAgent = readDefault(v.defaultAgent)
      return { version: 1, ...(defaultAgent ? { defaultAgent } : {}), projects }
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
