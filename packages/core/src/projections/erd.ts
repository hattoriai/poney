import type { Cardinality, Field, PoneyDocument, ViewOf } from '../schema/document'
import { indexOf, isDefined } from '../model/query'

/**
 * ERD projection: tables with the fields worth seeing first (keys, then the
 * first few others), relations between shown tables, and grouping by store.
 */
export interface ErdTable {
  dataTypeId: string
  name: string
  store?: string
  fields: Field[]
  hiddenCount: number
  expanded: boolean
}

export interface ErdRelation {
  id: string
  from: string
  to: string
  fromCardinality: Cardinality
  toCardinality: Cardinality
  label: string
  via?: string
  logical: boolean
}

export interface ErdDiagram {
  tables: ErdTable[]
  relations: ErdRelation[]
  stores: string[]
}

export function projectErd(doc: PoneyDocument, view: ViewOf<'erd'>, options: { expanded?: string[] } = {}): ErdDiagram {
  const idx = indexOf(doc)
  const shown = new Set(view.dataTypes)
  const expanded = new Set(options.expanded ?? [])
  const relations = doc.model.dataRelations.filter((r) => shown.has(r.from) && shown.has(r.to))
  const tables = view.dataTypes
    .map((id) => idx.dataTypes.get(id))
    .filter(isDefined)
    .map((t) => {
      const isKey = (f: Field) => f.primaryKey || !!f.references || relations.some((r) => r.via === f.name && (r.from === t.id || r.to === t.id))
      const keys = t.fields.filter(isKey)
      const rest = t.fields.filter((f) => !isKey(f))
      const open = expanded.has(t.id) || t.fields.length <= view.fieldLimit + 1
      const visible = open ? t.fields : [...keys, ...rest.slice(0, Math.max(0, view.fieldLimit - keys.length))]
      // Keep schema order among the visible fields.
      const fields = t.fields.filter((f) => visible.includes(f))
      return { dataTypeId: t.id, name: t.name, store: view.groupByStore ? t.storedIn : undefined, fields, hiddenCount: t.fields.length - fields.length, expanded: expanded.has(t.id) }
    })
  const stores = [...new Set(tables.map((t) => t.store).filter(isDefined))]
  return { tables, relations, stores }
}
