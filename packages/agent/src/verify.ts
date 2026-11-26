/**
 * Proof against the real code. In a change, the code a walkthrough shows must
 * be in the diff, with the line numbers it gives. In a tour, every excerpt
 * must be in the file at those lines. Cited tests and source references must
 * exist. The format cannot know the repository; these checks run when the
 * reader gives one (a git repository and revision, or a diff file).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CodeBlock, PoneyDocument, ValidationIssue } from '@hattoriai/poney-core'

/** The revision "working" means the files on disk, with changes not yet committed. */
export const WORKING = 'working'

/** Reads files at one revision of a repository. */
export interface FileSource {
  /** e.g. "~/code/notes at HEAD". */
  label: string
  read(path: string): string | undefined
  /** Every tracked file, for suggestions. */
  files(): string[]
}

export function filesAt(repo: string, rev: string): FileSource {
  const head = headOf(rev)
  const git = (args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  const cache = new Map<string, string | undefined>()
  let list: string[] | undefined
  return {
    label: `${repo} at ${head === WORKING ? 'the working tree' : head}`,
    read(path) {
      const clean = path.replace(/^\.\//, '')
      if (!cache.has(clean)) {
        try {
          if (head === WORKING) {
            const file = join(repo, clean)
            cache.set(clean, existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : undefined)
          } else cache.set(clean, git(['show', `${head}:${clean}`]))
        } catch {
          cache.set(clean, undefined)
        }
      }
      return cache.get(clean)
    },
    files() {
      try {
        list ??= git(head === WORKING ? ['ls-files', '--cached', '--others', '--exclude-standard'] : ['ls-tree', '-r', '--name-only', head]).split('\n').filter(Boolean)
      } catch {
        list = []
      }
      return list
    },
  }
}

/** A hint for a path that does not exist: files with the same name. */
function pathHint(path: string, source: FileSource): string {
  const name = path.split('/').pop() ?? path
  const like = source.files().filter((f) => f === name || f.endsWith(`/${name}`)).slice(0, 4)
  return like.length ? `Did you mean ${like.map((f) => `"${f}"`).join(' or ')}?` : 'Use a path relative to the root of the repository.'
}

interface FileDiff {
  added: Map<number, string>
  removed: Map<number, string>
  context: Map<number, string>
}

/** The unified diff of a commit, or of a range "a..b". */
export function diffFromGit(repo: string, rev: string): string {
  if (rev === WORKING) return execFileSync('git', ['-C', repo, 'diff', '--no-color', '--no-ext-diff', '--no-renames', '-U3', 'HEAD'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const args = rev.includes('..')
    ? ['diff', '--no-color', '--no-ext-diff', '--no-renames', '-U3', ...rev.split('..')]
    : ['show', '--no-color', '--no-ext-diff', '--no-renames', '-U3', '--format=', rev]
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** The commit whose files the walkthrough describes: the head of a range. */
export const headOf = (rev: string) => (rev.includes('..') ? rev.split('..')[1] || 'HEAD' : rev)

export function parseDiff(text: string): Map<string, FileDiff> {
  const files = new Map<string, FileDiff>()
  let file: FileDiff | undefined
  let oldN = 0
  let newN = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = undefined
      continue
    }
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '')
      file = { added: new Map(), removed: new Map(), context: new Map() }
      if (path !== '/dev/null') files.set(path, file)
      continue
    }
    if (line.startsWith('--- ')) continue
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      oldN = Number(hunk[1])
      newN = Number(hunk[2])
      continue
    }
    if (!file) continue
    if (line.startsWith('+')) file.added.set(newN++, line.slice(1))
    else if (line.startsWith('-')) file.removed.set(oldN++, line.slice(1))
    else if (line.startsWith(' ')) {
      file.context.set(newN, line.slice(1))
      oldN++
      newN++
    }
  }
  return files
}

