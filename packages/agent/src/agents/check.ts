/**
 * Can this agent work? Asks the agent's own CLI whether it is signed in;
 * for an agent without such a command, opens a test session over ACP in an
 * empty folder, then stops it. No prompt is sent, so nothing is spent.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentStartError, startAgent } from './acp'
import type { ProviderSpec, SignInStatus } from './providers'

const cache = new Map<string, { at: number; status: SignInStatus }>()
const FRESH_MS = 5 * 60_000

export async function checkProvider(spec: ProviderSpec, fresh = false): Promise<SignInStatus> {
  const hit = cache.get(spec.id)
  if (!fresh && hit && Date.now() - hit.at < FRESH_MS) return hit.status
  const status = await check(spec)
  cache.set(spec.id, { at: Date.now(), status })
  return status
}

async function check(spec: ProviderSpec): Promise<SignInStatus> {
  if (!spec.available) return { state: 'error', detail: spec.install }
  const told = await spec.status?.().catch(() => undefined)
  if (told) return told
  try {
    const agent = await startAgent(spec, mkdtempSync(join(tmpdir(), 'poney-check-')), { timeoutMs: 45_000 })
    agent.stop()
    return { state: 'unsure', detail: 'A test session opened. Poney cannot ask this agent whether it is signed in; the first request will tell.' }
  } catch (e) {
    if (e instanceof AgentStartError && e.signIn) return { state: 'sign-in', detail: 'It asks for a sign-in.' }
    return { state: 'error', detail: e instanceof Error ? e.message : String(e) }
  }
}
