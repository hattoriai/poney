import { plainText } from '@hattoriai/poney-core'
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, CircleAlert, Loader2, MessageCircle, Plug, Square, Wrench, X } from 'lucide-react'
import { useStudio, WALK, type ContextItem, type Message, screenOf } from '@/features/store'
import { MessageBox } from './MessageBox'
import { SessionBar } from './SessionBar'
import { ask, cancelAgent, choosePermission, disconnectAgent, startersFor, useProjectRoot } from '@/features/agent'

/**
 * The agent panel: the conversation with whichever agent answers.
 *
 * Two kinds of agent use the same panel. One the Studio started (over ACP)
 * answers at once, and its tool calls and permission requests show here. One
 * in its own session (Claude Code, Codex… with the Poney MCP server) takes
 * questions when it listens (poney_wait) and answers with poney_reply.
 */
export function AgentPanel() {
  const live = useStudio((s) => s.live.state === 'on')
  const open = useStudio((s) => s.agentPanelOpen)
  const setOpen = useStudio((s) => s.setAgentPanelOpen)
  const messages = useStudio((s) => s.conversation)
  const { session, listening } = useStudio((s) => s.agent)
  const [seen, setSeen] = useState(0)
  const list = useRef<HTMLOListElement>(null)

  const replies = messages.filter((m) => m.from === 'agent' || m.from === 'permission').length
  const unread = open ? 0 : Math.max(0, replies - seen)
  useEffect(() => {
    if (open) setSeen(replies)
  }, [open, replies])
  useEffect(() => {
    if (open) list.current?.lastElementChild?.scrollIntoView({ block: 'end' })
  }, [open, messages])

  const doc = useStudio((s) => s.history?.present)
  const project = useProjectRoot()
  // The start page is outside any workspace: no agent there.
  const outside = useStudio((s) => screenOf(s) === 'start')
  const workspaceName = useStudio((s) => s.workspace?.name)
  if (!live || outside) return null

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex h-11 items-center gap-2 rounded-full bg-ink pl-4 pr-5 text-[14px] font-semibold text-paper shadow-float hover:opacity-95"
      >
        {session?.busy ? <Loader2 size={17} className="animate-spin" /> : <MessageCircle size={17} />}
        Agent
        {unread > 0 && <span className="font-tabular ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-poney px-1.5 text-[11.5px] text-paper">{unread}</span>}
      </button>
    )

  const starters = startersFor(doc)
  const waiting = !session && messages.length > 0 && messages[messages.length - 1].from === 'person'
  return (
    <section aria-label="Agent" className="fade-in fixed bottom-5 right-5 z-30 flex max-h-[min(680px,80vh)] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-rule bg-raised shadow-float">
      <header className="flex items-start gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold">{session ? session.name : 'Agent'}</h2>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
            <span className={`h-2 w-2 shrink-0 rounded-full ${session || listening ? 'bg-new' : 'bg-ink-4'}`} aria-hidden />
            {session ? (
              <span className="truncate" title={project?.root}>
                {session.busy ? 'Working' : 'Ready'}{workspaceName ? ` in ${workspaceName}` : project ? ` in ${project.name}` : ''}
              </span>
            ) : listening ? (
              'Linked from another session'
            ) : waiting ? (
              'Waiting for an agent'
            ) : (
              'Not connected'
            )}
          </p>
        </div>
        {session && (
          <button type="button" onClick={() => void disconnectAgent()} title="Stop the agent" className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-3 hover:bg-sunken hover:text-ink">
            Disconnect
          </button>
        )}
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink">
          <X size={16} />
        </button>
      </header>

      <ol ref={list} className="scrollbar-quiet min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && <Empty />}
        {messages.map((m) => (
          <Item key={m.id} m={m} />
        ))}
        {session?.busy && (
          <li className="flex items-center gap-2 text-[12.5px] text-ink-3">
            <Loader2 size={13} className="animate-spin" /> Working…
          </li>
        )}
      </ol>

      {session && messages.filter((m) => m.from === 'person').length === 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-rule px-3 py-3">
          {starters.map((s) => (
            <button key={s.label} type="button" title="Puts this request in the message box. You send it." onClick={() => useStudio.getState().suggest(s.prompt)} className="rounded-full border border-rule bg-paper px-3 py-1.5 text-[12.5px] font-medium hover:border-rule-strong">
              {s.label}
            </button>
          ))}
        </div>
      )}
      <Composer busy={!!session?.busy} />
    </section>
  )
}

