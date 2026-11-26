# @hattoriai/poney-react

Poney's drawings in React: every diagram type and walkthrough scene from `@hattoriai/poney-diagrams`, as React components. Your app is the host: it passes the selection and interaction through `RenderProvider`; without them a diagram is a still picture.

```tsx
import '@hattoriai/poney-diagrams/styles.css'
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

The drawings are the same SVG as in every other host. Handlers that `bind` gives get React's events. `iconFor` and each diagram's `icon` are Lucide React components. React 18 or 19 is a peer dependency.

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
