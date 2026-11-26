/**
 * The agents Poney Studio can start, over the Agent Client Protocol (ACP).
 *
 * Claude Code and Codex speak ACP through their official adapters, which
 * this package depends on. OpenCode and GitHub Copilot speak it themselves,
 * when they are installed. A person can add any other ACP agent by command.
 */
import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { delimiter, dirname, join } from 'node:path'
import type { Provider, SignInStatus } from '../live/types'
export type { SignInStatus }


/** How to start one agent, and how to tell whether it is signed in. */
export interface ProviderSpec {
  id: string
  name: string
  command: string
  args: string[]
  install: string
  available: boolean
  /** What to run to sign in. */
  signIn: string
  /** Asks the agent's own CLI whether it is signed in. Without it, or when the CLI is not found, the check opens a test session. */
  status?: () => Promise<SignInStatus | undefined>
  custom?: boolean
}

const require = createRequire(import.meta.url)
const exec = promisify(execFile)

/**
 * The file of an npm package's command (its "bin"), run with this Node.
 * Read from the package's own package.json, since its exports may hide the file.
 */
function packageBin(pkg: string): string | undefined {
  try {
    const manifest = require.resolve(`${pkg}/package.json`)
    const { bin } = require(manifest) as { bin?: string | Record<string, string> }
    const file = typeof bin === 'string' ? bin : bin && Object.values(bin)[0]
    return file ? join(dirname(manifest), file) : undefined
  } catch {
    return undefined
  }
}

/** The full path of a program on PATH, if it is there. */
export function onPath(program: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const file = join(dir, program)
    try {
      accessSync(file, constants.X_OK)
      return file
    } catch {
      /* not here */
    }
  }
  return undefined
}

/** Runs a CLI and returns its exit code and output, without colours. */
async function run(command: string, args: string[]): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await exec(command, args, { timeout: 20_000, env: { ...process.env, NO_COLOR: '1' } })
    return { code: 0, out: strip(`${stdout}${stderr}`) }
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string; message: string }
    return { code: typeof err.code === 'number' ? err.code : 1, out: strip(`${err.stdout ?? ''}${err.stderr ?? err.message}`) }
  }
}
const strip = (t: string) => t.replace(/\x1b\[[0-9;]*m/g, '').trim()

/** `claude auth status` prints JSON with `loggedIn` and `authMethod`. */
async function claudeStatus(): Promise<SignInStatus | undefined> {
  const bin = onPath('claude')
  if (!bin) return undefined
  const { out } = await run(bin, ['auth', 'status'])
  try {
    const s = JSON.parse(out.slice(out.indexOf('{'))) as { loggedIn?: boolean; authMethod?: string; configDirectory?: string }
    return s.loggedIn ? { state: 'ready', detail: `Signed in${s.authMethod ? ` with ${s.authMethod}` : ''}${s.configDirectory ? ` (${s.configDirectory.replace(homedir(), '~')})` : ''}.` } : { state: 'sign-in', detail: 'Not signed in.' }
  } catch {
    return { state: 'unsure', detail: 'Claude Code did not say whether it is signed in.' }
  }
}

/** `codex login status` exits 0 when signed in, and says how. */
async function codexStatus(): Promise<SignInStatus | undefined> {
  const bin = onPath('codex')
  if (!bin) return undefined
  const { code, out } = await run(bin, ['login', 'status'])
  return code === 0 ? { state: 'ready', detail: `${out.split('\n')[0] || 'Signed in'}.` } : { state: 'sign-in', detail: out.split('\n')[0] || 'Not signed in.' }
}

/** `opencode auth list` counts stored sign-ins, and lists provider keys found in the environment. */
async function opencodeStatus(bin: string): Promise<SignInStatus> {
  const { out } = await run(bin, ['auth', 'list'])
  const stored = Number(/(\d+)\s+credentials?/i.exec(out)?.[1] ?? 0)
  const fromEnv = [...out.matchAll(/●\s+(.+?)\s+([A-Z][A-Z0-9_]+)\s*$/gm)].map((m) => `${m[1]} (${m[2]})`)
  if (stored > 0) return { state: 'ready', detail: `${stored} stored sign-in${stored > 1 ? 's' : ''}.` }
  if (fromEnv.length) return { state: 'unsure', detail: `No stored sign-in. It can only use keys from your environment: ${fromEnv.join(', ')}.` }
  return { state: 'sign-in', detail: 'No sign-in, and no provider key in the environment.' }
}

export function builtInProviders(): ProviderSpec[] {
  const claude = packageBin('@agentclientprotocol/claude-agent-acp')
  const codex = packageBin('@agentclientprotocol/codex-acp')
  const opencode = onPath('opencode')
  const copilot = onPath('copilot')
  return [
    { id: 'claude-code', name: 'Claude Code', command: process.execPath, args: claude ? [claude] : [], available: !!claude, install: 'Reinstall Poney\'s dependencies (npm install).', signIn: 'Run "claude" in a terminal and sign in with /login.', status: claudeStatus },
    { id: 'codex', name: 'OpenAI Codex', command: process.execPath, args: codex ? [codex] : [], available: !!codex, install: 'Reinstall Poney\'s dependencies (npm install).', signIn: 'Run "codex login" in a terminal.', status: codexStatus },
    { id: 'opencode', name: 'OpenCode', command: opencode ?? 'opencode', args: ['acp'], available: !!opencode, install: 'Install OpenCode: https://opencode.ai', signIn: 'Run "opencode auth login" in a terminal.', status: opencode ? () => opencodeStatus(opencode) : undefined },
    { id: 'copilot', name: 'GitHub Copilot', command: copilot ?? 'copilot', args: ['--acp', '--stdio'], available: !!copilot, install: 'Install the Copilot CLI: npm install -g @github/copilot', signIn: 'Run "copilot" in a terminal and sign in with /login.' },
  ]
}

/** Splits a command line into the program and its arguments; quotes group words. */
export function parseCommand(line: string): { command: string; args: string[] } | undefined {
  const words = [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3])
  if (!words.length) return undefined
  return { command: words[0], args: words.slice(1) }
}

/** An agent the person added by command. */
export function customProvider(name: string, commandLine: string): ProviderSpec | undefined {
  const parsed = parseCommand(commandLine)
  if (!parsed) return undefined
  const found = parsed.command.includes('/') ? parsed.command : onPath(parsed.command)
  return { id: `custom:${name}`, name, ...parsed, command: found ?? parsed.command, available: !!found, install: `"${parsed.command}" is not on PATH.`, signIn: 'Sign in as the agent\'s documentation says.', custom: true }
}

/** What the Studio shows about a provider. */
export const describeProvider = ({ id, name, install, available, signIn, custom }: ProviderSpec): Provider => ({ id, name, install, available, signIn, ...(custom ? { custom } : {}) })
