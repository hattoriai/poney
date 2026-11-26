import { ArrowRight, Database, Key, Link2, Table2, Workflow, Zap } from 'lucide-react'
import { fragmentLabel, isDefined, type Ref, type View } from '@poney/core'
import { useIndex, useStudio } from '@/features/store'
import { inspectorSections } from '@/features/extensions'
import { Chips, EntityLink, Facts, Prose, RefLink, Section, Sources, ViewLink } from './parts'

const dataIcon = (kind: string) => (kind === 'table' ? <Table2 size={14} /> : kind === 'event' ? <Zap size={14} /> : <Database size={14} />)

function DataLink({ id, secondary }: { id: string; secondary?: string }) {
  const idx = useIndex()
  const d = idx.dataTypes.get(id)
  if (!d) return null
  return <RefLink to={{ kind: 'dataType', id }} label={<span className={d.kind === 'table' ? 'font-mono text-[12px]' : ''}>{d.name}</span>} secondary={secondary ?? d.summary} icon={dataIcon(d.kind)} tone="var(--malachite)" />
}

/** "Open the checkout sequence" links for every view that shows `ref`, except the current one. */
function RelatedViews({ refValue, title = 'Seen in diagrams', exclude = [] }: { refValue: Ref; title?: string; exclude?: string[] }) {
  const idx = useIndex()
  const viewId = useStudio((s) => s.viewId)
  const views = idx.viewsShowing(refValue).filter((v) => v.id !== viewId && !exclude.includes(v.id))
  if (!views.length) return null
  return (
    <Section title={title} count={views.length}>
      {views.map((v) => (
        <ViewLink key={v.id} view={v} select={refValue} />
      ))}
    </Section>
  )
}

function ExtensionSections({ refValue }: { refValue: Ref }) {
  const idx = useIndex()
  return (
    <>
      {inspectorSections().map((s) => {
        const body = s.render({ ref: refValue, doc: idx.doc, idx })
        return body ? (
          <Section key={s.id} title={s.title}>
            {body}
          </Section>
        ) : null
      })}
    </>
  )
}

