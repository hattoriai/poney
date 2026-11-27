import { basename } from 'node:path'
import { parseDocument, type PoneyDocument } from '@hattoriai/poney-core'
import { describeMerge, mergeImport } from './merge'
import { plugins } from './registry'
import { slug, type ImportOptions, type OverlayResult } from './types'

/** Importers and overlays, each with the files it would read in a folder. */
export async function available(dir: string) {
  const p = await plugins()
  const describe = (x: { id: string; name: string; description: string; detect(dir: string): string[] }) => {
    let files: string[] = []
    try {
      files = x.detect(dir)
    } catch {
      /* a plugin that cannot look counts as having nothing to read */
    }
    return { id: x.id, name: x.name, description: x.description, files }
  }
  return { importers: p.importers.map(describe), overlays: p.overlays.map(describe), problems: p.problems }
}

/**
 * Runs an importer on a folder and adds what it finds to a document (or to a
 * new one named after the folder). Returns the document and what happened.
 */
export async function runImport(id: string, dir: string, options: ImportOptions & { into?: unknown } = {}) {
  const { importers } = await plugins()
  const importer = importers.find((i) => i.id === id)
  if (!importer) throw new Error(`No importer "${id}". Importers: ${importers.map((i) => i.id).join(', ')}.`)
  const result = await importer.run(dir, options)
  const name = basename(dir)
  const { document, report } = mergeImport(options.into as Record<string, unknown> | undefined, result, { id: slug(name), name, description: `The code in ${name}.` })
  return { document, summary: [describeMerge(report), ...result.notes].join('\n') }
}

/** Runs an overlay on a folder, for a document. */
export async function runOverlay(id: string, dir: string, document: unknown): Promise<OverlayResult> {
  const { overlays } = await plugins()
  const overlay = overlays.find((o) => o.id === id)
  if (!overlay) throw new Error(`No overlay "${id}". Overlays: ${overlays.map((o) => o.id).join(', ')}.`)
  let doc: PoneyDocument
  try {
    doc = parseDocument(document)
  } catch {
    throw new Error('The open document is not valid; an overlay needs a valid document.')
  }
  return overlay.read(dir, doc)
}

/** An overlay result in a few lines, for an agent or a terminal. */
export function describeOverlay(r: OverlayResult): string {
  const lines = r.marks.map((m) => `- ${m.target}: ${m.badge?.text ?? ''}${m.effect ? ` (${m.effect})` : ''}`)
  return [`${r.title}, read ${r.at}.`, ...r.notes, ...lines].join('\n')
}

/**
 * Runs an overlay on each folder of a workspace and joins the marks: a part gets the facts of the folder
 * that has its code (the first one, if several do). The notes name their folder.
 */
export async function runOverlayIn(id: string, dirs: string[], document: unknown): Promise<OverlayResult> {
  if (dirs.length === 1) return runOverlay(id, dirs[0], document)
  const results = await Promise.all(dirs.map(async (dir) => ({ dir, result: await runOverlay(id, dir, document) })))
  const seen = new Set<string>()
  const marks = results.flatMap(({ result }) => result.marks.filter((m) => !seen.has(m.target) && seen.add(m.target)))
  return { title: results[0].result.title, at: results[0].result.at, marks, notes: results.flatMap(({ dir, result }) => result.notes.map((n) => `${basename(dir)}: ${n}`)) }
}

/** The overlays of a workspace: each with the files it would read, in every folder. */
export async function availableIn(dirs: string[]) {
  if (dirs.length === 1) return available(dirs[0])
  const each = await Promise.all(dirs.map(async (dir) => ({ dir, found: await available(dir) })))
  const overlays = each[0].found.overlays.map((o) => ({ ...o, files: each.flatMap(({ dir, found }) => (found.overlays.find((x) => x.id === o.id)?.files ?? []).map((f) => `${basename(dir)}/${f}`)) }))
  return { ...each[0].found, overlays }
}
