import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Upload } from 'lucide-react'
import { useStudio } from '@/features/store'
import { detectFormat, importText, openText } from '@/features/io'
import { Modal } from './Modal'

const SAMPLES: { label: string; text: string }[] = [
  {
    label: 'Sequence',
    text: `sequenceDiagram
    title Password reset
    actor User
    participant Web as Web app
    participant Auth as Auth service
    participant Mail as Email provider
    User->>Web: Ask for a reset link
    Web->>Auth: RequestReset(email)
    alt account exists
        Auth->>Mail: Send reset email
        Mail-->>Auth: Accepted
    else no account
        Auth->>Auth: Wait, to hide the difference
    end
    Auth-->>Web: 202 Accepted
    Web-->>User: Check your inbox`,
  },
  {
    label: 'Flowchart',
    text: `flowchart TD
    title Deploy pipeline
    subgraph CI
      A([Push to main]) --> B[Run tests]
      B --> C{Tests pass?}
    end
    subgraph Release
      C -->|Yes| D[Build image]
      D --> E[Deploy to staging]
      E --> F{Smoke tests pass?}
      F -->|Yes| G[Promote to production]
      G --> H([Done])
    end
    C -->|No| I[Notify author]
    F -->|No| J[Roll back]
    J --> I`,
  },
  {
    label: 'State',
    text: `stateDiagram-v2
    title Support ticket
    [*] --> Open
    Open --> InProgress : Agent picks up
    InProgress --> Waiting : Needs customer [question asked] / pause SLA
    Waiting --> InProgress : Customer replies / resume SLA
    InProgress --> Resolved : Fix shipped
    Resolved --> Open : Customer reopens [within 7 days]
    Resolved --> [*]`,
  },
  {
    label: 'ER',
    text: `erDiagram
    CUSTOMER ||--o{ INVOICE : receives
    INVOICE ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is billed as"
    CUSTOMER {
      uuid id PK
      string email UK
      string name
    }
    INVOICE {
      uuid id PK
      uuid customer_id FK
      date issued_on
      int total_cents
    }
    LINE_ITEM {
      uuid id PK
      uuid invoice_id FK
      uuid product_id FK
      int quantity
    }
    PRODUCT {
      uuid id PK
      string sku UK
      int price_cents
    }`,
  },
]

export function ImportDialog() {
  const open = useStudio((s) => s.importOpen)
  const initial = useStudio((s) => s.importText)
  const setOpen = useStudio((s) => s.setImportOpen)
  const [text, setText] = useState('')
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setText(initial)
  }, [open, initial])

  const format = detectFormat(text)
  const result = useMemo(() => (text.trim() ? importText(text) : null), [text])

  const readFile = async (f: File) => setText(await f.text())

  return (
    <Modal
      open={open}
      onOpenChange={(o) => setOpen(o)}
      title="Open a model"
      description="Paste or drop a Poney document, or a Mermaid sequence, flowchart, state or ER diagram. Mermaid is converted to a Poney model."
      width={720}
    >
      <div
        className="flex min-h-0 flex-col gap-3 p-5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) void readFile(f)
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-ink-3">Try a Mermaid example:</span>
          {SAMPLES.map((s) => (
            <button key={s.label} type="button" className="rounded-md border border-rule px-2 py-1 text-[12px] text-ink-2 hover:border-rule-strong hover:text-ink" onClick={() => setText(s.text)}>
              {s.label}
            </button>
          ))}
          <span className="flex-1" />
          <button type="button" className="flex items-center gap-1.5 rounded-md border border-rule px-2 py-1 text-[12px] text-ink-2 hover:border-rule-strong hover:text-ink" onClick={() => file.current?.click()}>
            <Upload size={13} /> Choose a file
          </button>
          <input ref={file} type="file" accept=".poney,.json,.mmd,.mermaid,.txt,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
        </div>
        <label className="sr-only" htmlFor="import-text">
          Model text
        </label>
        <textarea
          id="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={'{ "poneyVersion": "0.1.0", … }\n\nor\n\nsequenceDiagram\n    Alice->>Bob: Hello'}
          className="scrollbar-quiet h-[300px] w-full resize-none rounded-xl border border-rule bg-plaster p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-rule-strong"
        />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-[12.5px]" aria-live="polite">
            {result?.ok && (
              <p className="flex items-center gap-1.5 text-[color:var(--success)]">
                <CheckCircle2 size={14} /> {format.label}: “{result.doc.project.name}”, {result.doc.views.length} view{result.doc.views.length > 1 ? 's' : ''}.
              </p>
            )}
            {result && !result.ok && (
              <div className="text-[color:var(--failure)]">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle size={14} /> {format.label}. It cannot be opened yet:
                </p>
                <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-5 text-ink-2">
                  {result.issues.slice(0, 8).map((i, n) => (
                    <li key={n}>
                      {i.path && <code className="font-mono text-[11.5px]">{i.path}</code>} {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!result && <p className="text-ink-3">{format.label}.</p>}
          </div>
          <button
            type="button"
            disabled={!result?.ok}
            onClick={() => openText(text, 'imported')}
            className="h-9 shrink-0 rounded-lg bg-ink px-4 font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Open model
          </button>
        </div>
      </div>
    </Modal>
  )
}
