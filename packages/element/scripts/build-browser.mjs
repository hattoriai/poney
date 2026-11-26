/**
 * Builds the files a page loads with no bundler and no Node at run time:
 * dist/browser/poney.js (one ES module: the element, the format, the layout
 * and the renderers, with ELK), poney.min.js, and poney.css (the diagrams'
 * stylesheet and the element's). Runs at release.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const js = { entryPoints: [here('../src/browser.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  // The other Poney packages from their source, as in this repository: the file never depends on their build order.
  conditions: ['poney-source'], legalComments: 'eof', logLevel: 'warning' }
await build({ ...js, outfile: here('../dist/browser/poney.js') })
await build({ ...js, outfile: here('../dist/browser/poney.min.js'), minify: true })
const css = { entryPoints: [here('./poney.css')], bundle: true, logLevel: 'warning', legalComments: 'none' }
await build({ ...css, outfile: here('../dist/browser/poney.css') })
