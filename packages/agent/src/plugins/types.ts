import type { DataRelation, DataType, EffectKind, Entity, PoneyDocument, PoneyExtension, Relationship, Tone } from '@hattoriai/poney-core'

/**
 * Poney plugins run in the local server (the hub), next to the code: they
 * read files and tools on this computer. The Studio only shows what they
 * return. A plugin can bring:
 *
 * - importers, which read a source (a schema file, an import graph) and
 *   return model elements and views to add to a document;
 * - overlays, which read live facts (test coverage, recent changes) and mark
 *   the parts of a document they concern, without changing it;
 * - format extensions, so the hub checks documents that use them.
 */

/** What an importer returns: elements and views to add. Ids are stable, so a second run finds what the first added. */
export interface ImportResult {
  entities: Entity[]
  relationships: Relationship[]
  dataTypes: DataType[]
  dataRelations: DataRelation[]
  /** Views in document form (as they would appear in "views"). */
  views: Record<string, unknown>[]
  /** What the importer read, and what it left out, for the person or the agent. */
  notes: string[]
}

export interface ImportOptions {
  /** A file to read instead of the one the importer finds. Relative to the folder. */
  path?: string
  /** For data: the entity (a database) the tables are stored in. */
  store?: string
}

export interface Importer {
  id: string
  name: string
  /** One line: what it reads and what it adds. */
  description: string
  /** The files in the folder it would read; empty when it has nothing to read there. */
  detect(dir: string): string[]
  run(dir: string, options?: ImportOptions): Promise<ImportResult>
}

/** A mark on one element: a short fact, and an effect by meaning. */
export interface OverlayMark {
  /** A ref key, e.g. "entity:orders". */
  target: string
  badge?: { text: string; tone?: Tone }
  effect?: EffectKind
}

export interface OverlayResult {
  /** What the marks show, e.g. "Test coverage". */
  title: string
  /** When the facts were read. */
  at: string
  marks: OverlayMark[]
  notes: string[]
}

export interface Overlay {
  id: string
  name: string
  description: string
  /** The files or tools it would read in the folder; empty when it has nothing to read there. */
  detect(dir: string): string[]
  read(dir: string, doc: PoneyDocument): Promise<OverlayResult>
}

export interface PoneyPlugin {
  name: string
  importers?: Importer[]
  overlays?: Overlay[]
  extensions?: PoneyExtension[]
}

/** Identity function that checks a plugin's shape. */
export const definePlugin = (plugin: PoneyPlugin): PoneyPlugin => plugin

/** An id from any name: lowercase letters, digits and "-". */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x'
