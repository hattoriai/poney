/**
 * A folder of code that agents work in, usually a repository. When a folder
 * opens alone, it is a workspace of its own: its documents are the .poney
 * files in its docs/poney/, and its key (for the conversation and the agent
 * session) is its path.
 */
import { basename } from 'node:path'

export interface Folder {
  cwd: string
  /** The id a first document made for this folder gets. */
  id: string
  name: string
}

export function folderAt(cwd: string): Folder {
  const name = basename(cwd) || 'workspace'
  return { cwd, id: slug(name), name }
}

/** An id made from a name: lower case, with dashes. */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/, '') || 'document'
}

/** An empty document. */
export function emptyDocument(id: string, name: string, description: string) {
  return { poneyVersion: '0.1.0', project: { id, name, description }, model: {}, views: [], walkthroughs: [] }
}

/** The empty document a folder starts with. */
export const folderDocument = (w: Folder) => emptyDocument(w.id, w.name, `The code in ${w.cwd}.`)

/**
 * A document an agent writes into an existing one: it takes that one's id, so
 * the file it goes to keeps its identity. Its own name stays.
 */
export function withIdentity(document: unknown, target: { id: string; name?: string }): unknown {
  if (!document || typeof document !== 'object') return document
  const d = document as { project?: Record<string, unknown> }
  return { ...d, project: { ...(d.project ?? {}), id: target.id, name: (d.project?.name as string | undefined) ?? target.name } }
}
