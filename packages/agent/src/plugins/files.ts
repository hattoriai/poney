import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'vendor', 'tmp', '_build', 'deps', '.next'])

/**
 * The files of a folder, relative to it: what git tracks and would track,
 * else a walk that skips dependency and build folders.
 */
export function listFiles(dir: string, match: (path: string) => boolean): string[] {
  try {
    const out = execFileSync('git', ['-C', dir, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    return out.split('\n').filter((p) => p && match(p))
  } catch {
    const out: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.') && e.name !== '.') continue
        const path = join(d, e.name)
        if (e.isDirectory()) {
          if (!SKIP.has(e.name)) walk(path)
        } else if (match(relative(dir, path))) out.push(relative(dir, path))
      }
    }
    walk(dir)
    return out
  }
}
