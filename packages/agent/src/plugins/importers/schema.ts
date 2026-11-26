import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DataRelation, DataType } from '@hattoriai/poney-core'
import { listFiles } from '../files'
import { slug, type ImportOptions, type ImportResult, type Importer } from '../types'

/**
 * Database schema: tables, columns, primary and foreign keys, from the
 * schema file a project keeps: Rails `db/schema.rb`, SQL DDL (`structure.sql`,
 * `schema.sql`, a pg_dump), or Prisma `schema.prisma`. It adds a table per
 * table, a relation per foreign key, and an ERD view when the schema is small
 * enough to read in one picture.
 */

interface Column {
  name: string
  type: string
  primaryKey?: boolean
  nullable?: boolean
  unique?: boolean
  references?: { table: string; column: string }
}
interface Table {
  name: string
  columns: Column[]
}

/** The most tables one ERD view shows; a bigger schema gets no view, and a note. */
const VIEW_LIMIT = 40

const CANDIDATES = ['db/schema.rb', 'db/structure.sql', 'prisma/schema.prisma', 'schema.prisma', 'db/schema.sql', 'schema.sql', 'sql/schema.sql']

export const schemaImporter: Importer = {
  id: 'schema',
  name: 'Database schema',
  description: 'Tables, columns and foreign keys from db/schema.rb, a SQL schema or schema.prisma.',
  detect(dir) {
    const found = CANDIDATES.filter((p) => existsSync(join(dir, p)))
    if (found.length) return found
    return listFiles(dir, (p) => /(^|\/)(schema|structure)\.(sql|rb|prisma)$/.test(p) && !p.includes('node_modules/')).slice(0, 5)
  },
  async run(dir, options: ImportOptions = {}) {
    const path = options.path ?? this.detect(dir)[0]
    if (!path) return { entities: [], relationships: [], dataTypes: [], dataRelations: [], views: [], notes: ['No schema file found: db/schema.rb, a .sql schema, or schema.prisma.'] }
    const text = readFileSync(join(dir, path), 'utf8')
    const tables = path.endsWith('.rb') ? parseRailsSchema(text) : path.endsWith('.prisma') ? parsePrisma(text) : parseSql(text)
    return toImport(tables, path, options.store)
  },
}

function toImport(tables: Table[], path: string, store?: string): ImportResult {
  const id = (table: string) => slug(table)
  const known = new Set(tables.map((t) => t.name))
  const dataTypes: DataType[] = tables.map((t) => ({
    id: id(t.name),
    kind: 'table',
    name: t.name,
    summary: `The ${t.name} table.`,
    fields: t.columns.map((c) => ({
      name: c.name,
      type: c.type,
      primaryKey: !!c.primaryKey,
      nullable: !!c.nullable,
      unique: !!c.unique,
      ...(c.references && known.has(c.references.table) ? { references: { dataType: id(c.references.table), field: c.references.column } } : {}),
    })),
    ...(store ? { storedIn: store } : {}),
    sourceRefs: [{ path }],
    ext: {},
  }))
  const dataRelations: DataRelation[] = tables.flatMap((t) =>
    t.columns
      .filter((c) => c.references && known.has(c.references.table))
      .map((c) => ({
        id: `${id(t.name)}-${slug(c.name)}`,
        from: id(t.name),
        to: id(c.references!.table),
        fromCardinality: 'many' as const,
        toCardinality: c.nullable ? ('zero-or-one' as const) : ('one' as const),
        label: `${c.name}`,
        via: c.name,
        logical: false,
      })),
  )
  const notes = [`Read ${tables.length} tables and ${dataRelations.length} foreign keys from ${path}.`]
  const views =
    tables.length && tables.length <= VIEW_LIMIT
      ? [{ id: 'database-schema', type: 'erd', title: 'Database schema', description: `Every table in ${path}, and the foreign keys between them.`, category: 'data', dataTypes: dataTypes.map((d) => d.id) }]
      : []
  if (tables.length > VIEW_LIMIT) notes.push(`No ERD view: ${tables.length} tables is too many for one picture. Make views of the tables that matter.`)
  return { entities: [], relationships: [], dataTypes, dataRelations, views, notes }
}

// ─── Rails db/schema.rb ─────────────────────────────────────────────────────

