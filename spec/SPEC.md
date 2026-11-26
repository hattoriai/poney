# The Poney format

**Version 0.2.0 — internal draft.** This is the working description of the format that the Poney tools read and write. It is not a public standard and makes no compatibility promise: it changes without notice until a party outside this project needs to read or write it.

Poney describes software: its parts, how they connect, what data they hold and move, how they behave, and what people can do with them. A Poney document holds one model of a system and any number of views of that model. The format does not depend on any renderer, programming language or UI library.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as described in RFC 2119.

---

## 1. Design principles

1. **Describe once, view many times.** The semantic model defines each element once. Views reference elements by identifier and never copy them.
2. **Meaning, arrangement and appearance are separate.** The *model* says what the software is. *Views* say what one diagram shows and how it is organized. *Presentation* says how things look. A change in one layer does not require a change in another.
3. **Diagram types keep their own structure.** A sequence diagram keeps message order and conditional fragments. An entity relationship diagram keeps keys and cardinality. A state machine keeps events, guards and actions. The format does not force them into one generic graph.
4. **Plain JSON.** Every document is a JSON value. Any language can read it, write it and check it with the rules in section 9.
5. **Open to extension.** Extensions add kinds, data and view types under their own namespace (section 8). They never change the meaning of core elements.

## 2. Conformance

A **reader** is any program that loads Poney documents. A conforming reader:

1. MUST accept every document that satisfies sections 3 to 9 for the extensions it knows.
2. MUST reject a document that breaks a rule marked as an error.
3. MUST keep data it does not understand (unknown extension data, unknown optional extensions) when it writes the document back.
4. SHOULD report problems with the path of the offending value (section 9.4).

A **writer** MUST produce documents that a conforming reader accepts.

The conformance suite in `spec/conformance/` lists valid and invalid documents and the error paths a reader should report. A reader in any language proves conformance by running it.

## 3. Document

### 3.1 Files

A Poney document is stored in a file with the extension **`.poney`**. The content is one JSON value, in UTF-8. The proposed media type is `application/vnd.poney+json`. Readers SHOULD also accept the same content in a `.json` file.

### 3.2 Members

A document is a JSON object with these members:

| Member | Type | Required | Meaning |
|---|---|---|---|
| `poneyVersion` | string | yes | Format version. For this specification: `"0.2.0"`. A reader MUST also accept `"0.1.0"` documents and upgrade them (section 11). |
| `project` | Project | yes | What the document describes. |
| `extensions` | ExtensionUse[] | no, default `[]` | Extensions the document uses (section 8). |
| `model` | Model | no, default empty | The semantic model (section 5). |
| `views` | View[] | no, default `[]` | Diagram views (section 6). |
| `walkthroughs` | Walkthrough[] | no, default `[]` | Stories that explain one change each (section 5.8). |
| `presentation` | Presentation | no, default styles | Rendering hints (section 7). |

A document can be **stand-alone**: one walkthrough with the few elements it talks about, its views written inside its scenes, and no presentation. This is the usual form for a document an agent writes.

**Project:** `id` (identifier), `name`, `description` (default empty), optional `repository`, optional `defaultView` (the id of the view to open first).

Members marked with a default MAY be omitted. A reader MUST treat an omitted member as its default. The **canonical form** of a document has every default filled in. `spec/poney.schema.json` gives the shape and the defaults of every member.

## 4. Identifiers

Every element that other elements reference has an `id`. An identifier:

- MUST match `^[a-z0-9][a-z0-9-_.]*$` (lowercase letters, digits, `-`, `_` and `.`; it starts with a letter or digit);
- MUST be unique in its collection (rule R1);
- SHOULD be stable: tools that change a document SHOULD NOT rename identifiers, because views, presentation, links and other documents refer to them.

Identifiers are not shown to people. Names (`name`, `label`, `title`) are.

## 5. The semantic model

`model` has seven collections. Only `entities` and `relationships` are required; the others default to `[]`.

