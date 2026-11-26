/**
 * A reference to one semantic element of the model. Selection, search
 * results, navigation targets and viewport anchors all use refs, so that
 * "the Payment service" means the same thing in every diagram.
 */
export type Ref =
  | { kind: 'entity'; id: string }
  | { kind: 'relationship'; id: string }
  | { kind: 'group'; view: string; id: string }
  | { kind: 'dataType'; id: string; field?: string }
  | { kind: 'dataRelation'; id: string }
  | { kind: 'dataFlow'; id: string }
  | { kind: 'message'; behavior: string; id: string }
  | { kind: 'fragment'; behavior: string; id: string }
  | { kind: 'activityNode'; behavior: string; id: string }
  | { kind: 'activityFlow'; behavior: string; id: string }
  | { kind: 'state'; behavior: string; id: string }
  | { kind: 'transition'; behavior: string; id: string }
  | { kind: 'useCase'; id: string }
  | { kind: 'behavior'; id: string }

export type RefKind = Ref['kind']

/** A stable string for maps and DOM attributes. */
export function refKey(ref: Ref): string {
  switch (ref.kind) {
    case 'group':
      return `group:${ref.view}:${ref.id}`
    case 'dataType':
      return ref.field ? `dataType:${ref.id}#${ref.field}` : `dataType:${ref.id}`
    case 'message':
    case 'fragment':
    case 'activityNode':
    case 'activityFlow':
    case 'state':
    case 'transition':
      return `${ref.kind}:${ref.behavior}:${ref.id}`
    default:
      return `${ref.kind}:${ref.id}`
  }
}

export function sameRef(a: Ref | null | undefined, b: Ref | null | undefined): boolean {
  if (!a || !b) return false
  return refKey(a) === refKey(b)
}

export const entityRef = (id: string): Ref => ({ kind: 'entity', id })

/**
 * Parses a ref key ("entity:order-service", "transition:order-lifecycle:t-retry",
 * "dataType:orders#payment_attempts"). Returns null for text that is not a ref.
 */
export function parseRef(text: string): Ref | null {
  const [kind, ...rest] = text.split(':')
  const tail = rest.join(':')
  if (!tail) return null
  switch (kind) {
    case 'entity':
    case 'relationship':
    case 'useCase':
    case 'dataFlow':
    case 'dataRelation':
    case 'behavior':
      return { kind, id: tail }
    case 'dataType': {
      const [id, field] = tail.split('#')
      return field ? { kind, id, field } : { kind, id }
    }
    case 'group':
      return rest.length >= 2 ? { kind, view: rest[0], id: rest.slice(1).join(':') } : null
    case 'message':
    case 'fragment':
    case 'state':
    case 'transition':
    case 'activityNode':
    case 'activityFlow':
      return rest.length >= 2 ? { kind, behavior: rest[0], id: rest.slice(1).join(':') } : null
    default:
      return null
  }
}
