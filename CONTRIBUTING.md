# Contributing to Poney

We welcome bug reports and pull requests on [GitHub](https://github.com/hattoriai/poney).

## Set up

Use Node 22 or later.

```sh
git clone https://github.com/hattoriai/poney && cd poney
npm install
npm run dev        # the Studio at http://localhost:5173, with its local hub
```

You can start editing as soon as the dependencies are installed. The development server and tests load the packages directly from source using the `poney-source` export condition.

| Command | What it does |
|---|---|
| `npm run dev` | Starts Studio at http://localhost:5173 and connects it to a local hub, starting one if needed |
| `npm run studio` | Serves the production build of Studio and starts its hub (default port 5319). Run `npm run build` first |
| `npm test` | Runs the full test suite, including format conformance, layouts, renderers, CLI and hub |
| `npm run typecheck` | Checks TypeScript types across all packages |
| `npm run spec` | Generates `spec/poney.schema.json` and `spec/examples/kestrel-commerce.poney` from the source |
| `npm run poney -- <command>` | Runs the CLI from source, for example `npm run poney -- check spec/examples/tour.poney` |
| `npm run mcp` | Runs the MCP server from source. Claude Code uses the same setup through `.mcp.json` |
| `npm run build:packages` | Builds the packages for publication to npm |

## Where things are

For a map of the repository and an explanation of how a document becomes a diagram, see [Architecture](docs/architecture.md). For a new plugin, extension or diagram type, see [Extending Poney](docs/extending.md).

## Rules of the codebase

- **Package dependencies** run from core through layout, react, render and agent. Each package may depend only on those earlier in the list. A test keeps `@hattoriai/poney-core` free of UI dependencies.
- **Package styles** belong in `packages/react/src/styles`. Use plain CSS in `@layer poney`, with `--poney-*` variables and `.poney-*` classes. Keep styles scoped. Only Studio uses Tailwind.
- **React is a peer dependency** of every package that uses it.
- **Format changes** belong in `packages/core/src/schema`, `validation/validate.ts` and `spec/SPEC.md`. Run `npm run spec` afterwards. If the change breaks an older document, bump `PONEY_VERSION`, add and test an upgrade step in `packages/core/src/upgrade.ts`, and record it in section 11 of the specification.
- **Conformance tests** use example documents in `spec/conformance`. Add a valid or invalid example for each new validation rule.
- **Formatting** follows the surrounding code. This repository has no Prettier or ESLint configuration.

## Pull requests

- Keep each pull request to one topic. Give it a title that describes what changes for someone using Poney.
- Run `npm run typecheck` and `npm test`. Both must pass in CI.
- If you change a diagram, render it with `npm run poney -- render <file> --view <id>` and inspect the PNG.
- If the change affects package users, add a line under the next version in the [changelog](CHANGELOG.md).

For release instructions, see the [release guide](RELEASING.md).

## License

By contributing, you agree to license your contribution under the [MIT License](LICENSE).
