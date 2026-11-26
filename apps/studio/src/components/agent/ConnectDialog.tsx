import { useEffect, useState } from 'react'
import { Folder as FolderIcon, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useStudio } from '@/features/store'
import { checkAgent, connectAgent, customAgents, lastFolder, rememberFolder, useProjectRoot, listAgents, saveCustomAgents, type AgentChoice, type Provider, type SignInStatus } from '@/features/agent'
import { Modal } from '@/components/dialogs/Modal'
import { FileBrowser } from './FileBrowser'

type Choice = { kind: 'provider'; id: string } | { kind: 'custom'; name: string; command: string }
const keyOf = (c: Choice) => (c.kind === 'provider' ? c.id : `custom:${c.name}`)
const asAgent = (c: Choice): AgentChoice => (c.kind === 'provider' ? { providerId: c.id } : { custom: { name: c.name, command: c.command } })
type Check = SignInStatus | 'checking'

/**
 * Choose the agent one time. It works in each project the person opens: the
 * Studio starts or resumes it there. From the start page, with no project
 * open, the person also picks the folder to open.
 */
export function ConnectDialog() {
  const open = useStudio((s) => s.connectOpen)
  const setOpen = useStudio((s) => s.setConnectOpen)
  const project = useProjectRoot()
  const [providers, setProviders] = useState<Provider[]>([])
  const [custom, setCustom] = useState(() => customAgents())
  const [choice, setChoice] = useState<Choice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checks, setChecks] = useState<Record<string, Check>>({})
  const [folder, setFolder] = useState<string | null>(null)
  const [defaultAgent, setDefaultAgent] = useState<AgentChoice | null>(null)
  const [picking, setPicking] = useState(false)

  /** Asks an agent whether it can work; the choice falls on the default agent when it is ready, else on the first that is ready. */
  const check = (c: Choice, fresh = false, preferred: AgentChoice | null = defaultAgent) => {
    setChecks((m) => ({ ...m, [keyOf(c)]: 'checking' }))
    return checkAgent(asAgent(c), fresh)
      .catch((e: unknown): SignInStatus => ({ state: 'error', detail: e instanceof Error ? e.message : String(e) }))
      .then((status) => {
        setChecks((m) => ({ ...m, [keyOf(c)]: status }))
        if (status.state === 'ready') {
          const isDefault = !!preferred && JSON.stringify(asAgent(c)) === JSON.stringify(preferred)
          setChoice((cur) => (isDefault || !cur ? c : cur))
        }
        return status
      })
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    // With a project open its folder is shown; otherwise the person picks one, starting from the last one used.
    const known = project?.root ?? lastFolder() ?? null
    setFolder(known)
    setPicking(!project && !known)
    listAgents()
      .then((r) => {
        setProviders(r.providers)
        setDefaultAgent(r.defaultAgent)
        for (const p of r.providers) if (p.available) void check({ kind: 'provider', id: p.id }, false, r.defaultAgent)
        for (const c of customAgents()) void check({ kind: 'custom', ...c }, false, r.defaultAgent)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    // Checks run each time the dialog opens; the server keeps answers for a few minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const connect = async () => {
    if (!choice || (!project && !folder)) return
    setBusy('Starting the agent…')
    setError(null)
    try {
      // With a project open, the agent starts there; from the start page, the chosen folder opens as the project first.
      await connectAgent(asAgent(choice), project ? undefined : folder ?? undefined)
      if (folder && !project) rememberFolder(folder)
      setOpen(false)
      useStudio.getState().setAgentPanelOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const ready = (!!project || !!folder) && !!choice && usableStatus(checks[keyOf(choice)])
  return (
    <Modal open={open} onOpenChange={setOpen} title="Choose your agent" description="It works in each project you open." width={640}>
      <div className="scrollbar-quiet min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section aria-labelledby="code-folder">
          <h3 id="code-folder" className="text-[13px] font-semibold">
            Code
          </h3>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-sunken px-3.5 py-2.5 text-[13px]">
            <FolderIcon size={15} className="shrink-0 text-ink-3" />
            <span className={`min-w-0 flex-1 truncate ${folder ? '' : 'text-ink-3'}`} title={folder ?? undefined}>
              {project ? <code className="font-mono text-[12px]">{project.root}</code> : folder ? <code className="font-mono text-[12px]">{folder}</code> : 'Choose a folder'}
            </span>
            {!project && !picking && (
              <button type="button" onClick={() => setPicking(true)} className="shrink-0 font-semibold text-poney hover:underline">
                Change
              </button>
            )}
          </div>
          {!project && picking && (
            <div className="mt-2">
              <FileBrowser
                start={folder ?? lastFolder()}
                onPickFolder={(p) => {
                  setFolder(p)
                  setPicking(false)
                }}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="ag">
          <h3 id="ag" className="text-[13px] font-semibold">
            Agent
          </h3>
          <ul className="mt-2 divide-y divide-rule rounded-xl border border-rule">
            {providers.map((p) => {
              const c: Choice = { kind: 'provider', id: p.id }
              const on = choice?.kind === 'provider' && choice.id === p.id
              const status = checks[p.id]
              const usable = p.available && usableStatus(status)
              return (
                <li key={p.id}>
                  <label className={`flex items-start gap-3 px-3.5 py-3 ${usable ? 'cursor-pointer' : 'cursor-default'}`}>
                    <input type="radio" name="agent" className="mt-1 accent-[var(--accent)]" checked={on} disabled={!usable} onChange={() => setChoice(c)} />
                    <span className={`min-w-0 flex-1 ${p.available ? '' : 'opacity-70'}`}>
                      <span className="block text-[14px] font-medium">{p.name}</span>
                      {p.available ? <Status status={status} signIn={p.signIn} onRetry={() => void check(c, true)} /> : <span className="block text-[12.5px] text-ink-3">{p.install}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
            {custom.map((c) => {
              const on = choice?.kind === 'custom' && choice.name === c.name
              return (
                <li key={c.name} className="flex items-start gap-3 px-3.5 py-3">
                  <input type="radio" name="agent" aria-label={c.name} className="mt-1 accent-[var(--accent)]" checked={on} onChange={() => setChoice({ kind: 'custom', ...c })} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{c.name}</span>
                    <code className="block truncate font-mono text-[11.5px] text-ink-3">{c.command}</code>
                    <Status status={checks[`custom:${c.name}`]} signIn="Sign in as the agent's documentation says." onRetry={() => void check({ kind: 'custom', ...c }, true)} />
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => {
                      const next = custom.filter((x) => x.name !== c.name)
                      setCustom(next)
                      saveCustomAgents(next)
                      if (on) setChoice(null)
                    }}
                    className="rounded p-1 text-ink-4 hover:bg-sunken hover:text-ink"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
          <AddAgent
            onAdd={(a) => {
              const next = [...custom.filter((x) => x.name !== a.name), a]
              setCustom(next)
              saveCustomAgents(next)
              setChoice({ kind: 'custom', ...a })
              void check({ kind: 'custom', ...a }, true)
            }}
          />
        </section>
      </div>
      <div className="flex items-center gap-3 border-t border-rule px-5 py-3.5">
        <p role={error ? 'alert' : undefined} className={`min-w-0 flex-1 text-[12.5px] ${error ? 'text-removed' : 'text-ink-3'}`}>
          {error ?? busy ?? (project || folder ? '' : 'Choose the folder with the code.')}
        </p>
        <button type="button" disabled={!ready || !!busy} onClick={() => void connect()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-[13.5px] font-semibold text-paper disabled:opacity-35">
          {busy && <Loader2 size={14} className="animate-spin" />} Connect
        </button>
      </div>
    </Modal>
  )
}


/** Any other ACP agent, by the command that starts it. */
function AddAgent({ onAdd }: { onAdd(a: { name: string; command: string }): void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3 hover:text-ink">
        <Plus size={13} /> Add another ACP agent
      </button>
    )
  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-rule p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onAdd({ name: name.trim(), command: command.trim() })
        setOpen(false)
        setName('')
        setCommand('')
      }}
    >
      <label className="block text-[12.5px] font-medium">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My agent" className="mt-1 h-8 w-full rounded-lg border border-rule bg-paper px-2.5 text-[13px] outline-none focus:border-rule-strong" />
      </label>
      <label className="block text-[12.5px] font-medium">
        Command
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="my-agent --acp" className="mt-1 h-8 w-full rounded-lg border border-rule bg-paper px-2.5 font-mono text-[12.5px] outline-none focus:border-rule-strong" />
        <span className="mt-1 block font-normal text-ink-3">The command that starts the agent in ACP mode.</span>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim() || !command.trim()} className="h-8 rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-paper disabled:opacity-35">
          Add agent
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-ink-3 hover:bg-sunken">
          Cancel
        </button>
      </div>
    </form>
  )
}

/** An agent can be chosen once the check says it may work. */
const usableStatus = (s?: Check) => !!s && s !== 'checking' && (s.state === 'ready' || s.state === 'unsure')

/** What the sign-in check found, in one line, with a way to check again. */
function Status({ status, signIn, onRetry }: { status?: Check; signIn: string; onRetry(): void }) {
  if (!status || status === 'checking')
    return (
      <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
        <Loader2 size={12} className="animate-spin" /> Checking the sign-in…
      </span>
    )
  const tone = status.state === 'ready' ? 'text-new' : status.state === 'unsure' ? 'text-changed' : 'text-removed'
  const head = status.state === 'ready' ? 'Ready' : status.state === 'unsure' ? 'Maybe not signed in' : status.state === 'sign-in' ? 'Not signed in' : 'Cannot start'
  return (
    <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">
      <span className={`font-semibold ${tone}`}>{head}.</span> {status.detail}
      {(status.state === 'sign-in' || status.state === 'unsure') && <span className="block">{signIn}</span>}
      {status.state !== 'ready' && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            onRetry()
          }}
          className="mt-1 inline-flex items-center gap-1 font-semibold text-ink-2 hover:text-ink"
        >
          <RotateCw size={11} /> Check again
        </button>
      )}
    </span>
  )
}
