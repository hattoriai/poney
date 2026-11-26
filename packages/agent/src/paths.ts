/**
 * Where this package's files are, the same whether it runs from src/ (in the
 * Poney repository) or from dist/ (installed from npm).
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(import.meta.url)

/** The package's root folder: the nearest folder up with a package.json. */
export const PACKAGE_ROOT = (() => {
  let dir = dirname(here)
  while (!existsSync(join(dir, 'package.json'))) {
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return dir
})()

export const packagePath = (...parts: string[]) => join(PACKAGE_ROOT, ...parts)

/** Running from source, in the repository (not from dist/, installed). */
export const fromSource = here.includes(`${sep}src${sep}`)

/**
 * How to start the MCP server. Installed: its bin. In the repository: the
 * source, with the workspace packages' source ("poney-source") and tsx,
 * found by absolute path, since an agent may start it in any folder.
 */
export function mcpCommand(): { command: string; args: string[] } {
  if (!fromSource) return { command: 'node', args: [packagePath('bin', 'poney-mcp.mjs')] }
  return { command: 'node', args: ['--conditions=poney-source', '--import', tsxLoader(), packagePath('src', 'mcp.ts')] }
}

/** tsx's loader, as a file URL (its package's "." export), so `--import` finds it from any folder. */
function tsxLoader(): string {
  const manifest = createRequire(import.meta.url).resolve('tsx/package.json')
  const target = (JSON.parse(readFileSync(manifest, 'utf8')) as { exports: { '.': string | { import?: string; default?: string } } }).exports['.']
  const entry = typeof target === 'string' ? target : (target.import ?? target.default ?? './dist/loader.mjs')
  return pathToFileURL(join(dirname(manifest), entry)).href
}

/** The built Studio: inside the package when installed; the Studio app's build in the repository. */
export const studioDist = () => (existsSync(packagePath('studio', 'index.html')) ? packagePath('studio') : packagePath('..', '..', 'apps', 'studio', 'dist'))
