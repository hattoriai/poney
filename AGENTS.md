# AGENTS.md

Instructions for coding agents that work on this repository. To *use* Poney to explain code, read the guide instead: `npm run poney -- brief`.

## The project

Poney is an open format (`.poney`, JSON) for explaining software in diagrams, with renderers anyone can use, and tools for agents (a CLI and an MCP server) and for people (Poney Studio). It is an npm workspace. [docs/architecture.md](docs/architecture.md) describes the packages and the pipeline: document → upgrade and validate → projection → layout → scene → renderer.

## Commands

Node 22 or later. Run from the repository root.

```sh
npm install
npm run typecheck              # every package; must pass
npm test                       # Vitest; must pass
npm run spec                   # after any change to the schema or the Kestrel example
npm run poney -- check <file>  # the CLI, from source
npm run poney -- render <file> --view <id> --out /tmp/view.png   # look at a diagram
```

Do not build to test a change: the packages resolve to their source through the `poney-source` export condition. `dist/` folders and `spec/poney.schema.json` are generated; do not edit them by hand.

## Rules

- Packages depend only on packages below them: core → layout → diagrams → react, render and element → agent. `@hattoriai/poney-core` imports no UI library, and `@hattoriai/poney-diagrams` imports no UI framework: its renderers are JSX for its own small runtime, and `@hattoriai/poney-react` adapts them to React.
- No Tailwind and no global CSS in `packages/`. The stylesheet is plain CSS in `@layer poney`, with `--poney-*` tokens and `.poney-*` classes. Only `apps/studio` uses Tailwind.
- `THEMES` in `packages/diagrams/src/theme.ts` must stay equal to the tokens in the stylesheet; a test checks it.
- Format changes: change `packages/core/src/schema`, `validation/validate.ts` and `spec/SPEC.md`, then `npm run spec`. A breaking change raises `PONEY_VERSION` and adds an upgrade step in `packages/core/src/upgrade.ts`, with a test and a row in section 11 of the specification. Never break existing `.poney` files without an upgrade.
- Use the industry's names for diagram concepts (C4, UML, crow's foot). Do not invent new terms.
- Add a conformance document in `spec/conformance` for each new validation rule.
- There is no Prettier or ESLint configuration. Do not run a formatter on whole files; follow the style around your change.
- UI text is short and plain: one fact, one action.
- This repository is open source: no private paths, names or internal plans in code, comments or docs.

## Checking your work

- `npm run typecheck` and `npm test`.
- For layout or renderer changes, render the views you changed and look at the PNGs.
- For Studio changes, run `npm run dev` and check in a browser.
- If you changed what users of the packages notice, add a line to `CHANGELOG.md` under the next version.
