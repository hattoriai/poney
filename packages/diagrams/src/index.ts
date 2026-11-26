/**
 * @hattoriai/poney-diagrams — draws Poney documents, with no framework.
 *
 * Every diagram type (diagrams/) and the walkthrough story renderers, as
 * plain functions written in JSX. `resolve` draws them into a tree of SVG
 * elements; `toMarkup` writes the tree as text, `mount` puts it in the DOM,
 * and an adapter (such as @hattoriai/poney-react) turns it into a
 * framework's elements. They read a scene laid out by @hattoriai/poney-layout
 * and never compute layout. Selection, interaction and view state come from
 * the host (RenderProvider); without them a drawing is a still picture.
 */
export * from './runtime'
export * from './host'
export * from './context'
export * from './render'
export * from './scene'
export * from './theme'
export * from './icons'
export * from './tone'
export { MapStory } from './MapStory'
export { SequenceStory } from './SequenceStory'
export { StateStory } from './StateStory'
export * from './SceneStory'
export { sceneLines, stepLetter, EmphasisOver, EmphasisUnder, type LineShape } from './emphasis'
export * from './diagrams'