### 5.1 Entities

An entity is a part of the system or of its surroundings.

| Member | Type | Meaning |
|---|---|---|
| `id` | identifier | |
| `kind` | string | A core kind (below) or an extension kind `"<extension>/<kind>"`. |
| `name` | string | Human name, e.g. "Payment service". |
| `summary` | string | One line on what it is for. |
| `description` | string? | Longer explanation. |
| `parent` | identifier? | The entity that contains this one. |
| `technology` | string? | e.g. "Go", "PostgreSQL 16". |
| `tags` | string[] | Default `[]`. |
| `sourceRefs` | SourceRef[] | Where it lives in code. Default `[]`. |
| `metadata` | object | String, number or boolean values. Default `{}`. |
| `ext` | object | Extension data by extension name (section 8). Default `{}`. |

Core kinds: `person`, `system`, `web-app`, `service`, `gateway`, `database`, `cache`, `message-broker`, `external`, `component`, `interface`, `library`. They follow the C4 model where it names them: a `component` is a part of the code inside a running program (a module, class or package), and a `message-broker` is a message queue, broker or event bus.

**SourceRef:** `path` (repository-relative), optional `line` (positive integer), `symbol`, `repository`.

**Containment.** `parent` builds a tree: a system contains services, a service contains modules.

### 5.2 Relationships

A relationship is a lasting connection between two entities.

`id`, `kind`, `source`, `target`, `label` (short verb phrase, e.g. "Authorizes payments"), optional `description`, optional `protocol`, `data` (identifiers of data types that travel along it, default `[]`), `metadata`, `ext`.

Core kinds: `uses`, `calls` (request and response), `reads`, `writes`, `reads-writes`, `publishes`, `subscribes` (asynchronous), `depends-on` (structural, in code), `implements`. Extensions MAY add `"<extension>/<kind>"`.

The direction is from `source` to `target` as the label reads: "Order service *calls* Payment service".

### 5.3 Data types and fields

A data type is a shape of data: a table, a record in transit, an event or a document.

`id`, `kind` (`table`, `record`, `event`, `document`), `name`, `summary`, optional `description`, `fields` (default `[]`), optional `ownedBy` (the entity that writes the source of truth), optional `storedIn` (the entity where it rests), `sourceRefs`, `ext`.

**Field:** `name` (unique within the data type), `type` (free text, e.g. `"uuid"`, `"timestamptz"`, `"CartLine[]"`), optional `description`, `primaryKey`, `nullable`, `unique` (booleans, default `false`), optional `references: { dataType, field }` for a foreign key.

### 5.4 Data relations

A data relation connects two data types, usually two tables.

`id`, `from`, `to`, `fromCardinality`, `toCardinality`, `label`, optional `via` (the field that implements it), `logical` (default `false`).

Cardinality values, as crow's foot notation names them: `exactly-one`, `zero-or-one`, `one-or-many`, `zero-or-many`.

Read a relation as: each `from` row *label* `toCardinality` `to` rows; each `to` row belongs to `fromCardinality` `from` rows. `logical: true` means the relation crosses a storage boundary and no database constraint enforces it.

### 5.5 Data flows

A data flow is data moving from one entity to another. Its direction is the direction of the data, which can differ from the direction of the call that carries it (a read returns data to the caller).

`id`, `source`, `target`, `data` (at least one data type identifier), `label`, optional `description`, optional `via` (the relationship that carries it).

### 5.6 Behaviors

`behaviors` holds three kinds of behavior, told apart by `kind`.

#### 5.6.1 Interaction (`"kind": "interaction"`)

An ordered exchange of messages: a sequence.

`id`, `name`, `summary`, optional `description`, `participants` (at least two entity identifiers, in display order), `steps` (at least one Step).

A **Step** is a Message or a Fragment, in reading order.

