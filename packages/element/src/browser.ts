/**
 * The built file, poney.js: everything to draw Poney diagrams in a page, in
 * one ES module with no imports. Loading it defines <poney-diagram>, with the
 * ownership and security extensions. Its exports are for pages that want to
 * read documents or draw in other ways.
 */
import { ownership } from '@hattoriai/poney-ext-ownership'
import { teamMap } from '@hattoriai/poney-ext-ownership/diagram'
import { layoutTeamMap } from '@hattoriai/poney-ext-ownership/layout'
import { security } from '@hattoriai/poney-ext-security'
import { registerExtensionLayout } from '@hattoriai/poney-layout'
import { registerDiagram } from '@hattoriai/poney-diagrams'
import { definePoneyDiagram, registerElementExtensions } from './diagram'

registerElementExtensions(ownership, security)
registerDiagram(teamMap)
registerExtensionLayout('ownership/team-map', layoutTeamMap)
definePoneyDiagram()

export { definePoneyDiagram, PoneyDiagramElement, registerElementExtensions } from './diagram'
export { indexOf, parseDocument, validateDocument, PONEY_VERSION } from '@hattoriai/poney-core'
export { layoutView } from '@hattoriai/poney-layout'
export { diagramFor, drawInto, resolve, toMarkup } from '@hattoriai/poney-diagrams'
