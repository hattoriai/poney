/**
 * Starts a live hub: the state, the HTTP server, and the agent pool that
 * lets the Studio start agents. `poney studio` and the MCP server both
 * start hubs this way; an MCP server that finds a hub already running attaches
 * to it instead (see attachOrStart).
 */
import { AgentPool } from '../agents/pool'
import { isPoneyHub, LocalLive, RemoteLive, type LiveApi } from './api'
import { LiveServer } from './server'
import { LiveState } from './state'
import { DocumentFiles } from './files'
import { mcpCommand } from '../paths'


export interface Hub {
  state: LiveState
  files: DocumentFiles
  server: LiveServer
  live: LiveApi
  agents: AgentPool
}

/** `autoStart`: start the default agent by itself when a project opens (`poney studio`; not a hub an MCP server starts). */
export async function startHub(port?: number, options: { autoStart?: boolean } = {}): Promise<Hub> {
  const state = new LiveState()
  let server: LiveServer | undefined
  // The MCP server an agent started by the Studio runs to reach this hub.
  const agents = new AgentPool(state, () => ({ ...mcpCommand(), command: process.execPath, hubUrl: server!.url }), undefined, undefined, undefined, options.autoStart)
  const files = new DocumentFiles(state)
  server = new LiveServer(state, agents, files)
  await server.start(port)
  return { state, files, server, live: new LocalLive(state, server, files), agents }
}

/**
 * The live link for an MCP server. With PONEY_HUB_URL, or when a hub already
 * answers on the usual port (a Studio started with `poney studio`), it
 * attaches to that hub, so the Studio and every agent share one session.
 * Otherwise it starts its own.
 */
export async function attachOrStart(): Promise<{ live: LiveApi; hub?: Hub }> {
  const given = process.env.PONEY_HUB_URL
  if (given) return { live: new RemoteLive(given.replace(/\/+$/, '')) }
  const usual = `http://127.0.0.1:${Number(process.env.PONEY_PORT ?? 5319)}`
  if (await isPoneyHub(usual)) return { live: new RemoteLive(usual) }
  const hub = await startHub()
  return { live: hub.live, hub }
}
