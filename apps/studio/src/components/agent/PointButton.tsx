import { Crosshair } from 'lucide-react'
import { agentReady, useStudio } from '@/features/store'

/**
 * Point at something in this diagram, for the agent: the next part, line,
 * message or state clicked goes into the message as a chip. Shown while
 * Poney runs on this computer; greyed while no agent is connected, and then
 * a click opens "Connect an agent".
 */
export function PointButton({ size = 14, className = '' }: { size?: number; className?: string }) {
  const reachable = useStudio((s) => s.live.state === 'on')
  const ready = useStudio(agentReady)
  const pointing = useStudio((s) => s.pointing)
  if (!reachable) return null
  return (
    <button
      type="button"
      aria-label={ready ? 'Point at something for the agent' : 'Point at something for the agent (connect an agent first)'}
      aria-pressed={ready ? pointing : undefined}
      title={ready ? 'Point at a part, a line, a message or a state, to put it in your question' : 'No agent is connected. Click to connect one, then point at something to ask about it.'}
      onClick={() => (ready ? useStudio.getState().setPointing(!pointing) : useStudio.getState().setConnectOpen(true))}
      className={`grid place-items-center rounded-md ${!ready ? 'text-ink-4 hover:bg-sunken hover:text-ink-3' : pointing ? 'bg-poney-wash text-poney' : 'text-ink-2 hover:bg-sunken'} ${className}`}
    >
      <Crosshair size={size} />
    </button>
  )
}