- **Message:** `"type": "message"`, `id`, `kind` (`call`: the sender waits; `return`: the answer to an earlier call; `async`: sent without waiting; `self`: work inside one participant), `from`, `to`, `label`, optional `description`, optional `relationship` (the relationship it travels along), `data` (default `[]`).
- **Fragment:** `"type": "fragment"`, `id`, `kind` (`alt`: exactly one branch runs; `opt`: the single branch runs only when its guard holds; `loop`: the branch repeats; `par`: the branches run at the same time), `label`, `branches` (at least one `{ guard, steps }`).

Fragments nest. Message order is the depth-first order of steps. Message and fragment identifiers are unique within the interaction.

#### 5.6.2 Activity (`"kind": "activity"`)

A flow of activities: a flowchart or activity diagram.

`id`, `name`, `summary`, optional `description`, `nodes` (at least two), `flows` (at least one).

**Node:** `id`, `kind` (`initial`, `final`, `action`, `decision`, `merge`, `fork`, `join`, as in UML activity diagrams), `label`, optional `description`, optional `performedBy` (an entity; renderers use it for swimlanes), optional `outcome` (`success` or `failure`, for end nodes).

**Flow:** `id`, `from`, `to`, optional `guard` (the answer that takes this flow, for flows out of a decision). Flows MAY form loops.

#### 5.6.3 State machine (`"kind": "state-machine"`)

The lifecycle of one thing.

`id`, `name`, `summary`, optional `description`, optional `subject` (the data type whose lifecycle this is), optional `owner` (the entity that owns the lifecycle), `states` (at least two), `transitions` (at least one).

**State:** `id`, `kind` (`initial`, `state`, `final`), `name`, optional `description`, `entryActions` (default `[]`), `outcome` (`success`, `failure`, `neutral`; default `neutral`).

**Transition:** `id`, `from`, `to`, `event` (what happens), optional `guard` (what must be true), `actions` (what is done, in order; default `[]`), optional `description`, optional `triggeredBy` (the entity that raises the event).

### 5.7 Use cases

A use case (UML) is something an actor does with the system.

`id`, `name`, `summary`, `area` (a grouping, e.g. "Orders"), `actors` (at least one entity who does it), `supporting` (entities that help, usually external; default `[]`), `realizedBy` (entities that implement it; default `[]`), `behaviors` (behaviors that show how it works; default `[]`), `includes` (use cases that are part of it; default `[]`), `ext`.

### 5.8 Walkthroughs

A walkthrough explains software to a reader in **scenes**, in reading order. It has one of two kinds:

- `change` (the default) explains one change: what changes for a person, a verdict, then the scenes. The model describes the system *after* the change; the walkthrough marks what the change added, changed or removed, so every view can show the change without a second model.
- `tour` explains code as it is, to a reader who is new to it. It has no marks and no removed elements (R14), and its code is excerpts of files, not diffs.

| Member | Meaning |
|---|---|
| `id`, `title`, `summary` | |
| `kind` | `change` or `tour`. Default `change`. |
| `source` | Optional origin: `{ kind, ref?, repository?, base?, head?, url?, author?, files?, added?, removed? }`. `kind` is e.g. `Commit`, `Merge request`, `Pull request`, `Branch`, or `Repository` for a tour. |
| `story` | `{ text, before?, after? }`: for a change, the change in plain words and one line for each side (both required, R14); for a tour, what the code is for and who uses it. |
| `overview` | Optional view to show next to the story, before and after: a view id, or a view written here. |
| `verdict` | Optional `{ risk: look \| routine, facts: [{ label, value }], findings: [{ text, severity: risk \| note, scene? }] }`. Findings are what a reviewer must weigh that needs no decision. |
| `marks` | `[{ ref, state: new \| changed \| removed, note? }]`. Default `[]`. |
| `removed` | Elements the change removed, as they were: `{ entities, relationships, transitions: [{ stateMachine, transition }] }`. Default empty. |
| `scenes` | At least one Scene. |

