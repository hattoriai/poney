/**
 * A workspace: one or more folders of code (usually repositories) and the
 * Poney documents that explain them, like an editor's multi-root workspace.
 *
 * A folder opened alone is a workspace with no file: its documents are the
 * .poney files in its docs/poney/, and its key is the folder's path. A saved
 * workspace is a .poney-workspace file that lists its folders and documents,
 * with paths relative to the file; its key is the file's path. A document
 * opened alone, with a folder attached, is a workspace too: its key is
 * "document:" and the document's path, and the local server remembers its
 * folder. A workspace not saved yet ("untitled", as in an editor) can hold
 * any folders and documents; the local server keeps it, under the key
 * "untitled:" and an id, until it is saved to a file. The key names the
 * workspace's conversation and agent session.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { folderAt, type Folder } from './folder'
import { checkFolder } from '../agents/workspace'
import { changeMemory, readMemory } from './memory'

export const WORKSPACE_EXT = '.poney-workspace'
/** The version of the workspace file. */
export const WORKSPACE_VERSION = 1

export interface Workspace {
  key: string
  name: string
  /** The .poney-workspace file, when the workspace is saved. */
  file?: string
  /** The first folder is where the agent runs. A folder that does not exist is kept, and marked missing. */
  folders: (Folder & { missing?: boolean })[]
  /** A saved workspace's documents, as absolute paths. A folder workspace's are the files in docs/poney/. A document workspace's: its document. */
  documents?: string[]
}

/** The start of a document workspace's key. */
export const DOCUMENT_KEY = 'document:'
/** The start of an untitled workspace's key. */
export const UNTITLED_KEY = 'untitled:'

export const isUntitled = (w: Workspace | undefined) => !!w?.key.startsWith(UNTITLED_KEY)

const folderOrMissing = (cwd: string) => ({ ...folderAt(cwd), ...(existsSync(cwd) ? {} : { missing: true }) })

/** An untitled workspace the local server keeps, by key. */
export function untitledWorkspace(key: string): Workspace {
  const id = key.slice(UNTITLED_KEY.length)
  const kept = readMemory().untitled[id]
  if (!kept) throw new Error('This workspace was not saved and is gone.')
  return { key, name: kept.name, folders: kept.folders.map(folderOrMissing), documents: kept.documents }
}

/** Keeps an untitled workspace (its name, folders and documents), or, with `remove`, forgets it. */
export function keepUntitled(w: Workspace, remove = false): void {
  const id = w.key.slice(UNTITLED_KEY.length)
  changeMemory((m) => {
    if (remove) delete m.untitled[id]
    else m.untitled[id] = { name: w.name, folders: w.folders.map((f) => f.cwd), documents: w.documents ?? [] }
  })
}

export const UNTITLED_NAME = 'Untitled workspace'

/**
 * The name of an untitled workspace whose folders change: its folders' names, until the person names it
 * (by saving it). A name the person gave stays.
 */
export function untitledName(w: Workspace, folders: Folder[]): string {
  const auto = (list: Folder[]) => list.map((f) => f.name).join(' + ')
  if (w.name !== UNTITLED_NAME && w.name !== auto(w.folders)) return w.name
  return auto(folders) || UNTITLED_NAME
}

