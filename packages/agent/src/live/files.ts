/**
 * Documents as files, like notebooks in Livebook.
 *
 * The open document can be tied to a .poney file. Every change, from an
 * agent or from the person in the Studio, is saved to it; a change to the
 * file on disk (an agent, git pull, an editor) shows in the Studio. A folder
 * an agent works in gets its file in docs/poney/, made when there is
 * something to keep.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { check } from '../ops'
import { changeMemory, readMemory } from './memory'
import { checkFolder } from '../agents/workspace'
import type { LiveState } from './state'
import type { WorkspaceDocument } from './types'
import { emptyDocument, folderAt, folderDocument, slug, withIdentity, type Folder } from './folder'
import { attachedTo, documentWorkspace, DOCUMENT_KEY, readWorkspace, setAttached, workspaceFilesIn, workspaceFor, writeWorkspace, type Workspace } from './workspace-file'
import { execFileSync } from 'node:child_process'

/** The top folder of the git repository a folder is in, if any, as a real path. */
function repositoryOf(dir: string): string | undefined {
  try {
    const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return top ? realpathSync(top) : undefined
  } catch {
    return undefined
  }
}

/**
 * The project of a .poney file, and the file, as real paths, so one folder is
 * one project whatever path names it: for <root>/docs/poney/<name>.poney the
 * project is <root>; else the git repository the file is in; else none.
 */
export function projectOf(path: string): { root?: string; file: string } {
  const inDocs = /^(.*)\/docs\/poney\/([^/]+\.poney)$/
  if (!existsSync(path)) {
    // A file not written yet: its folder is the project when that folder exists.
    const m = inDocs.exec(path)
    const root = m && existsSync(m[1]) ? realpathSync(m[1]) : undefined
    return { root, file: root ? join(root, 'docs', 'poney', m![2]) : path }
  }
  const file = realpathSync(path)
  return { root: inDocs.exec(file)?.[1] ?? repositoryOf(dirname(file)), file }
}

/** Where a folder's Poney file goes when it has none. */
export const workspaceFile = (w: Folder) => join(w.cwd, 'docs', 'poney', `${w.id}.poney`)

/** A document's entry in a list: its id and name, or why it is not a valid document. */
function entryFor(path: string): WorkspaceDocument {
  const fallback = { path, id: basename(path, '.poney'), name: basename(path, '.poney') }
  if (!existsSync(path)) return { ...fallback, invalid: 'The file is missing.' }
  try {
    const text = readFileSync(path, 'utf8')
    const { result, report } = check({ text })
    const project = (JSON.parse(text) as { project?: { id?: string; name?: string } }).project
    const entry = { path, id: project?.id ?? fallback.id, name: project?.name ?? fallback.name }
    return result?.ok ? entry : { ...entry, invalid: report.split('\n')[0] || 'Not a valid document.' }
  } catch {
    return { ...fallback, invalid: 'Not a valid document.' }
  }
}

/** The documents of a folder: the .poney files in its docs/poney/, by name. */
export function documentsIn(cwd: string): WorkspaceDocument[] {
  const dir = join(cwd, 'docs', 'poney')
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.poney')).sort() : []
  return names.map((f) => entryFor(join(dir, f)))
}

/** The documents of a workspace: a saved one's list, else its folder's docs/poney/. */
export function documentsOf(w: Workspace): WorkspaceDocument[] {
  if (w.file) return (w.documents ?? []).map(entryFor)
  const own = documentsIn(w.folders[0].cwd)
  // A document opened alone comes first, then the documents of its folder.
  if (w.documents) return [...w.documents.map(entryFor), ...own.filter((d) => !w.documents!.includes(d.path))]
  return own
}

/** The id and empty document a workspace starts with when it has no document. */
function starter(w: Workspace): { id: string; document: unknown } {
  if (!w.file) return { id: w.folders[0].id, document: folderDocument(w.folders[0]) }
  const id = slug(w.name)
  return { id, document: emptyDocument(id, w.name, '') }
}

/** The same file, whatever path names it. */
function sameFile(a: string, b: string): boolean {
  if (a === b) return true
  try {
    return realpathSync(a) === realpathSync(b)
  } catch {
    return false
  }
}