**Scene:** `id`, `title`, `text`, `risk` (`look` or `routine`, default `routine`), optional `view` (a view id, or a view written here), `focus` (refs to frame; everything else dims; default `[]`), `callouts` (`[{ target, text }]`, numbered in order), `cases` (`[{ when, then, note? }]`), `proof` (`[{ text, source?, test?, missing }]`: `source` a file, `test` the name of a test in it), optional `question` and `questions` (in a change, decisions for the reader; in a tour, questions that check understanding), `code` (`[{ path, title?, hunks: [{ header?, lines: [{ kind: add \| del \| ctx, old?, new?, text }] }], notes: [{ line, text }] }]`).

**Emphasis.** A scene may also have `trace` (`[{ ref, caption? }]`: a path through its view, in order, that a reader can play step by step), `effects` (`[{ target, as, tone? }]`, where `as` is `flow`, `attention`, `hot-path`, `slow`, `failing` or `blocked`) and `badges` (`[{ target, text, tone? }]`: a short fact on an element). All default to `[]`. They say what a reader must see, by meaning; a renderer chooses how. An interactive renderer MAY animate a trace and the `flow` and `attention` effects; a still renderer draws them without motion (a still picture SHOULD number the steps of a trace). A renderer MUST NOT animate when the reader asks for reduced motion. `flow` applies to lines (relationships, messages, transitions).

**Text.** Prose members of a walkthrough (`title`, `summary`, `story`, scene `title` and `text`, callout and finding `text`, `cases`, `question(s)`, trace `caption`) MAY use inline Markdown: `**bold**`, `*italic*` or `_italic_`, `` `code` ``, `[text](url)`. A blank line separates paragraphs in `story.text` and scene `text`. No other Markdown applies. A reader that cannot draw formatting SHOULD show the text without the markers.

**Excerpts.** A code block may give `start` and `text` in place of `hunks`: the lines of a file as they are, the first at line `start`. A reader turns it into one hunk of `ctx` lines numbered from `start` (only `new` is set), so the canonical form always has `hunks`. A block gives either `hunks` or both `start` and `text`.

**Inline views.** A scene or overview may write its view in place: the same members as in section 6, with `id`, `title`, `description` and `category` optional. A reader moves each inline view into `views` when it loads the document: the id is the one given, else `<walkthrough id>.<scene id>` (or `<walkthrough id>.overview`); the title defaults to the scene title; the category defaults to `walkthrough`. The canonical form holds only view ids in scenes.

**Refs as text.** Marks, focus and callouts name elements with a *ref key*: `entity:<id>`, `relationship:<id>`, `dataType:<id>` or `dataType:<id>#<field>`, `dataRelation:<id>`, `dataFlow:<id>`, `useCase:<id>`, `behavior:<id>`, and `<kind>:<behavior id>:<id>` for `message`, `fragment`, `activityNode`, `activityFlow`, `state` and `transition`.

**Reading a walkthrough.** A renderer can show three modes of any view: *before* (new elements hidden), *change* (new, changed and removed elements marked) and *after* (removed elements hidden). It draws removed elements from `removed`, laid out with the others so the picture does not move between modes. In a sequence view, a scene whose focus names messages MAY show only those messages and their participants.

## 6. Views

A view selects part of the model for one diagram and organizes it. Every view has:

| Member | Meaning |
|---|---|
| `id`, `title`, `description` | |
| `type` | The diagram type, below. |
| `category` | Navigation group. Core values: `overview`, `behavior`, `data`, `structure`, `use-cases`. Any other string is allowed. |
| `positions` | Manual positions by element id: `{ "<id>": { "x": n, "y": n } }`. Default `{}`. Layout engines SHOULD keep them as fixed points. |
| `ext` | Extension data. Default `{}`. |

Diagram types and their members:

