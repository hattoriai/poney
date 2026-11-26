# Architecture

## The repository

```
spec/                         The format
  SPEC.md                     The specification
  poney.schema.json           JSON Schema (generated: npm run spec)
  examples/                   Example documents
  conformance/                Valid and invalid documents, with the expected results

packages/
  core/          @hattoriai/poney-core       Schema, validation and lints, upgrades, model queries,
                                             commands, extensions, projections, JSON and Mermaid
                                             adapters. Depends only on Zod.
  layout/        @hattoriai/poney-layout     View → positioned scene. ELK and custom layouts.
  react/         @hattoriai/poney-react      Renderers for every diagram type and for walkthrough
                                             scenes, and the stylesheet.
  render/        @hattoriai/poney-render     Scenes to SVG and PNG in Node.
  agent/         @hattoriai/poney            The guide (brief*.md), the CLI and the MCP server:
                   src/live/                   the local hub: state, files, HTTP server
                   src/agents/                 agents started over ACP: providers, the bridge,
                                               workspaces (folders and Git clones)
                   src/plugins/                importers, overlays and the plugin loader
  ext-ownership/ @hattoriai/poney-ext-ownership   Example extension: teams, on-call, team map.
  ext-security/  @hattoriai/poney-ext-security    Trust zones, sensitive data, protected connections.
  examples/      (private)                   The Kestrel Commerce example, in TypeScript.

apps/
  studio/        (private)                   Poney Studio. Published built, inside @hattoriai/poney.
```

Each package depends only on the ones above it. A test in `@hattoriai/poney-core` fails if the format package imports React, a layout engine or another UI library.

## The data model

A document has three layers (sections 5 to 7 of [the specification](../spec/SPEC.md)):

- **Model**: what the software is. Entities (`person`, `web-app`, `service`, `database`, `message-broker`, `component`…), relationships, data types with fields and keys, data relations with cardinality, data flows, behaviours (interactions, activities, state machines) and use cases. Every element has a stable id.
- **Views**: what one diagram shows and how it is organized. A view refers to model ids; it never copies a definition. Each diagram type has its own structure: a sequence view points at an interaction (with ordered messages and nested fragments), an ERD view lists tables, an architecture view lists entities, groups and what starts closed.
- **Presentation**: how things look: shape, colour and icon per kind, line style per relationship kind, overrides per element and per view.

**Walkthroughs** are plain data in the same document (section 5.8): marks on model elements, removed elements as they were, and scenes that point at views or carry their own.

What is selected, hovered or zoomed is **not** in the document. It lives in the host, such as the Studio's store.

`validateDocument()` first upgrades a document written for an earlier version of the format (`upgradeDocument`, in `packages/core/src/upgrade.ts`), then checks it in three passes: shape (Zod, the same rules as the JSON Schema), referential integrity (rules R1 to R14), and extensions.

## From document to picture

```
document ─▶ upgrade + validate ─▶ model ─▶ projection ─▶ layout ─▶ scene ─▶ renderer
            @hattoriai/poney-core                       @hattoriai/poney-layout   @hattoriai/poney-react
                                                                                @hattoriai/poney-render
```

- **Projections** (`packages/core/src/projections`) are pure functions from a model and a view to a diagram graph. For example, the architecture projection nests entities by containment and group, and lifts relationships to the nearest visible container when a group is closed.
- **Layouts** (`packages/layout/src`) turn a view into a **scene**: plain rectangles, routed points and label boxes, plus `anchors` keyed by element reference, so a canvas can frame any element by its identity. Architecture, data flow, ERD and state machines use ELK (layered, orthogonal routing). Sequence, activity (swimlanes), use case and dependency diagrams use purpose-built layouts, because a timeline, a set of lanes or a set of bands is not a generic graph.
- **Map views**, for walkthroughs, are small composed pictures with soft curves, labels placed clear of boxes, and `passThrough` to draw a line through a hop that does not matter, such as a gateway. **Focused sequences** show only the messages a scene names, with their participants, in compact columns.
- **Renderers** draw SVG from a scene. They do not compute layout and do not change the model; interaction comes from the host (see [Use Poney in your app](embedding.md#your-app-is-the-host)). React Flow is not used: with a custom SVG canvas, every diagram type gets its own interaction model, and the model never has to look like a node-and-edge list. A Canvas or WebGL renderer could draw the same scenes.
- `@hattoriai/poney-render` uses the same renderers in Node. The colours of its static output (`THEMES`) and of the stylesheet are the same; a test keeps them equal. A test renders every view of the Kestrel example.

## Editing

The Studio renames elements today; the architecture is ready for more:

- **Commands** (`packages/core/src/commands`) are the only way to change a document: `entity.add`, `entity.update`, `entity.remove`, `relationship.*`, `view.addEntity`, `layout.move`, `presentation.override`, and others. Each is plain JSON, so it can be logged, sent to collaborators or replayed.
- `applyCommand` is pure, returns a new document, and refuses changes that break referential integrity.
- Every command has a **scope** (`semantic`, `layout` or `presentation`), so moving a box never touches the model, and renaming a service never touches positions.
- **Undo and redo** keep the earlier immutable documents (`createHistory`, `execute`, `undo`, `redo`).
- **Manual layout** goes into `view.positions`, apart from the model. The layouts pass these positions to ELK as node coordinates; making ELK keep them fixed, and the same for the custom layouts, is the next step.
- **Stable ids** mean that selection, links and anchors survive edits.

## The local hub

`poney studio` and the MCP server run a small HTTP server on 127.0.0.1 (`packages/agent/src/live`). It holds the open documents, saves each one to its file and watches the file for changes, streams changes to every open Studio (server-sent events), and passes questions and answers between the Studio and the agent. When an MCP server starts and a hub already runs, it attaches to that hub, so every agent and every window shares one state.
