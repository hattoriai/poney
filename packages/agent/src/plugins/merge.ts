import type { ImportResult } from './types'

export interface MergeReport {
  added: { entities: number; relationships: number; dataTypes: number; dataRelations: number; views: number }
  /** Elements the document already had (by id): they keep the document's version. */
  kept: number
  /** Relationships left out because an end is missing from the document. */
  skipped: number
}

type Doc = Record<string, any>

/**
 * Adds an import to a document. It only adds: an element whose id the
 * document already has keeps the document's version, so a person's edits and
 * an agent's words survive a second import.
 */
export function mergeImport(document: Doc | undefined, result: ImportResult, project?: { id: string; name: string; description: string }): { document: Doc; report: MergeReport } {
  const doc: Doc = structuredClone(document ?? { poneyVersion: '0.1.0', project: project ?? { id: 'imported', name: 'Imported', description: '' }, model: {}, views: [], walkthroughs: [] })
  doc.model ??= {}
  doc.views ??= []
  const report: MergeReport = { added: { entities: 0, relationships: 0, dataTypes: 0, dataRelations: 0, views: 0 }, kept: 0, skipped: 0 }
  const add = (key: 'entities' | 'relationships' | 'dataTypes' | 'dataRelations', items: { id: string }[], ok: (item: any, ids: Set<string>) => boolean = () => true) => {
    const list: { id: string }[] = (doc.model[key] ??= [])
    const ids = new Set(list.map((x) => x.id))
    for (const item of items) {
      if (ids.has(item.id)) report.kept++
      else if (!ok(item, ids)) report.skipped++
      else {
        list.push(item)
        ids.add(item.id)
        report.added[key]++
      }
    }
  }
  add('entities', result.entities)
  const entities = new Set<string>((doc.model.entities as { id: string }[]).map((e) => e.id))
  add('relationships', result.relationships, (r) => entities.has(r.source) && entities.has(r.target))
  // A table stored in a database the document does not have: the table comes, the link does not.
  add('dataTypes', result.dataTypes.map((d) => (d.storedIn && !entities.has(d.storedIn) ? { ...d, storedIn: undefined } : d)))
  const tables = new Set<string>((doc.model.dataTypes as { id: string }[]).map((d) => d.id))
  add('dataRelations', result.dataRelations, (r) => tables.has(r.from) && tables.has(r.to))
  const views = new Set<string>(doc.views.map((v: { id: string }) => v.id))
  for (const v of result.views) {
    if (views.has(v.id as string)) report.kept++
    else {
      doc.views.push(v)
      report.added.views++
    }
  }
  return { document: doc, report }
}

/** One line on what a merge did. */
export function describeMerge(r: MergeReport): string {
  const parts = Object.entries(r.added)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${LABEL[k as keyof typeof LABEL][n === 1 ? 0 : 1]}`)
  return `Added ${parts.length ? parts.join(', ') : 'nothing'}.${r.kept ? ` Kept ${r.kept} the document already had.` : ''}${r.skipped ? ` Left out ${r.skipped} relationships whose ends are not in the document.` : ''}`
}

const LABEL = { entities: ['part', 'parts'], relationships: ['relationship', 'relationships'], dataTypes: ['table', 'tables'], dataRelations: ['table relation', 'table relations'], views: ['view', 'views'] }
