# Writing a Poney walkthrough

A walkthrough explains software to a person, in scenes they read in order. There are two kinds:

- A **change** (`"kind": "change"`, the default) explains **one change** to a person who did not make it: a reviewer, a teammate, the owner of the product. They should understand what changes for people, how the system now behaves, and where to look closely — in a few minutes, without reading the whole diff.
- A **tour** (`"kind": "tour"`) teaches **a codebase as it is** to a person who is new to it. They should understand what it is for, how its parts fit, how one request moves through it, and where to start reading — and then ask you questions.

You write the content as one JSON document (a `.poney` file). You never write coordinates, sizes or colours: Poney lays out and draws every diagram. Your job is to choose **what to show** and **what to say**.

## The loop

1. Read the code: for a change, the diff, the files around it and the tests; for a tour, the entry points, the main modules and the tests.
2. Write the document (shape below; the part for your kind and a full example follow this guide).
3. **Copy code, do not retype it.** `poney excerpt <repo> <path> <from>-<to>` (or the `poney_excerpt` tool) prints a code block with `start` and `text`, copied from the file.
4. **Check** it against the code: `poney check file.poney --git <repo>@<rev>`, or the `poney_check` tool with `repo` and `rev`. `rev` is a commit, a range `<base>..<head>`, or `working` for the files on disk. Besides the format, this proves that every line of code you show is where you say it is, that every test you cite exists, and that every path in `sourceRefs` exists. Fix every error — the hints say where the right line or file is. Read every warning: each one names a reason the walkthrough reads badly, and how to fix it.
5. **Render** every scene with a view, including `overview` (`poney render file.poney --scene <id>`, or `poney_render`), and look at the picture. The PNG shows the numbered notes under the picture. If a scene is crowded, unclear, or does not show the point of its text, change the scene.
6. Repeat until the check is clean and every picture makes its point at a glance.
7. With the MCP tools, show it with `poney_open`, then read what the person does with `poney_read`, and answer their questions with `poney_wait` and `poney_reply`.

## The document

```
poneyVersion   "0.1.0"
project          { id, name, description }
model            what the walkthrough talks about — only that
  entities       parts of the system: { id, kind, name, summary, parent?, technology?, sourceRefs? }
  relationships  connections: { id, kind, source, target, label, protocol? }
  dataTypes      tables, records, events, with fields
  behaviors      interactions (sequences), state machines, processes
walkthroughs     [ the walkthrough ]
```

Model **only what the story needs**. A walkthrough of a sign-in change needs the user, the web app, the API, the database — not every service in the company. A tour needs the parts a newcomer must know, not every file.

### Entities and relationships

- `kind` of an entity: `person`, `web-app`, `service`, `gateway`, `database`, `cache`, `queue`, `external`, `module`, `interface`, `library`, `system`.
- `kind` of a relationship: `uses`, `calls`, `reads`, `writes`, `reads-writes`, `publishes`, `subscribes`, `depends-on`, `implements`.
- `name`: what a person calls it ("Payment service"), not a class path. Under 32 characters.
- `summary`: one line on what it is for.
- `parent`: the entity this one is part of — a module inside a service, a service inside a system. A map that shows both draws the child inside the parent (see Scenes).
- `label` of a relationship: a short verb phrase, read from source to target ("Reserves stock"). Under 36 characters.
- `sourceRefs`: `{ path, line?, symbol? }`, so a reader can open the code. `path` is relative to the root of the repository; a folder is fine for a module. Name only files you read; the check refuses paths that do not exist.

### Behaviors

