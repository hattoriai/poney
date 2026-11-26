/**
 * Documents as files, like notebooks in Livebook.
 *
 * The open document can be tied to a .poney file. Every change, from an
 * agent or from the person in the Studio, is saved to it; a change to the
 * file on disk (an agent, git pull, an editor) shows in the Studio. A folder
 * an agent works in gets its file in docs/poney/, made when there is
 * something to keep.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'
import { check } from '../ops'
import type { LiveState } from './state'
import { emptyDocument, intoWorkspace, workspaceProject, type WorkspaceProject } from './workspace-project'
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
export const workspaceFile = (w: WorkspaceProject) => join(w.cwd, 'docs', 'poney', `${w.id}.poney`)

/** Why a file that exists is not a valid document (a merge conflict, a bad edit); undefined when it is missing or valid. */
function invalidFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  const { result, report } = check({ text: readFileSync(path, 'utf8') })
  return result?.ok ? undefined : report.split('\n')[0] || 'Not a valid document.'
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
  /** The file each project is tied to, by project key (its folder). */
  private tied = new Map<string, string>()

  constructor(private readonly state: LiveState) {
    state.on('document', (_rev, doc, source) => {
      if (source === 'agent') this.save(doc)
    })
    state.on('edited', (doc) => this.save(doc))
    state.on('workspace', (w) => w && this.openWorkspace(w))
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
      return this.state.setWorkspace(workspaceProject(root))
    }
    this.load(file, root)
  }

  /** The file of a project: the one it is tied to, else the only .poney file in its docs/poney/, else the folder's own name there. */
  fileOf(w: WorkspaceProject): string {
    const tied = this.tied.get(w.cwd)
    if (tied) return tied
    const dir = join(w.cwd, 'docs', 'poney')
    const found = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.poney')) : []
    return found.length === 1 ? join(dir, found[0]) : workspaceFile(w)
  }

  private load(path: string, root: string | undefined) {
    const text = readFileSync(path, 'utf8')
    const { result, report } = check({ text })
    if (!result?.ok) throw new Error(`"${path}" is not a valid Poney document.\n${report}`)
    const doc = JSON.parse(text) as { project?: { id?: string } }
    this.tie(path, doc.project?.id, text)
    if (root) this.tied.set(root, path)
    this.state.open(doc, 'file')
    // Agents work in the file's project; a file of no project leaves none open.
    if (root !== this.state.project?.cwd) this.state.setWorkspace(root ? workspaceProject(root) : undefined)
  }

  /**
   * A project folder. The document already open stays when it belongs here,
   * or when it has no file yet (it is saved to docs/poney/ here). Otherwise
   * the folder's own file opens, or an empty project that becomes a file when
   * there is something to keep.
   */
  private openWorkspace(w: WorkspaceProject) {
    const open = this.state.shown()?.document
    const file = this.state.file
    if (file && file.startsWith(`${w.cwd}/`)) return
    if (open && !file && !isEmpty(open)) {
      const id = this.state.openProjectId ?? w.id
      const path = join(w.cwd, 'docs', 'poney', `${id}.poney`)
      this.tie(path, id)
      this.tied.set(w.cwd, path)
      return this.save(open)
    }
    const path = this.fileOf(w)
    if (existsSync(path)) {
      try {
        return this.load(path, w.cwd)
      } catch (e) {
        this.state.put({ from: 'notice', text: e instanceof Error ? e.message.split('\n')[0] : String(e), tone: 'error' })
        // The file is the person's to fix: nothing is saved over it.
        this.tie(undefined)
        if (this.state.openProjectId !== w.id) this.state.open(emptyDocument(w), 'workspace')
        return
      }
    }
    this.tie(path, w.id)
    this.tied.set(w.cwd, path)
    if (this.state.openProjectId !== w.id) this.state.open(emptyDocument(w), 'workspace')
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
  saveFor(w: WorkspaceProject, doc: unknown): 'saved' | 'unchanged' | 'invalid' {
    const into = intoWorkspace(doc, w)
    if (isEmpty(into)) return 'unchanged'
    const path = this.fileOf(w)
    if (invalidFile(path)) return 'invalid'
    const text = `${JSON.stringify(into, null, 2)}\n`
    if (existsSync(path) && readFileSync(path, 'utf8') === text) return 'unchanged'
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    return 'saved'
  }

  /** The document saved in a project's file: none when the file is missing, `invalid` when it is not a valid document. */
  savedFor(w: WorkspaceProject): { document?: unknown; invalid?: string } {
    const path = this.fileOf(w)
    if (!existsSync(path)) return {}
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
    if (!this.watcher) this.watch(path)
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
  }
}