/** The document shown last in each workspace, kept in the Poney home, so a workspace with several documents opens the one the person was reading. */
const readLast = () => new Map(Object.entries(readMemory().last))
const writeLast = (last: Map<string, string>) => changeMemory((m) => (m.last = Object.fromEntries(last)))

/** What an agent's document did: shown (`revision`), saved to a document not shown, or refused. */
export interface AgentOpened {
  revision?: number
  saved?: boolean
  refused?: string
}

/** Why a file that exists is not a valid document (a merge conflict, a bad edit); undefined when it is missing or valid. */
function invalidFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  const { result, report } = check({ text: readFileSync(path, 'utf8') })
  return result?.ok ? undefined : report.split('\n')[0] || 'Not a valid document.'
}

/** Why nothing was saved over a file that is not a valid document. */
export const NOT_SAVED = "The project's file is not a valid document. Not saved."

/** The refusal when a workspace has several documents and none is shown. */
function chooseOne(w: Workspace): string {
  const list = documentsOf(w).map((d) => `${d.path} (${d.name})`)
  return `Not opened: the workspace "${w.name}" has several documents, and none is shown. Give \`file\`: one of ${list.join(', ')}, or a new path in docs/poney/.`
}

const isEmpty = (doc: unknown) => {
  const d = doc as { views?: unknown[]; walkthroughs?: unknown[] } | undefined
  return !d?.views?.length && !d?.walkthroughs?.length
}

