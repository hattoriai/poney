# @hattoriai/poney-react

Draws Poney documents in React: every diagram type (architecture, map, sequence, data flow, activity, ERD, state, use case, dependency) and walkthrough scenes, from a scene laid out by `@hattoriai/poney-layout`. Your app is the host: it passes the selection and interaction through `RenderProvider`; without them a diagram is a still picture.

```tsx
import '@hattoriai/poney-react/styles.css'
import { RenderProvider, diagramFor } from '@hattoriai/poney-react'
import { indexOf } from '@hattoriai/poney-core'
import { layoutView } from '@hattoriai/poney-layout'

const view = doc.views[0]
const scene = await layoutView(doc, view)
const { Renderer } = diagramFor(view)!
<RenderProvider value={{ idx: indexOf(doc) }}>
  <svg viewBox={`0 0 ${scene.width} ${scene.height}`}><Renderer scene={scene} view={view} /></svg>
</RenderProvider>
```

The stylesheet is plain CSS (1.3 KB gzipped): `--poney-*` tokens and `.poney-*` classes, in the cascade layer `poney`, so your styles win. Set `data-poney-theme="dark"` on any element for dark. Without a bundler, use `@hattoriai/poney-react/styles.min.css`. React 18 or 19 is a peer dependency.

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
