/**
 * Builds the single-file stylesheets for apps without a bundler (or a CDN):
 * dist/poney.css (readable) and dist/poney.min.css (minified), each with all
 * parts of src/styles inlined. Apps with a bundler import
 * @poney/react/styles.css (the source) and let their build minify and
 * fingerprint it. Runs before publishing (prepack).
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const common = { entryPoints: [here('../src/styles/index.css')], bundle: true, logLevel: 'warning', legalComments: 'none' }

await build({ ...common, outfile: here('../dist/poney.css') })
await build({ ...common, outfile: here('../dist/poney.min.css'), minify: true })