/** What the panel says before anything is asked: how to get an agent. */
function Empty() {
  const { session, listening } = useStudio((s) => s.agent)
  const reading = useStudio((s) => screenOf(s) === 'document')
  const workspace = useStudio((s) => s.workspace)
  if (session || listening)
    return (
      <li className="text-[13.5px] leading-snug text-ink-3">
        {reading ? 'It sees the scene you are on and what you select.' : `It reads the folders of ${workspace?.name ?? 'this workspace'}: ${workspace?.folders.map((f) => f.name).join(', ') || 'none yet'}.`}
      </li>
    )
  return (
    <li className="space-y-2.5 text-[13.5px] leading-snug">
      <button type="button" onClick={() => useStudio.getState().setConnectOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-[13.5px] font-semibold text-paper hover:opacity-90">
        <Plug size={15} /> Connect an agent
      </button>
    </li>
  )
}

function Item({ m }: { m: Message }) {
  switch (m.from) {
    case 'person':
      return (
        <li className="ml-8 rounded-xl bg-sunken px-3 py-2.5">
          <p className="whitespace-pre-wrap text-[13.5px] leading-snug">
            <WithChips text={m.text} context={m.context ?? []} />
          </p>
          <Where walkthrough={m.walkthrough} scene={m.scene} prefix="On" />
        </li>
      )
    case 'agent':
      return (
        <li className="mr-4">
          <div className="space-y-2 text-[13.5px] leading-relaxed text-ink">
            {m.text.split(/\n{2,}/).map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {p}
              </p>
            ))}
          </div>
          <Where walkthrough={m.walkthrough} scene={m.scene} prefix="Show" link />
        </li>
      )
    case 'tool':
      return (
        <li className="flex items-center gap-2 text-[12.5px] text-ink-3">
          {m.status === 'completed' ? <Check size={13} className="shrink-0 text-new" /> : m.status === 'failed' ? <CircleAlert size={13} className="shrink-0 text-removed" /> : <Wrench size={13} className="shrink-0" />}
          <span className="truncate" title={m.title}>
            {m.title}
          </span>
        </li>
      )
    case 'permission':
      return (
        <li className="rounded-xl border border-changed/40 bg-changed-wash px-3 py-2.5">
          <p className="text-[13px] font-medium leading-snug">The agent asks: {m.title}</p>
          {m.chosen ? (
            <p className="mt-1.5 text-[12px] text-ink-3">{m.chosen === 'cancelled' ? 'Cancelled' : `You chose: ${m.options.find((o) => o.id === m.chosen)?.name ?? m.chosen}`}</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => void choosePermission(m.id, o.id)}
                  className={`h-7 rounded-lg px-2.5 text-[12.5px] font-semibold ${o.kind.startsWith('allow') ? 'bg-ink text-paper hover:opacity-90' : 'border border-rule-strong bg-raised hover:bg-sunken'}`}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
        </li>
      )
    case 'notice':
      return <li className={`text-center text-[12px] ${m.tone === 'error' ? 'text-removed' : 'text-ink-3'}`}>{m.text}</li>
  }
}

/** A message's place: a scene of a walkthrough, as a link when the agent points at it. */
function Where({ walkthrough, scene, prefix, link }: { walkthrough?: string; scene?: string; prefix: string; link?: boolean }) {
  const doc = useStudio((s) => s.history?.present)
  if (!doc || !scene) return null
  const w = walkthrough ? doc.walkthroughs.find((x) => x.id === walkthrough) : doc.walkthroughs.find((x) => x.scenes.some((s) => s.id === scene))
  const at = w ? w.scenes.findIndex((s) => s.id === scene) : -1
  if (!w || at < 0) return null
  const label = `${prefix} scene ${at + 1}: ${plainText(w.scenes[at].title)}`
  if (!link) return <p className="mt-1 text-[11.5px] text-ink-3">{label}</p>
  return (
    <button
      type="button"
      onClick={() => {
        const s = useStudio.getState()
        s.showStart(false)
        s.showHome(false)
        if (s.viewId !== `${WALK}${w.id}`) s.navigate(`${WALK}${w.id}`)
        setTimeout(() => useStudio.getState().jumpTo(scene), 60)
      }}
      className="mt-2 text-[12.5px] font-semibold text-poney hover:underline"
    >
      {label}
    </button>
  )
}

function Composer({ busy }: { busy: boolean }) {
  const [error, setError] = useState<string | null>(null)
  // The agent answers in one workspace: the box says which.
  const workspace = useStudio((s) => s.workspace?.name)

  const send = async ({ text, context }: { text: string; context: ContextItem[] }) => {
    try {
      await ask(text, context)
      setError(null)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }
  return (
    <div className="border-t border-rule p-3">
      <MessageBox
        placeholder={busy ? 'Ask next; it waits its turn' : workspace ? `Ask about ${workspace}` : 'Ask about the code'}
        onSend={send}
        actions={(submit, empty) => (
          <>
            {busy && (
              <button type="button" aria-label="Stop" title="Stop this request" onClick={() => void cancelAgent()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-rule-strong bg-raised text-ink hover:bg-sunken">
                <Square size={13} fill="currentColor" />
              </button>
            )}
            <button type="button" aria-label="Send" disabled={empty} onClick={submit} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-paper disabled:opacity-35">
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          </>
        )}
      />
      <SessionBar />
      {error && <p className="mt-1.5 text-[12px] text-removed">{error}</p>}
    </div>
  )
}

/** A sent question, with its chips drawn where they were in the sentence. */
function WithChips({ text, context }: { text: string; context: ContextItem[] }) {
  if (!context.length) return <>{text}</>
  const names = context.map((c) => `“${c.title}”`)
  const parts = text.split(new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`))
  return (
    <>
      {parts.map((part, i) => {
        const c = context[names.indexOf(part)]
        return c ? (
          <span key={i} title={c.quote ?? c.ref} className="mx-px inline-flex items-baseline gap-1 rounded-md bg-raised px-1.5 text-[12.5px]">
            <span className="text-ink-3">{c.kind === 'text' ? '“' : c.kind}</span>
            <span className="font-medium">{c.title}{c.kind === 'text' ? '”' : ''}</span>
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}
