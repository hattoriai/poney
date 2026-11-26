import { useStudio } from '@/features/store'
import { Modal } from './Modal'

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Find and move',
    keys: [
      ['⌘K  or  /', 'Search this document'],
      ['⌘Z  ⇧⌘Z', 'Undo and redo a change'],
      ['⌥←  ⌥→', 'Back and forward'],
      ['O', 'Project overview'],
      ['[  ]', 'Show or hide the sidebar and the inspector'],
    ],
  },
  {
    title: 'Canvas',
    keys: [
      ['Tab', 'Move between elements'],
      ['Enter', 'Select the focused element'],
      ['Double-click', 'Rename a part, a line, a message, a state or a step'],
      ['F', 'Zoom to the selection'],
      ['Esc', 'Clear the selection'],
      ['+  −', 'Zoom in and out'],
      ['⇧1  ⇧0', 'Fit the diagram, or 100%'],
      ['Arrows', 'Pan, when the canvas has focus'],
      ['Scroll  ·  ⌘ + scroll', 'Pan  ·  zoom at the pointer'],
    ],
  },
  {
    title: 'Model',
    keys: [
      ['⇧⌘C', 'Copy the model as Poney JSON'],
      ['⌘V', 'Open pasted Poney JSON or Mermaid'],
    ],
  },
]

export function ShortcutsDialog() {
  const open = useStudio((s) => s.shortcutsOpen)
  const setOpen = useStudio((s) => s.setShortcutsOpen)
  return (
    <Modal open={open} onOpenChange={setOpen} title="Keyboard shortcuts" width={520}>
      <div className="scrollbar-quiet overflow-y-auto px-5 py-4">
        {GROUPS.map((g) => (
          <section key={g.title} className="mb-4 last:mb-0">
            <h3 className="mb-1.5 text-[12px] font-semibold text-ink-3">{g.title}</h3>
            <dl className="divide-y divide-rule">
              {g.keys.map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="text-ink-2">{d}</dt>
                  <dd className="shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[12px] text-ink">{k}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