export function EntityBody({ id }: { id: string }) {
  const idx = useIndex()
  const e = idx.entities.get(id)
  if (!e) return null
  const out = idx.outgoing(id).filter((r) => r.kind !== 'depends-on' && r.kind !== 'implements')
  const inn = idx.incoming(id).filter((r) => r.kind !== 'depends-on' && r.kind !== 'implements')
  const deps = idx.outgoing(id).filter((r) => r.kind === 'depends-on' || r.kind === 'implements')
  const dependents = idx.incoming(id).filter((r) => r.kind === 'depends-on' || r.kind === 'implements')
  const behaviors = idx.behaviorsInvolving(id)
  const data = idx.dataOf(id)
  const caps = idx.capabilitiesOf(id)
  const kids = idx.children(id)
  const parent = e.parent ? idx.entities.get(e.parent) : undefined
  return (
    <>
      <Section title="About">
        <Prose>{e.description ?? e.summary}</Prose>
        <div className="mt-3">
          <Facts
            items={[
              ['Kind', idx.style(e).label],
              ['Technology', e.technology],
              ['Part of', parent ? <button className="text-left hover:text-poney hover:underline" onClick={() => useStudio.getState().select({ kind: 'entity', id: parent.id })}>{parent.name}</button> : undefined],
            ]}
          />
        </div>
        {e.tags.length > 0 && (
          <div className="mt-3">
            <Chips items={e.tags} />
          </div>
        )}
      </Section>
      <ExtensionSections refValue={{ kind: 'entity', id }} />

      {(out.length > 0 || inn.length > 0) && (
        <Section title="Connections" count={out.length + inn.length}>
          {out.map((r) => (
            <RefLink key={r.id} to={{ kind: 'relationship', id: r.id }} label={<>{r.label} <span className="text-ink-3">→ {idx.entities.get(r.target)?.name}</span></>} secondary={r.protocol} icon={<ArrowRight size={14} />} tone="var(--ink-3)" />
          ))}
          {inn.map((r) => (
            <RefLink key={r.id} to={{ kind: 'relationship', id: r.id }} label={<><span className="text-ink-3">{idx.entities.get(r.source)?.name} →</span> {r.label.charAt(0).toLowerCase() + r.label.slice(1)}</>} secondary={r.protocol} icon={<ArrowRight size={14} className="rotate-180" />} tone="var(--ink-3)" />
          ))}
        </Section>
      )}

      {(deps.length > 0 || dependents.length > 0) && (
        <Section title="Code dependencies" count={deps.length + dependents.length}>
          {deps.map((r) => <EntityLink key={r.id} id={r.target} secondary={r.kind === 'implements' ? 'Implements this interface' : `Uses it: ${r.label.toLowerCase()}`} />)}
          {dependents.map((r) => <EntityLink key={r.id} id={r.source} secondary={r.kind === 'implements' ? 'Implements this' : `Depends on this: ${r.label.toLowerCase()}`} />)}
        </Section>
      )}

      {behaviors.length > 0 && (
        <Section title="Takes part in" count={behaviors.length}>
          {behaviors.map((b) =>
            idx.viewsForBehavior(b.id).map((v) => <ViewLink key={`${b.id}-${v.id}`} view={v} select={{ kind: 'entity', id }} verb="Open" />),
          )}
        </Section>
      )}

      {(data.consumed.size > 0 || data.produced.size > 0 || data.owned.length > 0) && (
        <Section title="Data">
          {data.owned.length > 0 && <p className="mb-1 text-[11.5px] text-ink-3">Owns or stores</p>}
          {data.owned.map((d) => <DataLink key={`o-${d.id}`} id={d.id} />)}
          {data.consumed.size > 0 && <p className="mb-1 mt-2 text-[11.5px] text-ink-3">Receives</p>}
          {[...data.consumed.entries()].map(([d, flows]) => <DataLink key={`c-${d}`} id={d} secondary={`From ${flows.map((f) => idx.entities.get(f.source)?.name).join(', ')}`} />)}
          {data.produced.size > 0 && <p className="mb-1 mt-2 text-[11.5px] text-ink-3">Sends</p>}
          {[...data.produced.entries()].map(([d, flows]) => <DataLink key={`p-${d}`} id={d} secondary={`To ${flows.map((f) => idx.entities.get(f.target)?.name).join(', ')}`} />)}
        </Section>
      )}

      {kids.length > 0 && (
        <Section title="Contains" count={kids.length}>
          {kids.map((k) => <EntityLink key={k.id} id={k.id} />)}
        </Section>
      )}

      {caps.length > 0 && (
        <Section title={e.kind === 'person' ? 'Can' : 'Makes possible'} count={caps.length}>
          {caps.map((c) => <RefLink key={c.id} to={{ kind: 'capability', id: c.id }} label={c.name} secondary={c.summary} icon={<Workflow size={14} />} tone="var(--tyrian)" />)}
        </Section>
      )}
      <RelatedViews refValue={{ kind: 'entity', id }} title="Also seen in" exclude={behaviors.flatMap((b) => idx.viewsForBehavior(b.id).map((v) => v.id))} />
      <Sources refs={e.sourceRefs} />
    </>
  )
}

export function RelationshipBody({ id }: { id: string }) {
  const idx = useIndex()
  const r = idx.relationships.get(id)
  if (!r) return null
  const messages = idx.messagesAlong(id)
  return (
    <>
      <Section title="About">
        <Prose>{r.description ?? `${idx.entities.get(r.source)?.name} ${r.label.charAt(0).toLowerCase() + r.label.slice(1)} ${idx.entities.get(r.target)?.name}.`}</Prose>
        <div className="mt-3">
          <Facts items={[['Kind', kindPhrase(r.kind)], ['Protocol', r.protocol]]} />
        </div>
      </Section>
      <Section title="Between">
        <EntityLink id={r.source} secondary="From" />
        <EntityLink id={r.target} secondary="To" />
      </Section>
      {r.data.length > 0 && (
        <Section title="Carries" count={r.data.length}>
          {r.data.map((d) => <DataLink key={d} id={d} />)}
        </Section>
      )}
      {messages.length > 0 && (
        <Section title="Used in these steps" count={messages.length}>
          {messages.map(({ interaction, item }) => (
            <RefLink key={`${interaction.id}-${item.message.id}`} to={{ kind: 'message', behavior: interaction.id, id: item.message.id }} label={item.message.label} secondary={`${interaction.name}, step ${item.number}`} icon={<Workflow size={14} />} tone="var(--lapis)" />
          ))}
        </Section>
      )}
      <RelatedViews refValue={{ kind: 'relationship', id }} />
    </>
  )
}

