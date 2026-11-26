/**
 * The project of a workspace: the folder an agent works in is one project in
 * the Studio, from the moment the agent connects. It starts empty; every
 * document the agent opens takes the same project id, so its tours and
 * walkthroughs land in one place instead of new projects each time.
 */
import { basename } from 'node:path'

export interface WorkspaceProject {
  cwd: string
  id: string
  name: string
}

export function workspaceProject(cwd: string): WorkspaceProject {
  const name = basename(cwd) || 'workspace'
  const id = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'workspace'
  return { cwd, id, name }
}

/** The empty document a workspace starts with. */
export function emptyDocument(w: WorkspaceProject) {
  return { poneyVersion: '0.1.0', project: { id: w.id, name: w.name, description: `The code in ${w.cwd}.` }, model: {}, views: [], walkthroughs: [] }
}

/** A document the agent opens, kept in the workspace's project. Its own name stays. */
export function intoWorkspace(document: unknown, w: WorkspaceProject): unknown {
  if (!document || typeof document !== 'object') return document
  const d = document as { project?: Record<string, unknown> }
  return { ...d, project: { ...(d.project ?? {}), id: w.id, name: (d.project?.name as string | undefined) ?? w.name } }
}
