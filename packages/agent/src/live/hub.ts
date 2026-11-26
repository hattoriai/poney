/**
 * Starts a live hub: the state, the HTTP server, and (when asked) the bridge
 * that lets the Studio start agents. `poney studio` and the MCP server both
 * start hubs this way; an MCP server that finds a hub already running attaches
 * to it instead (see attachOrStart).
 */
import { fileURLToPath } from 'node:url'
import { AgentBridge } from '../agents/bridge'
import { isPoneyHub, LocalLive, RemoteLive, type LiveApi } from './api'
import { LiveServer } from './server'
import { LiveState } from './state'
import { DocumentFiles } from './files'

/** The MCP server's entry, which an agent started by the Studio runs to reach this hub. */
const MCP_BIN = fileURLToPath(new URL('../../bin/poney-mcp.mjs', import.meta.url))

export interface Hub {
  state: LiveState
  files: DocumentFiles
  server: LiveServer
  live: LiveApi
  bridge: AgentBridge
}

export async function startHub(port?: number): Promise<Hub> {
  const state = new LiveState()
  let server: LiveServer | undefined
  const bridge = new AgentBridge(state, () => ({ command: process.execPath, args: [MCP_BIN], hubUrl: server!.url }))
  const files = new DocumentFiles(state)
  server = new LiveServer(state, bridge, files)
  await server.start(port)
  return { state, files, server, live: new LocalLive(state, server), bridge }
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
