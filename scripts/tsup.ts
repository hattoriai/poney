/**
 * The build of every published package: ESM JavaScript and bundled type
 * declarations in dist/, one file per entry in package.json "exports".
 * Dependencies stay external (tsup reads them from package.json), so each
 * package ships only its own code. Run in a package: npm run build.
 */
import { readFileSync } from 'node:fs'
import type { Options } from 'tsup'

/** `entries` adds entries that are not exports, such as a CLI's bin targets. */
export function poneyBuild(options: Partial<Options> = {}, entries: Record<string, string> = {}): Options {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string | Record<string, string>> }
  // "./src/live/types.ts" → entry "live/types", built to dist/live/types.js and .d.ts.
  const entry: Record<string, string> = { ...entries }
  for (const target of Object.values(pkg.exports)) {
    const source = typeof target === 'string' ? target : target['poney-source']
    if (!source || !/\.tsx?$/.test(source)) continue
    entry[source.replace(/^\.\/src\//, '').replace(/\.tsx?$/, '')] = source
  }
  return {
    entry,
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    treeshake: true,
    target: 'es2022',
    outDir: 'dist',
    ...options,
  }
}
