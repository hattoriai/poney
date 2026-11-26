import { plainText } from '@hattoriai/poney-core'
import { Command } from 'cmdk'
import { ArrowRight, BookOpenText, Circle, ClipboardCopy, FileInput, Keyboard, LayoutGrid, Maximize, Moon, Square, Table2, Workflow, Users } from 'lucide-react'
import type { Ref } from '@hattoriai/poney-core'
import { OVERVIEW, useIndex, useStudio } from '@/features/store'
import { revealRef } from '@/features/navigation'
import { copyDocument } from '@/features/io'
import { diagramFor } from '@hattoriai/poney-react'
import { iconFor } from '@hattoriai/poney-react'
import { toneColor } from '@hattoriai/poney-react'
import { Modal } from './Modal'
import { categoryLabel } from '../navigation/categories'

/** Search over everything in the open document: diagrams, parts, data, behaviors and what is inside them (states, transitions, messages, steps), use cases, plus commands. */
export function CommandPalette() {
  const open = useStudio((s) => s.paletteOpen)
  const setOpen = useStudio((s) => s.setPaletteOpen)
  const idx = useIndex()
  const doc = idx.doc
  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }
  const reveal = (ref: Ref) => run(() => revealRef(ref))
  const item = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] aria-selected:bg-sunken'
  const group = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-3'

  return (
    <Modal open={open} onOpenChange={setOpen} title="Search" description="Find anything in the open document: parts, states, messages, data and diagrams" width={620} hideHeader>
      <Command label="Search the model" loop filter={match} className="flex min-h-0 flex-col">
        <Command.Input autoFocus placeholder="Search parts, states, messages, data, diagrams…" className="h-12 w-full border-b border-rule bg-transparent px-5 text-[15px] outline-none placeholder:text-ink-3 focus-visible:outline-none" />
        <Command.List className={`scrollbar-quiet max-h-[56vh] overflow-y-auto p-2 ${group}`}>
          <Command.Empty className="px-3 py-8 text-center text-ink-3">Nothing in this document matches. Try a part, a state, a message or a diagram name.</Command.Empty>

          {doc.walkthroughs.length > 0 && (
            <Command.Group heading="Walkthroughs">
              {doc.walkthroughs.map((w) => (
                <Command.Item key={w.id} className={item} value={`${plainText(w.title)} walkthrough change`} onSelect={() => run(() => useStudio.getState().navigate(`walk:${w.id}`))}>
                  <BookOpenText size={15} className="text-poney" />
                  <span className="flex-1">{plainText(w.title)}</span>
                  <span className="text-[12px] text-ink-3">{w.scenes.length} scenes</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Diagrams">
            <Command.Item className={item} value="Project overview" onSelect={() => run(() => useStudio.getState().navigate(OVERVIEW))}>
              <LayoutGrid size={15} className="text-ink-3" />
              Project overview
            </Command.Item>
            {doc.views.map((v) => {
              const Icon = diagramFor(v)?.icon ?? LayoutGrid
              return (
                <Command.Item key={v.id} className={item} value={`${v.title} ${v.type} diagram`} onSelect={() => run(() => useStudio.getState().navigate(v.id))}>
                  <Icon size={15} className="text-ink-3" />
                  <span className="flex-1">{v.title}</span>
                  <span className="text-[12px] text-ink-3">{categoryLabel(v.category)}</span>
                </Command.Item>
              )
            })}
          </Command.Group>

          <Command.Group heading="Parts of the system">
            {doc.model.entities.map((e) => {
              const s = idx.style(e)
              const Icon = iconFor(s.icon)
              return (
                <Command.Item key={e.id} className={item} value={`${e.name} ${e.id} ${s.label} ${e.technology ?? ''} ${e.summary}`} onSelect={() => reveal({ kind: 'entity', id: e.id })}>
                  <Icon size={15} style={{ color: toneColor(s.tone) }} />
                  <span className="min-w-0 flex-1 truncate">
                    {e.name} <span className="text-ink-3">— {e.summary}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-3">{s.label}</span>
                </Command.Item>
              )
            })}
          </Command.Group>

          <Command.Group heading="Data">
            {doc.model.dataTypes.map((d) => (
              <Command.Item key={d.id} className={item} value={`${d.name} ${d.id} ${d.kind} ${d.summary} ${d.fields.map((f) => f.name).join(' ')}`} onSelect={() => reveal({ kind: 'dataType', id: d.id })}>
                <Table2 size={15} className="text-ink-3" />
                <span className={`flex-1 ${d.kind === 'table' ? 'font-mono text-[12.5px]' : ''}`}>{d.name}</span>
                <span className="text-[12px] text-ink-3">{d.kind === 'table' ? 'Table' : d.kind === 'event' ? 'Event' : 'Record'}</span>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Behaviors and use cases">
            {doc.model.behaviors.map((b) => (
              <Command.Item
                key={b.id}
                className={item}
                value={`${b.name} ${b.summary}`}
                onSelect={() =>
                  run(() => {
                    const v = idx.viewsForBehavior(b.id)[0]
                    if (v) useStudio.getState().navigate(v.id)
                    else useStudio.getState().select({ kind: 'behavior', id: b.id })
                  })
                }
              >
                <Workflow size={15} className="text-ink-3" />
                <span className="flex-1">{b.name}</span>
                <span className="text-[12px] text-ink-3">{idx.describe({ kind: 'behavior', id: b.id }).kind}</span>
              </Command.Item>
            ))}
            {doc.model.useCases.map((c) => (
              <Command.Item key={c.id} className={item} value={`${c.name} ${c.summary} ${c.area} use case`} onSelect={() => reveal({ kind: 'useCase', id: c.id })}>
                <Users size={15} className="text-ink-3" />
                <span className="flex-1">{c.name}</span>
                <span className="text-[12px] text-ink-3">Use case</span>
              </Command.Item>
            ))}
          </Command.Group>

          {/* What is inside behaviors: often all a document has, e.g. a state diagram imported from Mermaid. */}
          <Command.Group heading="States, steps and messages">
            {doc.model.behaviors.flatMap((b) => {
              if (b.kind === 'state-machine')
                return [
                  ...b.states
                    .filter((st) => st.kind !== 'initial')
                    .map((st) => (
                      <Command.Item key={`s-${b.id}-${st.id}`} className={item} value={`${st.name} ${st.id} state ${st.description ?? ''} ${b.name}`} onSelect={() => reveal({ kind: 'state', behavior: b.id, id: st.id })}>
                        <Circle size={15} className="text-ink-3" />
                        <span className="min-w-0 flex-1 truncate">{st.name}</span>
                        <span className="shrink-0 text-[12px] text-ink-3">State in {b.name}</span>
                      </Command.Item>
                    )),
                  ...b.transitions.map((t) => (
                    <Command.Item key={`t-${b.id}-${t.id}`} className={item} value={`${t.event} ${t.guard ?? ''} transition ${b.name}`} onSelect={() => reveal({ kind: 'transition', behavior: b.id, id: t.id })}>
                      <ArrowRight size={15} className="text-ink-3" />
                      <span className="min-w-0 flex-1 truncate">
                        {t.event}
                        {t.guard && <span className="text-ink-3"> [{t.guard}]</span>}
                      </span>
                      <span className="shrink-0 text-[12px] text-ink-3">Transition in {b.name}</span>
                    </Command.Item>
                  )),
                ]
              if (b.kind === 'interaction')
                return idx.messages(b.id).map(({ message: m }) => (
                  <Command.Item key={`m-${b.id}-${m.id}`} className={item} value={`${m.label} ${m.id} message ${b.name}`} onSelect={() => reveal({ kind: 'message', behavior: b.id, id: m.id })}>
                    <ArrowRight size={15} className="text-ink-3" />
                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                    <span className="shrink-0 text-[12px] text-ink-3">Message in {b.name}</span>
                  </Command.Item>
                ))
              if (b.kind === 'activity')
                return b.nodes
                  .filter((n) => n.label)
                  .map((n) => (
                    <Command.Item key={`n-${b.id}-${n.id}`} className={item} value={`${n.label} ${n.id} step ${b.name}`} onSelect={() => reveal({ kind: 'activityNode', behavior: b.id, id: n.id })}>
                      <Square size={15} className="text-ink-3" />
                      <span className="min-w-0 flex-1 truncate">{n.label}</span>
                      <span className="shrink-0 text-[12px] text-ink-3">Step in {b.name}</span>
                    </Command.Item>
                  ))
              return []
            })}
          </Command.Group>

          <Command.Group heading="Actions">
            <Command.Item className={item} value="Fit diagram to view" onSelect={() => run(() => useStudio.getState().requestFocus('fit'))}>
              <Maximize size={15} className="text-ink-3" />
              Fit the diagram to the view
            </Command.Item>
            <Command.Item className={item} value="Copy JSON export clipboard" onSelect={() => run(() => void copyDocument())}>
              <ClipboardCopy size={15} className="text-ink-3" />
              Copy the model as JSON
            </Command.Item>
            <Command.Item className={item} value="Open paste import Mermaid JSON" onSelect={() => run(() => useStudio.getState().setImportOpen(true))}>
              <FileInput size={15} className="text-ink-3" />
              Open or paste a model (Poney JSON or Mermaid)
            </Command.Item>
            <Command.Item className={item} value="Toggle dark light theme" onSelect={() => run(() => useStudio.getState().toggleTheme())}>
              <Moon size={15} className="text-ink-3" />
              Switch theme
            </Command.Item>
            <Command.Item className={item} value="Keyboard shortcuts help" onSelect={() => run(() => useStudio.getState().setShortcutsOpen(true))}>
              <Keyboard size={15} className="text-ink-3" />
              Keyboard shortcuts
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  )
}

/**
 * Matches what people type, not scattered letters: every word of the search
 * must start a word of the item (best) or appear inside one. The name comes
 * first in each value, so a match there ranks higher.
 */
function match(value: string, search: string): number {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  const text = value.toLowerCase()
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  let score = 0
  for (const w of words) {
    const at = tokens.findIndex((t) => t.startsWith(w))
    if (at >= 0) score += at === 0 ? 1 : at < 4 ? 0.8 : 0.6
    else if (text.includes(w)) score += 0.3
    else return 0
  }
  return score / words.length
}
