import { describe, expect, it } from 'vitest'
import { detectMermaid, fromMermaid, MermaidImportError } from './mermaid'
import { indexOf } from '../model/query'

describe('fromMermaid', () => {
  it('converts a sequence diagram with nested blocks', () => {
    const { kind, document } = fromMermaid(`sequenceDiagram
      title Password reset
      actor User
      participant Web as Web app
      User->>Web: Ask for a reset link
      Web->>Auth: RequestReset(email)
      alt account exists
        Auth-)Mail: Send reset email
        opt rate limited
          Auth->>Auth: Wait
        end
      else no account
        Auth->>Auth: Wait, to hide the difference
      end
      Auth-->>Web: 202 Accepted`)
    expect(kind).toBe('sequence')
    expect(document.project.name).toBe('Password reset')
    const idx = indexOf(document)
    expect(idx.entities.get('user')?.kind).toBe('person')
    expect(idx.entities.get('web')?.name).toBe('Web app')
    const flat = idx.messages('sequence')
    expect(flat.map((m) => m.message.kind)).toEqual(['call', 'call', 'async', 'self', 'self', 'return'])
    expect(flat[3].context.map((c) => c.fragment.kind)).toEqual(['alt', 'opt'])
  })

  it('converts a flowchart with lanes and guards', () => {
    const { document } = fromMermaid(`flowchart TD
      subgraph CI
        A([Push]) --> B[Run tests]
        B --> C{Pass?}
      end
      C -->|Yes| D[Deploy]
      C -- No --> E[Notify]
      D --> F([Done])`)
    const p = indexOf(document).process('flow')!
    expect(p.nodes.find((n) => n.id === 'a')?.kind).toBe('start')
    expect(p.nodes.find((n) => n.id === 'c')?.kind).toBe('decision')
    expect(p.nodes.find((n) => n.id === 'f')?.kind).toBe('end')
    expect(p.flows.filter((f) => f.from === 'c').map((f) => f.guard).sort()).toEqual(['No', 'Yes'])
    expect(p.nodes.find((n) => n.id === 'a')?.performedBy).toBe('lane-ci')
  })

  it('converts a state diagram with events, guards and actions', () => {
    const { document } = fromMermaid(`stateDiagram-v2
      [*] --> Open
      Open --> Waiting : Needs customer [question asked] / pause SLA
      Waiting --> Open : Customer replies
      Open --> Resolved : Fix shipped
      Resolved --> [*]`)
    const sm = indexOf(document).stateMachine('lifecycle')!
    const t = sm.transitions.find((x) => x.event === 'Needs customer')!
    expect(t.guard).toBe('question asked')
    expect(t.actions).toEqual(['pause SLA'])
    expect(sm.states.find((s) => s.name === 'Resolved')?.kind).toBe('final')
    expect(sm.states.filter((s) => s.kind === 'initial')).toHaveLength(1)
  })

  it('converts an ER diagram with keys and cardinality', () => {
    const { document } = fromMermaid(`erDiagram
      CUSTOMER ||--o{ ORDER : places
      ORDER ||--|{ LINE_ITEM : contains
      PRODUCT }o..o{ TAG : "is tagged"
      CUSTOMER {
        uuid id PK
        string email UK "Sign-in email"
      }`)
    const idx = indexOf(document)
    expect(idx.dataTypes.get('customer')?.fields[0]).toMatchObject({ name: 'id', primaryKey: true })
    expect(idx.dataTypes.get('customer')?.fields[1]).toMatchObject({ unique: true, description: 'Sign-in email' })
    const rel = document.model.dataRelations.find((r) => r.label === 'places')!
    expect([rel.fromCardinality, rel.toCardinality]).toEqual(['one', 'many'])
    expect(document.model.dataRelations.find((r) => r.label === 'is tagged')?.logical).toBe(true)
  })

  it('detects kinds and rejects other text', () => {
    expect(detectMermaid('graph LR\n A-->B')).toBe('flowchart')
    expect(detectMermaid('pie title Pets')).toBeUndefined()
    expect(() => fromMermaid('sequenceDiagram\n  alt x\n  A->>B: hi')).toThrow(MermaidImportError)
  })
})
