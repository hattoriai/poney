/**
 * @hattoriai/poney-element — <poney-diagram>, a custom element that draws a
 * Poney view or walkthrough scene in any web page, with no framework.
 *
 * With a bundler: import this package, call definePoneyDiagram(), and import
 * @hattoriai/poney-element/poney.css. Without one: load the built file
 * @hattoriai/poney-element/poney.js (it defines the element and knows the
 * ownership and security extensions) and poney.css.
 */
export { definePoneyDiagram, PoneyDiagramElement, registerElementExtensions } from './diagram'
