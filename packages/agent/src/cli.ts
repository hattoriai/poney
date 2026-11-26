/**
 * poney — check, render and convert Poney documents.
 *
 *   poney check <file.poney> [--json] [--git <repo>[@<commit, a..b, or working>]] [--diff <file>]
 *   poney render <file> [--walkthrough id] [--scene id|overview] [--view id]
 *                  [--mode before|change|after] [--theme light|dark] [--format png|svg] [--out path]
 *   poney brief [--tour]   the guide for agents, with a complete example
 *   poney schema           the JSON Schema of a document
 *   poney import <file.mmd> [--out path]   Mermaid to Poney JSON
 *   poney excerpt <repo> <path> <from>-<to> [--rev <commit|working>]   a code block, copied from the file
 *   poney studio [--port n]   runs Poney Studio here: open folders, start agents, and let MCP agents attach
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { toJSON } from '@poney/core'
import { renderScene, renderScenePng } from '@poney/react/static'
import { brief, check, example, excerpt, outline, readInput, schema } from './ops'

const [command, ...rest] = process.argv.slice(2)
const { values, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    json: { type: 'boolean' },
    walkthrough: { type: 'string' },
    scene: { type: 'string' },
    view: { type: 'string' },
    mode: { type: 'string' },
    theme: { type: 'string' },
    format: { type: 'string' },
    out: { type: 'string', short: 'o' },
    git: { type: 'string' },
    diff: { type: 'string' },
    tour: { type: 'boolean' },
    rev: { type: 'string' },
    port: { type: 'string' },
  },
})
const file = positionals[0]

async function main(): Promise<number> {
  switch (command) {
    case 'check': {
      if (!file) return usage()
      const [repo, rev] = values.git ? (values.git.includes('@') ? [values.git.slice(0, values.git.lastIndexOf('@')), values.git.slice(values.git.lastIndexOf('@') + 1)] : [values.git, 'HEAD']) : []
      const { result, report } = check({ path: file }, { repo, rev, diff: values.diff ? readFileSync(values.diff, 'utf8') : undefined })
      if (values.json) console.log(JSON.stringify({ ok: result?.ok ?? false, errors: result?.errors ?? [], warnings: result?.warnings ?? [] }, null, 2))
      else console.log([report, result?.ok ? outline(result) : ''].filter(Boolean).join('\n'))
      return result?.ok ? 0 : 1
    }
    case 'render': {
      if (!file) return usage()
      const { result, report } = check({ path: file })
      if (!result?.ok || !result.document) {
        console.error(report)
        return 1
      }
      const options = {
        walkthrough: values.walkthrough,
        scene: values.scene,
        view: values.view,
        mode: values.mode as 'before' | 'change' | 'after' | undefined,
        theme: values.theme as 'light' | 'dark' | undefined,
      }
      const format = values.format ?? (values.out?.endsWith('.svg') ? 'svg' : 'png')
      const name = values.scene ?? values.view ?? 'scene'
      const out = values.out ?? `${file.replace(/\.(poney|json)$/, '')}.${name}.${format}`
      if (format === 'svg') writeFileSync(out, (await renderScene(result.document, { ...options, embedFonts: true })).svg)
      else writeFileSync(out, (await renderScenePng(result.document, options)).png)
      console.log(`Wrote ${out}`)
      return 0
    }
    case 'brief':
      console.log(`${brief(values.tour ? 'tour' : 'change')}\n\n## Example\n\n\`\`\`json\n${example(values.tour ? 'tour' : 'change')}\`\`\``)
      return 0
    case 'schema':
      console.log(JSON.stringify(schema(), null, 2))
      return 0
    case 'import': {
      if (!file) return usage()
      const read = readInput({ path: file })
      if (read.error || !read.converted) {
        console.error(read.error ?? 'Not a Mermaid diagram.')
        return 1
      }
      const json = toJSON(read.value as Parameters<typeof toJSON>[0])
      if (values.out) writeFileSync(values.out, json)
      else process.stdout.write(json)
      return 0
    }
    case 'studio': {
      const { startHub } = await import('./live/hub')
      const hub = await startHub(values.port ? Number(values.port) : undefined)
      console.log(`Poney Studio: ${hub.server.studioUrl}`)
      if (!hub.server.servesStudio) console.log('The Studio is not built: run "npm run build" first, or "npm run dev" and open the address above.')
      console.log('Agents in their own session (Claude Code, Codex…) with the Poney MCP server attach to this Studio by themselves.')
      const stop = () => {
        hub.server.stop()
        process.exit(0)
      }
      hub.server.onStopRequest = stop
      process.on('SIGINT', stop)
      process.on('SIGTERM', stop)
      return new Promise<number>(() => {})
    }
    case 'excerpt': {
      const [repo, path, range] = positionals
      const m = range ? /^(\d+)(?:-(\d+))?$/.exec(range) : null
      if (!repo || !path || !m) return usage()
      const r = excerpt(repo, path, Number(m[1]), Number(m[2] ?? m[1]), values.rev ?? 'HEAD')
      if (r.error) {
        console.error(r.error)
        return 1
      }
      console.log(JSON.stringify(r.block, null, 2))
      return 0
    }
    default:
      return usage()
  }
}

function usage() {
  console.error(`Usage:
  poney check <file> [--json] [--git <repo>[@<commit, a..b, or working>]] [--diff <file>]
  poney render <file> [--walkthrough id] [--scene id|overview] [--view id] [--mode before|change|after] [--theme light|dark] [--format png|svg] [--out path]
  poney brief [--tour]
  poney schema
  poney import <file.mmd> [--out path]
  poney excerpt <repo> <path> <from>-<to> [--rev <commit|working>]
  poney studio [--port n]`)
  return 2
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  },
)
