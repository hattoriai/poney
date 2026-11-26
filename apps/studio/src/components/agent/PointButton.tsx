import { Crosshair } from 'lucide-react'
import { agentReady, useStudio } from '@/features/store'

/**
 * Point at something in this diagram, for the agent: the next part, line,
 * message or state clicked goes into the message as a chip. Shown only while
 * an agent can be reached.
 */
export function PointButton({ size = 14, className = '' }: { size?: number; className?: string }) {
  const live = useStudio(agentReady)
  const pointing = useStudio((s) => s.pointing)
  if (!live) return null
  return (
    <button
      type="button"
      aria-label="Point at something for the agent"
      aria-pressed={pointing}
      title="Point at a part, a line, a message or a state, to put it in your question"
      onClick={() => useStudio.getState().setPointing(!pointing)}
      className={`grid place-items-center rounded-md ${pointing ? 'bg-poney-wash text-poney' : 'text-ink-2 hover:bg-sunken'} ${className}`}
    >
      <Crosshair size={size} />
    </button>
  )
}