| `type` | Members |
|---|---|
| `map` | `entities` (at least one); `relationships` (optional); `passThrough` (entities left out of the picture: a relationship into one and one out of it are drawn as a single line "through" it; default `[]`); `collapsed` (groups shown closed, default `[]`; see Groups in a map); `layout.direction` (`right` or `down`, default `right`). A small, composed picture for one explanation, at most about a dozen entities. |
| `architecture` | `entities` (at least one); `relationships` (optional: omit to show every relationship between shown entities); `groups` (`{ id, label, description?, members }`, default `[]`); `collapsed` (entity or group identifiers shown closed, default `[]`); `layout.direction` (`right` or `down`, default `right`). |
| `sequence` | `interaction`: an interaction behavior. |
| `dataflow` | `flows` (at least one data flow); `showControlFlow` (default `true`). |
| `activity` | `activity`: an activity behavior; `swimlanes` (default `true`). |
| `erd` | `dataTypes` (at least one); `groupByStore` (default `true`); `fieldLimit` (default `6`). |
| `state` | `stateMachine`: a state machine behavior. |
| `usecase` | `useCases` (at least one). |
| `dependency` | `entities`; `relationships` (optional); `layers` (at least one group, top to bottom). |
| `extension` | `extension` (`"<extension>/<view type>"`); `entities` (entities the view shows, default `[]`); `data` (any value, defined by the extension). |

**Groups in a map.** When an entity and its `parent` (or a nearer shown ancestor) are both in a map's `entities`, the parent is drawn as a frame around the child: a *group*. A group in `collapsed` is drawn as one box; what it contains is hidden, and relationships that end inside it are drawn to it. Relationships between two elements of one closed group, and between a group and what it contains, are not drawn. Several relationships between the same two boxes MAY be drawn as one line. A reader MAY let a person open and close groups; that is interaction state, not part of the document.

**Collapsing.** In an `architecture` view, a collapsed container or group hides what it contains. Relationships that end inside it are drawn to it instead ("lifted"). Several relationships lifted to the same pair of ends MAY be drawn as one.

## 7. Presentation

Presentation holds hints for renderers. It never changes meaning; a reader that ignores it still understands the model.

| Member | Meaning |
|---|---|
| `kinds` | Style per entity kind: `{ shape, tone, icon, label }`. `shape` is one of `card`, `cylinder`, `person`, `stack`, `chip`, `frame`. `tone` is a named pigment (`lapis`, `malachite`, `ochre`, `umber`, `tyrian`, `slate`, `accent`, `verdigris`) or a hex color `#rrggbb`. `icon` is a Lucide icon name. `label` is the human name of the kind. |
| `relationships` | Line style per relationship kind: `{ pattern: solid \| dashed \| dotted, head: arrow \| open-arrow \| triangle \| none }`. |
| `elements` | Overrides by element id, for every view: `{ tone?, icon?, width?, height?, emphasis? }`. Default `{}`. |
| `views` | Overrides by view id, then element id. Default `{}`. |

Interaction state — what is selected, hovered, zoomed or open — is not part of a document.

## 8. Extensions

### 8.1 Declaring

A document lists the extensions it uses:

```json
"extensions": [{ "name": "ownership", "version": "0.1.0", "required": false }]
```

`name` matches `^[a-z][a-z0-9-]*$` and is also the extension's namespace. `required` defaults to `false`.

### 8.2 Kinds

An extension MAY define entity kinds and relationship kinds. They are written `"<name>/<kind>"`, for example `"ownership/team"`. A kind with a namespace MUST name a declared extension.

### 8.3 Facets and view types

An extension MAY attach data ("facets") to entities, relationships, data types, use cases and views, under `ext["<name>"]`:

```json
{ "id": "payment-service", "kind": "service", "ext": { "ownership": { "team": "team-payments" } } }
```

An extension MAY define view types, used as `{ "type": "extension", "extension": "<name>/<view type>", "entities": [...], "data": ... }`. The `entities` member lets readers that do not know the extension still search for and link to the view.

### 8.4 Reading extensions

