# Extending Poney

- Use an **extension** for information that belongs in the document, such as which team owns a service. Extensions can define new kinds of elements, fields and views, along with rules for checking them.
- Use a **plugin** to bring in information from a repository. An **importer** adds what it finds to the document. An **overlay** displays information such as test coverage on the diagram.
- Add a **core diagram type** when every Poney reader should support the notation.

## Extensions

The ownership extension adds teams to the model and a team map to show which services they own. See the [complete extension](../packages/ext-ownership).

**The format definition** describes what gets stored in the file. In this example, `team` is a new entity kind. A *facet* is a set of extra fields on an element, such as the team that owns a service.

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

Use `validate` to catch errors such as a service naming a team that doesn’t exist. Use `lint` for warnings and include a stable code and a suggested fix. For example, the security extension warns when sensitive data crosses a trust boundary without encryption. It shows the zones as groups in an architecture view. [Security extension source](../packages/ext-security)

**The layout and renderer** draw the team map. The ownership package exports them from `/layout` and `/diagram`. Register them with `registerExtensionLayout` from `@hattoriai/poney-layout` and `registerDiagram` from `@hattoriai/poney-diagrams`. The CLI already registers both for `poney render`.

**The Studio inspector** can show details when a reader selects an element. Register a section with `registerStudioExtension`. See the [ownership inspector](../apps/studio/src/extensions/ownership).

Documents list the extensions they use. When a reader encounters an unfamiliar optional extension, it preserves the data so another reader can use it. If the extension is required, the reader must reject the document. See section 8 of the [specification](../spec/SPEC.md).

## Plugins: importers and overlays

Plugins run locally, with access to the repository. Studio displays their results.

- **Importers** add missing items and preserve existing entries and descriptions. The `schema` importer reads tables, columns and foreign keys from `db/schema.rb`, SQL DDL or `schema.prisma`. The `js-modules` importer follows JavaScript and TypeScript imports, including imports across npm workspaces and `tsconfig` path aliases.
- **Overlays** use each element’s `sourceRefs` to match it to files in the repository. The `coverage` overlay reads the latest lcov, Istanbul, SimpleCov or ExCoveralls report. The `churn` overlay counts commits that touched those files in the last 90 days. Both display their results without editing the document.

In Studio, choose **Import from the code…** or **Facts**. From the terminal, use `poney import` or `poney overlay`. The corresponding MCP tools are `poney_import` and `poney_overlay`.

### Your own plugin

Make `definePlugin(...)` the module’s default export. It accepts `importers`, `overlays` and format `extensions`. Here’s the outline of a Sentry overlay.

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

List the module in `~/.poney/plugins.json`, for example `{ "plugins": ["/path/to/sentry.mjs"] }`. This list is personal because plugins run code on your computer. Set `PONEY_PLUGINS` to use a different file. An importer or overlay with the same ID as a built-in replaces it.

## A new diagram type

An extension can add a view type of its own. For a built-in diagram, update the following parts of Poney.

1. **Format.** Define the view in `packages/core/src/schema/views.ts` and check its references in `validation/validate.ts`. Update `viewShows` in `model/query.ts` so search and navigation can find elements in the view. Document the type in `spec/SPEC.md` and run `npm run spec`.
2. **Projection.** If the diagram needs a function to select or group model elements, add it under `packages/core/src/projections`.
3. **Layout.** Add `layoutX(doc, view, options): SceneBase` in `packages/layout/src` and call it from `layoutView`. Give every selectable element an anchor so the canvas can frame it.
4. **Renderer.** Export a `DiagramModule` from `packages/diagrams/src/diagrams/x/index.tsx` and register it in `BUILT_IN_DIAGRAMS` in `diagrams/registry.ts`. Write it in JSX for `@hattoriai/poney-diagrams` (`/** @jsxImportSource @hattoriai/poney-diagrams */`), not React. Use `useRenderIndex`, `useRenderBind`, `useRenderSubject` and `useViewState` for data and interactions supplied by the app, and `useLocal` for a small state of its own. Studio toolbar buttons belong in `apps/studio/src/renderers/tools.tsx`.
5. **Inspector.** If the diagram introduces a new kind of element reference, add its inspector content to `apps/studio/src/components/inspector/bodies.tsx`.
