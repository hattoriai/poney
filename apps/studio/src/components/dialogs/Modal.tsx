import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 560,
  hideHeader,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  width?: number
  hideHeader?: boolean
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fade-in fixed inset-0 z-40 bg-ink/25 backdrop-blur-[1px]" />
        <D.Content
          className="fade-in fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-rule bg-raised shadow-float"
          style={{ maxWidth: width }}
          aria-describedby={description ? undefined : undefined}
        >
          {hideHeader ? (
            <D.Title className="sr-only">{title}</D.Title>
          ) : (
            <div className="flex items-start gap-3 border-b border-rule px-5 py-4">
              <div className="flex-1">
                <D.Title className="text-[15px] font-semibold">{title}</D.Title>
                {description && <D.Description className="mt-0.5 text-[12.5px] text-ink-2">{description}</D.Description>}
              </div>
              <D.Close aria-label="Close" className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink">
                <X size={16} />
              </D.Close>
            </div>
          )}
          {!description && !hideHeader && <D.Description className="sr-only">{title}</D.Description>}
          {hideHeader && <D.Description className="sr-only">{description ?? title}</D.Description>}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
