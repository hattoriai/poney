import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Overlay, OverlayMark } from '../types'
import { perEntity, relativeTo } from './by-file'

/**
 * Test coverage: the share of lines the tests run, per part. It reads the
 * report a test run leaves: lcov (most JavaScript tools, and many others),
 * Istanbul's JSON, SimpleCov (Ruby) or ExCoveralls JSON (Elixir). It does not
 * run the tests.
 */

type Lines = { covered: number; total: number }

const REPORTS = ['coverage/lcov.info', 'lcov.info', 'coverage/coverage-final.json', 'coverage/.resultset.json', 'cover/excoveralls.json', 'excoveralls.json']

/** Below this share, a part gets the "attention" effect. */
const LOW = 50

export const coverageOverlay: Overlay = {
  id: 'coverage',
  name: 'Test coverage',
  description: 'The share of lines the tests run, per part, from the last coverage report (lcov, Istanbul, SimpleCov, ExCoveralls).',
  detect: (dir) => REPORTS.filter((p) => existsSync(join(dir, p))),
  async read(dir, doc) {
    const report = this.detect(dir)[0]
    const at = new Date().toISOString()
    if (!report) return { title: 'Test coverage', at, marks: [], notes: ['No coverage report found. Run the tests with coverage first (for example coverage/lcov.info).'] }
    const files = readReport(dir, report)
    const parts = perEntity(doc, files, (items) => items.reduce((a, b) => ({ covered: a.covered + b.covered, total: a.total + b.total })))
    const marks: OverlayMark[] = []
    for (const [id, l] of parts) {
      if (!l.total) continue
      const pct = Math.round((100 * l.covered) / l.total)
      marks.push({ target: `entity:${id}`, badge: { text: `${pct}% tested`, tone: pct >= 80 ? 'malachite' : pct >= LOW ? 'ochre' : 'poney' }, ...(pct < LOW ? { effect: 'attention' as const } : {}) })
    }
    const notes = [`Read ${files.size} files from ${report}. ${marks.length} parts have source paths with coverage.`]
    return { title: 'Test coverage', at, marks, notes }
  },
}

function readReport(dir: string, report: string): Map<string, Lines> {
  const text = readFileSync(join(dir, report), 'utf8')
  const out = new Map<string, Lines>()
  const add = (path: string, covered: number, total: number) => {
    const p = relativeTo(dir, path)
    const cur = out.get(p) ?? { covered: 0, total: 0 }
    out.set(p, { covered: cur.covered + covered, total: cur.total + total })
  }
  if (report.endsWith('.info')) {
    let file = ''
    for (const line of text.split('\n')) {
      if (line.startsWith('SF:')) file = line.slice(3).trim()
      else if (line.startsWith('LH:')) add(file, Number(line.slice(3)), 0)
      else if (line.startsWith('LF:')) add(file, 0, Number(line.slice(3)))
    }
    return out
  }
  const json = JSON.parse(text) as Record<string, unknown>
  if (report.endsWith('coverage-final.json')) {
    // Istanbul: statement hits per file.
    for (const [path, f] of Object.entries(json as Record<string, { s?: Record<string, number> }>)) {
      const hits = Object.values(f.s ?? {})
      add(path, hits.filter((n) => n > 0).length, hits.length)
    }
  } else if (report.endsWith('.resultset.json')) {
    // SimpleCov: { "RSpec": { "coverage": { "/abs/file.rb": { "lines": [1, null, 0] } } } }, one entry per test command.
    for (const run of Object.values(json as Record<string, { coverage?: Record<string, { lines?: (number | null)[] } | (number | null)[]> }>))
      for (const [path, f] of Object.entries(run.coverage ?? {})) countLines(Array.isArray(f) ? f : (f.lines ?? []), (c, t) => add(path, c, t))
  } else {
    // ExCoveralls: { "source_files": [{ "name": "lib/x.ex", "coverage": [null, 1, 0] }] }
    for (const f of (json as { source_files?: { name: string; coverage: (number | null)[] }[] }).source_files ?? []) countLines(f.coverage, (c, t) => add(f.name, c, t))
  }
  return out
}

function countLines(lines: (number | null)[], done: (covered: number, total: number) => void) {
  const relevant = lines.filter((n): n is number => n !== null)
  done(relevant.filter((n) => n > 0).length, relevant.length)
}
