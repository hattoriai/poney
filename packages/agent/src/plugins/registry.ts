import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { definePlugin, type Importer, type Overlay, type PoneyPlugin } from './types'
import { schemaImporter } from './importers/schema'
import { jsModulesImporter } from './importers/js-modules'
import { coverageOverlay } from './overlays/coverage'
import { churnOverlay } from './overlays/churn'

/** What Poney brings. */
export const BUILT_IN = definePlugin({ name: 'poney', importers: [schemaImporter, jsModulesImporter], overlays: [coverageOverlay, churnOverlay] })

/**
 * The person's own plugins, listed in ~/.poney/plugins.json (or the file
 * PONEY_PLUGINS names):
 *
 *   { "plugins": ["/path/to/my-plugin.mjs", "poney-plugin-sentry"] }
 *
 * Each is a module whose default export is a plugin (see definePlugin).
 * Plugins run code on this computer, so the list lives in the person's home
 * folder, never in a project: opening or cloning a repository never loads
 * its code.
 */
export const pluginsFile = () => process.env.PONEY_PLUGINS ?? join(homedir(), '.poney', 'plugins.json')

export interface Plugins {
  plugins: PoneyPlugin[]
  importers: Importer[]
  overlays: Overlay[]
  /** Plugins that did not load, and why. */
  problems: string[]
}

let loaded: Promise<Plugins> | undefined

/** The built-in plugins and the person's own, loaded once. */
export function plugins(): Promise<Plugins> {
  return (loaded ??= load())
}

/** For tests: forget what was loaded. */
export const resetPlugins = () => (loaded = undefined)

async function load(): Promise<Plugins> {
  const all: PoneyPlugin[] = [BUILT_IN]
  const problems: string[] = []
  const file = pluginsFile()
  if (existsSync(file)) {
    let list: unknown = []
    try {
      list = (JSON.parse(readFileSync(file, 'utf8')) as { plugins?: unknown }).plugins ?? []
    } catch (e) {
      problems.push(`${file} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
    for (const spec of Array.isArray(list) ? list : []) {
      if (typeof spec !== 'string') continue
      try {
        const mod = (await import(isAbsolute(spec) ? pathToFileURL(spec).href : spec)) as { default?: PoneyPlugin }
        const plugin = mod.default
        if (!plugin || typeof plugin.name !== 'string') throw new Error('its default export is not a plugin (use definePlugin)')
        all.push(plugin)
      } catch (e) {
        problems.push(`The plugin "${spec}" did not load: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  // A later plugin with the same id replaces an earlier one, so a person can swap a built-in.
  const byId = <T extends { id: string }>(items: T[]) => [...new Map(items.map((x) => [x.id, x])).values()]
  return {
    plugins: all,
    importers: byId(all.flatMap((p) => p.importers ?? [])),
    overlays: byId(all.flatMap((p) => p.overlays ?? [])),
    problems,
  }
}