/** A new, empty untitled workspace, kept by the local server. */
export function newUntitled(name = UNTITLED_NAME): Workspace {
  const w: Workspace = { key: `${UNTITLED_KEY}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, folders: [], documents: [] }
  keepUntitled(w)
  return w
}

/** A document opened alone, with the folders attached to it. */
export function documentWorkspace(doc: string, folders: string[]): Workspace {
  let name = basename(doc, '.poney')
  try {
    name = (JSON.parse(readFileSync(doc, 'utf8')) as { project?: { name?: string } }).project?.name ?? name
  } catch {
    /* the file's name, then */
  }
  return {
    key: `${DOCUMENT_KEY}${doc}`,
    name,
    folders: folders.map(folderOrMissing),
    documents: [doc],
  }
}

/** The folders attached to a document opened alone, if any. */
export const attachedTo = (doc: string): string[] | undefined => readMemory().attached[doc]

/** Attaches folders to a document opened alone, or, with none, detaches them. */
export function setAttached(doc: string, folders: string[]): void {
  changeMemory((m) => {
    if (folders.length) m.attached[doc] = folders
    else delete m.attached[doc]
  })
}

export const isWorkspaceFile = (path: string) => path.endsWith(WORKSPACE_EXT)

/** The workspace of a folder opened alone. */
export function folderWorkspace(folder: Folder): Workspace {
  return { key: folder.cwd, name: folder.name, folders: [folder] }
}

const real = (path: string) => (existsSync(path) ? realpathSync(path) : path)

/** Reads a .poney-workspace file. Throws with a short reason when it is not one. */
export function readWorkspace(path: string): Workspace {
  if (!isWorkspaceFile(path)) throw new Error(`"${path}" is not a ${WORKSPACE_EXT} file.`)
  if (!existsSync(path)) throw new Error(`"${path}" does not exist.`)
  const file = realpathSync(path)
  let data: { poneyWorkspace?: unknown; name?: unknown; folders?: unknown; documents?: unknown }
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new Error(`"${path}" is not valid JSON.`)
  }
  if (typeof data.poneyWorkspace !== 'number') throw new Error(`"${path}" has no "poneyWorkspace" version.`)
  if (data.poneyWorkspace > WORKSPACE_VERSION) throw new Error(`"${path}" is for a newer version of Poney (workspace version ${data.poneyWorkspace}).`)
  const paths = (list: unknown, what: string): string[] => {
    if (list === undefined) return []
    if (!Array.isArray(list) || list.some((x) => typeof x?.path !== 'string')) throw new Error(`"${path}": "${what}" must be a list of { "path": … }.`)
    return list.map((x: { path: string }) => real(resolve(dirname(file), x.path)))
  }
  const folders = paths(data.folders, 'folders').map((cwd) => {
    const missing = !existsSync(cwd) || !statSync(cwd).isDirectory()
    return { ...folderAt(cwd), ...(missing ? { missing } : {}) }
  })
  if (!folders.length) throw new Error(`"${path}" has no folders.`)
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : basename(file, WORKSPACE_EXT)
  return { key: file, name, file, folders, documents: paths(data.documents, 'documents') }
}

/** Writes a saved workspace to its file, with paths relative to the file. */
export function writeWorkspace(w: Workspace & { file: string }): void {
  const dir = dirname(w.file)
  const rel = (p: string) => {
    const r = relative(dir, p)
    return r === '' ? '.' : isAbsolute(r) ? p : r
  }
  const data = {
    poneyWorkspace: WORKSPACE_VERSION,
    name: w.name,
    folders: w.folders.map((f) => ({ path: rel(f.cwd) })),
    documents: (w.documents ?? []).map((d) => ({ path: rel(d) })),
  }
  writeFileSync(w.file, `${JSON.stringify(data, null, 2)}\n`)
}

/** The .poney-workspace files at the top of a folder, by name. */
export function workspaceFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && isWorkspaceFile(e.name))
    .map((e) => join(dir, e.name))
    .sort()
}

/** The workspace a key names: a saved workspace's file, or a folder. */
export function workspaceFor(key: string): Workspace {
  if (isWorkspaceFile(key)) return readWorkspace(key)
  if (key.startsWith(UNTITLED_KEY)) return untitledWorkspace(key)
  if (key.startsWith(DOCUMENT_KEY)) {
    const doc = key.slice(DOCUMENT_KEY.length)
    const folders = attachedTo(doc)
    if (!folders?.length) throw new Error(`No folder is attached to "${doc}".`)
    return documentWorkspace(doc, folders)
  }
  const dir = resolve(key)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`No folder "${dir}"`)
  return folderWorkspace(folderAt(realpathSync(dir)))
}

/**
 * What opening a path opens: a .poney-workspace file; a folder's own workspace file (with several, the
 * person chooses: `choose`); else the folder as a workspace of its own.
 */
export function workspaceToOpen(path: string): Workspace | { choose: string[] } {
  if (isWorkspaceFile(path)) return readWorkspace(path)
  if (path.startsWith(DOCUMENT_KEY) || path.startsWith(UNTITLED_KEY)) return workspaceFor(path)
  const dir = checkFolder(path)
  const files = workspaceFilesIn(dir)
  if (files.length === 1) return readWorkspace(files[0])
  if (files.length > 1) return { choose: files }
  return folderWorkspace(folderAt(dir))
}

/** The folders an agent can read: the ones that exist. */
export const presentFolders = (w: Workspace) => w.folders.filter((f) => !f.missing)
