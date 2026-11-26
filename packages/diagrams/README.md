# @hattoriai/poney-diagrams

Draws Poney documents as SVG, with no UI framework: every diagram type (architecture, map, sequence, data flow, activity, ERD, state, use case, dependency) and walkthrough scenes, from a scene laid out by `@hattoriai/poney-layout`. Your page is the host: it gives the model index and, if it wants, interaction, selection and view state. Without them a diagram is a still picture.

```ts
import '@hattoriai/poney-diagrams/styles.css'
import { diagramFor, drawInto } from '@hattoriai/poney-diagrams'
import { indexOf } from '@hattoriai/poney-core'
import { layoutView } from '@hattoriai/poney-layout'

const view = doc.views[0]
const scene = await layoutView(doc, view)
const svg = document.querySelector('svg')!
svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`)
drawInto(svg, diagramFor(view)!.Renderer, { scene, view }, { render: { idx: indexOf(doc) } })
```

`drawInto` draws again after a local change (an open group, a hovered line) and changes only what changed, so focus, hover and transitions survive. `resolve` and `toMarkup` give the same drawing as SVG text, for a server or a file. For React, use `@hattoriai/poney-react`.

The renderers are plain functions in JSX for this package's small runtime (`/** @jsxImportSource @hattoriai/poney-diagrams */`). An extension writes its renderers the same way and registers them with `registerDiagram`.

The stylesheet is plain CSS (1.3 KB gzipped): `--poney-*` tokens and `.poney-*` classes, in the cascade layer `poney`, so your styles win. Set `data-poney-theme="dark"` on any element for dark. Without a bundler, use `@hattoriai/poney-diagrams/styles.min.css`.

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
