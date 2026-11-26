/**
 * Poney MCP server.
 *
 * Gives an agent everything it needs to write walkthroughs and diagrams that
 * people read in Poney Studio: the guide and schema, a checker that explains
 * how to fix problems, a renderer so the agent can see its own pictures, and a
 * live link to the Studio — open a document for a person, read back what
 * they looked at, answered and wrote, and answer the questions they ask.
 *
 * Run: poney-mcp (stdio), or npm run mcp in the Poney repository. Logs go to stderr.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { renderScenePng } from '@hattoriai/poney-render'
import { brief, check, example, excerpt, outline, schema, type Input, type Topic } from './ops'
import { attachOrStart } from './live/hub'

// The live link: this process's own hub, or one already running (a Studio started with `poney studio`).
const { live, hub } = await attachOrStart()
const log = (...args: unknown[]) => console.error('[poney]', ...args)

const server = new McpServer(
  { name: 'poney', version: '0.1.0' },
  {
    instructions:
      'Poney turns a JSON document into walkthroughs and diagrams that explain software to people: a "change" walkthrough explains one change; a "tour" teaches a codebase as it is. Call poney_guide once (topic "change" or "tour") to learn the format. Write a document, run poney_check with the repository until it is clean, look at each scene with poney_render, then poney_open to show it to the person. Use poney_read to see what they looked at, answered or wrote. To teach, loop: poney_wait for the person\'s next question, answer it with poney_reply (and, when a picture helps, a new scene opened with poney_open first), then wait again.',
  },
)

const documentInput = {
  document: z.any().optional().describe('The Poney document, as a JSON object or JSON text. Mermaid text is converted.'),
  path: z.string().optional().describe('Path of a .json (or Mermaid) file to read instead of `document`.'),
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], isError })

/** The document to work on: the one given, else what is open in the Studio. */
async function inputOrLive(args: Input): Promise<Input | undefined> {
  if (args.document !== undefined || args.path) return args
  const { current } = await live.read()
  return current == null ? undefined : { document: current }
}

/** The walkthroughs and diagrams of the open document that `next` leaves out. */
async function dropped(next: { walkthroughs: { id: string }[]; views: { id: string }[] }): Promise<string[]> {
  const { current } = await live.read()
  const open = current as { walkthroughs?: { id: string; title?: string }[]; views?: { id: string; title?: string }[] } | undefined
  if (!open) return []
  const keep = new Set([...next.walkthroughs.map((w) => `w:${w.id}`), ...next.views.map((v) => `v:${v.id}`)])
  return [
    ...(open.walkthroughs ?? []).filter((w) => !keep.has(`w:${w.id}`)).map((w) => `the walkthrough "${w.title ?? w.id}"`),
    ...(open.views ?? []).filter((v) => !keep.has(`v:${v.id}`)).map((v) => `the diagram "${v.title ?? v.id}"`),
  ]
}

const SAVED = 'Saved in its project. It shows when the person opens that project.'
const noWindow = () => `No Studio window is open. Ask the person to open ${live.studioUrl}.`

server.registerTool(
  'poney_guide',
  {
    title: 'How to write a Poney walkthrough',
    description:
      'Returns the guide for writing a walkthrough (what each part is for, refs, limits, the check-and-render loop) and a complete valid example. Topic "change" explains one change (a commit, a pull request); topic "tour" teaches a codebase as it is. Read it before writing a document.',
    inputSchema: { topic: z.enum(['change', 'tour']).optional().describe('"change" (default) or "tour".') },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const topic: Topic = args.topic ?? 'change'
    return text(`${brief(topic)}\n\n## Example\n\n\`\`\`json\n${example(topic)}\`\`\``)
  },
)

