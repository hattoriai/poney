/**
 * Documents as files, like notebooks in Livebook.
 *
 * The open document can be tied to a .poney file. Every change, from an
 * agent or from the person in the Studio, is saved to it; a change to the
 * file on disk (an agent, git pull, an editor) shows in the Studio. A folder
 * an agent works in gets its file in docs/poney/, made when there is
 * something to keep.
 */
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'
import { check } from '../ops'
import type { LiveState } from './state'
import { emptyDocument, intoWorkspace, workspaceProject, type WorkspaceProject } from './workspace-project'
import { execFileSync } from 'node:child_process'

/** The top folder of the git repository a folder is in, if any. */
function repositoryOf(dir: string): string | undefined {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined
  } catch {
    return undefined
  }
}

/** Where a folder's Poney file goes. */
export const workspaceFile = (w: WorkspaceProject) => join(w.cwd, 'docs', 'poney', `${w.id}.poney`)

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

  constructor(private readonly state: LiveState) {
    state.on('document', (_rev, doc, source) => {
      if (source === 'agent') this.save(doc)
    })
    state.on('edited', (doc) => this.save(doc))
    state.on('workspace', (w) => w && this.openWorkspace(w))
  }

  /** Opens a .poney file and ties the document to it. Throws with the check report when it is not a valid document. */
  open(path: string): void {
    const text = readFileSync(path, 'utf8')
    const { result, report } = check({ text })
    if (!result?.ok) throw new Error(`"${path}" is not a valid Poney document.\n${report}`)
    const doc = JSON.parse(text) as { project?: { id?: string } }
    this.tie(path, doc.project?.id, text)
    this.state.open(doc, 'file')
    // A file inside a repository belongs to that project: agents will work there.
    const root = repositoryOf(dirname(path))
    if (root && root !== this.state.project?.cwd) this.state.setWorkspace(workspaceProject(root))
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
      this.tie(join(w.cwd, 'docs', 'poney', `${id}.poney`), id)
      return this.save(open)
    }
    const path = workspaceFile(w)
    if (existsSync(path)) {
      try {
        return this.open(path)
      } catch (e) {
        this.state.put({ from: 'notice', text: e instanceof Error ? e.message.split('\n')[0] : String(e), tone: 'error' })
      }
    }
    this.tie(path, w.id)
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

  /** Saves a document into another project's file, whether or not that project is open. Nothing for an empty document, nothing when unchanged; true when it wrote. */
  saveFor(w: WorkspaceProject, doc: unknown): boolean {
    const into = intoWorkspace(doc, w)
    if (isEmpty(into)) return false
    const path = workspaceFile(w)
    const text = `${JSON.stringify(into, null, 2)}\n`
    if (existsSync(path) && readFileSync(path, 'utf8') === text) return false
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    return true
  }

  /** The document saved in a project's file, if there is one. */
  savedFor(w: WorkspaceProject): unknown {
    try {
      return JSON.parse(readFileSync(workspaceFile(w), 'utf8'))
    } catch {
      return null
    }
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
