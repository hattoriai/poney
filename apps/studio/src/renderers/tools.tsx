import { useEffect, useRef, useState, type FC } from 'react'
import { ArrowRightLeft, ChevronsDownUp, ChevronsUpDown, Share2 } from 'lucide-react'
import type { View, ViewOf } from '@hattoriai/poney-core'
import { useIndex, useStudio } from '@/features/store'
import { ToolbarButton } from '@/components/shared/Toolbar'
import { FIRST_STEP_MS, STEP_MS, StepPlayer } from '@/components/shared/StepPlayer'

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
  // Playing moves the selection one message at a time. Selecting anything else, or Esc, stops it.
  const [playing, setPlaying] = useState(false)
  /** The step that playing selected last; any other selection is the reader's. */
  const ours = useRef(-1)
  const play = (from: number) => {
    ours.current = from
    setPlaying(true)
  }
  useEffect(() => {
    if (!playing) return
    if (current !== ours.current) return setPlaying(false)
    const next = current + 1
    if (next >= flat.length) return setPlaying(false)
    const t = window.setTimeout(() => {
      ours.current = next
      go(next)
    }, current < 0 ? FIRST_STEP_MS : STEP_MS)
    return () => clearTimeout(t)
  }, [playing, current, flat.length])
  useEffect(() => setPlaying(false), [view.id])
  return (
    <StepPlayer
      count={flat.length}
      step={current >= 0 ? current : null}
      playing={playing}
      compact
      label="Play the messages"
      onPlay={() => {
        if (current >= flat.length - 1) {
          play(0)
          go(0)
        } else play(current)
      }}
      onPause={() => setPlaying(false)}
      onStep={(k) => {
        setPlaying(false)
        if (k !== null) go(Math.max(0, Math.min(flat.length - 1, k)))
      }}
    />
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
