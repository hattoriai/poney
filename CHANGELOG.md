# Changelog

Every package in this repository has the same version. The format has its own version, in `poneyVersion` (see [spec/SPEC.md](spec/SPEC.md)).

## Next

### Poney Studio

- **New workspace** opens a blank workspace: add its folders and documents from inside it. Before, a workspace started from a folder.
- The start page is outside any workspace, so it has no agent: no agent panel and no **Ask the agent**. A workspace has its own home page with its folders, its documents and its agent. The agent panel names the workspace it works in ("Ask about tug").
- The document list no longer opens over the page by itself when a workspace has several documents: its home page lists them.
- A dialog opened or closed with the mouse shows no focus ring: it focuses its first field, and gives focus back only to a keyboard user.
- The workspace's **Folders** and **Documents** show at the top of the sidebar and on the start page, each with a **+** to add one. Before, they were in the document menu.
- A workspace with several folders needs no file. Poney keeps it until you choose **Save as…**, named after its folders. A folder opened alone becomes such a workspace when you add a second folder, and keeps its conversation and agent session.
- Adding a folder opens none of its documents.
- The folder browser takes a typed or pasted path (`~` is the home folder).
- The suggested requests in the agent panel and on an empty document put their text in the message box. They no longer send it on a click.
- A tab that reloads, or a local server that restarts, opens the workspace again.
- **Expand** on a walkthrough diagram makes the same diagram bigger. The groups you opened, the zoom and an edit in progress stay. Before, it opened a new copy with all groups closed. The button then restores the diagram.
- An expanded diagram restores when you ask the agent from it, or open **Connect an agent…**, so you see the agent panel or the dialog.
- The agent's replies show their Markdown: bold, italic, `code`, links, headings, lists, code blocks, quotes and tables. Before, they showed the raw marks.
- A link in document text or in a reply opens only for web and mail addresses.
- **Zoom to selection** has its own icon, a frame with a magnifier, so it does not look like **Fit to view**. It is off when nothing is selected.
- A sequence diagram has **Play** next to its step buttons, as a walkthrough scene has. It selects one message about every two seconds. Selecting something else, or Esc, stops it.
- In a narrow window, the diagram toolbar centers in the part of the canvas that the inspector does not cover. Before, the inspector hid its end.
- The facts in a walkthrough's **At a glance** and **Verdict** show `code` and links, as the findings do, and you can edit them.

### Agents

- No agent starts in a workspace with no folder. **Connect an agent** says to add a folder first.
- In a workspace with several folders, the agent is told that all of them are the code: a tour or an answer covers every folder that has code for it. Before, it was told the first folder was the code and the others were folders it may read.
- A folder added while the agent works or starts gets to the agent when it finishes, in the same session. Before, the agent kept the folders it started with.

## 0.4.0

### Poney Studio

- A folder can have several documents. **Open a workspace** (before: **Open a project**) opens a folder; its documents are the `.poney` files in `docs/poney/`. With one, it opens; with several, the one you read last opens, or Studio asks you to select one. Before, a folder with several documents opened a new, empty one.
- The document menu, at the top of the sidebar, lists the folder's documents, and **New document…** starts another one in `docs/poney/`.
- Names in the interface: workspace in place of project, and **Overview** in place of **Project overview**.
- A workspace can have several folders, kept in a `.poney-workspace` file with paths relative to the file. **Add a folder…** and **Save the workspace…** are in the document menu. A folder with its own workspace file opens that file. Saving a workspace keeps its conversation and agent session.
- **Import from the code…** asks which folder of the workspace to read. **Facts** reads every folder of the workspace.
- The start page lists recent workspaces. A folder saved as a workspace file shows once.
- A document opened alone can have a folder attached, so an agent can read the code it explains: **Add a folder…** in the document menu. Poney remembers the folder for the document. A second folder needs a saved workspace, next to the document by default.
- You can close an open document: the × on the document in the **Open** list on the start page, or in the document menu. A closed document stays in **Recent**.
- You can delete the `.poney` file of a document when Poney on this computer keeps it: **Delete file…** in the document menu, or the trash button on the document in the start page's lists. Studio asks first. The delete is permanent.
- New route `POST /api/files/delete` in the local server. It deletes only a valid Poney document, and with `project` only a file that holds that document.