export class DocumentFiles {
  private watcher?: FSWatcher
  /** What this process wrote last, so its own writes are not read back as changes. */
  private written?: string
  private timer?: ReturnType<typeof setTimeout>
  /** The project the file holds. A document of another project releases the file; it never overwrites it. */
  private project?: string
  /** The file a save was refused for, so the person is told once. */
  private refused?: string
  /** The file each workspace showed last, by workspace key. */
  private tied = readLast()
  /** Watches what lists the open workspace's documents (its file, or its folder's docs/poney/), so the list stays true. */
  private dirWatcher?: { dir: string; watcher?: FSWatcher }
  private listTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly state: LiveState) {
    state.on('document', (_rev, doc, source) => {
      if (source === 'agent') this.save(doc)
    })
    state.on('edited', (doc) => this.save(doc))
    state.on('workspace', (w) => {
      if (w) this.openWorkspace(w)
      else this.refresh()
    })
    state.on('file', () => this.refresh())
  }

  private remember(root: string, path: string) {
    if (this.tied.get(root) === path) return
    this.tied.set(root, path)
    writeLast(this.tied)
  }

  /** Sends the open workspace's documents, and the one shown, to the Studio. */
  refresh(): void {
    const w = this.state.workspace
    this.state.setDocuments({ documents: w ? documentsOf(w) : [], shown: this.state.file ?? null })
    const dir = w?.file ?? (w ? join(w.folders[0].cwd, 'docs', 'poney') : undefined)
    if (this.dirWatcher?.dir === dir && (this.dirWatcher?.watcher || !dir || !existsSync(dir))) return
    this.dirWatcher?.watcher?.close()
    this.dirWatcher = dir ? { dir } : undefined
    if (!dir || !existsSync(dir)) return
    try {
      this.dirWatcher!.watcher = watch(dir, () => {
        clearTimeout(this.listTimer)
        this.listTimer = setTimeout(() => this.reread(), 150)
      })
    } catch {
      /* the list is then read again on the next change here */
    }
  }

  /** A change on disk: a saved workspace's file is read again (an editor, git pull); then the list. */
  private reread() {
    const w = this.state.workspace
    if (w?.file && existsSync(w.file)) {
      try {
        const next = readWorkspace(w.file)
        if (JSON.stringify(next) !== JSON.stringify(w)) return this.state.setWorkspace(next)
      } catch (e) {
        this.state.put({ from: 'notice', text: e instanceof Error ? e.message : String(e), tone: 'error' })
      }
    }
    this.refresh()
  }

  /** Adds a document to the open workspace's file, when it is saved and does not list it yet. */
  private adopt(path: string) {
    const w = this.state.workspace
    if (!w?.file || w.documents?.includes(path)) return
    const next = { ...w, file: w.file, documents: [...(w.documents ?? []), path] }
    writeWorkspace(next)
    this.state.setWorkspace(next)
  }

  /**
   * A new, empty document in docs/poney/ of the open workspace's first folder (or `folder`), shown at once.
   * Its id comes from its name, and is not one another document of the workspace has.
   */
  create(name: string, folder?: string): string {
    const w = this.state.workspace
    const first = folder ? w?.folders.find((f) => f.cwd === folder) : this.state.project
    if (!w || !first) throw new Error('Open a workspace first.')
    const title = name.trim()
    if (!title) throw new Error('Give the document a name.')
    const dir = join(first.cwd, 'docs', 'poney')
    const taken = new Set([...documentsOf(w), ...documentsIn(first.cwd)].map((d) => d.id))
    const base = slug(title)
    let id = base
    for (let n = 2; taken.has(id) || existsSync(join(dir, `${id}.poney`)); n++) id = `${base}-${n}`
    const path = join(dir, `${id}.poney`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path, `${JSON.stringify(emptyDocument(id, title, ''), null, 2)}\n`)
    this.adopt(path)
    this.load(path, first.cwd)
    return path
  }

  /** Removes a document from a saved workspace's list. The file stays. */
  removeDocument(path: string): void {
    const w = this.state.workspace
    if (!w?.file) throw new Error('Only a saved workspace lists its documents. Delete the file instead.')
    if (!w.documents?.includes(path)) throw new Error(`"${path}" is not in this workspace.`)
    if (this.state.file === path) {
      this.tie(undefined)
      this.state.clear()
    }
    const next = { ...w, file: w.file, documents: w.documents.filter((d) => d !== path) }
    writeWorkspace(next)
    this.state.setWorkspace(next)
  }

  /**
   * Saves the open workspace as a .poney-workspace file. A folder workspace lists its folder and its
   * documents. Returns the old and the new key: the conversation and the agent session move to the new one.
   */
  saveWorkspace(file: string, name?: string): { from: string; to: string; workspace: Workspace } {
    const w = this.state.workspace
    if (!w) throw new Error('Open a workspace first.')
    if (!file.endsWith('.poney-workspace')) throw new Error('The file must end in .poney-workspace.')
    if (existsSync(file) && !sameFile(file, w.file ?? '')) throw new Error(`"${file}" exists already.`)
    const documents = documentsOf(w).map((d) => d.path)
    const shown = this.state.file
    if (shown && !documents.includes(shown) && existsSync(shown)) documents.push(shown)
    mkdirSync(dirname(file), { recursive: true })
    writeWorkspace({ ...w, name: name?.trim() || w.name, file, documents })
    // A document opened alone is in the saved workspace now; its file there says so.
    if (w.key.startsWith(DOCUMENT_KEY) && w.documents?.[0]) setAttached(w.documents[0], [])
    const saved = readWorkspace(file)
    this.rekey(w.key, saved.key)
    return { from: w.key, to: saved.key, workspace: saved }
  }

  /**
   * Adds a folder to the open workspace, which must be saved. Its documents in docs/poney/ join the list.
   * A document opened alone, with no workspace, gets the folder attached: a workspace of its own.
   */
  addFolder(path: string): Workspace {
    const w = this.state.workspace
    const doc = this.state.file
    if (!w) {
      if (!doc || !existsSync(doc)) throw new Error('Open a document or a workspace first.')
      const cwd = checkFolder(path)
      setAttached(doc, [cwd])
      return documentWorkspace(doc, [cwd])
    }
    if (!w.file) throw new Error('Save the workspace first.')
    const folder = folderAt(checkFolder(path))
    if (w.folders.some((f) => f.cwd === folder.cwd)) return w
    const documents = [...(w.documents ?? [])]
    for (const d of documentsIn(folder.cwd)) if (!documents.includes(d.path)) documents.push(d.path)
    const next = { ...w, file: w.file, folders: [...w.folders, folder], documents }
    writeWorkspace(next)
    return next
  }

  /**
   * Removes a folder from the open workspace, which must be saved and keep one folder. Its documents stay listed.
   * A document opened alone gets its folder detached: it is alone again (undefined).
   */
  removeFolder(path: string): Workspace | undefined {
    const w = this.state.workspace
    if (w?.key.startsWith(DOCUMENT_KEY) && w.documents?.[0]) {
      setAttached(w.documents[0], [])
      return undefined
    }
    if (!w?.file) throw new Error('Save the workspace first.')
    if (w.folders.length < 2) throw new Error('A workspace keeps at least one folder.')
    const next = { ...w, file: w.file, folders: w.folders.filter((f) => f.cwd !== path) }
    writeWorkspace(next)
    return next
  }

  /** The document a workspace showed last moves with it to its new key. */
  private rekey(from: string, to: string) {
    const last = this.tied.get(from)
    if (last === undefined || from === to) return
    this.tied.delete(from)
    this.tied.set(to, last)
    writeLast(this.tied)
  }

  /**
   * A document from an agent. Without `file`, it goes into the shown document (or, for an agent of a
   * folder that is not shown, `project`, into that folder's document). With `file`: into that document
   * (shown at once when it is the shown one, else saved and listed), or, when the file does not exist, a
   * new document there, shown at once. A document never changes the id of the file it goes into.
   */
  agentOpen(document: unknown, options: { project?: string; file?: string } = {}): AgentOpened {
    const background = !!options.project && options.project !== this.state.projectKey()
    const space = background ? workspaceFor(options.project!) : this.state.workspace
    const folder = space?.folders.find((f) => !f.missing) ?? space?.folders[0]
    const target = options.file ? (isAbsolute(options.file) ? options.file : resolve(folder?.cwd ?? process.cwd(), options.file)) : undefined
    if (target && !target.endsWith('.poney')) return { refused: 'Not opened: `file` must end in .poney.' }
    const name = (document as { project?: { name?: string } } | null)?.project?.name ?? (target ? basename(target, '.poney') : folder?.name ?? 'the document')
    if (background) {
      const saved = this.saveFor(space!, document, target)
      if (saved === 'invalid') return { refused: NOT_SAVED }
      if (saved === 'nofile') return { refused: chooseOne(space!) }
      if (saved === 'saved') this.state.put({ from: 'notice', text: `The agent saved “${name}”. It shows when you open this workspace.`, tone: 'info' }, options.project)
      return { saved: true }
    }
    if (!target || (this.state.file && sameFile(target, this.state.file))) {
      if (space && !this.state.shown()) return { refused: chooseOne(space) }
      return { revision: this.state.open(document) }
    }
    if (existsSync(target)) {
      const saved = this.saveInto(target, document)
      if (saved === 'invalid') return { refused: NOT_SAVED }
      if (saved === 'saved') this.state.put({ from: 'notice', text: `The agent saved “${name}”. Select it in the document menu to see it.`, tone: 'info' })
      return { saved: true }
    }
    // A new document: it keeps its own id, unless another document of the workspace has it.
    const root = projectOf(target).root
    const taken = new Set([...(space ? documentsOf(space) : []), ...(root ? documentsIn(root) : [])].map((d) => d.id))
    const own = (document as { project?: { id?: string } } | null)?.project?.id
    const id = own && !taken.has(own) ? own : slug(basename(target, '.poney'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `${JSON.stringify(withIdentity(document, { id }), null, 2)}\n`)
    this.adopt(realpathSync(target))
    this.load(realpathSync(target), root)
    return { revision: this.state.shown()?.revision }
  }

  /** Writes a document into an existing document's file, keeping that file's id. Nothing over a file that is not a valid document. */
  private saveInto(path: string, doc: unknown): 'saved' | 'unchanged' | 'invalid' {
    if (invalidFile(path)) return 'invalid'
    const id = (JSON.parse(readFileSync(path, 'utf8')) as { project?: { id?: string } }).project?.id
    const text = `${JSON.stringify(id ? withIdentity(doc, { id }) : doc, null, 2)}\n`
    if (readFileSync(path, 'utf8') === text) return 'unchanged'
    writeFileSync(path, text)
    this.refresh()
    return 'saved'
  }

  /**
   * Opens a .poney file and ties the document to it, and its project (see projectOf) opens. Throws with the check report when it is not a valid document.
   * A file in docs/poney/ that was never written, with the document it holds (`given`, as a Studio gives it back to a hub that restarted), opens its project with that document.
   */
  open(path: string, given?: unknown): void {
    const { root, file } = projectOf(path)
    if (!existsSync(file) && root && given !== undefined) {
      // Nothing is saved over another file meanwhile; the project then ties its own file, and the document stays.
      this.tie(undefined)
      this.state.open(given, 'file')
      return this.state.setWorkspace(this.workspaceOfFile(file, root))
    }
    this.load(file, root)
  }

  /**
   * Deletes a .poney file for good. Only a valid Poney document is deleted.
   * With `project`, only a file that holds that project is deleted.
   * When it is the open file, the document is untied first, so no later save writes it again.
   */
  delete(path: string, project?: string): void {
    if (!path.endsWith('.poney')) throw new Error('Only a .poney file can be deleted.')
    if (!existsSync(path)) throw new Error(`"${path}" does not exist.`)
    const file = realpathSync(path)
    const invalid = invalidFile(file)
    if (invalid) throw new Error(`"${path}" is not a valid Poney document. It was not deleted.`)
    if (project !== undefined && (JSON.parse(readFileSync(file, 'utf8')) as { project?: { id?: string } }).project?.id !== project) throw new Error(`"${path}" holds another document. It was not deleted.`)
    if (this.state.file && existsSync(this.state.file) && realpathSync(this.state.file) === file) this.tie(undefined)
    let forgot = false
    for (const [root, tied] of this.tied)
      if (tied === file || tied === path) {
        this.tied.delete(root)
        forgot = true
      }
    if (forgot) writeLast(this.tied)
    unlinkSync(file)
    this.refresh()
  }

  /**
   * The document of a folder: the one it showed last, else its only document, else (none) the folder's own
   * name in docs/poney/. Undefined when it has several and none was shown yet: the person selects one.
   */
  fileOf(w: Workspace): string | undefined {
    const tied = this.tied.get(w.key)
    if (tied && existsSync(tied) && (!w.file || w.documents?.includes(tied))) return tied
    if (!w.file && w.documents?.length) return w.documents[0]
    const found = documentsOf(w).filter((d) => existsSync(d.path))
    if (found.length === 1) return found[0].path
    if (found.length === 0) return (!w.file && tied) || join(w.folders[0].cwd, 'docs', 'poney', `${starter(w).id}.poney`)
    return undefined
  }

  /**
   * The workspace a file opens in: a .poney-workspace file at the top of its project folder that lists it,
   * else its project folder, else none.
   */
  private workspaceOfFile(file: string, root: string | undefined): Workspace | Folder | undefined {
    const attached = attachedTo(file)
    if (attached?.length) return documentWorkspace(file, attached)
    for (const candidate of [...new Set([...workspaceFilesIn(dirname(file)), ...(root ? workspaceFilesIn(root) : [])])]) {
      try {
        const w = readWorkspace(candidate)
        if (w.documents?.includes(file)) return w
      } catch {
        /* not a workspace this file opens in */
      }
    }
    return root ? folderAt(root) : undefined
  }

  private load(path: string, root: string | undefined) {
    const text = readFileSync(path, 'utf8')
    const { result, report } = check({ text })
    if (!result?.ok) throw new Error(`"${path}" is not a valid Poney document.\n${report}`)
    const doc = JSON.parse(text) as { project?: { id?: string } }
    this.tie(path, doc.project?.id, text)
    this.state.open(doc, 'file')
    // Agents work in the file's workspace; a file of no project leaves none open.
    if (!this.state.inWorkspace(path)) this.state.setWorkspace(this.workspaceOfFile(path, root))
    const key = this.state.projectKey()
    if (key) this.remember(key, path)
  }

  /**
   * A project folder. The document already open stays when it belongs here,
   * or when it has no file yet (it is saved to docs/poney/ here). Otherwise
   * the folder's document opens (see fileOf), or an empty project that becomes
   * a file when there is something to keep, or, when the folder has several
   * documents and none was shown yet, none: the person selects one.
   */
  private openWorkspace(w: Workspace) {
    const open = this.state.shown()?.document
    const file = this.state.file
    const first = w.folders.find((f) => !f.missing) ?? w.folders[0]
    const start = starter(w)
    if (file && this.state.inWorkspace(file)) return this.refresh()
    if (open && !file && !isEmpty(open)) {
      const id = this.state.openProjectId ?? start.id
      const path = join(first.cwd, 'docs', 'poney', `${id}.poney`)
      this.tie(path, id)
      this.remember(w.key, path)
      this.save(open)
      return this.refresh()
    }
    const path = this.fileOf(w)
    if (!path) {
      this.tie(undefined)
      this.state.clear()
      return this.refresh()
    }
    if (existsSync(path)) {
      try {
        return this.load(path, first.cwd)
      } catch (e) {
        this.state.put({ from: 'notice', text: e instanceof Error ? e.message.split('\n')[0] : String(e), tone: 'error' })
        // The file is the person's to fix: nothing is saved over it.
        this.tie(undefined)
        if (this.state.openProjectId !== start.id) this.state.open(start.document, 'workspace')
        return
      }
    }
    this.tie(path, start.id)
    if (this.state.openProjectId !== start.id) this.state.open(start.document, 'workspace')
  }

  private tie(path: string | undefined, project?: string, text?: string) {
    this.watcher?.close()
    this.watcher = undefined
    this.written = text
    this.project = project
    this.state.setFile(path)
    if (!path) return
    if (existsSync(path)) this.watch(path)
  }

  /**
   * Saves a document into another project's file, whether or not that project is open.
   * Nothing for an empty document or when unchanged, and never over a file that is not a valid document.
   */
  saveFor(w: Workspace, doc: unknown, file?: string): 'saved' | 'unchanged' | 'invalid' | 'nofile' {
    const path = file ?? this.fileOf(w)
    if (!path) return 'nofile'
    if (invalidFile(path)) return 'invalid'
    // Into an existing document, with its id; a new one keeps its own id when it names the file, else takes the workspace's.
    const existing = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { project?: { id?: string } }).project?.id : undefined
    const own = (doc as { project?: { id?: string } } | null)?.project?.id
    const into = withIdentity(doc, { id: existing ?? (file && own ? own : starter(w).id), name: w.name })
    if (isEmpty(into)) return 'unchanged'
    const text = `${JSON.stringify(into, null, 2)}\n`
    if (existsSync(path) && readFileSync(path, 'utf8') === text) return 'unchanged'
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    // A new document of a saved workspace joins its list.
    if (w.file && !w.documents?.includes(path)) writeWorkspace({ ...w, file: w.file, documents: [...(w.documents ?? []), path] })
    return 'saved'
  }

  /** The document saved in a project's file: none when the file is missing, `invalid` when it is not a valid document. */
  savedFor(w: Workspace): { document?: unknown; invalid?: string } {
    const path = this.fileOf(w)
    if (!path || !existsSync(path)) return {}
    const invalid = invalidFile(path)
    return invalid ? { invalid } : { document: JSON.parse(readFileSync(path, 'utf8')) }
  }

  /** Writes the document to its file, unless it is empty or unchanged. */
  private save(doc: unknown): void {
    const path = this.state.file
    if (!path || isEmpty(doc)) return
    const id = (doc as { project?: { id?: string } }).project?.id
    if (this.project && id !== this.project) {
      // Another project: never over this file. The agent's folder's own project goes to that folder's file.
      const w = this.state.project
      if (!w || id !== w.id) return this.tie(undefined)
      this.tie(workspaceFile(w), w.id)
      return this.save(doc)
    }
    const first = !existsSync(path)
    const text = `${JSON.stringify(doc, null, 2)}\n`
    if (text === this.written) return
    // A file that changed on disk into something that is not a document (a merge conflict, a bad edit) is the person's to fix.
    if (existsSync(path) && readFileSync(path, 'utf8') !== this.written && invalidFile(path)) {
      if (this.refused !== path) this.state.put({ from: 'notice', text: `${path} is not a valid document. Not saved.`, tone: 'error' })
      this.refused = path
      return
    }
    this.refused = undefined
    mkdirSync(dirname(path), { recursive: true })
    this.written = text
    writeFileSync(path, text)
    if (first) this.adopt(path)
    if (!this.watcher) {
      this.watch(path)
      this.refresh()
    }
  }

  /** Changes on disk show in the Studio; a file that no longer reads as a document is reported, not opened. */
  private watch(path: string) {
    this.watcher = watch(path, () => {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        if (this.state.file !== path || !existsSync(path)) return
        const text = readFileSync(path, 'utf8')
        if (text === this.written) return
        const { result, report } = check({ text })
        if (!result?.ok) return void this.state.put({ from: 'notice', text: `${path} changed on disk but is not a valid document: ${report.split('\n')[0]}`, tone: 'error' })
        this.written = text
        this.state.open(JSON.parse(text), 'file')
      }, 150)
    })
  }

  close() {
    this.watcher?.close()
    this.dirWatcher?.watcher?.close()
  }
}
