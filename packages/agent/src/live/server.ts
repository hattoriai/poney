/**
 * The live hub's HTTP server, on 127.0.0.1.
 *
 * - The Studio receives documents, messages and agent status over
 *   server-sent events, and reports what the person does.
 * - An MCP server in another process uses the /api/live endpoints (see
 *   RemoteLive).
 * - The Studio starts agents and picks workspaces through /api/agent and
 *   /api/workspace.
 * - When the Studio is built, the server also serves it, so one address is
 *   enough.
 *
 * It can start programs and read folders, so it answers only requests for
 * its own host name, and only browser requests from its own pages (or the
 * Studio's dev server). Requests without an Origin come from programs on
 * this machine, such as an MCP server.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize } from 'node:path'
import type { LiveState } from './state'
import { providerFor, type AgentPool } from '../agents/pool'
import { builtInProviders, describeProvider } from '../agents/providers'
import { cloneRepository, listFolders, searchFiles } from '../agents/workspace'
import { checkProvider } from '../agents/check'
import type { AgentChoice } from '../agents/sessions'
import { check } from '../ops'
import { documentsOf, type DocumentFiles } from './files'


import type { Place } from './types'
import { presentFolders, workspaceFor, workspaceToOpen, type Workspace } from './workspace-file'
import { buildStamp } from './stamp'
import { mcpCommand, studioDist } from '../paths'

const DIST = studioDist()
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.json': 'application/json',
}
const NOT_VALID = "The project's file is not a valid document."
/** The Studio's dev server may also use the hub. */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

/** The open workspace, as the Studio shows it. */
const describe = (w: Workspace | undefined) => (w ? { key: w.key, name: w.name, file: w.file ?? null, folders: w.folders.map((f) => ({ path: f.cwd, name: f.name, ...(f.missing ? { missing: true } : {}) })) } : null)

export class LiveServer {
  private server?: Server
  private clients = new Set<ServerResponse>()
  port = 0
  /** The code this hub runs, and who started it ("dev" for the Studio's dev server). */
  readonly build = buildStamp()
  readonly owner = process.env.PONEY_HUB_OWNER ?? 'other'
  /** Called when a local program asks this hub to stop (see /api/live/stop). */
  onStopRequest?: () => void

  constructor(
    private readonly state: LiveState,
    private readonly agents?: AgentPool,
    private readonly files?: DocumentFiles,
  ) {
    const send = (event: string, data: unknown) => {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      for (const c of this.clients) c.write(payload)
    }
    state.on('document', (revision, document, source) => send('document', { revision, document, source }))
    state.on('message', (message) => send('message', message))
    state.on('thread', (messages) => send('thread', { messages }))
    state.on('agent', (status) => send('agent', status))
    state.on('file', (path) => send('file', { path: path ?? null }))
    state.on('workspace', (w) => {
      send('project', { root: state.project?.cwd ?? null, name: w?.name ?? null })
      send('workspace', describe(w))
    })
    state.on('overlays', (o) => send('overlays', o))
    state.on('documents', (d) => send('documents', d))
  }

  get url() {
    return `http://127.0.0.1:${this.port}`
  }
  get servesStudio() {
    return existsSync(join(DIST, 'index.html'))
  }
  /** Where a person opens the Studio for this hub. */
  get studioUrl() {
    return this.servesStudio ? `${this.url}/` : `http://localhost:5173/?live=${encodeURIComponent(this.url)}`
  }
  get viewers() {
    return this.clients.size
  }

  async start(preferred = Number(process.env.PONEY_PORT ?? 5319)): Promise<void> {
    for (let port = preferred; port < preferred + 20; port++) {
      try {
        await this.listen(port)
        this.port = port
        return
      } catch {
        /* port in use: try the next */
      }
    }
    throw new Error(`No free port from ${preferred} to ${preferred + 19}`)
  }