const same = (a: string | undefined, b: string) => a !== undefined && a.trimEnd() === b.trimEnd()
const short = (t: string) => (t.length > 70 ? `${t.slice(0, 67)}…` : t)
/** The line with this text nearest to where the walkthrough says it is. */
const nearest = (lines: Map<number, string>, text: string, near = 0) =>
  [...lines.entries()].filter(([, t]) => same(t, text)).sort((a, b) => Math.abs(a[0] - near) - Math.abs(b[0] - near))[0]?.[0]

/** The lines of an excerpt must be in the file, at the numbers it gives. */
function excerptIssues(block: CodeBlock, at: string, source: FileSource, code: string): ValidationIssue[] {
  const content = source.read(block.path)
  if (content === undefined) return [{ path: `${at}.path`, message: `No file "${block.path}" in ${source.label}`, severity: 'error', code, hint: pathHint(block.path, source) }]
  const file = content.split('\n')
  const lines = new Map(file.map((t, i) => [i + 1, t]))
  const out: ValidationIssue[] = []
  block.hunks.forEach((h, hi) =>
    h.lines.forEach((l, li) => {
      if (l.kind !== 'ctx') return
      if (l.new !== undefined && same(lines.get(l.new), l.text)) return
      const n = nearest(lines, l.text, l.new)
      out.push({
        path: `${at}.hunks.${hi}.lines.${li}`,
        message: `Line ${l.new ?? '?'} of "${block.path}" is not "${short(l.text.trim())}"`,
        severity: 'error',
        code,
        hint: n ? `That text is at line ${n}.${l.new && n !== l.new ? ` Every line after it may be off by ${n - l.new} too.` : ''}` : l.new && l.new <= file.length ? `Line ${l.new} is: "${short((lines.get(l.new) ?? '').trim())}".` : `The file has ${file.length} lines.`,
      })
    }),
  )
  // One wrong start shifts every line: report the first, with the shift.
  return out.length > 3 ? [...out.slice(0, 3), { ...out[3], message: `${out.length - 3} more lines of "${block.path}" do not match`, hint: 'Copy the excerpt again from the file, with its first line number as "start".' }] : out
}

/** In a tour, every excerpt is checked against the file as it is. */
export function verifyExcerpts(doc: PoneyDocument, source: FileSource): ValidationIssue[] {
  return doc.walkthroughs.flatMap((w, wi) =>
    w.kind !== 'tour' ? [] : w.scenes.flatMap((s, si) => s.code.flatMap((block, ci) => excerptIssues(block, `walkthroughs.${wi}.scenes.${si}.code.${ci}`, source, 'code-not-in-file'))),
  )
}

