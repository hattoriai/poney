# @hattoriai/poney-layout

Lays out the views of a Poney document: each diagram type to a positioned scene, with ELK and custom layouts. No UI framework; the renderers in `@hattoriai/poney-react` draw its scenes.

```ts
import { layoutView } from '@hattoriai/poney-layout'

const scene = await layoutView(doc, doc.views[0])
```

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