- **Interaction** (a sequence): `participants` in left-to-right order, then `steps`. A step is a message `{ type: "message", id, kind: call|return|async|self, from, to, label }` or a fragment `{ type: "fragment", id, kind: alt|opt|loop|par, label, branches: [{ guard, steps }] }`. Message labels under 48 characters, and under 40 when the message is marked (a "New" tag follows the label). A `call` label says what is asked ("Find user by email"); a `return` label says what comes back ("User row", "401 Unauthorized").
- **State machine**: `states` (exactly one `initial` — it is drawn as a start dot with no name, so make it its own state, e.g. `{ "id": "start", "kind": "initial", "name": "Start" }`, with a transition to the first real state; `final` for end states; `outcome: success|failure` where it helps) and `transitions` `{ id, from, to, event, guard?, actions?, triggeredBy? }`. Events under 32 characters; conditions go in `guard`.
- **Process** (a flowchart): `nodes` `{ id, kind: start|end|action|decision|merge|fork|join, label, performedBy?, outcome?: success|failure }` (exactly one `start`; note `label`, not `name`) and `flows` `{ id, from, to, guard? }`, with `guard` on the branches of a decision.

Ids are lowercase: letters, digits, `-`, `_`, `.`. Keep them short and readable: `s-locked`, `t-lock`, `r-api-db`.

## The walkthrough

```
id, kind, title, summary
source     { kind, ref?, repository?, base?, head?, url?, author?, files?, added?, removed? }
story      { text, before?, after? }
overview   a view: the picture next to the story
verdict    { risk: look|routine, facts: [{ label, value }], findings: [{ text, severity: risk|note, scene? }] }
scenes     in reading order
```

A change also has `marks` and `removed`; see the part for your kind.

### Text

Text fields (titles, summaries, story, scene text, notes, cases, questions, captions) may use inline Markdown: `**bold**`, `*italic*`, `` `code` `` and `[links](https://…)`. Blank lines separate paragraphs in the story and in scene text. Nothing else: no headings, lists or HTML. Use `code` for names from the code (functions, files, columns); keep bold for the one phrase that matters.

### Refs

Marks, focus and callouts point at elements with a ref:

| Element | Ref |
|---|---|
| entity | `entity:api` |
| relationship | `relationship:r-api-db` |
| table or field | `dataType:users`, `dataType:users#locked_until` |
| message, fragment | `message:sign-in:s5`, `fragment:sign-in:f-check` |
| state, transition | `state:account:locked`, `transition:account:t-lock` |
| process node, flow | `activityNode:checkout:a-pay`, `activityFlow:checkout:f3` |

### Scenes

A scene makes **one point**. Each has:

- `title`: the point, as a sentence. "Sign-in checks the lock first."
- `text`: two to four sentences that explain it.
- `risk`: `look` when the reader should slow down; else `routine`.
- `view`: what to look at, written inline, or the id of a view in `views` shared by several scenes (a shared view takes the same fields). The check reports a problem in an inline view with the scene it belongs to. Omit it for a scene of code only. Scenes draw three kinds of view in the story style (and as PNG):
  - `{ "type": "map", "entities": [...], "relationships"?: [...], "passThrough"?: [...], "collapsed"?: [...], "layout"?: { "direction": "right" | "down" } }` — boxes and lines. Without `relationships`, every relationship between the entities is drawn. `passThrough` leaves out a hop that does not matter (a gateway) and draws its lines "through" it; the joined line shows the label of the line **into** the hop, with "through <name>" under it. `direction: "down"` suits long chains.
    - **Groups.** When an entity and its `parent` are both in `entities`, the child is drawn inside the parent's frame. `collapsed` lists groups drawn closed: one box ("4 inside") where the lines of everything inside join. **The children must be in `entities` too**: a group closes over what the map shows, so a parent with none of its children listed is just a box (and naming it in `collapsed` is an error). The reader opens and closes groups in the Studio. Use closed groups to show a large codebase a few boxes at a time, and open one group per scene to go inside it.
  - `{ "type": "sequence", "interaction": "<id>" }`. The sequence numbers its own messages; in a picture, callouts are black circles and trace steps are lettered squares (A, B, C), so the three never clash.
  - `{ "type": "state", "stateMachine": "<id>" }`
  - Other views (`activity` for a process, `erd`, `dataflow`) show in the Studio in a different style and cannot be rendered; the check warns. Prefer the three above.
