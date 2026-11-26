import { useEffect, useState } from 'react'
import { Folder as FolderIcon, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useStudio } from '@/features/store'
import { agentFor, checkAgent, connectHere, customAgents, lastFolder, openProjectFolder, rememberAgentFor, rememberFolder, useProjectRoot, listAgents, saveCustomAgents, type AgentChoice, type Provider, type SignInStatus } from '@/features/agent'
import { Modal } from '@/components/dialogs/Modal'
import { FileBrowser } from './FileBrowser'

type Choice = { kind: 'provider'; id: string } | { kind: 'custom'; name: string; command: string }
const keyOf = (c: Choice) => (c.kind === 'provider' ? c.id : `custom:${c.name}`)
const asAgent = (c: Choice): AgentChoice => (c.kind === 'provider' ? { providerId: c.id } : { custom: { name: c.name, command: c.command } })
type Check = SignInStatus | 'checking'

/**
 * Connect an agent to the open document: pick the agent and the folder with
 * the code. The document stays open; the agent reads the code there and
 * writes to the document.
 */
export function ConnectDialog() {
  const open = useStudio((s) => s.connectOpen)
  const setOpen = useStudio((s) => s.setConnectOpen)
  const project = useProjectRoot()
  // From the start page, the folder's own project opens; otherwise the agent writes to the document on screen.
  const fromStart = useStudio((s) => s.startOpen || !s.history)
  const [providers, setProviders] = useState<Provider[]>([])
  const [custom, setCustom] = useState(() => customAgents())
  const [choice, setChoice] = useState<Choice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checks, setChecks] = useState<Record<string, Check>>({})
  const [folder, setFolder] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  /** Asks an agent whether it can work; the choice falls on the first that is ready. */
  const check = (c: Choice, fresh = false) => {
    setChecks((m) => ({ ...m, [keyOf(c)]: 'checking' }))
    return checkAgent(asAgent(c), fresh)
      .catch((e: unknown): SignInStatus => ({ state: 'error', detail: e instanceof Error ? e.message : String(e) }))
      .then((status) => {
        setChecks((m) => ({ ...m, [keyOf(c)]: status }))
        if (status.state === 'ready') setChoice((cur) => cur ?? c)
        return status
      })
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    // The folder already known, else the one last used with this document, else the last one used at all.
    const docId = useStudio.getState().history?.present.project.id
    const known = project?.root ?? agentFor(docId)?.folder ?? lastFolder() ?? null
    setFolder(known)
    setPicking(!known)
    listAgents()
      .then((r) => {
        setProviders(r.providers)
        for (const p of r.providers) if (p.available) void check({ kind: 'provider', id: p.id })
        for (const c of customAgents()) void check({ kind: 'custom', ...c })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    // Checks run each time the dialog opens; the server keeps answers for a few minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const connect = async () => {
    if (!folder || !choice) return
    setBusy('Starting the agent…')
    setError(null)
    try {
      const before = useStudio.getState().history?.present.project.id
      if (useStudio.getState().startOpen || !before) {
        // From the start page, nothing is on screen: the folder's own project opens (its docs/poney/ file, or a new one), and the agent works on it.
        await openProjectFolder(folder)
        await connectHere(asAgent(choice))
      } else {
        // A document is on screen: the agent works in the folder and writes to that document.
        await connectHere(asAgent(choice), folder)
      }
      rememberFolder(folder)
      const docId = await documentAfter(before)
      if (docId) rememberAgentFor(docId, { folder, agent: asAgent(choice) })
      setOpen(false)
      useStudio.getState().setAgentPanelOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const ready = !!folder && !!choice && usableStatus(checks[keyOf(choice)])
  return (
    <Modal open={open} onOpenChange={setOpen} title="Connect an agent" description={fromStart ? 'It reads the code in the folder below, and writes to its Poney document.' : 'It reads the code in the folder below and writes to this document.'} width={640}>
      <div className="scrollbar-quiet min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section aria-labelledby="code-folder">
          <h3 id="code-folder" className="text-[13px] font-semibold">
            Code
          </h3>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-sunken px-3.5 py-2.5 text-[13px]">
            <FolderIcon size={15} className="shrink-0 text-ink-3" />
            <span className={`min-w-0 flex-1 truncate ${folder ? '' : 'text-ink-3'}`} title={folder ?? undefined}>
              {folder ? <code className="font-mono text-[12px]">{folder}</code> : 'Choose a folder'}
            </span>
            {!picking && (
              <button type="button" onClick={() => setPicking(true)} className="shrink-0 font-semibold text-poney hover:underline">
                Change
              </button>
            )}
          </div>
          {picking && (
            <div className="mt-2">
              <FileBrowser
                start={folder ?? agentFor(useStudio.getState().history?.present.project.id)?.folder ?? lastFolder()}
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
          {error ?? busy ?? (folder ? '' : 'Choose the folder with the code.')}
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

/** The document on screen once a project has opened: a new one when the project changed (it arrives from the local server), else the same. */
async function documentAfter(before: string | undefined): Promise<string | undefined> {
  for (let i = 0; i < 20; i++) {
    const s = useStudio.getState()
    const id = s.history?.present.project.id
    if (id && (id !== before || !s.startOpen)) return id
    await new Promise((r) => setTimeout(r, 100))
  }
  return useStudio.getState().history?.present.project.id
}
