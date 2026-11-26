/**
 * The operations behind the CLI and the MCP server: read a document, check
 * it, render a scene, convert Mermaid. Both front ends stay thin.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { checkDocument, detectMermaid, formatCheck, fromMermaid, PoneyDocument, toJSON, type CheckResult } from '@poney/core'
import { ownership } from '@poney/ext-ownership'
import { security } from '@poney/ext-security'
import { teamMap } from '@poney/ext-ownership/diagram'
import { layoutTeamMap } from '@poney/ext-ownership/layout'
import { registerDiagram } from '@poney/react'
import { registerExtensionLayout } from '@poney/layout'
import { diffFromGit, filesAt, verifyCode, verifyExcerpts, verifySources } from './verify'

export const EXTENSIONS = [ownership, security]

// The extensions' own diagrams, so headless renders draw their views too.
registerDiagram(teamMap)
registerExtensionLayout('ownership/team-map', layoutTeamMap)

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** What a walkthrough explains: one change, or a codebase as it is. */
export type Topic = 'change' | 'tour'

/** The brief that teaches an agent to write a walkthrough: the common guide, then the part for the topic. */
export const brief = (topic: Topic = 'change') => `${readFileSync(here('../brief.md'), 'utf8')}\n\n${readFileSync(here(`../brief-${topic}.md`), 'utf8')}`
/** A complete, valid example document for the topic. */
export const example = (topic: Topic = 'change') => readFileSync(here(topic === 'tour' ? '../examples/tour.poney' : '../examples/walkthrough.poney'), 'utf8')

/** The JSON Schema of the authoring form: what an agent may write. */
export function schema(): object {
  // Cast: the MCP SDK brings its own copy of Zod, and TypeScript cannot compare the two copies.
  return zodToJsonSchema(PoneyDocument as never, { name: 'PoneyDocument', target: 'jsonSchema7', $refStrategy: 'root', definitionPath: 'definitions' })
}

export type Input = { document?: unknown; path?: string; text?: string }

/** Reads a document given as an object, as JSON text, or as a file path. Mermaid text is converted. */
export function readInput(input: Input): { value?: unknown; error?: string; converted?: string } {
  try {
    let text = input.text
    if (input.path) text = readFileSync(input.path, 'utf8')
    if (input.document !== undefined && typeof input.document !== 'string') return { value: input.document }
    if (typeof input.document === 'string') text = input.document
    if (text === undefined) return { error: 'Give a document, JSON text, or a file path.' }
    const kind = detectMermaid(text)
    if (kind) return { value: fromMermaid(text).document, converted: `Converted from a Mermaid ${kind} diagram.` }
    return { value: JSON.parse(text) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Where to prove the code and tests: a git repository and revision ("working" for files on disk), or a diff. */
export type Against = { repo?: string; rev?: string; diff?: string }

export function check(input: Input, against: Against = {}): { result?: CheckResult; report: string } {
  const read = readInput(input)
  if (read.error) return { report: `Cannot read the document: ${read.error}` }
  const result = checkDocument(read.value, { extensions: EXTENSIONS })
  const notes: string[] = []
  if (result.ok && result.document && (against.repo || against.diff)) {
    try {
      const doc = result.document
      const rev = against.rev ?? 'HEAD'
      const files = against.repo ? filesAt(against.repo, rev) : undefined
      const showsChange = doc.walkthroughs.some((w) => w.kind === 'change' && w.scenes.some((s) => s.code.length))
      const found = [
        ...(showsChange ? verifyCode(doc, against.diff ?? diffFromGit(against.repo!, rev), files) : []),
        ...(files ? [...verifyExcerpts(doc, files), ...verifySources(doc, files)] : []),
      ]
      if (found.length) {
        result.errors.push(...found)
        result.ok = false
      } else notes.push(`Code, sources and proof match ${files ? files.label : 'the diff'}.`)
    } catch (e) {
      notes.push(`Could not read the change: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
    }
  }
  return { result, report: [read.converted, formatCheck(result), ...notes].filter(Boolean).join('\n') }
}

/** Short summary of a valid document: what can be rendered. */
export function outline(result: CheckResult): string {
  const doc = result.document
  if (!doc) return ''
  return doc.walkthroughs
    .map((w) => {
      const scenes = [w.overview ? 'overview' : undefined, ...w.scenes.map((s) => (s.view ? s.id : `${s.id} (code only)`))].filter(Boolean)
      return `Walkthrough "${w.id}": ${w.title}\n  Scenes: ${scenes.join(', ')}`
    })
    .join('\n')
}

export { toJSON }

/**
 * A code excerpt, copied from the file: what a scene's `code` takes. Lines
 * "from" to "to" (1-based, inclusive) of `path` in `repo` at `rev`.
 */
export function excerpt(repo: string, path: string, from: number, to: number, rev = 'HEAD'): { block?: { path: string; start: number; text: string }; error?: string } {
  const files = filesAt(repo, rev)
  const content = files.read(path)
  if (content === undefined) return { error: `No file "${path}" in ${files.label}.` }
  const lines = content.split('\n')
  if (from < 1 || to < from) return { error: 'Give a range like 12-30, first line first.' }
  if (from > lines.length) return { error: `"${path}" has ${lines.length} lines.` }
  return { block: { path, start: from, text: lines.slice(from - 1, Math.min(to, lines.length)).join('\n') } }
}
