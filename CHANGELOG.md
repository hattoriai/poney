# Changelog

Every package in this repository has the same version. The format has its own version, in `poneyVersion` (see [spec/SPEC.md](spec/SPEC.md)).

## Unreleased

### Diagrams without a framework

- New package `@hattoriai/poney-diagrams`: every renderer, the walkthrough stories and the stylesheet, with no UI framework. The renderers are JSX for a small runtime of their own; `toMarkup` writes them as SVG text, and `drawInto` draws them into a page and changes only what changed on the next drawing.
- `@hattoriai/poney-react` is now the React adapter for these renderers: the providers, `diagramFor`, `iconFor`, the story components and the scene helpers stay. The parts for writing renderers (`EntityNode`, `Glyph`, `useRenderIndex`, `useStory` and the like) move to `@hattoriai/poney-diagrams`. Import the stylesheet from `@hattoriai/poney-diagrams/styles.css`. `react-dom` is no longer a peer dependency.
- `@hattoriai/poney-render` and `@hattoriai/poney` draw with `@hattoriai/poney-diagrams` and no longer need React. The SVG is the same as before.
- Extensions write their renderers for `@hattoriai/poney-diagrams` and register them with its `registerDiagram`. `DiagramModule.icon` is a Lucide icon (`IconData`); the React adapter turns it into a Lucide React component.

### `<poney-diagram>`

- New package `@hattoriai/poney-element`: the custom element `<poney-diagram>` draws a view or a walkthrough scene in any web page, with no framework. Attributes say what to draw (`view`, `walkthrough`, `scene`, `mode`, `hot`, `selection`, `trace-step`, `theme`, `still`, `fill`); events tell the page what the reader clicks and points at (`poney-select`, `poney-hover`, `poney-ready`, `poney-error`). The camera glides between frames in one view and follows a playing trace.
- `dist/browser/poney.js` (one ES module with no imports) and `poney.css`: everything a page needs, with no bundler and no Node at run time.
- `@hattoriai/poney-diagrams` exports `findTarget`, `followFrame` and `STORY_TYPES`, shared by the element, `poney-render` and the Studio. `drawInto(…).update` takes new props.

### Studio

- The sidebar ends with "Made by Hattori AI", a link to hattori.ai.
- Each project has its own agent session and conversation. Choose the agent one time; it starts or resumes when you open a project.
- A file in `docs/poney/` opens its folder as the project, also in a subfolder of a repository or outside one. A path through a link opens the same project.
- Poney does not save over a project's file that is not a valid document, such as one with merge conflicts. It says so.

## 0.2.0

### Format 0.2.0

The format now uses the names of the notations it draws. Readers upgrade 0.1.0 documents automatically; writers write 0.2.0. [SPEC.md section 11](spec/SPEC.md) lists each change.

- Entity kinds `module` → `component` (C4) and `queue` → `message-broker`.
- Cardinalities `one` → `exactly-one` and `many` → `zero-or-many` (crow's foot).
- `capabilities` → `useCases`, and refs `capability:` → `useCase:` (UML).
- Behaviour `process` → `activity`, with nodes `initial` and `final` (UML); state kind `normal` → `state`.
- View category `capabilities` → `use-cases`; tone `poney` → `accent`.
- `@hattoriai/poney-core` exports `upgradeDocument`.

### Diagrams

- In dependency diagrams, a line that crosses several layers goes around the boxes in the layers between, not behind them.

### Documentation

- A shorter README, with guides in `docs/`, `CONTRIBUTING.md`, and `AGENTS.md` for coding agents. The architecture guide shows Poney's own diagrams, from `docs/poney/poney.poney`.

### Studio

- Connecting an agent from the start page opens the folder's project. An agent's document never goes into the project or file of a different folder.
- Without an agent, agent actions show greyed, with a way to connect one.
- The Studio connects to the local server again after the server restarts.
- No focus ring under the search box.

## 0.1.1

- The CLI is published as `@hattoriai/poney` and requires Node 22.

## 0.1.0

- First release.