### Agents

- `poney_open` and `poney_import` take `file`: the document to write to, relative to the folder. A path that does not exist starts a new document there. Without `file`, they write to the document the person reads, as before; when the folder has several documents and none is shown, they ask for `file`.
- `poney_read` returns the folder's documents and the one shown.
- A document keeps its own `project.id`. Before, every document an agent opened in a folder took the folder's id.
- One agent works for a workspace and reads all its folders, through ACP `additionalDirectories` (Claude Code and Codex support it). An agent that does not gets the other folders' paths in its instructions. When the folders change, the agent starts again in the same session.
- `poney_read` returns the workspace's folders.
- The local server remembers the document shown last in each workspace, in `~/.poney/workspaces.json`. New routes `POST /api/documents/new`, `/api/workspace/save`, `/api/workspace/folders` and `/api/workspace/documents/remove`, and `documents` and `workspace` events for the Studio.

## 0.3.1

### The guide for agents

- The examples and the guide (`poney brief`) name the facts of a verdict with plain labels: Undo, Other systems, Data, Proof, To read. Before, the examples used Door, Outside and Your time, and agents copied a business idiom into their walkthroughs. The guide now asks for the plain words a developer uses.

## 0.3.0

### Reading documents

- A member the format does not define is now an error, as the specification says (section 9.1). Before, `@hattoriai/poney-core` dropped it silently, so a typo such as `"summmary"` lost its value without a word. The issue names the member's own path, such as `project.colour`, with a hint to remove it. Extension data belongs under `ext`, and free key-value data under `metadata`.
- A new conformance case, `invalid/unknown-member.poney`.

### Diagrams without a framework

- New package `@hattoriai/poney-diagrams`: every renderer, the walkthrough stories and the stylesheet, with no UI framework. The renderers are JSX for a small runtime of their own; `toMarkup` writes them as SVG text, and `drawInto` draws them into a page and changes only what changed on the next drawing.
- `@hattoriai/poney-react` is now the React adapter for these renderers: the providers, `diagramFor`, `iconFor`, the story components and the scene helpers stay. The parts for writing renderers (`EntityNode`, `Glyph`, `useRenderIndex`, `useStory` and the like) move to `@hattoriai/poney-diagrams`. Import the stylesheet from `@hattoriai/poney-diagrams/styles.css`. `react-dom` is no longer a peer dependency.
- `@hattoriai/poney-render` and `@hattoriai/poney` draw with `@hattoriai/poney-diagrams` and no longer need React. The SVG is the same as before.
- Extensions write their renderers for `@hattoriai/poney-diagrams` and register them with its `registerDiagram`. `DiagramModule.icon` is a Lucide icon (`IconData`); the React adapter turns it into a Lucide React component.

### `<poney-diagram>`

- New package `@hattoriai/poney-element`: the custom element `<poney-diagram>` draws a view or a walkthrough scene in any web page, with no framework. Attributes say what to draw (`view`, `walkthrough`, `scene`, `mode`, `hot`, `selection`, `trace-step`, `theme`, `still`, `fill`); events tell the page what the reader clicks and points at (`poney-select`, `poney-hover`, `poney-ready`, `poney-error`). The camera glides between frames in one view and follows a playing trace.
- Zoom and pan, as in the Studio: pinch or ⌘/Ctrl + scroll, a mouse drag, a double click, and controls with the zoom level and "Reset view". `still` turns them off. `@hattoriai/poney-diagrams` exports the camera math, `zoomViewBox` and `panViewBox`, which the Studio uses too.
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
