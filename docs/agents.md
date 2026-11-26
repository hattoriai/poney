# Agents, the CLI and MCP

An agent learns the format from the guide, writes a `.poney` file, checks it, looks at each scene, and shows it to a person. It can do each step with the CLI or with the MCP server; they do the same things.

## Install

```sh
npm install -g @hattoriai/poney     # the commands poney and poney-mcp (Node 22 or later)
```

Or without installing: `npx @hattoriai/poney <command>`, and for the MCP server `npx -y --package=@hattoriai/poney poney-mcp`.

## The MCP server

`poney-mcp` speaks MCP over stdio. To add it to Claude Code:

```sh
claude mcp add poney -- poney-mcp                                     # installed
claude mcp add poney -- npx -y --package=@hattoriai/poney poney-mcp   # without installing
```

Other MCP clients take the same command. In this repository, `.mcp.json` registers the server from source.

| Tool | What it does |
|---|---|
| `poney_guide` | The guide and a complete example, for a change (default) or a tour (`topic: "tour"`). |
| `poney_schema` | The JSON Schema. |
| `poney_check` | Validates and lints: errors and warnings with paths and fix hints. With `repo` (and `rev`: a commit, `a..b`, or `working`), it also proves that the code shown is in the diff or the file at those lines, and that cited tests and `sourceRefs` exist. |
| `poney_render` | One scene as a PNG, so the agent can see it. Without a document, it renders what is open in the Studio. |
| `poney_open` | Shows a document live in Poney Studio. Every open window updates. |
| `poney_read` | What the person sees and does: the scene, the selection, answers to questions, notes for the agent, the question thread, and the document if they changed it. |
| `poney_wait` | Waits for the next question the person asks in the Studio ("Ask the agent"), with the scene they were on. |
| `poney_reply` | Answers in the Studio thread. A reply can link to a scene. |
| `poney_excerpt` | A code block copied exactly from a file, for a scene's `code`. |
| `poney_import` | Adds what an importer reads in the repository (a database schema, the module imports) to the open document. It only adds. |
| `poney_overlay` | Live facts about the parts, through their source paths: test coverage, recent changes. |

## The CLI

```sh
poney brief                                   # the guide and a complete example (--tour for a tour)
poney check lockout.poney                     # errors and warnings, each with a fix hint
poney check tour.poney --git .                # also checks the code it shows against the repository
poney render lockout.poney --scene states     # PNG (or --format svg), exactly as the Studio draws it
poney render shop.poney --view architecture --format svg   # any view of any type
poney schema                                  # the JSON Schema, for structured output
poney excerpt . src/notes/save.ts 12-40       # a code block copied from a file
poney import diagram.mmd --out diagram.poney  # Mermaid to Poney
poney import                                  # the importers, and what each would read here
poney import schema . --into app.poney        # add tables and foreign keys from the database schema
poney overlay coverage app.poney .            # live facts on the parts: test coverage, recent changes
poney studio                                  # Poney Studio, in your browser
```

`poney --help` lists every option.

## The live Studio

The MCP server runs a small local hub (port 5319 and up, or `PONEY_PORT`), which also serves the Studio, so the person opens the address `poney_open` gives. The top bar shows **Live** when the Studio is linked to a hub. When a Studio hub already runs, the MCP server attaches to it (or to `PONEY_HUB_URL`).

A typical loop for a tour: `poney_open` the document, then call `poney_wait`; when it returns a question, answer with `poney_reply` (with a link to a scene where it helps), then wait again.

## What makes a good walkthrough

[`packages/agent/brief.md`](../packages/agent/brief.md) is the guide that `poney brief` prints, with [`brief-change.md`](../packages/agent/brief-change.md) and [`brief-tour.md`](../packages/agent/brief-tour.md). In short: small scenes, plain words, every ref resolved, every test real, code copied and never retyped.

## Mermaid

`poney import diagram.mmd` (and `fromMermaid` in `@hattoriai/poney-core`) converts `sequenceDiagram`, `flowchart`/`graph`, `stateDiagram(-v2)` and `erDiagram` into a Poney document with one view. Mermaid describes one picture; the import creates the entities, behaviours and data types that the picture implies. Styling directives are ignored.