  private listen(port: number) {
    return new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => void this.handle(req, res))
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        this.server = server
        resolve()
      })
    })
  }

  stop() {
    this.state.close()
    this.files?.close()
    this.agents?.stopAll()
    for (const c of this.clients) c.end()
    this.server?.close()
  }

  /* ─── Requests ──────────────────────────────────────────────────────── */

  private allowedOrigin(origin: string | undefined) {
    return !origin || origin === this.url || origin === `http://localhost:${this.port}` || DEV_ORIGINS.includes(origin)
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    // A page on another site must not reach this server, even through a renamed host (DNS rebinding).
    const host = req.headers.host ?? ''
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return void res.writeHead(403).end('Wrong host')
    const origin = req.headers.origin
    if (!this.allowedOrigin(origin)) return void res.writeHead(403).end('Wrong origin')
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'content-type')
    }
    if (req.method === 'OPTIONS') return void res.writeHead(204).end()
    const url = new URL(req.url ?? '/', this.url)
    try {
      if (url.pathname.startsWith('/api/')) return await this.api(url, req, res)
      return this.serveStudio(url.pathname, res)
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  private async api(url: URL, req: IncomingMessage, res: ServerResponse) {
    const route = `${req.method} ${url.pathname}`
    const s = this.state
    /** A folder of the open workspace the request names, else its first folder. */
    const folderOf = (given: string | null | undefined) => (given && s.workspace?.folders.some((f) => f.cwd === given) ? given : s.project?.cwd)
    switch (route) {
      /* Live document and conversation */
      case 'GET /api/live':
        return json(res, 200, { poney: true, revision: s.shown()?.revision ?? 0, viewers: this.viewers, build: this.build, owner: this.owner })
      case 'POST /api/live/stop':
        // Only a program on this machine (no browser page), and only a hub the dev server started, which another one replaces.
        if (req.headers.origin || this.owner !== 'dev' || !this.onStopRequest) return json(res, 403, { error: 'This hub does not stop on request.' })
        json(res, 200, { stopping: true })
        setTimeout(() => this.onStopRequest?.(), 50)
        return
      case 'GET /api/live/events':
        return this.events(req, res)
      case 'POST /api/live/state':
        s.report((await body(req)) as object)
        return void res.writeHead(204).end()
      case 'POST /api/live/open': {
        const { document, project, file } = (await body(req)) as { document?: unknown; project?: string; file?: string }
        if (document === undefined) return json(res, 400, { error: 'Give a document' })
        if (!this.files) {
          if ((project && project !== s.projectKey()) || file) return json(res, 400, { error: 'This hub cannot save documents.' })
          return json(res, 200, { revision: s.open(document), viewers: this.viewers })
        }
        // An agent of a project that is not open: its document is saved in that project, not shown. `file` names the target document.
        const opened = this.files.agentOpen(document, { project, file })
        return json(res, 200, { revision: opened.revision ?? s.shown()?.revision ?? 0, viewers: this.viewers, ...(opened.saved ? { saved: true } : {}), ...(opened.refused ? { refused: opened.refused } : {}) })
      }
      case 'GET /api/live/read': {
        // An agent of a project that is not open reads its own project: the saved document and its thread.
        const project = url.searchParams.get('project')
        if (project && project !== s.projectKey() && this.files) {
          const w = workspaceFor(project)
          const { document, invalid } = this.files.savedFor(w)
          const workspace = { folder: w.folders[0].cwd, folders: w.folders.map((f) => f.cwd), documents: documentsOf(w), shown: this.files.fileOf(w) ?? null }
          return json(res, 200, { viewers: this.viewers, current: document ?? null, ...(invalid ? { invalid: NOT_VALID } : {}), thread: s.thread(project), workspace })
        }
        const workspace = s.project ? { folder: s.project.cwd, folders: s.workspace!.folders.map((f) => f.cwd), ...s.documents } : undefined
        return json(res, 200, { viewers: this.viewers, studio: s.studio, current: s.current(), thread: s.thread(), ...(workspace ? { workspace } : {}) })
      }
      case 'GET /api/live/wait': {
        const ms = Math.min(900_000, Math.max(0, Number(url.searchParams.get('timeout') ?? 300_000)))
        const questions = await s.waitForQuestions(ms)
        return json(res, 200, { questions, viewers: this.viewers, place: { walkthrough: s.studio?.walkthrough, scene: s.studio?.scene }, answeredInStudio: !!s.status().session })
      }
      case 'POST /api/live/ask': {
        const q = (await body(req)) as Place & { text?: string }
        const text = typeof q.text === 'string' ? q.text.trim().slice(0, 8000) : ''
        if (!text) return json(res, 400, { error: 'Empty question' })
        const context = Array.isArray(q.context)
          ? q.context.slice(0, 12).map((c) => ({ ...(c.ref ? { ref: String(c.ref).slice(0, 200) } : {}), title: String(c.title ?? '').slice(0, 200), kind: String(c.kind ?? '').slice(0, 40), ...(c.quote ? { quote: String(c.quote).slice(0, 2000) } : {}) }))
          : undefined
        return json(res, 200, s.ask(text, { walkthrough: q.walkthrough, scene: q.scene, selection: q.selection, ...(context?.length ? { context } : {}) }))
      }
      case 'POST /api/live/reply': {
        const r = (await body(req)) as { text?: string; inReplyTo?: number; walkthrough?: string; scene?: string }
        if (!r.text) return json(res, 400, { error: 'Empty reply' })
        return json(res, 200, s.reply(r.text, { inReplyTo: r.inReplyTo, walkthrough: r.walkthrough, scene: r.scene }))
      }

      /* Agents the Studio starts */
      case 'GET /api/agent':
        return json(res, 200, { providers: builtInProviders().map(describeProvider), status: s.status(), defaultAgent: this.agents?.defaultAgent() ?? null, canStart: !!this.agents, mcpServer: mcpCommand() })
      case 'POST /api/agent/check': {
        const r = (await body(req)) as AgentChoice & { fresh?: boolean }
        const spec = providerFor(r)
        if (!spec) return json(res, 400, { error: 'Unknown agent' })
        return json(res, 200, await checkProvider(spec, r.fresh))
      }
      case 'POST /api/agent/connect': {
        if (!this.agents) return json(res, 400, { error: 'This hub cannot start agents.' })
        const r = (await body(req)) as AgentChoice & { folder?: string }
        if (!providerFor(r)) return json(res, 400, { error: 'Unknown agent' })
        if (r.folder) {
          const w = workspaceToOpen(r.folder)
          if ('choose' in w) return json(res, 200, { choose: w.choose })
          // The default first, so the folder's agent starts once, as this agent.
          this.agents.setDefault(r)
          s.setWorkspace(w)
        }
        if (!s.project) return json(res, 400, { error: 'Choose the folder with the code first.' })
        await this.agents.connect(r)
        return json(res, 200, s.status())
      }
      case 'POST /api/agent/disconnect':
        await this.agents?.disconnect()
        return json(res, 200, s.status())
      case 'POST /api/agent/cancel':
        await this.agents?.active()?.cancel()
        return json(res, 200, s.status())
      case 'POST /api/agent/setting': {
        const r = (await body(req)) as { id?: string; value?: string | boolean }
        const agent = this.agents?.active()
        if (!agent || !r.id || r.value === undefined) return json(res, 400, { error: 'Give id and value' })
        await agent.setSetting(r.id, r.value)
        return json(res, 200, s.status())
      }
      case 'POST /api/agent/permission': {
        const r = (await body(req)) as { messageId?: number; optionId?: string }
        if (typeof r.messageId !== 'number' || !r.optionId) return json(res, 400, { error: 'Give messageId and optionId' })
        this.agents?.active()?.choose(r.messageId, r.optionId)
        return json(res, 200, { ok: true })
      }

      /* The project folder */
      case 'GET /api/plugins': {
        // Importers and overlays, and what each would read in the project's folder.
        const { available, availableIn } = await import('../plugins/run')
        const asked = url.searchParams.get('folder')
        const dir = folderOf(asked)
        if (!dir) return json(res, 200, { root: null, importers: [], overlays: [], problems: [] })
        // Importers read one folder; overlays read every folder of the workspace, unless the request names one.
        const all = asked ? [dir] : presentFolders(s.workspace!).map((f) => f.cwd)
        const overlays = (await availableIn(all)).overlays
        return json(res, 200, { root: dir, ...(await available(dir)), overlays })
      }
      case 'POST /api/import': {
        const { runImport } = await import('../plugins/run')
        const r = (await body(req)) as { importer?: string; path?: string; store?: string; folder?: string }
        const dir = folderOf(r.folder)
        if (!dir) return json(res, 400, { error: 'Choose the folder with the code first.' })
        const { document, summary } = await runImport(r.importer ?? '', dir, { into: s.current(), path: r.path, store: r.store })
        const checked = check({ document })
        if (!checked.result?.ok) return json(res, 400, { error: `The document has errors after the import.\n${checked.report}` })
        s.open(document, 'agent')
        return json(res, 200, { summary })
      }
      case 'POST /api/overlays/run': {
        const { runOverlayIn } = await import('../plugins/run')
        const r = (await body(req)) as { id?: string; folder?: string }
        const dir = folderOf(r.folder)
        if (!dir) return json(res, 400, { error: 'Choose the folder with the code first.' })
        const result = await runOverlayIn(r.id ?? '', r.folder ? [dir] : presentFolders(s.workspace!).map((f) => f.cwd), s.current())
        s.setOverlay(r.id!, result)
        return json(res, 200, result)
      }
      case 'POST /api/overlays/clear': {
        const r = (await body(req)) as { id?: string }
        s.setOverlay(r.id ?? '', null)
        return json(res, 200, {})
      }
      case 'POST /api/project/open': {
        const r = (await body(req)) as { path?: string }
        const w = workspaceToOpen(r.path ?? '')
        if ('choose' in w) return json(res, 200, { choose: w.choose })
        s.setWorkspace(w)
        return json(res, 200, { root: s.project?.cwd, key: s.projectKey(), revision: s.shown()?.revision ?? null })
      }

      /* The open workspace */
      case 'POST /api/workspace/new': {
        if (!this.files) return json(res, 400, { error: 'This hub cannot keep workspaces.' })
        const w = this.files.newWorkspace()
        s.setWorkspace(w)
        return json(res, 200, describe(w))
      }
      case 'POST /api/workspace/save': {
        if (!this.files) return json(res, 400, { error: 'This hub cannot save files.' })
        const r = (await body(req)) as { file?: string; name?: string }
        if (!r.file) return json(res, 400, { error: 'Give a file' })
        const { from, to, workspace } = this.files.saveWorkspace(r.file, r.name)
        s.rekey(from, to)
        this.agents?.rekey(from, to)
        s.setWorkspace(workspace)
        return json(res, 200, { key: to })
      }
      case 'POST /api/workspace/folders': {
        if (!this.files) return json(res, 400, { error: 'This hub cannot save files.' })
        const r = (await body(req)) as { add?: string; remove?: string }
        if (!r.add && !r.remove) return json(res, 400, { error: 'Give a folder to add or remove' })
        if (r.remove) {
          const w = this.files.removeFolder(r.remove)
          s.setWorkspace(w)
          return json(res, 200, describe(w))
        }
        const { workspace, from } = this.files.addFolder(r.add!)
        // A folder opened alone became a workspace: its conversation and agent session go with it.
        if (from) {
          s.rekey(from, workspace.key)
          this.agents?.rekey(from, workspace.key)
        }
        s.setWorkspace(workspace)
        return json(res, 200, describe(workspace))
      }
      case 'POST /api/workspace/documents/remove': {
        if (!this.files) return json(res, 400, { error: 'This hub cannot save files.' })
        const r = (await body(req)) as { path?: string }
        this.files.removeDocument(r.path ?? '')
        return json(res, 200, {})
      }

      /* Files */
      case 'POST /api/files/open': {
        if (!this.files) return json(res, 400, { error: 'This hub cannot open files.' })
        const r = (await body(req)) as { path?: string; document?: unknown }
        if (!r.path) return json(res, 400, { error: 'Give a path' })
        this.files.open(r.path, r.document)
        return json(res, 200, { path: s.file, revision: s.shown()?.revision ?? null })
      }
      case 'POST /api/documents/new': {
        if (!this.files) return json(res, 400, { error: 'This hub cannot make files.' })
        const r = (await body(req)) as { name?: string; folder?: string }
        return json(res, 200, { path: this.files.create(r.name ?? '', r.folder) })
      }
      case 'POST /api/files/delete': {
        if (!this.files) return json(res, 400, { error: 'This hub cannot delete files.' })
        const r = (await body(req)) as { path?: string; project?: string }
        if (!r.path) return json(res, 400, { error: 'Give a path' })
        this.files.delete(r.path, r.project)
        return json(res, 200, {})
      }

      /* Workspaces */
      case 'GET /api/workspace/folders':
        return json(res, 200, listFolders(url.searchParams.get('path') ?? undefined))
      case 'GET /api/workspace/files': {
        // In the project's folder, else the folder of the open document's file.
        const cwd = s.project?.cwd ?? (s.file ? dirname(s.file) : undefined)
        if (!cwd) return json(res, 200, { files: [] })
        return json(res, 200, { root: cwd, files: await searchFiles(cwd, url.searchParams.get('q') ?? '') })
      }
      case 'POST /api/workspace/clone': {
        const r = (await body(req)) as { url?: string }
        return json(res, 200, { path: await cloneRepository(r.url ?? '') })
      }
      default:
        return json(res, 404, { error: `No route ${route}` })
    }
  }

  /** Server-sent events: what is open now, then every change. */
  private events(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write(': connected\n\n')
    const shown = this.state.shown()
    if (shown) res.write(`event: document\ndata: ${JSON.stringify(shown)}\n\n`)
    res.write(`event: thread\ndata: ${JSON.stringify({ messages: this.state.thread() })}\n\n`)
    res.write(`event: agent\ndata: ${JSON.stringify(this.state.status())}\n\n`)
    res.write(`event: file\ndata: ${JSON.stringify({ path: this.state.file ?? null })}\n\n`)
    res.write(`event: project\ndata: ${JSON.stringify({ root: this.state.project?.cwd ?? null, name: this.state.project?.name ?? null })}\n\n`)
    res.write(`event: overlays\ndata: ${JSON.stringify(this.state.overlays)}\n\n`)
    res.write(`event: documents\ndata: ${JSON.stringify(this.state.documents)}\n\n`)
    res.write(`event: workspace\ndata: ${JSON.stringify(describe(this.state.workspace))}\n\n`)
    this.clients.add(res)
    const beat = setInterval(() => res.write(': beat\n\n'), 20_000)
    req.on('close', () => {
      clearInterval(beat)
      this.clients.delete(res)
    })
  }

  private serveStudio(pathname: string, res: ServerResponse) {
    if (!this.servesStudio) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
      return void res.end('Poney Studio is not built. Run "npm run build" in the Poney repository, or run "npm run dev" and open the address the agent gives you.')
    }
    const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
    let file = join(DIST, safe)
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  }
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
}

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let text = ''
    req.on('data', (chunk) => {
      text += chunk
      if (text.length > 20_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : {})
      } catch {
        reject(new Error('Not JSON'))
      }
    })
    req.on('error', reject)
  })
}