/** Every code line shown must be in the diff, as the line it claims to be. Unchanged lines may also come from the file itself. */
export function verifyCode(doc: PoneyDocument, diffText: string, source?: FileSource): ValidationIssue[] {
  const files = parseDiff(diffText)
  const issues: ValidationIssue[] = []
  const error = (path: string, message: string, hint?: string) => issues.push({ path, message, severity: 'error', code: 'code-not-in-diff', ...(hint ? { hint } : {}) })
  const find = (path: string) => files.get(path) ?? [...files.entries()].find(([p]) => p.endsWith(`/${path}`) || path.endsWith(`/${p}`))?.[1]
  doc.walkthroughs.forEach((w, wi) =>
    w.kind === 'tour' ? undefined : w.scenes.forEach((s, si) =>
      s.code.forEach((block, ci) => {
        const at = `walkthroughs.${wi}.scenes.${si}.code.${ci}`
        const f = find(block.path)
        const excerpt = block.hunks.every((h) => h.lines.every((l) => l.kind === 'ctx'))
        if (excerpt && source && (!f || block.hunks.some((h) => h.lines.some((l) => l.new === undefined || !(same(f.context.get(l.new), l.text) || same(f.added.get(l.new), l.text))))))
          return void issues.push(...excerptIssues(block, at, source, 'code-not-in-file'))
        if (!f) return error(`${at}.path`, `"${block.path}" is not in the diff`, `Files in the diff: ${[...files.keys()].slice(0, 8).join(', ')}${files.size > 8 ? ', …' : ''}.`)
        block.hunks.forEach((h, hi) =>
          h.lines.forEach((l, li) => {
            const lp = `${at}.hunks.${hi}.lines.${li}`
            if (l.kind === 'add') {
              if (same(f.added.get(l.new ?? -1), l.text)) return
              const n = nearest(f.added, l.text, l.new)
              error(lp, `Added line ${l.new ?? '?'} is not "${short(l.text.trim())}"`, n ? `That text is added at line ${n}.` : f.added.has(l.new ?? -1) ? `Line ${l.new} adds: "${short((f.added.get(l.new!) ?? '').trim())}".` : 'The diff adds no such line. Show only lines the change adds.')
            } else if (l.kind === 'del') {
              if (same(f.removed.get(l.old ?? -1), l.text)) return
              const n = nearest(f.removed, l.text, l.old)
              error(lp, `Removed line ${l.old ?? '?'} is not "${short(l.text.trim())}"`, n ? `That text is removed at old line ${n}.` : 'The diff removes no such line.')
            } else {
              if (l.new !== undefined && (same(f.context.get(l.new), l.text) || same(f.added.get(l.new), l.text))) return
              if (l.new === undefined && [...f.context.values()].some((t) => same(t, l.text))) return
              const n = nearest(f.context, l.text, l.new)
              error(lp, `Context line ${l.new ?? '?'} is not "${short(l.text.trim())}"`, n ? `That text is at line ${n}.` : 'Context lines must be unchanged lines the diff shows around a change.')
            }
          }),
        )
      }),
    ),
  )
  return issues
}

/** Cited test files must exist and contain the named test. Source references on entities must point at real files and symbols. */
export function verifySources(doc: PoneyDocument, source: FileSource): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const looksLikePath = (p: string) => !/\s/.test(p) && /[/.]/.test(p)
  doc.walkthroughs.forEach((w, wi) =>
    w.scenes.forEach((s, si) =>
      s.proof.forEach((p, pi) => {
        if (!p.source || p.missing || !looksLikePath(p.source)) return
        const at = `walkthroughs.${wi}.scenes.${si}.proof.${pi}`
        const content = source.read(p.source)
        if (content === undefined) return issues.push({ path: `${at}.source`, message: `No file "${p.source}" in ${source.label}`, severity: 'error', code: 'proof-not-found', hint: `${pathHint(p.source, source)} Or mark the proof "missing": true.` })
        if (p.test && !content.includes(p.test))
          issues.push({ path: `${at}.test`, message: `"${p.source}" has no test "${p.test}"`, severity: 'error', code: 'proof-not-found', hint: 'Use the test name as it is written in the file.' })
      }),
    ),
  )
  doc.model.entities.forEach((e, ei) =>
    e.sourceRefs.forEach((r, ri) => {
      if (!looksLikePath(r.path)) return
      const at = `model.entities.${ei}.sourceRefs.${ri}`
      const content = source.read(r.path)
      if (content === undefined) {
        // A directory is a fair place to point at, for a module.
        const dir = r.path.replace(/\/$/, '')
        if (source.files().some((f) => f.startsWith(`${dir}/`))) return
        return issues.push({ path: `${at}.path`, message: `No file or folder "${r.path}" in ${source.label}`, severity: 'error', code: 'source-not-found', hint: pathHint(r.path, source) })
      }
      const lines = content.split('\n')
      if (r.line !== undefined && r.line > lines.length) issues.push({ path: `${at}.line`, message: `"${r.path}" has only ${lines.length} lines`, severity: 'error', code: 'source-not-found' })
      if (r.symbol && !content.includes(r.symbol.split(/[.#:]/).pop()!)) issues.push({ path: `${at}.symbol`, message: `"${r.path}" does not mention "${r.symbol}"`, severity: 'error', code: 'source-not-found', hint: 'Use the name as it is written in the file.' })
    }),
  )
  return issues
}
