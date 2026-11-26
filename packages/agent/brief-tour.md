# A tour

`"kind": "tour"`. It teaches a codebase as it is, to a person who is new to it. A tour has no marks, no `removed`, and no before and after: the diagrams show the code as it is today.

- **title**: what the reader will understand. "How Acme Notes saves a note", "A first walk through the billing service".
- **summary**: one sentence: what the codebase is, and what the tour covers.
- **story.text**: two or three plain sentences: what the code is for, who uses it, and what the tour leaves out.
- **source**: `{ "kind": "Repository", "repository": "<name or path>", "head": "<commit>" }`, so a reader knows which version the tour describes.
- **overview**: the whole codebase on one map, with its big parts as **closed groups**. The reader opens them in the Studio.
- **verdict**: optional. Use `facts` for what a newcomer asks first: language and framework, how to run it, how to run the tests, where the entry points are. Use `findings` for traps: a surprising name, a slow test suite, code that looks dead but is not. `risk` is `routine` unless something is fragile.

## Choosing the scenes

Five to eight scenes. Each one answers one question a newcomer has, in this order:

1. **What are the parts?** A map: the big parts, closed. One sentence each in callouts.
2. **Where does a request come in?** The entry points: routes, a CLI, a job runner. An excerpt of the router.
3. **What happens to one request?** The main flow as a sequence, end to end, for the most common action. Focus on fewer messages if it is long.
4. **Inside the part that matters most.** A map with that group open, the rest closed.
5. **What is kept, and how it moves.** The data: a state machine for the main record, or a map of what reads and writes the stores.
6. **Where to start a change.** The files a newcomer touches first, and the tests that cover them.

Leave out what a newcomer does not need on day one. Say so in `story.text`.

## Code in a tour

Show code as it is, as an **excerpt**: `{ "path": "src/notes/save.ts", "title": "saveNote", "start": 12, "text": "export async function saveNote(…) {\n  …\n}" }`. `start` is the number of the first line; `text` is the lines as they are in the file, joined with `\n`. Five to twenty lines; cut to the part that matters. Put `notes` under the lines that need a word. The check proves that every line is in the file at its number: copy the lines, do not retype them. A tour has no `add` or `del` lines.

Give each important entity `sourceRefs`, so the reader can open the code from the picture. A scene that has no excerpt and no `sourceRefs` on what it focuses gets a warning: a tour must lead the reader to the code.

## Questions in a tour

`question` checks understanding: "Where would you add a rate limit?", "Which module owns the lock?". The reader types an answer; you read it with `poney_read` and tell them whether they are right, with `poney_reply`.

## Teaching: the question loop

A tour is the start of a conversation. After `poney_open`:

1. Call `poney_wait`. It returns when the person asks a question in the Studio ("Ask the agent"), with the scene they were on and what they selected.
2. Read the code that answers it. Do not guess.
3. If a picture helps, add a scene (or a whole walkthrough) to the document, check it, and `poney_open` it again. The person's place and answers stay.
4. Answer with `poney_reply`: short, plain, and with `scene` set to the new scene when there is one, so the reply links to it.
5. Call `poney_wait` again. Stop when the person says they are done.