const RAILS_TYPE: Record<string, string> = { bigint: 'bigint', integer: 'integer', string: 'string', text: 'text', boolean: 'boolean', datetime: 'datetime', date: 'date', decimal: 'decimal', float: 'float', jsonb: 'jsonb', json: 'json', uuid: 'uuid', binary: 'binary', timestamp: 'timestamp', time: 'time', inet: 'inet', citext: 'citext', enum: 'enum' }

export function parseRailsSchema(text: string): Table[] {
  const tables: Table[] = []
  const byName = new Map<string, Table>()
  const lines = text.split('\n')
  let current: Table | undefined
  for (const raw of lines) {
    const line = raw.trim()
    const create = /^create_table\s+"([^"]+)"(.*)\bdo\s*\|t\|/.exec(line)
    if (create) {
      const opts = create[2]
      current = { name: create[1], columns: [] }
      // Rails adds an integer or bigint "id" unless the table says id: false.
      if (!/\bid:\s*false\b/.test(opts)) {
        const type = /\bid:\s*:(\w+)/.exec(opts)?.[1] ?? /\bid:\s*"(\w+)"/.exec(opts)?.[1] ?? 'bigint'
        current.columns.push({ name: 'id', type, primaryKey: true })
      }
      tables.push(current)
      byName.set(current.name, current)
      continue
    }
    if (!current) {
      const fk = /^add_foreign_key\s+"([^"]+)",\s*"([^"]+)"(.*)$/.exec(line)
      if (fk) {
        const table = byName.get(fk[1])
        const column = /\bcolumn:\s*"([^"]+)"/.exec(fk[3])?.[1] ?? `${singular(fk[2])}_id`
        const primary = /\bprimary_key:\s*"([^"]+)"/.exec(fk[3])?.[1] ?? 'id'
        const col = table?.columns.find((c) => c.name === column)
        if (col) col.references = { table: fk[2], column: primary }
      }
      continue
    }
    if (line === 'end') {
      current = undefined
      continue
    }
    const col = /^t\.(\w+)\s+"([^"]+)"(.*)$/.exec(line)
    if (col && col[1] !== 'index') {
      current.columns.push({ name: col[2], type: RAILS_TYPE[col[1]] ?? col[1], nullable: !/\bnull:\s*false\b/.test(col[3]) })
      continue
    }
    const index = /^t\.index\s+\["([^"]+)"\](.*)$/.exec(line)
    if (index && /\bunique:\s*true\b/.test(index[2])) {
      const c = current.columns.find((x) => x.name === index[1])
      if (c) c.unique = true
    }
  }
  return tables
}

/** Rails' table → model name rule, for the default foreign key column: "posts" → "post". */
function singular(word: string): string {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y')
  if (/(ss|sh|ch|x|z)es$/.test(word)) return word.replace(/es$/, '')
  if (/s$/.test(word) && !/ss$/.test(word)) return word.replace(/s$/, '')
  return word
}

// ─── SQL DDL ────────────────────────────────────────────────────────────────

