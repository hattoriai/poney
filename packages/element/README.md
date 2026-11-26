# @hattoriai/poney-element

`<poney-diagram>`: a custom element that draws a Poney view or walkthrough scene in any web page, with no framework. The page gives the document and says what to draw. The element lays the view out, draws it, frames it, and sends events when the reader points at or clicks a part.

```html
<link rel="stylesheet" href="poney.css">
<script type="module" src="poney.js"></script>

<poney-diagram walkthrough="payment-retry" scene="checkout" mode="change">
  <script type="application/json">{ "poneyVersion": "0.2.0", … }</script>
</poney-diagram>
```

`poney.js` and `poney.css` are in this package, in `dist/browser/` (also `poney.min.js`). `poney.js` is one ES module with no imports: the format, the layout (ELK), the renderers and the element, with the ownership and security extensions. Copy it into your app's assets; it needs no Node at run time. With a bundler, import the package instead and call `definePoneyDiagram()`.

## Attributes

| Attribute | What it does |
|---|---|
| `view` | Draws a view on its own, as an explorer does |
| `walkthrough`, `scene` | Draws a walkthrough scene (`overview` for the overview). With neither, the first walkthrough's overview, else the document's default view |
| `mode` | `before`, `change` (default) or `after` |
| `hot` | A ref key to light up, for example from a sentence the reader points at |
| `selection` | A ref key to show as selected |
| `trace-step` | The trace step to show (from 0); the camera follows it. Empty: not playing |
| `theme` | `light` or `dark`; the element then paints its own background |
| `still` | A picture: no controls and no interaction |
| `fill` | Fill the element's box. Without it, the element is as wide as its container and as high as the scene |

Set the document with the `document` property (an object or JSON text), or put it in a `<script type="application/json">` child.

## Events

All events bubble.

| Event | `detail` |
|---|---|
| `poney-select` | `{ ref }`: the reader clicked a part, or pressed Enter on it |
| `poney-hover` | `{ ref }`: the reader points at a part; `null` when they leave it |
| `poney-ready` | `{ title, view }`: a new view is drawn |
| `poney-error` | `{ message, issues? }`: the document is not valid, or the target does not exist |

## Styles and fonts

`poney.css` has the `--poney-*` tokens and the `.poney-*` classes, in the cascade layer `poney`, so your styles win. To give the diagrams your colours and fonts, set the tokens on the element or on a parent. The element measures text with `--poney-font-sans` and `--poney-font-mono`, so the fonts that you set must be loaded on the page.

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
