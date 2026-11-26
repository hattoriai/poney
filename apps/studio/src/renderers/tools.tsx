import type { FC } from 'react'
import { ArrowRightLeft, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Share2 } from 'lucide-react'
import type { View, ViewOf } from '@hattoriai/poney-core'
import { useIndex, useStudio } from '@/features/store'
import { ToolbarButton } from '@/components/shared/Toolbar'

/**
 * The Studio's controls for each diagram type, in the canvas toolbar. The
 * diagrams themselves come from @hattoriai/poney-react; these buttons change what the
 * Studio keeps for a view (open groups, expanded tables) or move the
 * selection.
 */

function ArchitectureTools({ view }: { view: ViewOf<'architecture'> }) {
  const idx = useIndex()
  const collapsed = useStudio((s) => s.viewUi[view.id]?.collapsed) ?? view.collapsed
  const update = useStudio((s) => s.updateViewUi)
  const systems = view.entities.filter((id) => idx.children(id).some((c) => view.entities.includes(c.id)))
  return (
    <>
      <ToolbarButton label="Open everything" onClick={() => update(view.id, { collapsed: [] })} disabled={collapsed.length === 0}>
        <ChevronsUpDown size={15} />
      </ToolbarButton>
      <ToolbarButton label="Show as one system" onClick={() => update(view.id, { collapsed: [...systems] })} disabled={systems.every((s) => collapsed.includes(s))}>
        <ChevronsDownUp size={15} />
      </ToolbarButton>
    </>
  )
}

function DataflowTools({ view }: { view: ViewOf<'dataflow'> }) {
  const ui = useStudio((s) => s.viewUi[view.id])
  const update = useStudio((s) => s.updateViewUi)
  const on = ui?.controlFlow ?? view.showControlFlow
  return (
    <ToolbarButton label={on ? 'Hide calls that carry no data' : 'Show calls that carry no data'} onClick={() => update(view.id, { controlFlow: !on })} active={on}>
      <ArrowRightLeft size={15} />
    </ToolbarButton>
  )
}

function DependencyTools({ view }: { view: View }) {
  const transitive = useStudio((s) => s.viewUi[view.id]?.transitive ?? false)
  const update = useStudio((s) => s.updateViewUi)
  return (
    <ToolbarButton label={transitive ? 'Show direct dependencies only' : 'Follow dependencies all the way'} onClick={() => update(view.id, { transitive: !transitive })} active={transitive}>
      <Share2 size={15} />
    </ToolbarButton>
  )
}

function ErdTools({ view }: { view: ViewOf<'erd'> }) {
  const ui = useStudio((s) => s.viewUi[view.id])
  const update = useStudio((s) => s.updateViewUi)
  const all = ui?.expandedTables?.length === view.dataTypes.length
  return (
    <ToolbarButton label={all ? 'Show key fields only' : 'Show every field'} onClick={() => update(view.id, { expandedTables: all ? [] : [...view.dataTypes] })} active={all}>
      {all ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
    </ToolbarButton>
  )
}

function SequenceTools({ view }: { view: ViewOf<'sequence'> }) {
  const idx = useIndex()
  const selection = useStudio((s) => s.selection)
  const select = useStudio((s) => s.select)
  const flat = idx.messages(view.interaction)
  const current = selection?.kind === 'message' && selection.behavior === view.interaction ? flat.findIndex((f) => f.message.id === selection.id) : -1
  const go = (i: number) => flat[i] && select({ kind: 'message', behavior: view.interaction, id: flat[i].message.id }, { focus: 'center' })
  return (
    <>
      <ToolbarButton label="Previous step" onClick={() => go(current <= 0 ? 0 : current - 1)} disabled={current === 0}>
        <ChevronLeft size={15} />
      </ToolbarButton>
      <span className="font-tabular min-w-[54px] text-center text-[12px] text-ink-2" aria-live="polite">
        {current >= 0 ? `${current + 1} / ${flat.length}` : `${flat.length} steps`}
      </span>
      <ToolbarButton label={current < 0 ? 'Start stepping through' : 'Next step'} onClick={() => go(current + 1)} disabled={current === flat.length - 1}>
        <ChevronRight size={15} />
      </ToolbarButton>
    </>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOLS: Record<string, FC<{ view: any }>> = {
  architecture: ArchitectureTools,
  dataflow: DataflowTools,
  dependency: DependencyTools,
  erd: ErdTools,
  sequence: SequenceTools,
}
