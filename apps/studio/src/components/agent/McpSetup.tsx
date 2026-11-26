import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useStudio } from '@/features/store'
import { listAgents } from '@/features/agent'

/** How to start the Poney MCP server: what this install reports, else the published package. */
type Command = { command: string; args: string[] }
const PUBLISHED: Command = { command: 'npx', args: ['-y', '--package=poney', 'poney-mcp'] }
const shell = (c: Command) => [c.command, ...c.args].map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ')

/** How to add the Poney MCP server, per agent: a command where the agent has one, else its config. */
const AGENTS: { id: string; name: string; how: string; text(c: Command): string }[] = [
  { id: 'claude', name: 'Claude Code', how: 'Run in a terminal:', text: (c) => `claude mcp add poney -- ${shell(c)}` },
  { id: 'codex', name: 'Codex', how: 'Run in a terminal:', text: (c) => `codex mcp add poney -- ${shell(c)}` },
  {
    id: 'opencode',
    name: 'OpenCode',
    how: 'Add to opencode.json:',
    text: (c) => JSON.stringify({ mcp: { poney: { type: 'local', command: [c.command, ...c.args], enabled: true } } }, null, 2),
  },
  {
    id: 'copilot',
    name: 'Copilot',
    how: 'Add to ~/.copilot/mcp-config.json:',
    text: (c) => JSON.stringify({ mcpServers: { poney: { type: 'local', command: c.command, args: c.args, tools: ['*'] } } }, null, 2),
  },
  { id: 'other', name: 'Other', how: 'Add to its MCP settings:', text: (c) => JSON.stringify({ mcpServers: { poney: { command: c.command, args: c.args } } }, null, 2) },
]

/** Pick your agent; get what adds the Poney MCP server to it: this install's command, else the published package. */
export function McpSetup() {
  const live = useStudio((s) => s.live.state === 'on')
  const [command, setCommand] = useState<Command>(PUBLISHED)
  const [agent, setAgent] = useState(AGENTS[0].id)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (live) void listAgents().then((r) => r.mcpServer && setCommand(r.mcpServer), () => undefined)
  }, [live])
  const a = AGENTS.find((x) => x.id === agent)!
  const text = a.text(command)
  return (
    <div>
      <div role="tablist" aria-label="Your agent" className="flex flex-wrap gap-1">
        {AGENTS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === agent}
            onClick={() => (setAgent(x.id), setCopied(false))}
            className={`h-7 rounded-md px-2 text-[12.5px] font-medium ${x.id === agent ? 'bg-sunken text-ink' : 'text-ink-3 hover:text-ink'}`}
          >
            {x.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">{a.how}</p>
      <div className="relative mt-1">
        <pre className="scrollbar-quiet overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-sunken py-2 pl-2.5 pr-9 font-mono text-[11.5px] text-ink">{text}</pre>
        <button
          type="button"
          aria-label="Copy"
          title="Copy"
          onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}
          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-raised hover:text-ink"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  )
}
