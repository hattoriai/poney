# Contributing to Poney

Thank you for helping. Issues and pull requests are welcome at [github.com/hattoriai/poney](https://github.com/hattoriai/poney).

## Set up

Node 22 or later.

```sh
git clone https://github.com/hattoriai/poney && cd poney
npm install
npm run dev        # the Studio at http://localhost:5173, with its local hub
```

Nothing needs building to develop: inside this repository, the packages resolve to their source (the `poney-source` export condition in TypeScript, Vite, Vitest and the scripts).

| Command | What it does |
|---|---|
| `npm run dev` | The Studio dev server at http://localhost:5173. It starts the local hub too, or uses one that runs |
| `npm run studio` | The Studio from its production build, with its hub at http://127.0.0.1:5319 (run `npm run build` first) |
| `npm test` | Every test: the format, layouts, renderers, conformance, the CLI and the hub |
| `npm run typecheck` | Type checks every package |
| `npm run spec` | Generates `spec/poney.schema.json` and `spec/examples/kestrel-commerce.poney` from the source |
| `npm run poney -- <command>` | The CLI, from source: `npm run poney -- check spec/examples/tour.poney` |
| `npm run mcp` | The MCP server, from source (`.mcp.json` registers it for Claude Code) |
| `npm run build:packages` | Builds what is published to npm |

## Where things are

[docs/architecture.md](docs/architecture.md) describes the packages, the pipeline from document to picture, and the local hub. [docs/extending.md](docs/extending.md) says how to add an extension, a plugin or a diagram type.

## Rules of the codebase

- **Each package depends only on the packages below it** in this order: core, layout, react, render, agent. The format (`@hattoriai/poney-core`) imports no UI library; a test checks this.
- **The packages have no Tailwind and no global CSS.** The stylesheet in `packages/react/src/styles` is plain CSS in the cascade layer `poney`, with `--poney-*` tokens and `.poney-*` classes. The Studio is an app and uses Tailwind.
- **React is a peer dependency** of every package that uses it.
- **A change to the format** changes `packages/core/src/schema`, the checks in `validation/validate.ts` and `spec/SPEC.md`; then run `npm run spec`. A change that makes earlier documents invalid (a rename, a removed value) also raises `PONEY_VERSION`, adds the step to `packages/core/src/upgrade.ts` with a test, and lists it in section 11 of the specification, so that existing files still open.
- **The conformance suite** (`spec/conformance`) has a valid or invalid document for each rule. Add one when you add a rule.
- **There is no Prettier or ESLint configuration.** Follow the style of the file you change.

## Pull requests

- One topic per pull request, with a title that says what changes for a person.
- `npm run typecheck` and `npm test` must pass; CI runs both.
- For a change to a diagram, look at it: `npm run poney -- render <file> --view <id>` gives a PNG.
- Add a line to [CHANGELOG.md](CHANGELOG.md) under the next version when people who use the packages will notice the change.

Releases are described in [RELEASING.md](RELEASING.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
