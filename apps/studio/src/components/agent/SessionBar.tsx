import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Settings } from 'lucide-react'
import { useStudio } from '@/features/store'
import { connectAgent, customAgents, listAgents, setSetting, type Provider, type SessionSetting } from '@/features/agent'

/**
 * The agent's session settings that matter for explaining code, under the
 * message box: the agent and its model on the left; the effort, with fast
 * mode, on the right. Another agent can take over in the
 * same folder; the conversation stays.
 */
export function SessionBar() {
  const session = useStudio((s) => s.agent.session)
  const [error, setError] = useState<string | null>(null)
  if (!session) return null
  const run = (p: Promise<unknown>) => p.then(() => setError(null)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  const model = session.settings.find((s) => s.category === 'model')
  const effort = session.settings.find((s) => s.category === 'effort')
  // Only what matters for explaining code: the model, the effort, and fast mode. Modes, subagents and coding workflows stay the agent's own.
  const others = session.settings.filter((s) => s.category === 'speed')
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1 text-[12.5px]">
        <ModelPicker session={session} model={model} onError={setError} run={run} />
        <span className="flex-1" />
        {(effort || others.length > 0) && (
          <Popover label={effort ? nameOf(effort) : 'Options'} title="Effort and options">
            {(close) => (
              <>
                {others.map((s) => (
                  <Section key={s.id} title={s.name}>
                    {choices(s).map((c) => (
                      <Row key={String(c.value)} on={s.current === c.value} label={c.name} hint={c.description} onClick={() => (close(), run(setSetting(s.id, c.value)))} />
                    ))}
                  </Section>
                ))}
                {effort && (
                  <Section title={effort.name}>
                    {choices(effort).map((c) => (
                      <Row key={String(c.value)} on={effort.current === c.value} label={c.name} hint={c.description} onClick={() => (close(), run(setSetting(effort.id, c.value)))} />
                    ))}
                  </Section>
                )}
              </>
            )}
          </Popover>
        )}
      </div>
      {error && <p className="mt-1 text-[12px] text-removed">{error}</p>}
    </div>
  )
}

/** The agent, then its model: a second level, as other agent tools do. */
function ModelPicker({ session, model, run, onError }: { session: NonNullable<ReturnType<typeof useStudio.getState>['agent']['session']>; model?: SessionSetting; run(p: Promise<unknown>): void; onError(e: string | null): void }) {
  const [level, setLevel] = useState<'models' | 'agents'>(model ? 'models' : 'agents')
  const [providers, setProviders] = useState<Provider[]>([])
  const [query, setQuery] = useState('')
  const label = model ? `${session.name} · ${nameOf(model)}` : session.name
  return (
    <Popover
      label={label}
      title="Agent and model"
      align="left"
      onOpen={() => {
        setLevel(model ? 'models' : 'agents')
        setQuery('')
        void listAgents().then((r) => setProviders(r.providers.filter((p) => p.available)), () => onError('The list of agents is not available.'))
      }}
    >
      {(close) =>
        level === 'agents' ? (
          <>
            <Section title="Agent">
              {providers.map((p) => (
                <Row
                  key={p.id}
                  on={p.id === session.providerId}
                  label={p.name}
                  trailing={p.id === session.providerId && model ? <ChevronRight size={13} /> : undefined}
                  onClick={() => {
                    if (p.id === session.providerId) return model ? setLevel('models') : close()
                    close()
                    // Another agent takes over in this project; the conversation stays.
                    run(connectAgent({ providerId: p.id }))
                  }}
                />
              ))}
              {customAgents().map((c) => {
                const id = `custom:${c.name}`
                return (
                  <Row
                    key={id}
                    on={id === session.providerId}
                    label={c.name}
                    onClick={() => {
                      close()
                      if (id !== session.providerId) run(connectAgent({ custom: c }))
                    }}
                  />
                )
              })}
            </Section>
            <div className="my-1 h-px bg-rule" />
            <Row label="Change agent" icon={<Settings size={13} />} onClick={() => (close(), useStudio.getState().setConnectOpen(true))} />
          </>
        ) : (
          <>
            <div className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold text-ink-3">{session.name}</div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {choices(model!)
                .filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()))
                .map((c) => (
                  <Row
                    key={String(c.value)}
                    on={model!.current === c.value}
                    label={c.name}
                    hint={c.description}
                    tags={[...(c.recommended ? ['Recommended'] : []), ...(model!.initial === c.value && !c.recommended ? ['Your setting'] : [])]}
                    onClick={() => (close(), run(setSetting(model!.id, c.value)))}
                  />
                ))}
            </div>
            {choices(model!).length > 8 && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                aria-label="Search models"
                className="mx-1 my-1 h-8 w-[calc(100%-8px)] rounded-md border border-rule bg-paper px-2 text-[12.5px] focus:border-rule-strong"
                style={{ outline: 'none' }}
              />
            )}
            <div className="my-1 h-px bg-rule" />
            <Row label="Other agents" icon={<ArrowLeft size={13} />} onClick={() => setLevel('agents')} />
          </>
        )
      }
    </Popover>
  )
}

/* ─── Small parts ─────────────────────────────────────────────────────── */

const choices = (s: SessionSetting): { value: string | boolean; name: string; description?: string; recommended?: boolean }[] =>
  s.kind === 'boolean' ? [{ value: true, name: 'On' }, { value: false, name: 'Off' }] : s.options
const nameOf = (s: SessionSetting) => choices(s).find((c) => c.value === s.current)?.name ?? String(s.current)

/** A button that opens a small menu above it. Escape or a click outside closes it. */
function Popover({ label, title, align = 'right', onOpen, children }: { label: string; title: string; align?: 'left' | 'right'; onOpen?(): void; children(close: () => void): ReactNode }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ left?: number; right?: number; bottom: number; maxHeight: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={box} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => {
          if (!open) {
            onOpen?.()
            // Placed against the window, above the button, so no panel cuts it off.
            const r = button.current!.getBoundingClientRect()
            setPlace({
              ...(align === 'left' ? { left: r.left } : { right: window.innerWidth - r.right }),
              bottom: window.innerHeight - r.top + 6,
              maxHeight: r.top - 16,
            })
          }
          setOpen(!open)
        }}
        className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md px-2 font-medium text-ink-2 hover:bg-sunken hover:text-ink ${open ? 'bg-sunken text-ink' : ''}`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      {open && place && (
        <div role="menu" aria-label={title} className="fade-in fixed z-50 flex w-72 flex-col overflow-y-auto rounded-xl border border-rule bg-raised p-1 shadow-float" style={place}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="[&+&]:mt-1 [&+&]:border-t [&+&]:border-rule [&+&]:pt-1">
      <div className="px-2.5 pb-0.5 pt-1.5 text-[11.5px] font-semibold text-ink-3">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, hint, tags = [], on, icon, trailing, onClick }: { label: string; hint?: string; tags?: string[]; on?: boolean; icon?: ReactNode; trailing?: ReactNode; onClick(): void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={!!on} onClick={onClick} title={hint} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-sunken">
      {icon && <span className="shrink-0 text-ink-3">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate">{label}</span>
          {tags.map((t) => (
            <span key={t} className={`shrink-0 rounded-full px-1.5 text-[10.5px] font-semibold ${t === 'Recommended' ? 'bg-new-wash text-new' : 'bg-sunken text-ink-3'}`}>
              {t}
            </span>
          ))}
        </span>
      </span>
      {on && <Check size={13} className="shrink-0 text-poney" />}
      {trailing && <span className="shrink-0 text-ink-3">{trailing}</span>}
    </button>
  )
}