- Every key of an `ext` object and every namespaced kind MUST name an extension declared in `extensions`. Otherwise the document is invalid.
- If a reader does not know an extension that is declared with `required: true`, it MUST reject the document. A required extension changes how the document must be understood.
- If a reader does not know an optional extension, it MUST accept the document, SHOULD warn, and MUST keep the extension's data unchanged when it writes the document.
- If a reader knows an extension, it MUST apply the extension's own rules to its kinds, facets and views.

### 8.5 Defining extensions

An extension definition states: its name and version; its kinds; the shape of each facet and view `data`; and any extra referential rules (for example, "`ext.ownership.team` names an entity of kind `ownership/team`"). The reference implementation expresses this with `defineExtension` in `@hattoriai/poney-core`; see `packages/ext-ownership` for a complete example. Other languages SHOULD publish extension rules as JSON Schema for the facet and view shapes plus prose for the referential rules.

An extension MAY also define lints: warnings about a valid document in the extension's own terms, for example "personal data crosses a trust zone without encryption" (see `packages/ext-security`). Like core lints, they never make a document invalid; each has a stable code that starts with the extension's name.

## 9. Validation

### 9.1 Shape

A document MUST match `spec/poney.schema.json`. JSON Schema covers shape and defaults only.

### 9.2 Referential rules

These rules apply after the shape check. Each one is an error unless marked as a warning.

| Rule | Requirement |
|---|---|
| R1 | Identifiers are unique within `entities`, `relationships`, `dataTypes`, `dataRelations`, `dataFlows`, `behaviors`, `useCases` and `views`; step identifiers within each interaction; node identifiers within each process; state identifiers within each state machine; field names within each data type. |
| R2 | `parent` names an existing entity, and containment has no cycles. |
| R3 | A relationship's `source` and `target` are entities; its `data` entries are data types. |
| R4 | A data type's `ownedBy` and `storedIn` are entities. |
| R5 | A field's `references` names an existing data type and a field of it. |
| R6 | A data relation's `from` and `to` are data types, and `via`, when present, is a field of one of them. A data flow's `source` and `target` are entities, its `data` entries are data types, and `via` is a relationship. |
| R7 | An interaction's participants are entities. A message's `from` and `to` are participants of its interaction; its `relationship` and `data` exist. |
| R8 | An activity has exactly one `initial` node; flows connect nodes of the same activity; `performedBy` is an entity. |
| R9 | A state machine has exactly one `initial` state; transitions connect states of the same machine; `subject` is a data type; `owner` and `triggeredBy` are entities. |
| R10 | A use case's `actors`, `supporting` and `realizedBy` are entities; `behaviors` are behaviors; `includes` are use cases. |
| R11 | Every identifier a view references exists. Groups and layers list only entities that are in the view; a map's `passThrough` names entities. `collapsed` lists entities or groups of the view; in a map, each entity in `collapsed` contains another entity of the view. `sequence`, `activity` and `state` views reference a behavior of the matching kind. |
| R12 | `project.defaultView`, when present, names a view. |
| R13 | In each walkthrough: `overview` and every scene `view` name views; every mark, focus, callout, trace, effect and badge ref names an element of the model or of `removed`; a mark is `removed` exactly when its element is in `removed`; removed elements are not also in the model, and their ends exist. |
| R14 | A `change` walkthrough has `story.before` and `story.after`. A `tour` has no marks, and its code has only `ctx` lines. |
| W1 | *Warning:* an entity kind has no style in `presentation.kinds`. Renderers use a default. |

### 9.3 Lints

A valid document can still read badly. Readers MAY report these warnings, each with a code and a hint. They never make a document invalid.

