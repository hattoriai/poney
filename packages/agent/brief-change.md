# A change walkthrough

`"kind": "change"` (the default). It explains one commit, merge request or branch.

```
marks      [{ ref, state: new|changed|removed, note? }]
removed    elements the change removed, as they were: { entities, relationships, transitions }
```

- **title**: what changes, in the words of a person who uses the product. "Lock an account after five failed sign-ins", not "Add LockoutService".
- **story.text**: two or three plain sentences. Who notices the change, and how. **before** and **after** (both required): one line each.
- **source.kind**: what the change is: `"Commit"`, `"Merge request"`, `"Pull request"` or `"Branch"`. `ref` is its name or number, `head` the commit, `base` where it starts.
- **verdict.facts**: what a reviewer weighs, each with a plain label: **Undo** (can a revert undo it, or what else it takes), **Other systems** (what outside systems it touches), **Data** (what data changes), **Proof** (what shows it works: tests, CI, screenshots), **To read** (how long to read). Use the plain words a developer uses, such as "a revert undoes it".
- **verdict.findings**: what you found that the reader must weigh — a risk, a gap, a surprise — that is not a question. Point `scene` at the scene that shows it.
- **marks**: every element the change adds, changes or removes. A mark's `note` shows when the reader selects the element. The model describes the system **after** the change. A removed element goes in `removed` and gets a `removed` mark. Marks make the diagrams show the change: new in green, changed in amber, removed struck out, and a Before / After switch.
- **questions**: decisions the reader should make ("Keep it" or "Ask for a change"). A risk that needs no decision is a `finding`, not a question.
- **code**: the diff lines that matter for this scene. Copy lines and numbers from the diff: `{ "kind": "add", "new": 42, "text": "…" }`, `{ "kind": "del", "old": 40, "text": "…" }`, and `ctx` lines with both. Lines that are not next to each other go in separate `hunks`; `header` is optional. To show unchanged code from a file the change does not touch, give an excerpt instead: `{ "path", "start", "text" }` (see the tour guide).

Order the scenes: the behaviour first, then how it is built, then the data, then the routine changes.

## What the format cannot show yet

A message that the change removed from a sequence, and one step waiting for another. Say them in the scene `text` and in a callout on the nearest message.
