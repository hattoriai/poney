# Extending Poney

There are three ways to extend Poney:

- An **extension** adds to the format: new entity kinds, data on elements ("facets"), new view types, checks and lints. Documents declare the extensions they use.
- A **plugin** runs in the local hub, next to the code: **importers** add what they read in a repository to a document, and **overlays** show live facts on the parts.
- A **new diagram type** in the core, when every reader must know it.

## Extensions

[`packages/ext-ownership`](../packages/ext-ownership) is a complete example. An extension has up to three parts.

**The format part** has no UI and runs anywhere:

```ts
import { defineExtension } from '@hattoriai/poney-core'

export const ownership = defineExtension({
  name: 'ownership',
  version: '0.1.0',
  entityKinds: { team: { label: 'Team' } },             // used as "ownership/team"
  facets: { entity: OwnershipFacet },                   // ext.ownership on entities
  views: { 'team-map': { label: 'Team map', schema: TeamMapData } },
  validate(doc, { index, report }) { /* teams must exist */ },
  lint(doc, { index, warn }) { /* optional: warnings in the extension's own terms */ },
})
```

`validate` reports errors (the document is invalid); `lint` gives warnings with a stable code and a hint, as the core lints do. [`packages/ext-security`](../packages/ext-security) uses `lint` to warn where personal data or secrets cross a trust zone without encryption or a named authentication. It needs no view type of its own: an architecture view's groups draw the zones.

**The drawing part** (`@hattoriai/poney-ext-ownership/layout` and `/diagram`) is a layout and a renderer for the view type, for any app. Register them with `registerExtensionLayout(...)` from `@hattoriai/poney-layout` and `registerDiagram(...)` from `@hattoriai/poney-react`. The CLI does this, so `poney render` draws the team map too.

**The Studio part** ([`apps/studio/src/extensions/ownership`](../apps/studio/src/extensions/ownership)) is an inspector section, registered with `registerStudioExtension(...)`.

A document declares the extensions it uses. Readers that do not know an optional extension keep its data and still work; readers that do not know a *required* one refuse the document (section 8 of [the specification](../spec/SPEC.md)).

## Plugins: importers and overlays

Plugins run in the local hub, next to the code, and the Studio shows what they return.

- **Importers** read a source and add what they find to a document. They only add: what the document already has keeps its words. Built in: `schema` (tables, columns and foreign keys from `db/schema.rb`, SQL DDL or `schema.prisma`) and `js-modules` (the modules of a JavaScript or TypeScript codebase and who imports whom, across npm workspaces and tsconfig paths).
- **Overlays** read live facts and mark the parts they concern, through each part's `sourceRefs`, without changing the document. Built in: `coverage` (from the last lcov, Istanbul, SimpleCov or ExCoveralls report) and `churn` (commits in the last 90 days).

People use them with `poney import` and `poney overlay`, or in the Studio (**Import from the code…** and **Facts**); agents use `poney_import` and `poney_overlay`.

### Your own plugin

A plugin is a module whose default export comes from `definePlugin`, with `importers`, `overlays` and format `extensions`:

```js
import { definePlugin } from '@hattoriai/poney/plugins'

export default definePlugin({
  name: 'sentry',
  overlays: [{
    id: 'sentry',
    name: 'Errors',
    description: 'Unresolved errors per part, from Sentry.',
    detect: () => (process.env.SENTRY_AUTH_TOKEN ? ['SENTRY_AUTH_TOKEN'] : []),
    async read(dir, doc) {
      /* … */
      return { title: 'Errors', at: new Date().toISOString(), marks: [], notes: [] }
    },
  }],
})
```

List it in `~/.poney/plugins.json` (or in the file that `PONEY_PLUGINS` names): `{ "plugins": ["/path/to/sentry.mjs"] }`. A plugin runs code on your computer, so the list lives in your home folder, never in a project: opening or cloning a repository does not load its code. A plugin with the same id as a built-in one replaces it.

## A new diagram type

To add a diagram type without changing the format, write an extension with a view type. To add one to the core:

1. **Format.** Add the view's shape to `packages/core/src/schema/views.ts` and its referential checks to `validation/validate.ts`. Add `viewShows` cases to `model/query.ts`, so search and navigation find elements in it. Document it in `spec/SPEC.md` and run `npm run spec`.
2. **Projection** (optional). Add a pure function under `packages/core/src/projections`.
3. **Layout.** Add `layoutX(doc, view, options): SceneBase` in `packages/layout/src` and a case in `layoutView`. Put an anchor in the scene for every element a person can select.
4. **Renderer.** Add `packages/react/src/diagrams/x/index.tsx`, exporting a `DiagramModule`, and add it to `BUILT_IN_DIAGRAMS` in `diagrams/registry.ts`. Take everything app-specific from the host (`useRenderIndex`, `useRenderBind`, `useRenderSubject`, `useViewState`). For a toolbar button in the Studio, add it to `apps/studio/src/renderers/tools.tsx`.
5. **Inspector.** If the diagram brings a new kind of element reference, add a body for it in `apps/studio/src/components/inspector/bodies.tsx`.
