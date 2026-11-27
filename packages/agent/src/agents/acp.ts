/**
 * Starting an ACP agent: spawn it, initialize, open a session. A project agent
 * uses it for real work; the sign-in check uses it to see whether an agent
 * can start at all.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import {
  client,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ClientConnection,
  type McpServer,
  type LoadSessionRequest,
  type NewSessionRequest,
  type NewSessionResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from '@agentclientprotocol/sdk'
import type { ProviderSpec } from './providers'

/** ACP's error code for "authentication required". */
const AUTH_REQUIRED = -32000

/** Why an agent could not start: it needs a sign-in, or it failed. */
export class AgentStartError extends Error {
  constructor(
    message: string,
    readonly signIn: boolean,
  ) {
    super(message)
  }
}

function isSignInError(e: unknown): boolean {
  const err = e as { code?: number; message?: string }
  return err.code === AUTH_REQUIRED || /auth|sign.?in|log.?in|credential|api key/i.test(err.message ?? '')
}

export interface RunningAgent {
  child: ChildProcess
  connection: ClientConnection
  sessionId: string
  /** What happened: a new session, or the one in `StartOptions.resume`, resumed or loaded. */
  how: 'new' | 'resume' | 'load'
  /** What the agent can do with an old session. */
  can: { load: boolean; resume: boolean }
  /** The agent's answer to session/new: its settings (config options, models, modes). */
  session: NewSessionResponse
  /** True when the agent took `systemPrompt` as system instructions; else the caller must say it in the first prompt. */
  systemPromptApplied: boolean
  /** The last lines the agent wrote to stderr, for error messages. */
  stderr(): string[]
  stop(): void
}

export interface StartOptions {
  mcpServers?: McpServer[]
  /** More folders the agent may read, besides `cwd`, when it supports that (ACP `additionalDirectories`). */
  additionalDirectories?: string[]
  /** Instructions added to the agent's own system prompt, when it supports that (ACP `systemPrompt`, append mode). */
  systemPrompt?: string
  /** An earlier session to continue. An agent that cannot resume it loads it; if it cannot, or fails, a new session starts. */
  resume?: { sessionId: string; how: 'resume' | 'load' }
  onUpdate?(n: SessionNotification): void
  onPermission?(p: RequestPermissionRequest): Promise<RequestPermissionResponse>
  timeoutMs?: number
}

export async function startAgent(spec: ProviderSpec, cwd: string, options: StartOptions = {}): Promise<RunningAgent> {
  if (!spec.available) throw new AgentStartError(`${spec.name} is not installed. ${spec.install}`, false)
  const child = spawn(spec.command, spec.args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
  let lines: string[] = []
  child.stderr?.on('data', (d: Buffer) => {
    lines = [...lines, ...d.toString().split('\n').filter(Boolean)].slice(-20)
  })
  const exited = new Promise<never>((_, reject) => {
    child.once('error', (e) => reject(new AgentStartError(`${spec.name} did not start: ${e.message}`, false)))
    child.once('exit', (code) => reject(new AgentStartError(`${spec.name} stopped (exit ${code}). ${lines.slice(-3).join(' ')}`.trim(), false)))
  })
  exited.catch(() => undefined)

  let app = client({ name: 'Poney Studio' })
  if (options.onUpdate) app = app.onNotification(methods.client.session.update, ({ params }) => options.onUpdate!(params))
  // Without a handler, an agent that asks for permission gets "cancelled": nothing runs unasked.
  app = app.onRequest(methods.client.session.requestPermission, ({ params }) => options.onPermission?.(params) ?? { outcome: { outcome: 'cancelled' } })
  const connection = app.connect(ndJsonStream(Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>))
  const stop = () => {
    connection.close()
    if (child.exitCode === null) child.kill()
  }

  const opened = (async () => {
    const init = await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'poney-studio', version: '0.1.0' },
    })
    // ACP lets a client add to the system prompt only when the agent says it can.
    const canAppend = init.agentCapabilities?.sessionCapabilities?.systemPrompt != null
    const systemPrompt = canAppend && options.systemPrompt ? { mode: 'append' as const, content: [{ type: 'text' as const, text: options.systemPrompt }] } : undefined
    const can = { load: init.agentCapabilities?.loadSession === true, resume: init.agentCapabilities?.sessionCapabilities?.resume != null }
    // More folders, only to an agent that says it reads them.
    const dirs = init.agentCapabilities?.sessionCapabilities?.additionalDirectories != null && options.additionalDirectories?.length ? { additionalDirectories: options.additionalDirectories } : {}
    const base = { cwd, mcpServers: options.mcpServers ?? [], ...dirs, ...(systemPrompt ? { systemPrompt } : {}) }
    const old = options.resume
    const how = old && (can[old.how] ? old.how : can.load ? ('load' as const) : undefined)
    if (old && how) {
      const request: LoadSessionRequest = { ...base, sessionId: old.sessionId }
      try {
        const session = how === 'load' ? await connection.agent.request(methods.agent.session.load, request) : await connection.agent.request(methods.agent.session.resume, request)
        return { sessionId: old.sessionId, how, can, session: { sessionId: old.sessionId, ...session }, systemPromptApplied: !!systemPrompt }
      } catch (e) {
        // A sign-in error is not a lost session: let the caller see it. Any other failure starts a new session.
        if (isSignInError(e)) throw e
      }
    }
    const request: NewSessionRequest = base
    const session = await connection.agent.request(methods.agent.session.new, request)
    return { sessionId: session.sessionId, how: 'new' as const, can, session, systemPromptApplied: !!systemPrompt }
  })()
  const ms = options.timeoutMs ?? 60_000
  const late = new Promise<never>((_, reject) => setTimeout(() => reject(new AgentStartError(`${spec.name} did not answer within ${Math.round(ms / 1000)} seconds.`, false)), ms))
  try {
    const { sessionId, how, can, session, systemPromptApplied } = await Promise.race([opened, exited, late])
    return { child, connection, sessionId, how, can, session, systemPromptApplied, stderr: () => lines, stop }
  } catch (e) {
    stop()
    if (e instanceof AgentStartError) throw e
    const err = e as { code?: number; message?: string }
    const signIn = isSignInError(err)
    throw new AgentStartError(signIn ? `${spec.name} needs a sign-in. ${spec.signIn}` : `${spec.name} failed: ${err.message ?? String(e)}`, signIn)
  }
}
