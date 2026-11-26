import * as RT from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function Hint({ label, shortcut, children, side = 'top' }: { label: string; shortcut?: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RT.Root delayDuration={350}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          className="fade-in z-50 flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-[11.5px] text-paper shadow-float"
        >
          {label}
          {shortcut && <kbd className="rounded bg-paper/15 px-1 font-sans text-[10.5px] text-paper/80">{shortcut}</kbd>}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  )
}

interface ToolbarButtonProps {
  label: string
  shortcut?: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: ReactNode
  side?: 'top' | 'bottom'
}

export function ToolbarButton({ label, shortcut, onClick, active, disabled, children, side = 'top' }: ToolbarButtonProps) {
  return (
    <Hint label={label} shortcut={shortcut} side={side}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={`grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35 ${
          active ? 'bg-poney-wash !text-poney' : ''
        }`}
      >
        {children}
      </button>
    </Hint>
  )
}

export const ToolbarDivider = () => <span className="mx-1 h-5 w-px bg-rule" aria-hidden />
