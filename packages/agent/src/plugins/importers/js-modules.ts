import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import type { Entity, Relationship } from '@hattoriai/poney-core'
import { listFiles } from '../files'
import { slug, type ImportResult, type Importer } from '../types'

/**
 * JavaScript and TypeScript modules: who imports whom. A module is a folder
 * at the top of a package's source (src/schema, src/live…); in a workspace
 * (npm, pnpm or yarn workspaces), each package is a group with its modules
 * inside. It reads import, export…from, require() and import() with a
 * literal path; relative paths, workspace packages and tsconfig "paths" are
 * followed, other packages (npm dependencies) are left out. Tests are left
 * out too.
 */

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const TEST = /(\.(test|spec|stories)\.[cm]?[jt]sx?$)|(^|\/)(__tests__|__mocks__|test|tests|e2e)\//
const IMPORT = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs']
/** Folders that hold a package's source; a module is the folder below them. */
const SOURCE_ROOTS = ['src', 'lib', 'app', 'source']
/** More modules than this and the view shows the packages closed. */
const OPEN_LIMIT = 14

interface Package {
  dir: string // relative to the folder; '' for the root
  name: string
  paths: { prefix: string; target: string }[]
}

export const jsModulesImporter: Importer = {
  id: 'js-modules',
  name: 'JavaScript and TypeScript modules',
  description: 'Modules (top folders of each package) and who imports whom, from import and require statements.',
  detect(dir) {
    if (!existsSync(join(dir, 'package.json'))) return []
    return listFiles(dir, (p) => SOURCE.test(p) && !TEST.test(p)).length ? ['package.json'] : []
  },
  async run(dir) {
    const files = listFiles(dir, (p) => SOURCE.test(p) && !TEST.test(p) && !p.endsWith('.d.ts'))
    const fileSet = new Set(files)
    const packages = findPackages(dir, listFiles(dir, (p) => p === 'package.json' || p.endsWith('/package.json')))
    const packageOf = (file: string) => packages.filter((p) => p.dir === '' || file.startsWith(`${p.dir}/`)).sort((a, b) => b.dir.length - a.dir.length)[0]
    const workspace = packages.length > 1

    /** The module a file belongs to: its package, and the folder below the package's source root. */
    const moduleOf = (file: string) => {
      const pkg = packageOf(file)
      const rest = (pkg.dir ? file.slice(pkg.dir.length + 1) : file).split('/')
      const root = rest.length > 1 && SOURCE_ROOTS.includes(rest[0]) ? 1 : 0
      const folder = rest.length - 1 > root ? rest[root] : '(top)'
      const path = [pkg.dir, ...rest.slice(0, root), folder === '(top)' ? '' : folder].filter(Boolean).join('/')
      return { pkg, folder, path, key: `${pkg.dir}|${folder}` }
    }

    const resolve = (from: string, spec: string): string | undefined => {
      const pkg = packageOf(from)
      let base: string | undefined
      if (spec.startsWith('.')) base = normalize(join(dirname(from), spec))
      else {
        const alias = pkg.paths.find((p) => spec === p.prefix || spec.startsWith(p.prefix))
        if (alias) base = normalize(join(alias.target, spec.slice(alias.prefix.length)))
        else {
          const target = packages.find((p) => p.name && (spec === p.name || spec.startsWith(`${p.name}/`)))
          if (!target) return undefined
          const sub = spec.slice(target.name.length).replace(/^\//, '')
          base = sub ? join(target.dir, sub) : join(target.dir, 'src/index')
          if (!sub && !EXTENSIONS.some((e) => fileSet.has(`${base}${e}`))) base = join(target.dir, 'index')
        }
      }
      // TypeScript in ESM imports "./x.js" for "./x.ts".
      const candidates = [base, base.replace(/\.(m|c)?js$/, '')]
      for (const c of candidates) for (const e of EXTENSIONS) if (fileSet.has(`${c}${e}`)) return `${c}${e}`
      return undefined
    }

    const modules = new Map<string, ReturnType<typeof moduleOf> & { files: number }>()
    const edges = new Map<string, number>()
    let unresolved = 0
    for (const file of files) {
      const from = moduleOf(file)
      modules.set(from.key, { ...from, files: (modules.get(from.key)?.files ?? 0) + 1 })
      const text = readFileSync(join(dir, file), 'utf8')
      for (const m of text.matchAll(IMPORT)) {
        const spec = m[1] ?? m[2] ?? m[3]
        const target = resolve(file, spec)
        if (!target) {
          if (spec.startsWith('.')) unresolved++
          continue
        }
        const to = moduleOf(target)
        if (to.key === from.key) continue
        const key = `${from.key}→${to.key}`
        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
    }

    const pkgId = (p: Package) => `pkg-${slug(p.name || p.dir || 'root')}`
    const modId = (m: { pkg: Package; folder: string }) => (workspace ? `${pkgId(m.pkg).slice(4)}-${slug(m.folder)}` : slug(m.folder))
    const usedPackages = workspace ? [...new Set([...modules.values()].map((m) => m.pkg))] : []
    const entities: Entity[] = [
      ...usedPackages.map((p) => ({ id: pkgId(p), kind: 'library', name: p.name || p.dir || 'root', summary: `The package in ${p.dir || 'the root folder'}.`, tags: [], sourceRefs: [{ path: p.dir || '.' }], metadata: {}, ext: {} })),
      ...[...modules.values()].map((m) => ({
        id: modId(m),
        kind: 'component',
        name: m.folder,
        summary: `${m.files} file${m.files === 1 ? '' : 's'} in ${m.path || 'the root folder'}.`,
        ...(workspace ? { parent: pkgId(m.pkg) } : {}),
        tags: [],
        sourceRefs: [{ path: m.path || '.' }],
        metadata: { files: m.files },
        ext: {},
      })),
    ]
    const relationships: Relationship[] = [...edges.entries()].map(([key, count]) => {
      const [a, b] = key.split('→').map((k) => modules.get(k)!)
      return { id: `${modId(a)}-imports-${modId(b)}`, kind: 'depends-on', source: modId(a), target: modId(b), label: 'Imports', data: [], metadata: { imports: count }, ext: {} }
    })
    const ids = entities.map((e) => e.id)
    const closed = workspace && modules.size > OPEN_LIMIT
    const views = entities.length
      ? [
          {
            id: 'modules',
            type: 'architecture',
            title: 'Modules',
            description: workspace ? 'Each package and its modules, and who imports whom. Open a package to see its modules.' : 'The modules of the code, and who imports whom.',
            category: 'structure',
            entities: ids,
            ...(closed ? { collapsed: usedPackages.map(pkgId) } : {}),
          },
        ]
      : []
    const notes = [`Read ${files.length} source files in ${workspace ? `${usedPackages.length} packages` : 'one package'}: ${modules.size} modules, ${relationships.length} import links. Tests and npm dependencies are left out.`]
    if (unresolved) notes.push(`${unresolved} relative imports did not resolve to a file (generated code, or files git ignores).`)
    return { entities, relationships, dataTypes: [], dataRelations: [], views, notes } satisfies ImportResult
  },
}

/** Packages with a package.json, with their tsconfig "paths" aliases. */
function findPackages(dir: string, manifests: string[]): Package[] {
  const out: Package[] = []
  for (const m of manifests) {
    const pkgDir = m === 'package.json' ? '' : m.slice(0, -'/package.json'.length)
    let name = ''
    try {
      name = (JSON.parse(readFileSync(join(dir, m), 'utf8')) as { name?: string }).name ?? ''
    } catch {
      continue
    }
    out.push({ dir: pkgDir, name, paths: tsPaths(dir, pkgDir) })
  }
  if (!out.some((p) => p.dir === '')) out.push({ dir: '', name: '', paths: tsPaths(dir, '') })
  return out
}

/** "@/*": ["./src/*"] in a package's tsconfig, as prefix → folder (relative to the root folder). */
function tsPaths(dir: string, pkgDir: string): Package['paths'] {
  const file = join(dir, pkgDir, 'tsconfig.json')
  if (!existsSync(file)) return []
  try {
    // tsconfig allows comments and trailing commas.
    const text = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1')
    const options = (JSON.parse(text) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }).compilerOptions ?? {}
    return Object.entries(options.paths ?? {})
      .filter(([k, v]) => k.endsWith('*') && v[0]?.endsWith('*'))
      .map(([k, v]) => ({ prefix: k.slice(0, -1), target: normalize(join(pkgDir, options.baseUrl ?? '.', v[0].slice(0, -1))) }))
  } catch {
    return []
  }
}
