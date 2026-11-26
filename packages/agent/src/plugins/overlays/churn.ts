import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Overlay, OverlayMark } from '../types'
import { covers } from './by-file'

/**
 * Recent changes: how many commits touched each part in the last 90 days,
 * from git. The parts that change most get the "attention" effect: that is
 * where the code moves, and where a reader should look twice.
 */

const DAYS = 90
/** The parts that change most: this many, if they changed at least MIN times. */
const TOP = 3
const MIN = 5

export const churnOverlay: Overlay = {
  id: 'churn',
  name: 'Recent changes',
  description: `How many commits touched each part in the last ${DAYS} days, from git.`,
  detect: (dir) => (existsSync(join(dir, '.git')) ? ['.git'] : []),
  async read(dir, doc) {
    const at = new Date().toISOString()
    let log = ''
    try {
      log = execFileSync('git', ['-C', dir, 'log', `--since=${DAYS} days ago`, '--name-only', '--format=%x00%H'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      return { title: 'Recent changes', at, marks: [], notes: ['This folder is not a git repository.'] }
    }
    const commits = log
      .split('\0')
      .filter(Boolean)
      .map((c) => c.split('\n').slice(1).filter(Boolean))
    const counts = new Map<string, number>()
    for (const e of doc.model.entities) {
      const refs = e.sourceRefs.map((s) => s.path)
      if (!refs.length) continue
      const n = commits.filter((files) => files.some((f) => refs.some((r) => covers(r, f)))).length
      if (n) counts.set(e.id, n)
    }
    const hot = new Set(
      [...counts.entries()]
        .filter(([, n]) => n >= MIN)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP)
        .map(([id]) => id),
    )
    const marks: OverlayMark[] = [...counts.entries()].map(([id, n]) => ({ target: `entity:${id}`, badge: { text: `${n} change${n === 1 ? '' : 's'} in ${DAYS} d` }, ...(hot.has(id) ? { effect: 'attention' as const } : {}) }))
    return { title: 'Recent changes', at, marks, notes: [`Read ${commits.length} commits from the last ${DAYS} days.`] }
  },
}
