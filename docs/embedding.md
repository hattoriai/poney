# Use Poney in your app

Poney is a format and a set of renderers, like Mermaid. Poney Studio is one app that uses them; your app can be another. The packages have no global styles, no Tailwind and no app framework other than React for the renderers.

```sh
npm install @hattoriai/poney-core                 # read, check and change documents (any runtime)
npm install @hattoriai/poney-layout               # lay a view out into a scene
npm install @hattoriai/poney-react                # draw scenes in React (React 18 or 19)
npm install @hattoriai/poney-render               # draw scenes to SVG or PNG in Node
```

## Read and check a document

`parseDocument` throws on an invalid document; `validateDocument` returns the issues. Both upgrade a document written for an earlier version of the format first.

```ts
import { validateDocument, indexOf } from '@hattoriai/poney-core'
import { ownership } from '@hattoriai/poney-ext-ownership'

const result = validateDocument(json, { extensions: [ownership] })
if (result.ok) {
  const idx = indexOf(result.document)
  idx.behaviorsInvolving('payment-service')           // the behaviours it takes part in
  idx.viewsShowing({ kind: 'entity', id: 'payment-service' })
} else {
  console.log(result.issues)                          // { path, message, severity }
}
```

Validation has three passes: shape (Zod, the same rules as the JSON Schema), referential integrity (the rules R1 to R14 in the [specification](../spec/SPEC.md)), and extensions.

## Draw a view in React

```tsx
import '@hattoriai/poney-react/styles.css'
import { RenderProvider, diagramFor } from '@hattoriai/poney-react'
import { indexOf } from '@hattoriai/poney-core'
import { layoutView } from '@hattoriai/poney-layout'

const view = doc.views[0]
const scene = await layoutView(doc, view)
const { Renderer } = diagramFor(view)!

<RenderProvider value={{ idx: indexOf(doc) }}>
  <svg viewBox={`0 0 ${scene.width} ${scene.height}`}>
    <Renderer scene={scene} view={view} />
  </svg>
</RenderProvider>
```

`layoutView(doc, view, options)` lays out any view. The options are reader choices that do not change the document: which groups are open, which tables show every field.

### Your app is the host

Renderers draw SVG from a scene. They do not compute layout and do not change the document. Everything interactive comes from your app, through `RenderProvider`:

| | What it gives | Without it |
|---|---|---|
| `idx` | The model index (required) | — |
| `bind(ref, label)` | Click, hover and keyboard behaviour for an element | Plain SVG with `data-ref` |
| `selection`, `hover` | What to light up | Nothing dims |
| `viewState`, `setViewState` | Open groups, expanded tables | Each view keeps its own while shown |
| `still` | A picture: no controls | Controls are drawn |
| `ZoomProvider` | The zoom level, for level of detail | 1 |

Without `bind`, `selection` and the others, a diagram is a still picture. Poney Studio's host is [`apps/studio/src/story/StudioRender.tsx`](../apps/studio/src/story/StudioRender.tsx): it passes its store's selection and view state, and a `bind` with rename on double-click, a context menu and pointing for the agent.

Each diagram type is a `DiagramModule` with a `label`, an `icon`, a `howToRead` sentence, a `Renderer` and an optional `Legend`; `diagramFor(view)` finds the module for a view.

## Styles and themes

Import `@hattoriai/poney-react/styles.css` once. It is plain CSS, about 1.3 KB gzipped.

- **Nothing global, easy to override.** Every rule is in the cascade layer `poney` and uses `:where()`, so your own CSS wins without `!important`. It sets only `--poney-*` tokens and `.poney-*` classes: no resets, no element styles.
- **Themes.** Override any `--poney-*` token (colours, `--poney-font-sans`, `--poney-font-mono`). Light is the default; set `data-poney-theme="dark"` on any element (often `<html>`) to draw Poney dark inside it.
- **With a bundler** (Vite, webpack, Next.js…), the file and its parts are inlined, minified and fingerprinted by your build.
- **Without one**, or from a CDN, use the prebuilt single file `@hattoriai/poney-react/styles.min.css`.
- Motion stops for readers who ask for reduced motion. The package is marked `sideEffects: ["*.css"]`, so bundlers drop the renderers an app does not use.

## Draw without a browser

`@hattoriai/poney-render` draws any view or walkthrough scene to SVG or PNG in Node, with the real fonts and the same colours as the stylesheet:

```ts
import { renderScene, renderScenePng } from '@hattoriai/poney-render'
```

From a terminal: `poney render doc.poney --view <id> --format svg --out view.svg`. Text measuring is injectable (`setTextMeasurer` in `@hattoriai/poney-layout`), so layouts also run in a worker or with a server-side font engine.

## Change a document

Commands are the only way to change a document. Each is plain JSON, and `applyCommand` is pure: it returns a new document and refuses changes that break referential integrity.

```ts
import { applyCommand, toJSON } from '@hattoriai/poney-core'

const next = applyCommand(doc, { type: 'entity.update', id: 'payment-service', changes: { name: 'Payments' } })
```

## Other formats

- `fromMermaid(text)` converts a Mermaid sequence diagram, flowchart, state diagram or ER diagram into a Poney document with one view.
- `fromJSON` and `toJSON` read and write the JSON form.

## Other languages

Read [the specification](../spec/SPEC.md), check shapes with [the JSON Schema](../spec/poney.schema.json), implement the rules R1 to R14, upgrade older documents as section 11 says, and run [the conformance suite](../spec/conformance).