| Code | Warns when |
|---|---|
| `scene-too-big` | A scene shows too much: a map over 12 boxes (a closed group counts as one, an open group as none), a sequence over 16 messages or 7 participants, a large state machine or view with no focus. |
| `focus-outside-view`, `callout-outside-view` | A scene focuses or numbers an element that its view does not show. |
| `callout-not-focused` | A callout points at an element that the focus dims. |
| `too-many-callouts` | More than five callouts in a scene. |
| `no-proof` | A scene asks for a close look and lists no proof. |
| `no-marks`, `mark-not-shown`, `no-change-shown` | In a change: nothing is marked, a mark appears in no scene, or a scene shows nothing the change touches. |
| `trace-outside-view`, `effect-outside-view`, `badge-outside-view` | A trace step, an effect or a badge names an element its view does not show. |
| `flow-on-box`, `long-trace` | A `flow` effect on a box, or a trace over 12 steps. |
| `no-source` | In a tour: a scene has no code, no proof file, and none of what it is about has `sourceRefs`. |
| `thin-story`, `empty-scene` | The story is a fragment, or a scene has neither a view nor code. |
| `long-name`, `long-label` | Names, labels or events too long to sit on a diagram. |

### 9.4 Error paths

Readers SHOULD report each problem with a path: member names and array indexes joined by dots, from the document root. For example `model.relationships.4.target` or `views.2.entities.7`. The conformance suite uses these paths.

## 10. Processing model

The format is the first stage of a pipeline. Every stage after it is optional and replaceable.

```
Poney JSON ─▶ parse + validate ─▶ model (canonical form)
                                        │
                     project (per view) ▼
                                   diagram graph ─▶ layout ─▶ scene ─▶ renderer
                                                                    (SVG, Canvas, WebGL,
                                                                     static image, …)
```

- The **model** — the validated document in canonical form — is the intermediate representation. Tools that generate, edit, convert or analyse software descriptions work at this stage. They need no layout and no renderer.
- A **projection** turns one view into a diagram graph: which nodes, which edges, which groups. Projections are pure functions of the model.
- A **layout** turns a diagram graph into a **scene**: numbers only (rectangles, routed points, label positions), with anchors keyed by element reference. The format does not specify layouts; the `positions` member of a view lets authors fix points.
- A **renderer** draws a scene.

## 11. Versioning

`poneyVersion` follows semantic versioning. Before 1.0.0, any minor version MAY break compatibility. After 1.0.0, a reader for version *M.n* MUST read any *M.m* document with *m ≤ n*. New optional members and new core kinds are minor changes.

## Appendix A. Files

| File | Content |
|---|---|
| `spec/SPEC.md` | This document. |
| `spec/poney.schema.json` | JSON Schema (draft-07) of the document shape, generated from the reference implementation. |
| `spec/examples/kestrel-commerce.poney` | A complete example: a commerce platform with fourteen views (one from the ownership extension) and a walkthrough. |
| `spec/examples/walkthrough.poney` | A stand-alone walkthrough, as an agent writes one. |
| `spec/conformance/` | Valid and invalid documents with expected results (`manifest.json`). |

## 11. Versions

A document names the version of the format it was written for in `poneyVersion`. A reader of this version MUST accept a document of an earlier version and upgrade it before validating; a writer writes the current version.

**0.1.0 → 0.2.0** (the names that follow the industry's terms):

| 0.1.0 | 0.2.0 |
|---|---|
| Entity kind `module` | `component` (C4) |
| Entity kind `queue` | `message-broker` |
| Their styles in `presentation.kinds`, with the default labels "Module" and "Event bus" | Moved to the new kinds; the labels become "Component" and "Message broker" |
| Cardinality `one`, `many` | `exactly-one`, `zero-or-many` (crow's foot) |
| `model.capabilities`, a use case view's `capabilities`, refs `capability:<id>` | `model.useCases`, `useCases`, `useCase:<id>` (UML) |
| View category `capabilities` | `use-cases` |
| Behaviour kind `process`, an activity view's `process` | `activity` (UML), `activity` |
| Activity node kinds `start`, `end` | `initial`, `final` (UML) |
| State kind `normal` | `state` |
| Tone `poney` | `accent` |
