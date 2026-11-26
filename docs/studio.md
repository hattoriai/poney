# Poney Studio

Poney Studio is where people read walkthroughs, explore diagrams and talk to the agent that wrote them. It is one host for the Poney renderers among others: everything it draws comes from [`@hattoriai/poney-react`](../packages/react).

```sh
npx @hattoriai/poney studio     # or: npm install -g @hattoriai/poney, then poney studio
```

The Studio works on its own in the browser. Started with `poney studio`, a small local hub also serves it: the hub saves documents to files, starts agents and talks to agents in their own sessions. It listens on 127.0.0.1 only.

## The start page

A new tab opens on the start page: open a `.poney` file (or drop it, or paste it), reopen recent work, or connect an agent. Reloading a tab keeps its document. **Try the example** opens Kestrel Commerce, a sample online store with a change walkthrough ("Let customers retry a declined card") and a tour ("A first walk through Kestrel"). `?example=kestrel` in the address opens it directly.

## Reading a walkthrough

- **The story and the overview map.** Switch Before, Change and After: the new retry worker and its lines appear and disappear in place.
- **Scenes.** Scroll. The diagram on the right stays in view, and its camera moves to each scene's focus; the rest of the view dims. The numbered notes in the text match the numbers in the diagram: hover one to light up the other.
- **Each scene** has what happens in each case, the proof (a missing test is called out), an optional question for the reader, and the code with notes, with syntax colours for its language.
- **The diagram is a canvas.** Pinch or <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + scroll zooms the diagram, never the page; drag pans; double-click zooms in; "Reset view" frames the scene again. "Expand" opens it near full screen.
- Reading progress and answers are kept in this browser.

Scenes can also say what a reader must see, by meaning: a `trace` (a path the reader plays step by step while the camera follows), `effects` (`flow`, `attention`, `hot-path`, `slow`, `failing`, `blocked`) and `badges` (short facts such as "p95 840 ms"). The Studio animates them; a PNG draws them still and numbers the path. Nothing moves for readers who ask for reduced motion.

## Exploring the whole system

**Explore the whole system** opens every view of the document. In the Kestrel example, one model drives fourteen views:

| Category | Views |
|---|---|
| Overview | System context, Architecture, Payment retry map |
| Behavior | Sign-in sequence, Checkout sequence, Payment retry sequence, Checkout activity, Order lifecycle |
| Data | Checkout data flow, Data model |
| Structure | Order service components, Service dependencies |
| Use cases | What people can do |
| Ownership (extension) | Team map |

Things to try:

- Select the **Payment service** in Architecture. The inspector shows its connections, data, team and the behaviours it takes part in. Select **Open checkout sequence**: the sequence opens with the Payment service still selected and centred.
- In the checkout sequence, step through the messages with the arrows in the toolbar.
- In the Data model, select `orders.id` to see every table that refers to it, across databases.
- In Order service components, turn on **Follow dependencies all the way**.
- Press <kbd>⌘K</kbd> to search parts, tables, behaviours and diagrams.
- Paste a Mermaid diagram, or Poney JSON, anywhere in the Studio. It opens as a new project. **Export → Copy JSON** copies the current model.
- Press <kbd>?</kbd> for every keyboard shortcut.

**Facts** in the top bar shows live facts on the parts, such as test coverage and recent changes; **Import from the code…** in the project menu adds what an importer finds, such as the tables of a database schema. See [plugins](extending.md#plugins-importers-and-overlays).

## Working with agents

There are two ways, and they work together:

- **Start an agent from the Studio.** "Connect an agent" picks the folder it works in (a folder on this computer, or a Git address that Poney clones into `~/.poney/workspaces`) and the agent: Claude Code, OpenAI Codex, OpenCode, GitHub Copilot, or any other agent that speaks the [Agent Client Protocol](https://agentclientprotocol.com), by its command. The agent uses your own sign-in. Poney gives it the Poney MCP tools and tells it how to use them, so the tours and walkthroughs it writes open in the Studio at once. You talk to it in the agent panel, which shows what the agent does and asks you before it acts when the agent asks.
- **Use your own agent session.** Add the Poney MCP server to your agent (see [Agents, the CLI and MCP](agents.md)). When a Studio hub runs, the MCP server attaches to it by itself (or set `PONEY_HUB_URL`); otherwise it starts its own hub. Your questions in the agent panel reach the agent through `poney_wait`, and its answers come back with `poney_reply`.

Both kinds of agent share one document and one conversation, so the Studio is the same either way. Without an agent, the agent actions show greyed, with a way to connect one.

In a scene, **Ask the agent** asks about what you see, and the target button points the agent at one part of the diagram. Each scene also has **Add a note for the agent**; answers and notes reach the agent through `poney_read`.

## Documents are files

As notebooks are in Livebook, Poney documents are files. When an agent starts in a folder, the Studio opens that folder's project, saved to `docs/poney/<folder>.poney` once there is something to keep (or opened from there, when the file already exists). Every change, from the agent or from you, is saved to the file, and a change to the file on disk (an editor, `git pull`) shows in the Studio. "Open a file" browses this computer for `.poney` files.

Commit the files with the code. A tour then lives with the code it explains, and `poney check --git` shows when it no longer matches.
