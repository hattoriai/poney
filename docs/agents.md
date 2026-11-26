# Agents, the CLI and MCP

Use the CLI to check a walkthrough or render a diagram from the terminal. Through the Model Context Protocol (MCP), your coding agent can also open the walkthrough in Studio and answer questions there.

## Install

```sh
npm install -g @hattoriai/poney     # installs poney and poney-mcp (Node 22 or later)
```

For a one-off command, use `npx @hattoriai/poney <command>`. You can also run the MCP server with `npx -y --package=@hattoriai/poney poney-mcp`.

## The MCP server

`poney-mcp` uses standard input and output (stdio). In Claude Code, choose the command that matches your installation.

```sh
claude mcp add poney -- poney-mcp                                     # global install
claude mcp add poney -- npx -y --package=@hattoriai/poney poney-mcp   # run with npx
```

In another MCP client, use `poney-mcp` as the server command, or `npx` with the arguments shown above. This repository’s `.mcp.json` runs the server from source.

| Tool | What it does |
|---|---|
| `poney_guide` | Returns the guide and a worked example for a change walkthrough (default) or a tour (`topic: "tour"`). |
| `poney_schema` | Returns the document’s JSON Schema for structured output. |
| `poney_check` | Reports errors and warnings with hints. Pass `repo` to check excerpts, diffs, cited tests and `sourceRefs` against the code. Set `rev` to a commit, a range (`a..b`) or `working` for uncommitted changes. |
| `poney_render` | Renders a scene or view as a PNG. Defaults to the document open in Studio. |
| `poney_open` | Opens a document in Studio and updates connected windows. |
| `poney_read` | Returns the reader’s current scene, selection, answers, notes and conversation. Includes the document if the reader edited it. |
| `poney_wait` | Waits for a question from Studio and returns it with the reader’s scene and selection. |
| `poney_reply` | Posts an answer in Studio, with an optional link to a scene. |
| `poney_excerpt` | Copies lines from a source file into a scene’s `code` block. |
| `poney_import` | Adds tables or module dependencies from a repository and preserves existing entries. |
| `poney_overlay` | Uses source paths to show test coverage or recent changes for each part of the system. |

## The CLI

```sh
poney brief                                   # authoring guide and example (add --tour for a tour)
poney check lockout.poney                     # validate a document
poney check tour.poney --git .                # check excerpts and references against the code
poney render lockout.poney --scene states     # export one scene as a PNG
poney render shop.poney --view architecture --format svg   # export a view as SVG
poney schema                                  # print the JSON Schema
poney excerpt . src/notes/save.ts 12-40       # copy lines 12–40 into a code block
poney import diagram.mmd --out diagram.poney  # convert a Mermaid diagram
poney import                                  # list importers and the files they would read
poney import schema . --into app.poney        # add tables and foreign keys from the database schema
poney overlay coverage app.poney .            # show test coverage by part of the system
poney studio                                  # start Studio locally
```

`poney --help` lists every option.

## The live Studio

Open the address returned by `poney_open`. Look for **Live** in Studio’s top bar to confirm the connection. The MCP server looks for Studio on port 5319 (or `PONEY_PORT`) and starts a local server if needed. Set `PONEY_HUB_URL` to connect to a specific server.

For a tour, call `poney_open`, then `poney_wait`. Answer each question with `poney_reply` and wait again. Include a scene ID to point the reader to a diagram.

## What makes a good walkthrough

Give each scene one thing to explain. Copy the relevant lines from the source file, and name the test that covers the case you describe. `poney brief` prints the [authoring guide](../packages/agent/brief.md) with instructions for a [change walkthrough](../packages/agent/brief-change.md) or a [tour](../packages/agent/brief-tour.md).

## Mermaid

`poney import diagram.mmd` reads a Mermaid diagram and prints a Poney document with one view. It supports `sequenceDiagram`, `flowchart` (or `graph`), `stateDiagram`, `stateDiagram-v2` and `erDiagram`, and skips styling directives. In JavaScript, use `fromMermaid` from `@hattoriai/poney-core`.