/** The last part of a possibly qualified, possibly quoted name: public."Users" → Users. */
const bare = (name: string) => name.trim().split('.').pop()!.replace(/^["`[]|["`\]]$/g, '')

/** Splits on commas that are not inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

/** The text inside the parentheses that open at `start`. */
function inside(s: string, start: number): { body: string; end: number } {
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')' && --depth === 0) return { body: s.slice(start + 1, i), end: i }
  }
  return { body: s.slice(start + 1), end: s.length }
}

const names = (list: string) => list.split(',').map(bare)

export function parseSql(text: string): Table[] {
  const sql = text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const tables = new Map<string, Table>()
  const create = /create\s+(?:unlogged\s+|temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)\s*\(/gi
  for (let m = create.exec(sql); m; m = create.exec(sql)) {
    const { body, end } = inside(sql, m.index + m[0].length - 1)
    create.lastIndex = end
    const table: Table = { name: bare(m[1]), columns: [] }
    for (const part of splitTop(body)) {
      const constraint = part.replace(/^constraint\s+[\w"`]+\s+/i, '')
      const pk = /^primary\s+key\s*\(([^)]+)\)/i.exec(constraint)
      const fk = /^foreign\s+key\s*\(([^)]+)\)\s*references\s+([\w."`[\]]+)\s*\(([^)]+)\)/i.exec(constraint)
      const uq = /^unique\s*\(([^)]+)\)/i.exec(constraint)
      if (pk) names(pk[1]).forEach((n) => mark(table, n, { primaryKey: true }))
      else if (fk) names(fk[1]).forEach((n, i) => mark(table, n, { references: { table: bare(fk[2]), column: names(fk[3])[i] ?? 'id' } }))
      else if (uq) {
        const cols = names(uq[1])
        if (cols.length === 1) mark(table, cols[0], { unique: true })
      } else if (!/^(check|exclude|index|key)\b/i.test(constraint)) {
        const col = /^([\w"`[\]]+)\s+([\s\S]*)$/.exec(part)
        if (!col || /^like\b/i.test(part)) continue
        // The type runs to the first constraint keyword: "character varying(255) NOT NULL" → "character varying(255)".
        const at = col[2].search(/\s(not\s+null|null|primary\s+key|references|default|unique|check|constraint|generated|collate)\b/i)
        const type = (at < 0 ? col[2] : col[2].slice(0, at)).trim()
        const rest = at < 0 ? '' : col[2].slice(at)
        const ref = /references\s+([\w."`[\]]+)\s*(?:\(([^)]+)\))?/i.exec(rest)
        table.columns.push({
          name: bare(col[1]),
          type: type.toLowerCase(),
          primaryKey: /primary\s+key/i.test(rest),
          nullable: !/not\s+null|primary\s+key/i.test(rest),
          unique: /\bunique\b/i.test(rest),
          ...(ref ? { references: { table: bare(ref[1]), column: ref[2] ? bare(ref[2]) : 'id' } } : {}),
        })
      }
    }
    tables.set(table.name, table)
  }
  // pg_dump adds keys after the tables: ALTER TABLE ONLY public.posts ADD CONSTRAINT … FOREIGN KEY (user_id) REFERENCES public.users(id);
  const alter = /alter\s+table\s+(?:only\s+)?([\w."`[\]]+)\s+add\s+constraint\s+[\w"`]+\s+(primary\s+key|unique|foreign\s+key)\s*\(([^)]+)\)(?:\s*references\s+([\w."`[\]]+)\s*\(([^)]+)\))?/gi
  for (let m = alter.exec(sql); m; m = alter.exec(sql)) {
    const table = tables.get(bare(m[1]))
    if (!table) continue
    const cols = names(m[3])
    const kind = m[2].toLowerCase().replace(/\s+/g, ' ')
    if (kind === 'primary key') cols.forEach((n) => mark(table, n, { primaryKey: true }))
    else if (kind === 'unique' && cols.length === 1) mark(table, cols[0], { unique: true })
    else if (kind === 'foreign key' && m[4]) cols.forEach((n, i) => mark(table, n, { references: { table: bare(m[4]), column: names(m[5])[i] ?? 'id' } }))
  }
  return [...tables.values()]
}

function mark(table: Table, column: string, patch: Partial<Column>) {
  const c = table.columns.find((x) => x.name === column)
  if (!c) return
  Object.assign(c, patch)
  if (patch.primaryKey) c.nullable = false
}

// ─── Prisma ─────────────────────────────────────────────────────────────────

export function parsePrisma(text: string): Table[] {
  const models = [...text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
  const modelNames = new Set(models.map((m) => m[1]))
  const tables: Table[] = []
  for (const [, name, body] of models) {
    const table: Table = { name, columns: [] }
    const relations: { fields: string[]; table: string; references: string[] }[] = []
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim()
      if (!line || line.startsWith('@@')) {
        const id = /^@@id\(\[([^\]]+)\]/.exec(line)
        if (id) id[1].split(',').forEach((n) => mark(table, n.trim(), { primaryKey: true }))
        const uq = /^@@unique\(\[([^\]]+)\]/.exec(line)
        if (uq && !uq[1].includes(',')) mark(table, uq[1].trim(), { unique: true })
        continue
      }
      const m = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(line)
      if (!m) continue
      const [, field, type, list, optional, attrs] = m
      if (modelNames.has(type)) {
        // A relation field: it names another model; the column is in `fields`.
        const rel = /@relation\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\]/.exec(attrs)
        if (rel && !list) relations.push({ fields: rel[1].split(',').map((s) => s.trim()), table: type, references: rel[2].split(',').map((s) => s.trim()) })
        continue
      }
      table.columns.push({ name: field, type: `${type}${list ? '[]' : ''}`, primaryKey: /@id\b/.test(attrs), nullable: !!optional, unique: /@unique\b/.test(attrs) })
    }
    relations.forEach((r) => r.fields.forEach((f, i) => mark(table, f, { references: { table: r.table, column: r.references[i] ?? 'id' } })))
    tables.push(table)
  }
  return tables
}