const kindPhrase = (k: string) =>
  ({
    uses: 'Used by a person',
    calls: 'Request, waits for an answer',
    reads: 'Reads',
    writes: 'Writes',
    'reads-writes': 'Reads and writes',
    publishes: 'Publishes events',
    subscribes: 'Subscribes to events',
    'depends-on': 'Code dependency',
    implements: 'Implements an interface',
  })[k] ?? k

export function DataTypeBody({ id, field }: { id: string; field?: string }) {
  const idx = useIndex()
  const d = idx.dataTypes.get(id)
  if (!d) return null
  const usage = idx.usagesOfData(id)
  const f = field ? d.fields.find((x) => x.name === field) : undefined
  const viaRelations = field ? usage.relations.filter((r) => r.via === field) : []
  return (
    <>
      {f && (
        <Section title={`Field ${f.name}`}>
          {f.description && <Prose>{f.description}</Prose>}
          <div className="mt-2">
            <Facts
              items={[
                ['Type', <code className="font-mono text-[12px]">{f.type}</code>],
                ['Key', f.primaryKey ? 'Primary key' : f.references ? 'Foreign key' : undefined],
                ['Unique', f.unique ? 'Yes' : undefined],
                ['Can be empty', f.nullable ? 'Yes' : 'No'],
              ]}
            />
          </div>
          {f.references && (
            <div className="mt-2">
              <RefLink to={{ kind: 'dataType', id: f.references.dataType, field: f.references.field }} label={<span className="font-mono text-[12px]">{idx.dataTypes.get(f.references.dataType)?.name}.{f.references.field}</span>} secondary="References" icon={<Link2 size={14} />} tone="var(--lapis)" />
            </div>
          )}
          {viaRelations.map((r) => {
            const other = r.from === id ? r.to : r.from
            return <RefLink key={r.id} to={{ kind: 'dataType', id: other }} label={<span className="font-mono text-[12px]">{idx.dataTypes.get(other)?.name}</span>} secondary={r.logical ? 'Logical reference across services; no database constraint' : 'Linked by this field'} icon={<Link2 size={14} />} tone="var(--lapis)" />
          })}
        </Section>
      )}
      <Section title={f ? `About ${d.name}` : 'About'}>
        <Prose>{d.description ?? d.summary}</Prose>
        <div className="mt-3">
          <Facts
            items={[
              ['Kind', d.kind === 'table' ? 'Table' : d.kind === 'event' ? 'Event' : d.kind === 'document' ? 'Document' : 'Record'],
              ['Owned by', d.ownedBy ? <button className="text-left hover:text-poney hover:underline" onClick={() => useStudio.getState().select({ kind: 'entity', id: d.ownedBy! })}>{idx.entities.get(d.ownedBy)?.name}</button> : undefined],
              ['Stored in', d.storedIn ? idx.entities.get(d.storedIn)?.name : undefined],
            ]}
          />
        </div>
      </Section>
      {!f && d.fields.length > 0 && (
        <Section title="Fields" count={d.fields.length}>
          <ul className="space-y-0.5">
            {d.fields.map((x) => (
              <li key={x.name}>
                <button type="button" onClick={() => useStudio.getState().select({ kind: 'dataType', id, field: x.name })} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-sunken">
                  <span className="w-3.5 shrink-0">{x.primaryKey ? <Key size={12} className="text-[color:var(--ochre)]" /> : x.references ? <Link2 size={12} className="text-[color:var(--lapis)]" /> : null}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{x.name}</code>
                  <code className="shrink-0 font-mono text-[11px] text-ink-3">
                    {x.type}
                    {x.nullable ? '?' : ''}
                  </code>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {usage.lifecycles.length > 0 && (
        <Section title="Lifecycle">
          {usage.lifecycles.flatMap((l) => idx.viewsForBehavior(l.id)).map((v) => <ViewLink key={v.id} view={v} select={{ kind: 'dataType', id }} />)}
        </Section>
      )}
      {usage.flows.length > 0 && (
        <Section title="Moves between" count={usage.flows.length}>
          {usage.flows.map((fl) => (
            <RefLink key={fl.id} to={{ kind: 'dataFlow', id: fl.id }} label={`${idx.entities.get(fl.source)?.name} → ${idx.entities.get(fl.target)?.name}`} secondary={fl.label} icon={<ArrowRight size={14} />} tone="var(--malachite)" />
          ))}
        </Section>
      )}
      {usage.messages.length > 0 && (
        <Section title="Sent in these steps" count={usage.messages.length}>
          {usage.messages.map(({ interaction, item }) => (
            <RefLink key={`${interaction.id}-${item.message.id}`} to={{ kind: 'message', behavior: interaction.id, id: item.message.id }} label={item.message.label} secondary={`${interaction.name}, step ${item.number}`} icon={<Workflow size={14} />} tone="var(--lapis)" />
          ))}
        </Section>
      )}
      <RelatedViews refValue={{ kind: 'dataType', id }} />
      <Sources refs={d.sourceRefs} />
    </>
  )
}

export function DataRelationBody({ id }: { id: string }) {
  const idx = useIndex()
  const r = idx.dataRelations.get(id)
  if (!r) return null
  const from = idx.dataTypes.get(r.from)
  const to = idx.dataTypes.get(r.to)
  const card = (c: string) => ({ one: 'exactly one', 'zero-or-one': 'at most one', many: 'any number of', 'one-or-many': 'at least one' })[c]
  return (
    <>
      <Section title="Reads as">
        <Prose>
          Each <code className="font-mono">{from?.name}</code> row {r.label} {card(r.toCardinality)} <code className="font-mono">{to?.name}</code> row{r.toCardinality === 'one' || r.toCardinality === 'zero-or-one' ? '' : 's'}. Each <code className="font-mono">{to?.name}</code> row belongs to {card(r.fromCardinality)} <code className="font-mono">{from?.name}</code> row{r.fromCardinality === 'one' || r.fromCardinality === 'zero-or-one' ? '' : 's'}.
        </Prose>
        <div className="mt-3">
          <Facts items={[['Through', r.via ? <code className="font-mono text-[12px]">{r.via}</code> : undefined], ['Enforced', r.logical ? 'No. The tables live in different databases; the services keep it consistent.' : 'Yes, by a foreign key']]} />
        </div>
      </Section>
      <Section title="Tables">
        <DataLink id={r.from} />
        <DataLink id={r.to} />
      </Section>
    </>
  )
}

export function DataFlowBody({ id }: { id: string }) {
  const idx = useIndex()
  const f = idx.dataFlows.get(id)
  if (!f) return null
  return (
    <>
      <Section title="About">
        <Prose>{f.description ?? `${idx.entities.get(f.source)?.name} sends ${f.label.charAt(0).toLowerCase() + f.label.slice(1)} to ${idx.entities.get(f.target)?.name}.`}</Prose>
      </Section>
      <Section title="Data" count={f.data.length}>
        {f.data.map((d) => {
          const t = idx.dataTypes.get(d)
          return (
            <div key={d} className="mb-2">
              <DataLink id={d} />
              {t && t.fields.length > 0 && (
                <p className="ml-6 font-mono text-[11px] leading-relaxed text-ink-3">{t.fields.map((x) => x.name).join(', ')}</p>
              )}
            </div>
          )
        })}
      </Section>
      <Section title="Between">
        <EntityLink id={f.source} secondary="From" />
        <EntityLink id={f.target} secondary="To" />
        {f.via && <RefLink to={{ kind: 'relationship', id: f.via }} label={idx.relationships.get(f.via)?.label} secondary="Carried by this connection" icon={<Link2 size={14} />} tone="var(--ink-3)" />}
      </Section>
      <RelatedViews refValue={{ kind: 'dataFlow', id }} />
    </>
  )
}

export function MessageBody({ behavior, id }: { behavior: string; id: string }) {
  const idx = useIndex()
  const item = idx.messages(behavior).find((m) => m.message.id === id)
  if (!item) return null
  const m = item.message
  const all = idx.messages(behavior)
  const prev = all[item.number - 2]
  const next = all[item.number]
  const kind = { call: 'Request, waits for an answer', return: 'Answer to an earlier request', async: 'Sent without waiting', self: 'Work done inside one participant' }[m.kind]
  return (
    <>
      <Section title="About">
        {m.description && <Prose>{m.description}</Prose>}
        <div className={m.description ? 'mt-3' : ''}>
          <Facts items={[['Step', `${item.number} of ${all.length}`], ['Kind', kind], ['When', item.context.length ? item.context.map((c) => `${fragmentLabel(c.fragment.kind).toLowerCase()}: ${c.guard}`).join(', then ') : undefined]]} />
        </div>
      </Section>
      <Section title="Between">
        <EntityLink id={m.from} secondary="From" />
        {m.to !== m.from && <EntityLink id={m.to} secondary="To" />}
      </Section>
      {m.data.length > 0 && (
        <Section title="Carries">
          {m.data.map((d) => <DataLink key={d} id={d} />)}
        </Section>
      )}
      {m.relationship && (
        <Section title="Connection">
          <RefLink to={{ kind: 'relationship', id: m.relationship }} label={idx.relationships.get(m.relationship)?.label} secondary={idx.relationships.get(m.relationship)?.protocol} icon={<Link2 size={14} />} tone="var(--ink-3)" />
        </Section>
      )}
      <Section title="Step through">
        <div className="flex gap-2">
          <button type="button" disabled={!prev} onClick={() => prev && useStudio.getState().select({ kind: 'message', behavior, id: prev.message.id }, { focus: 'center' })} className="flex-1 rounded-md border border-rule px-2 py-1.5 text-[12px] hover:bg-sunken disabled:opacity-35">
            ← Step {item.number - 1 || ''}
          </button>
          <button type="button" disabled={!next} onClick={() => next && useStudio.getState().select({ kind: 'message', behavior, id: next.message.id }, { focus: 'center' })} className="flex-1 rounded-md border border-rule px-2 py-1.5 text-[12px] hover:bg-sunken disabled:opacity-35">
            Step {next ? item.number + 1 : ''} →
          </button>
        </div>
      </Section>
    </>
  )
}

export function FragmentBody({ behavior, id }: { behavior: string; id: string }) {
  const idx = useIndex()
  const f = idx.findFragment(behavior, id)
  if (!f) return null
  const explain = { alt: 'Exactly one of these paths happens, depending on the condition.', opt: 'This happens only when the condition is true.', loop: 'These steps repeat.', par: 'These paths happen at the same time.' }[f.kind]
  return (
    <Section title={fragmentLabel(f.kind)}>
      <Prose>{explain}</Prose>
      <ol className="mt-2 space-y-1.5">
        {f.branches.map((b, i) => (
          <li key={i} className="rounded-md bg-sunken px-2.5 py-1.5 text-[12.5px]">
            <span className="text-ink-3">{f.kind === 'loop' ? 'Repeat' : f.kind === 'par' ? 'Path' : 'If'}</span> {b.guard}
            <span className="text-ink-3"> — {b.steps.length} step{b.steps.length === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}

export function ActivityNodeBody({ behavior, id }: { behavior: string; id: string }) {
  const idx = useIndex()
  const p = idx.process(behavior)
  const n = p?.nodes.find((x) => x.id === id)
  if (!p || !n) return null
  const outs = p.flows.filter((f) => f.from === id)
  const ins = p.flows.filter((f) => f.to === id)
  const label = (nid: string) => p.nodes.find((x) => x.id === nid)?.label
  return (
    <>
      <Section title="About">
        {n.description && <Prose>{n.description}</Prose>}
        <div className={n.description ? 'mt-3' : ''}>
          <Facts items={[['Step', idx.describe({ kind: 'activityNode', behavior, id }).kind], ['Outcome', n.outcome === 'failure' ? 'Ends in failure' : n.outcome === 'success' ? 'Ends in success' : undefined]]} />
        </div>
      </Section>
      {n.performedBy && (
        <Section title="Done by">
          <EntityLink id={n.performedBy} />
        </Section>
      )}
      {ins.length > 0 && (
        <Section title="Comes after">
          {ins.map((f) => <RefLink key={f.id} to={{ kind: 'activityNode', behavior, id: f.from }} label={label(f.from)} secondary={f.guard ? `When “${f.guard}”` : undefined} icon={<ArrowRight size={14} className="rotate-180" />} tone="var(--ink-3)" />)}
        </Section>
      )}
      {outs.length > 0 && (
        <Section title={n.kind === 'decision' ? 'Branches' : 'Leads to'}>
          {outs.map((f) => <RefLink key={f.id} to={{ kind: 'activityNode', behavior, id: f.to }} label={label(f.to)} secondary={f.guard ? `When “${f.guard}”` : undefined} icon={<ArrowRight size={14} />} tone="var(--ink-3)" />)}
        </Section>
      )}
    </>
  )
}

export function ActivityFlowBody({ behavior, id }: { behavior: string; id: string }) {
  const idx = useIndex()
  const p = idx.process(behavior)
  const f = p?.flows.find((x) => x.id === id)
  if (!p || !f) return null
  return (
    <Section title="Flow">
      {f.guard && <Prose>Taken when the answer is “{f.guard}”.</Prose>}
      <div className="mt-2">
        <RefLink to={{ kind: 'activityNode', behavior, id: f.from }} label={p.nodes.find((n) => n.id === f.from)?.label} secondary="From" />
        <RefLink to={{ kind: 'activityNode', behavior, id: f.to }} label={p.nodes.find((n) => n.id === f.to)?.label} secondary="To" />
      </div>
    </Section>
  )
}

export function StateBody({ behavior, id }: { behavior: string; id: string }) {
  const idx = useIndex()
  const sm = idx.stateMachine(behavior)
  const s = sm?.states.find((x) => x.id === id)
  if (!sm || !s) return null
  const name = (sid: string) => sm.states.find((x) => x.id === sid)?.name
  const outs = sm.transitions.filter((t) => t.from === id)
  const ins = sm.transitions.filter((t) => t.to === id)
  return (
    <>
      <Section title="About">
        {s.description && <Prose>{s.description}</Prose>}
        <div className={s.description ? 'mt-3' : ''}>
          <Facts items={[['Kind', s.kind === 'initial' ? 'Where every lifecycle starts' : s.kind === 'final' ? 'Final. Nothing happens after this.' : 'State'], ['Stored as', sm.subject ? <code className="font-mono text-[12px]">{idx.dataTypes.get(sm.subject)?.name}.status</code> : undefined]]} />
        </div>
      </Section>
      {s.entryActions.length > 0 && (
        <Section title="On entry">
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-ink-2">
            {s.entryActions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </Section>
      )}
      {outs.length > 0 && (
        <Section title="Can move to" count={outs.length}>
          {outs.map((t) => <RefLink key={t.id} to={{ kind: 'transition', behavior, id: t.id }} label={name(t.to)} secondary={`${t.event}${t.guard ? `, only when ${t.guard}` : ''}`} icon={<ArrowRight size={14} />} tone="var(--ink-3)" />)}
        </Section>
      )}
      {ins.length > 0 && (
        <Section title="Reached from" count={ins.length}>
          {ins.map((t) => <RefLink key={t.id} to={{ kind: 'transition', behavior, id: t.id }} label={name(t.from)} secondary={t.event} icon={<ArrowRight size={14} className="rotate-180" />} tone="var(--ink-3)" />)}
        </Section>
      )}
    </>
  )
}

export function TransitionBody({ behavior, id }: { behavior: string; id: string }) {
  const idx = useIndex()
  const sm = idx.stateMachine(behavior)
  const t = sm?.transitions.find((x) => x.id === id)
  if (!sm || !t) return null
  const name = (sid: string) => sm.states.find((x) => x.id === sid)?.name
  return (
    <>
      <Section title="What causes it">
        <Prose>
          When <strong className="text-ink">{t.event.charAt(0).toLowerCase() + t.event.slice(1)}</strong>
          {t.guard ? <>, and only if {t.guard},</> : ''} the {sm.subject ? idx.dataTypes.get(sm.subject)?.name.replace(/s$/, '') : 'item'} moves from <strong className="text-ink">{name(t.from)}</strong> to <strong className="text-ink">{name(t.to)}</strong>.
        </Prose>
        {t.description && <p className="mt-2 text-[12.5px] text-ink-2">{t.description}</p>}
      </Section>
      {t.actions.length > 0 && (
        <Section title="What happens then">
          <ol className="list-decimal space-y-0.5 pl-4 text-[12.5px] text-ink-2">
            {t.actions.map((a) => <li key={a}>{a}</li>)}
          </ol>
        </Section>
      )}
      {t.triggeredBy && (
        <Section title="Raised by">
          <EntityLink id={t.triggeredBy} />
        </Section>
      )}
      <Section title="States">
        <RefLink to={{ kind: 'state', behavior, id: t.from }} label={name(t.from)} secondary="From" />
        <RefLink to={{ kind: 'state', behavior, id: t.to }} label={name(t.to)} secondary="To" />
      </Section>
    </>
  )
}

export function CapabilityBody({ id }: { id: string }) {
  const idx = useIndex()
  const c = idx.capabilities.get(id)
  if (!c) return null
  const views = c.behaviors.flatMap((b) => idx.viewsForBehavior(b))
  return (
    <>
      <Section title="About">
        <Prose>{c.summary}</Prose>
        <div className="mt-3">
          <Facts items={[['Area', c.area]]} />
        </div>
      </Section>
      <Section title="Who">
        {c.actors.map((a) => <EntityLink key={a} id={a} secondary="Does it" />)}
        {c.supporting.map((a) => <EntityLink key={a} id={a} secondary="Helps" />)}
      </Section>
      {c.realizedBy.length > 0 && (
        <Section title="Built by" count={c.realizedBy.length}>
          {c.realizedBy.map((a) => <EntityLink key={a} id={a} />)}
        </Section>
      )}
      {views.length > 0 && (
        <Section title="See how it works">
          {views.map((v) => <ViewLink key={v.id} view={v} />)}
        </Section>
      )}
      {c.includes.length > 0 && (
        <Section title="Includes">
          {c.includes.map((i) => <RefLink key={i} to={{ kind: 'capability', id: i }} label={idx.capabilities.get(i)?.name} secondary={idx.capabilities.get(i)?.summary} icon={<Workflow size={14} />} tone="var(--tyrian)" />)}
        </Section>
      )}
    </>
  )
}

export function GroupBody({ view, id }: { view: string; id: string }) {
  const idx = useIndex()
  const v = idx.views.get(view)
  const groups = v?.type === 'architecture' ? v.groups : v?.type === 'dependency' ? v.layers : []
  const g = groups.find((x) => x.id === id)
  if (!g) return null
  return (
    <>
      {g.description && (
        <Section title="About">
          <Prose>{g.description}</Prose>
        </Section>
      )}
      <Section title="Members" count={g.members.length}>
        {g.members.map((m) => <EntityLink key={m} id={m} />)}
      </Section>
    </>
  )
}

export function BehaviorBody({ id }: { id: string }) {
  const idx = useIndex()
  const b = idx.behaviors.get(id)
  if (!b) return null
  return (
    <>
      <Section title="About">
        <Prose>{b.description ?? b.summary}</Prose>
      </Section>
      <Section title="Diagrams">
        {idx.viewsForBehavior(id).map((v: View) => <ViewLink key={v.id} view={v} />)}
      </Section>
    </>
  )
}

export function bodyFor(ref: Ref) {
  switch (ref.kind) {
    case 'entity':
      return <EntityBody id={ref.id} />
    case 'relationship':
      return <RelationshipBody id={ref.id} />
    case 'dataType':
      return <DataTypeBody id={ref.id} field={ref.field} />
    case 'dataRelation':
      return <DataRelationBody id={ref.id} />
    case 'dataFlow':
      return <DataFlowBody id={ref.id} />
    case 'message':
      return <MessageBody behavior={ref.behavior} id={ref.id} />
    case 'fragment':
      return <FragmentBody behavior={ref.behavior} id={ref.id} />
    case 'activityNode':
      return <ActivityNodeBody behavior={ref.behavior} id={ref.id} />
    case 'activityFlow':
      return <ActivityFlowBody behavior={ref.behavior} id={ref.id} />
    case 'state':
      return <StateBody behavior={ref.behavior} id={ref.id} />
    case 'transition':
      return <TransitionBody behavior={ref.behavior} id={ref.id} />
    case 'capability':
      return <CapabilityBody id={ref.id} />
    case 'group':
      return <GroupBody view={ref.view} id={ref.id} />
    case 'behavior':
      return <BehaviorBody id={ref.id} />
  }
}

export { isDefined }
