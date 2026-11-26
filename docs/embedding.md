# Use Poney in your app

Use Poney’s packages to read a document, draw a diagram in any web page or in React, or export an image from Node.

```sh
npm install @hattoriai/poney-core                 # read, check and change documents (any runtime)
npm install @hattoriai/poney-layout               # position the elements in a diagram
npm install @hattoriai/poney-diagrams             # draw scenes as SVG, with no framework
npm install @hattoriai/poney-react                # draw scenes in React (React 18 or 19)
npm install @hattoriai/poney-render               # export SVG or PNG in Node
```

## Read and check a document

`validateDocument` takes a parsed JSON object and reports any issues. Use `parseDocument` if you prefer an exception on invalid input. Both upgrade older documents first.

```ts
import { validateDocument, indexOf } from '@hattoriai/poney-core'
import { ownership } from '@hattoriai/poney-ext-ownership'

const result = validateDocument(json, { extensions: [ownership] })
if (result.ok) {
  const idx = indexOf(result.document)
  idx.behaviorsInvolving('payment-service')
  idx.viewsShowing({ kind: 'entity', id: 'payment-service' })
} else {
  console.log(result.issues)                          // { path, message, severity }
}
```

Validation checks the document’s structure, its references and any rules from registered extensions. For example, if a view names a service, that service must exist in the model. See rules R1–R14 in the [specification](../spec/SPEC.md).

## Draw a view in a web page

`@hattoriai/poney-diagrams` draws with no framework. Give `drawInto` an `<svg>`, a renderer, its scene and the host values.

```ts
import '@hattoriai/poney-diagrams/styles.css'
import { diagramFor, drawInto } from '@hattoriai/poney-diagrams'
import { indexOf } from '@hattoriai/poney-core'
import { layoutView } from '@hattoriai/poney-layout'

const view = doc.views[0]
const scene = await layoutView(doc, view)
const svg = document.querySelector('svg')!
svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`)
const drawing = drawInto(svg, diagramFor(view)!.Renderer, { scene, view }, { render: { idx: indexOf(doc) } })
// Later, with a new selection: drawing.update({ render: { idx, selection } })
```

`drawInto` draws again after a change inside the diagram, such as an open group, and changes only the elements that changed. For text, `toMarkup(resolve(element))` gives the same SVG.

## Draw a view in React

```tsx
import '@hattoriai/poney-diagrams/styles.css'
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

`layoutView` calculates the positions for a view. Its optional third argument lets you collapse groups or expand table fields for display without editing the document.

### Your app is the host

Pass the model index (as `render` to `drawInto`, or to `RenderProvider` in React) to draw the scene as SVG. Your app can also supply event handlers and keep track of what the reader selects.

| Input | Purpose | Default |
|---|---|---|
| `idx` | Looks up model elements by ID | Required |
| `bind(ref, label)` | Adds click, hover and keyboard handlers to an element | SVG element with `data-ref` |
| `selection`, `hover` | Identifies the element to highlight | No highlight |
| `viewState`, `setViewState` | Keeps track of open groups and expanded tables | Each view keeps its own state while mounted |
| `still` | Hides controls for a static picture | Controls visible |
| `zoom` (`ZoomProvider` in React) | Sets the zoom level used to show or hide detail | `1` |

Studio uses `bind` to let readers rename an element with a double-click, open its context menu or point it out to an agent. See [StudioRender.tsx](../apps/studio/src/story/StudioRender.tsx).

`diagramFor(view)` returns the matching `DiagramModule`. Each module includes a `Renderer`, `label`, `icon`, a short `howToRead` description and an optional `Legend`.

## Styles and themes

Import `@hattoriai/poney-diagrams/styles.css` once. It is plain CSS, about 1.3 KB gzipped.

- All rules live in the `poney` cascade layer and use `:where()`. You can override `.poney-*` classes and `--poney-*` variables in your own stylesheet.
- The default theme is light. Set `data-poney-theme="dark"` on a diagram’s container or on `<html>` for the whole page. Use the `--poney-*` variables to change colours and fonts, including `--poney-font-sans` and `--poney-font-mono`.
- If you use a bundler such as Vite or webpack, import the stylesheet alongside your components.
- To serve a single CSS file directly or from a CDN, use `@hattoriai/poney-diagrams/styles.min.css`.
- Animations respect the reader’s reduced-motion setting. The package marks CSS as a side effect so bundlers can omit unused renderers.

## Draw without a browser

In Node, `renderScene` returns an SVG string and `renderScenePng` returns a PNG buffer. Both accept a view or a walkthrough scene and use the same colours as Studio.

```ts
import { renderScene, renderScenePng } from '@hattoriai/poney-render'
```

From the terminal, run `poney render doc.poney --view <id> --format svg --out view.svg`. If your layout runs in a worker or uses a server-side font engine, pass your own text measurement function to `setTextMeasurer` in `@hattoriai/poney-layout`.

## Change a document

Pass a JSON command to `applyCommand` to edit a document. It returns a new document and throws if the edit would break a reference.

```ts
import { applyCommand, toJSON } from '@hattoriai/poney-core'

const next = applyCommand(doc, { type: 'entity.update', id: 'payment-service', changes: { name: 'Payments' } })
```

## Other formats

- `fromMermaid(text)` converts a Mermaid sequence diagram, flowchart, state diagram or ER diagram into a Poney document with one view.
- `fromJSON` reads and validates a JSON string. `toJSON` writes a document back to a string.

## Other languages

When implementing a reader, use the [JSON Schema](../spec/poney.schema.json) to check document structure. The [specification](../spec/SPEC.md) defines rules R1–R14 for references and explains how to upgrade older documents in section 11. Test your reader against the [conformance suite](../spec/conformance).
