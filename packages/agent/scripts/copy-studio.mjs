/**
 * Puts the built Studio inside this package (studio/), so `poney studio`
 * serves it when installed from npm. Build the Studio first
 * (npm run build -w @hattoriai/poney-studio); npm run build:packages does both.
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../../../apps/studio/dist', import.meta.url))
const to = fileURLToPath(new URL('../studio', import.meta.url))
if (!existsSync(`${from}/index.html`)) {
  console.error('The Studio is not built: run npm run build -w @hattoriai/poney-studio first.')
  process.exit(1)
}
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
console.log('Copied the Studio into packages/agent/studio')
