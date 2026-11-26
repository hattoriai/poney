# @hattoriai/poney-render

Renders any view or walkthrough scene of a Poney document to SVG or PNG in Node, with the real fonts: self-contained SVG (no CSS variables), or PNG at twice the size.

```ts
import { renderScene, renderScenePng } from '@hattoriai/poney-render'

const { svg } = await renderScene(doc, { view: 'architecture' })
const { png } = await renderScenePng(doc, { scene: 'checkout', theme: 'dark' })
```

From a terminal, the `poney` package: `npx poney render doc.poney --view architecture --format svg`.

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
