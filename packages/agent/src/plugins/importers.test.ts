import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validateDocument } from '@hattoriai/poney-core'
import { parsePrisma, parseRailsSchema, parseSql, schemaImporter } from './importers/schema'
import { jsModulesImporter } from './importers/js-modules'
import { mergeImport } from './merge'

const project = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'poney-import-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

const RAILS = `ActiveRecord::Schema[7.1].define(version: 2024_01_01) do
  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "name"
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  create_table "posts", id: :uuid, force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "editor_id"
    t.text "body"
  end

  create_table "tags_posts", id: false, force: :cascade do |t|
    t.uuid "post_id"
  end

  add_foreign_key "posts", "users"
  add_foreign_key "posts", "users", column: "editor_id"
  add_foreign_key "tags_posts", "posts"
end
`

describe('the schema importer', () => {
  it('reads Rails db/schema.rb: implicit ids, null: false, unique indexes and foreign keys', () => {
    const t = parseRailsSchema(RAILS)
    expect(t.map((x) => x.name)).toEqual(['users', 'posts', 'tags_posts'])
    expect(t[0].columns).toEqual([
      { name: 'id', type: 'bigint', primaryKey: true },
      { name: 'email', type: 'string', nullable: false, unique: true },
      { name: 'name', type: 'string', nullable: true },
    ])
    expect(t[1].columns[0]).toEqual({ name: 'id', type: 'uuid', primaryKey: true })
    expect(t[1].columns.find((c) => c.name === 'editor_id')?.references).toEqual({ table: 'users', column: 'id' })
    expect(t[2].columns).toEqual([{ name: 'post_id', type: 'uuid', nullable: true, references: { table: 'posts', column: 'id' } }])
  })

  it('reads SQL: inline and table constraints, and pg_dump keys added later', () => {
    const t = parseSql(`
      CREATE TABLE public.users (id bigint NOT NULL, email character varying(255) NOT NULL UNIQUE, created_at timestamp without time zone);
      CREATE TABLE IF NOT EXISTS "orders" (
        id serial PRIMARY KEY,
        user_id bigint REFERENCES users(id),
        total numeric(10,2) DEFAULT 0 NOT NULL, -- in cents
        CONSTRAINT orders_total CHECK (total >= 0)
      );
      CREATE TABLE lines (order_id int, n int, PRIMARY KEY (order_id, n), FOREIGN KEY (order_id) REFERENCES orders (id));
      ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
    `)
    expect(t.map((x) => x.name)).toEqual(['users', 'orders', 'lines'])
    expect(t[0].columns).toMatchObject([
      { name: 'id', type: 'bigint', primaryKey: true, nullable: false },
      { name: 'email', type: 'character varying(255)', nullable: false, unique: true },
      { name: 'created_at', type: 'timestamp without time zone', nullable: true },
    ])
    expect(t[1].columns.map((c) => [c.name, c.type, !!c.primaryKey, c.references?.table])).toEqual([
      ['id', 'serial', true, undefined],
      ['user_id', 'bigint', false, 'users'],
      ['total', 'numeric(10,2)', false, undefined],
    ])
    expect(t[2].columns.map((c) => [c.name, !!c.primaryKey, c.references?.table])).toEqual([
      ['order_id', true, 'orders'],
      ['n', true, undefined],
    ])
  })

  it('reads Prisma models and their relations', () => {
    const t = parsePrisma(`model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  posts Post[]
}

model Post {
  id       Int   @id
  author   User? @relation(fields: [authorId], references: [id])
  authorId Int?
}
`)
    expect(t[0].columns).toEqual([
      { name: 'id', type: 'Int', primaryKey: true, nullable: false, unique: false },
      { name: 'email', type: 'String', primaryKey: false, nullable: false, unique: true },
    ])
    expect(t[1].columns[1]).toMatchObject({ name: 'authorId', nullable: true, references: { table: 'User', column: 'id' } })
  })

  it('adds tables, relations and an ERD view that make a valid document, and keeps what is there on a second run', async () => {
    const dir = project({ 'db/schema.rb': RAILS })
    expect(schemaImporter.detect(dir)).toEqual(['db/schema.rb'])
    const result = await schemaImporter.run(dir, { store: 'db' })
    const first = mergeImport(undefined, result, { id: 'blog', name: 'Blog', description: '' })
    expect(first.report.added).toEqual({ entities: 0, relationships: 0, dataTypes: 3, dataRelations: 3, views: 1 })
    // The store "db" is not in the document: the tables come without it.
    expect(first.document.model.dataTypes[0].storedIn).toBeUndefined()
    const v = validateDocument(first.document)
    expect(v.issues.filter((i) => i.severity === 'error')).toEqual([])
    first.document.model.dataTypes[0].summary = 'People who write.'
    const again = mergeImport(first.document, result)
    expect(again.report).toMatchObject({ added: { dataTypes: 0, views: 0 }, kept: 7 })
    expect(again.document.model.dataTypes[0].summary).toBe('People who write.')
  })
})

describe('the JS modules importer', () => {
  it('groups files into modules per package and follows relative, workspace and alias imports', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }),
      'packages/core/package.json': JSON.stringify({ name: '@acme/core' }),
      'packages/core/src/index.ts': "export * from './model/thing'\n",
      'packages/core/src/model/thing.ts': "import { x } from '../util/x.js'\nexport const thing = x\n",
      'packages/core/src/util/x.ts': 'export const x = 1\n',
      'packages/core/src/util/x.test.ts': "import { thing } from '../model/thing'\n",
      'packages/app/package.json': JSON.stringify({ name: '@acme/app' }),
      'packages/app/tsconfig.json': '{ // paths\n "compilerOptions": { "paths": { "@/*": ["./src/*"] }, },\n}',
      'packages/app/src/main.tsx': "import { thing } from '@acme/core'\nimport { view } from '@/ui/view'\nimport React from 'react'\n",
      'packages/app/src/ui/view.tsx': "import { x } from '@acme/core/src/util/x'\nexport const view = () => require('./helpers')\n",
      'packages/app/src/ui/helpers.js': 'module.exports = 1\n',
    })
    const r = await jsModulesImporter.run(dir)
    expect(r.entities.map((e) => [e.id, e.parent ?? null]).sort()).toEqual(
      [
        ['acme-app-top', 'pkg-acme-app'],
        ['acme-app-ui', 'pkg-acme-app'],
        ['acme-core-model', 'pkg-acme-core'],
        ['acme-core-top', 'pkg-acme-core'],
        ['acme-core-util', 'pkg-acme-core'],
        ['pkg-acme-app', null],
        ['pkg-acme-core', null],
      ].sort(),
    )
    expect(r.relationships.map((x) => `${x.source}→${x.target}`).sort()).toEqual(['acme-app-top→acme-app-ui', 'acme-app-top→acme-core-top', 'acme-app-ui→acme-core-util', 'acme-core-model→acme-core-util', 'acme-core-top→acme-core-model'].sort())
    const merged = mergeImport(undefined, r, { id: 'mono', name: 'Mono', description: '' })
    expect(validateDocument(merged.document).issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})