- `focus`: the refs the scene is about. The picture frames them and dims the rest; a focused line or transition keeps its two ends bright, and a focused line shows its label. A focused entity inside a closed group lights the group. In a sequence, focusing messages shows **only** those messages and their participants — use it to cut a long sequence down to the part that matters.
- `callouts`: up to five numbered notes `{ target, text }`, pinned on elements in the picture. Say what a reader would miss without them. Each target must be in the view (an error otherwise), and should be in the focus when there is one (a warning: it would be dimmed).
- `cases`: `{ when, then, note? }` — what the code does in each situation, including edge cases.
- `proof`: `{ text, source, test? }` per test or check that proves a case: `source` is the file, `test` the test's name as written in it. A case with no test gets `{ text, missing: true }`. Never invent a test; the check refuses files and names that do not exist.
- `question` (and `questions`, a list): what the reader should answer. Its meaning depends on the kind; see your part.
- `code`: a few lines that matter for this scene, with `notes` `{ line, text }` under the lines that need a word. Not whole files. The form depends on the kind; see your part.

### Emphasis and motion

Three scene fields say what the reader must **see**, by meaning. You never choose colours, speeds or animations: the Studio animates, a PNG draws the same marks still, and readers who ask for less motion get none.

- `trace`: `[{ ref, caption }]` — a path through the picture, in order: relationships, messages or transitions (and boxes to stop at). The reader plays it step by step: a token moves along each line, and the caption shows. A PNG numbers the steps in small squares and lists the captions under the picture. Use it for "what happens to one request". Up to twelve steps; each caption is one short sentence.
- `effects`: `[{ target, as, tone? }]`, where `as` is:
  - `flow` — data moves along this line (lines only);
  - `attention` — look here first (a slow pulse);
  - `hot-path` — the main path stands out;
  - `slow` — this takes time;
  - `failing` — this fails, or the error starts here;
  - `blocked` — nothing gets through here.

  Use one or two per scene. An effect on everything is an effect on nothing.
- `badges`: `[{ target, text, tone? }]` — a short fact on a box or a line (a relationship, a message in a sequence, a transition): `"p95 840 ms"`, `"3 retries"`, `"120 k rows"`. Under 18 characters. Give only numbers you read in the code, the config or the tests; never invent one.

`tone` is optional: `lapis`, `malachite`, `ochre`, `umber`, `tyrian`, `slate`, `poney`, `verdigris`, or `#rrggbb`. Leave it out unless a colour carries meaning the effect does not.

### Extensions

An extension adds kinds and data under its own name. Declare it in `extensions`, then use it only where the code proves it.

- **security** — trust zones and sensitive data. Add a zone as an entity of kind `security/zone` (`ext.security.trust`: `public`, `internal` or `restricted`), and put parts in it with `ext.security.zone` (a part without one takes its parent's zone). Mark data types with `ext.security.classes`: `personal`, `secret`, `payment`, `health`. On a relationship that crosses zones, say how it is protected: `ext.security.encrypted` (TLS counts) and `ext.security.auth` (`"mTLS"`, `"OAuth token"`, `"none"`). `poney_check` then warns where sensitive data crosses a zone unprotected.
- **ownership** — teams (`ownership/team`) and `ext.ownership.team` on the parts they own.

## What good looks like

- **Small pictures.** A map shows at most twelve boxes (a closed group counts as one); a sequence at most sixteen messages (focus on fewer). If a picture needs more, it is two scenes.
- **Order by understanding**, not by file.
- **Plain words.** Name things as people do. Explain why, not only what.
- **Every claim checked.** Every ref resolves (the checker proves it). Every test you cite exists. Every line of code you show is where you say it is.
