#!/usr/bin/env node
/**
 * One version for every published Poney package.
 *
 *   node scripts/version.mjs 0.2.0           sets it in each package.json, and wherever a package or an app depends on one
 *   node scripts/version.mjs --check 0.2.0   fails unless every package has it (the release workflow runs this)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [flag, value] = process.argv[2] === '--check' ? ['check', process.argv[3]] : ['set', process.argv[2]]
if (!value || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(value)) {
  console.error('Usage: node scripts/version.mjs [--check] <version>, e.g. 0.2.0')
  process.exit(2)
}

const root = new URL('..', import.meta.url).pathname
// The packages, and the apps (private), whose dependencies on the packages follow the version too.
const inside = (folder) => readdirSync(join(root, folder)).map((d) => join(root, folder, d, 'package.json'))
const manifests = [...inside('packages'), ...inside('apps')]
const packages = manifests.map((path) => ({ path, json: JSON.parse(readFileSync(path, 'utf8')) })).filter((p) => !p.json.private)
const names = new Set(packages.map((p) => p.json.name))

if (flag === 'check') {
  const wrong = packages.filter((p) => p.json.version !== value).map((p) => `${p.json.name} is ${p.json.version}`)
  if (wrong.length) {
    console.error(`Not every package is ${value}: ${wrong.join(', ')}`)
    process.exit(1)
  }
  console.log(`Every package is ${value}.`)
} else {
  for (const p of manifests.map((path) => ({ path, json: JSON.parse(readFileSync(path, 'utf8')) }))) {
    if (!p.json.private) p.json.version = value
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'])
      for (const dep of Object.keys(p.json[field] ?? {})) if (names.has(dep)) p.json[field][dep] = value
    writeFileSync(p.path, `${JSON.stringify(p.json, null, 2)}\n`)
  }
  console.log(`Set ${value} in ${packages.length} packages. Run npm install to update the lock file.`)
}