server.registerTool(
  'poney_schema',
  {
    title: 'Poney JSON Schema',
    description: 'Returns the JSON Schema (draft-07) of a Poney document, for structured output.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => text(JSON.stringify(schema())),
)

server.registerTool(
  'poney_check',
  {
    title: 'Check a Poney document',
    description:
      'Validates a document and lints it for readability. Returns errors (the document is invalid) and warnings (it reads badly), each with its path and a hint for the fix, and the scenes it can render. Give `repo` (and `rev`, or `diff`) to also prove the code: in a change, every line shown is in the diff with the right number; in a tour, every excerpt is in its file at those lines; cited tests, and the files in `sourceRefs`, exist. Run it after every edit until there are no errors.',
    inputSchema: {
      ...documentInput,
      repo: z.string().optional().describe('Path of the git repository the code is in.'),
      rev: z.string().optional().describe('The commit, a range "base..head", or "working" for the files on disk. Default: HEAD.'),
      diff: z.string().optional().describe('A unified diff to check the code against, instead of a repository.'),
    },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const input = await inputOrLive(args)
    if (!input) return text('Give a document or a path. Nothing is open in the Studio.', true)
    const { result, report } = check(input, { repo: args.repo, rev: args.rev, diff: args.diff })
    return text([report, result?.ok ? outline(result) : ''].filter(Boolean).join('\n\n'), !result?.ok)
  },
)

server.registerTool(
  'poney_excerpt',
  {
    title: 'Copy a code excerpt',
    description: 'Returns a code block for a scene\'s `code`: lines `from` to `to` of a file, copied exactly, with `start` set. Use it instead of retyping code, so the check finds every line where you say it is.',
    inputSchema: {
      repo: z.string().describe('Path of the git repository.'),
      path: z.string().describe('File path, relative to the repository root.'),
      from: z.number().int().min(1),
      to: z.number().int().min(1),
      rev: z.string().optional().describe('A commit, or "working" for the file on disk. Default: HEAD.'),
    },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const r = excerpt(args.repo, args.path, args.from, args.to, args.rev)
    return r.error ? text(r.error, true) : text(JSON.stringify(r.block, null, 2))
  },
)

server.registerTool(
  'poney_render',
  {
    title: 'Render a scene',
    description:
      'Draws one scene of a walkthrough (or a view) as a PNG, exactly as Poney Studio shows it, so you can see whether it makes its point. Without a document, renders what is open in the Studio. Scenes are named by id; "overview" is the picture next to the story.',
    inputSchema: {
      ...documentInput,
      walkthrough: z.string().optional().describe('Walkthrough id. Default: the first.'),
      scene: z.string().optional().describe('Scene id, or "overview". Default: the overview, else the first scene with a view.'),
      view: z.string().optional().describe('Render a view by id instead of a scene.'),
      mode: z.enum(['before', 'change', 'after']).optional().describe('Before the change, the change marked (default), or after.'),
      theme: z.enum(['light', 'dark']).optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const input = await inputOrLive(args)
    if (!input) return text('Give a document or a path. Nothing is open in the Studio.', true)
    const { result, report } = check(input)
    if (!result?.ok || !result.document) return text(`The document has errors; fix them first.\n\n${report}`, true)
    try {
      const r = await renderScenePng(result.document, { walkthrough: args.walkthrough, scene: args.scene, view: args.view, mode: args.mode, theme: args.theme })
      return {
        content: [
          { type: 'image' as const, data: r.png.toString('base64'), mimeType: 'image/png' },
          { type: 'text' as const, text: `${r.title} (${r.width}×${r.height} px).${result.warnings.length ? `\n\n${report}` : ''}` },
        ],
      }
    } catch (e) {
      return text(e instanceof Error ? e.message : String(e), true)
    }
  },
)

server.registerTool(
  'poney_open',
  {
    title: 'Open in Poney Studio',
    description:
      'Checks a document and shows it live in Poney Studio for the person. Every open Studio window updates at once. Returns the address to give the person if no window is open yet. Call it again after each revision. It replaces the open document: to add to it, get it with poney_read (includeDocument: true) and open it with your additions.',
    inputSchema: {
      ...documentInput,
      replace: z.boolean().optional().describe('Set only when the person asked to remove walkthroughs or diagrams that are open now, or to start a new document.'),
    },
  },
  async (args) => {
    if (args.document === undefined && !args.path) return text('Give a document or a path.', true)
    const { result, report } = check(args)
    if (!result?.ok || !result.document) return text(`Not opened: the document has errors.\n\n${report}`, true)
    // The person's work is not lost by accident: what is open stays unless they asked to remove it.
    if (!args.replace) {
      const lost = await dropped(result.document)
      if (lost.length)
        return text(
          `Not opened: the open document has ${lost.join(', ')}, and this one leaves them out. Get the open document with poney_read (includeDocument: true), add your work to it, and open that. Set replace: true only if the person asked to remove them.`,
          true,
        )
    }
    const { revision, viewers, saved, refused } = await live.open(JSON.parse(JSON.stringify(result.document)))
    if (refused) return text(refused, true)
    if (saved) return text(SAVED)
    const where = viewers ? `Shown in ${viewers} open Studio window${viewers > 1 ? 's' : ''}.` : noWindow()
    return text(`Opened revision ${revision}: "${result.document.walkthroughs[0]?.title ?? result.document.project.name}". ${where}${result.warnings.length ? `\n\n${report}` : ''}`)
  },
)

server.registerTool(
  'poney_import',
  {
    title: 'Import from the code',
    description:
      'Reads a source in a repository and adds what it finds to the document open in the Studio (or to a new one): "schema" reads the database schema (db/schema.rb, a .sql schema, schema.prisma) into tables, columns and foreign keys; "js-modules" reads JavaScript and TypeScript imports into modules and who imports whom. It only adds: what the document already has stays. Without an importer, lists the importers and what each would read in the repository. Use it to start from facts, then write the words and the walkthrough yourself.',
    inputSchema: {
      repo: z.string().describe('The repository folder.'),
      importer: z.string().optional().describe('"schema", "js-modules", or another installed importer. Leave out to list them.'),
      path: z.string().optional().describe('A file to read instead of the one the importer finds, relative to the repository.'),
      store: z.string().optional().describe('For "schema": the id of the database entity the tables are stored in.'),
    },
  },
  async ({ repo, importer, path, store }) => {
    const p = await import('./plugins')
    if (!importer) {
      const { importers, problems } = await p.available(repo)
      return text([...importers.map((i) => `- ${i.id}: ${i.description} ${i.files.length ? `Would read ${i.files.join(', ')}.` : 'Nothing to read in this repository.'}`), ...problems].join('\n'))
    }
    try {
      const { current } = await live.read()
      const { document, summary } = await p.runImport(importer, repo, { into: current ?? undefined, path, store })
      const { result, report } = check({ document })
      if (!result?.ok) return text(`Not opened: the document has errors after the import.\n\n${report}`, true)
      const { revision, viewers, saved, refused } = await live.open(document)
      if (refused) return text(refused, true)
      if (saved) return text(`${summary}\n${SAVED}`)
      return text(`${summary}\nOpened revision ${revision}${viewers ? '' : `. ${noWindow()}`}. Give the new parts and tables plain summaries, then group them into views that explain something.`)
    } catch (e) {
      return text(e instanceof Error ? e.message : String(e), true)
    }
  },
)

server.registerTool(
  'poney_overlay',
  {
    title: 'Live facts about the parts',
    description:
      'Reads live facts about the parts of the open document, through their source paths: "coverage" (the share of lines the tests run, from the last coverage report) or "churn" (commits in the last 90 days, from git). Without an overlay, lists them. Use the facts in your answers and as badges, e.g. a scene badge "34% tested", only as the overlay reports them.',
    inputSchema: {
      repo: z.string().describe('The repository folder.'),
      overlay: z.string().optional().describe('"coverage", "churn", or another installed overlay. Leave out to list them.'),
    },
  },
  async ({ repo, overlay }) => {
    const p = await import('./plugins')
    if (!overlay) {
      const { overlays } = await p.available(repo)
      return text(overlays.map((o) => `- ${o.id}: ${o.description} ${o.files.length ? `Would read ${o.files.join(', ')}.` : 'Nothing to read in this repository.'}`).join('\n'))
    }
    try {
      const { current } = await live.read()
      if (current == null) return text('No document is open in the Studio.', true)
      return text(p.describeOverlay(await p.runOverlay(overlay, repo, current)))
    } catch (e) {
      return text(e instanceof Error ? e.message : String(e), true)
    }
  },
)

server.registerTool(
  'poney_wait',
  {
    title: 'Wait for a question from the person',
    description:
      'Waits until the person asks a question in Poney Studio ("Ask the agent"), then returns it with where they were: the walkthrough, the scene, and what they selected. Returns questions you have not seen yet at once, if there are any. Returns an empty list when time runs out; call it again to keep listening. While you wait, the Studio tells the person you are listening.',
    inputSchema: { timeoutSeconds: z.number().int().min(1).max(900).optional().describe('How long to wait. Default: 300.') },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const { questions, viewers, place, answeredInStudio } = await live.waitForQuestions((args.timeoutSeconds ?? 300) * 1000)
    if (answeredInStudio)
      return text('Nothing to wait for: an agent started by Poney Studio answers the person\'s questions, and each question reaches it as a new message. If that agent is you, end your turn now.')
    if (!questions.length) return text(viewers ? 'No question yet. Call poney_wait again to keep listening.' : `No question yet. ${noWindow()}`)
    return text(JSON.stringify({ questions, ...place }, null, 2))
  },
)

server.registerTool(
  'poney_reply',
  {
    title: 'Answer the person in Poney Studio',
    description:
      'Shows your answer in the thread in Poney Studio, under the person\'s question. Answer in plain words, short. When a picture helps, first add a scene to the document and open it with poney_open, then give its id in `scene`: the reply gets a link that takes the person there.',
    inputSchema: {
      text: z.string().min(1).describe('The answer. Plain text; blank lines separate paragraphs.'),
      inReplyTo: z.number().int().optional().describe('The id of the question it answers.'),
      walkthrough: z.string().optional().describe('The walkthrough of `scene`. Default: the one the person is reading.'),
      scene: z.string().optional().describe('A scene to show with the answer.'),
    },
  },
  async (args) => {
    const { studio, viewers } = await live.read()
    const m = await live.reply(args.text, { inReplyTo: args.inReplyTo, walkthrough: args.walkthrough ?? (args.scene ? studio?.walkthrough : undefined), scene: args.scene })
    return text(`Replied (message ${m.id}).${viewers ? '' : ' No Studio window is open; the person will see it when they open one.'}`)
  },
)

server.registerTool(
  'poney_read',
  {
    title: 'Read what the person sees',
    description:
      'Returns what the person is doing in Poney Studio: the view and scene they are on, what they selected, their answers to questions, the notes they wrote for you, which scenes they marked as read, the last messages of the question thread, and the document itself if they changed it.',
    inputSchema: { includeDocument: z.boolean().optional().describe('Also return the full document. Default: only when the person changed it.') },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const r = await live.read()
    if (!r.studio && !args.includeDocument) return text(r.viewers ? 'A Studio window is open but has reported nothing yet.' : noWindow())
    const { document, ...rest } = r.studio ?? { document: undefined }
    const out: Record<string, unknown> = { viewers: r.viewers, ...rest, changedDocument: document !== undefined, thread: r.thread.slice(-20), ...(r.invalid ? { problem: r.invalid } : {}) }
    if (document !== undefined || args.includeDocument) out.document = document ?? r.current
    return text(JSON.stringify(out, null, 2))
  },
)

log(hub ? `live hub on ${hub.server.url}; Studio at ${live.studioUrl}` : `attached to the live hub; Studio at ${live.studioUrl}`)
await server.connect(new StdioServerTransport())
process.on('SIGINT', () => {
  hub?.server.stop()
  process.exit(0)
})
