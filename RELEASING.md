# Releasing Poney

Nine packages are published to npm, with one version:

| Package | What it is |
|---|---|
| `@hattoriai/poney-core` | The format |
| `@hattoriai/poney-layout` | Layout |
| `@hattoriai/poney-diagrams` | Renderers and the stylesheet, with no framework |
| `@hattoriai/poney-react` | The renderers in React |
| `@hattoriai/poney-render` | SVG and PNG in Node |
| `@hattoriai/poney-ext-ownership` | Extension |
| `@hattoriai/poney-ext-security` | Extension |
| `@hattoriai/poney-element` | `<poney-diagram>`, and the built `poney.js` and `poney.css` for pages with no bundler |
| `@hattoriai/poney` | The CLI (commands `poney` and `poney-mcp`), the MCP server and Poney Studio |

`@hattoriai/poney-examples` and `@hattoriai/poney-studio` are private: the Studio ships built inside `@hattoriai/poney`.

## A release

1. Set the version: `node scripts/version.mjs 0.2.0`, then `npm install` (the lock file follows).
2. Add the version to `CHANGELOG.md`: what changed since the last release, for the people who use the packages.
3. Open a pull request with it; merge it when CI passes.
4. On GitHub, publish a release with the tag `v0.2.0`, and use the version's changelog section as the release notes.

The `release` workflow checks that the tag and every package name one version, runs the type checks, the tests and the build, and publishes each package that npm does not have yet, in dependency order. It publishes by npm's trusted publishing: no token, and each package records which run built it (provenance). Approve the run in the `npm` environment.

## Before the first release (once)

npm lets you set up trusted publishing only for a package that exists, so 0.1.0 is published by hand, from the account that owns the `hattoriai` organization:

1. `npm login`
2. `npm run build:packages`
3. Publish each, in this order (`--provenance=false`: provenance only comes from CI):

   ```sh
   for name in @hattoriai/poney-core @hattoriai/poney-layout @hattoriai/poney-diagrams @hattoriai/poney-react @hattoriai/poney-render @hattoriai/poney-ext-ownership @hattoriai/poney-ext-security @hattoriai/poney-element @hattoriai/poney; do
     npm publish -w "$name" --access public --provenance=false
   done
   ```

4. On npmjs.com, for each of the packages: **Settings → Trusted Publisher → GitHub Actions**, with the organization `hattoriai`, the repository `poney`, the workflow `release.yml` and the environment `npm`.
5. On GitHub, in the repository's **Settings → Environments**, create the environment `npm` with yourself as a required reviewer.

From then on, every release goes through the workflow.

A new package (for example `@hattoriai/poney-diagrams` or `@hattoriai/poney-element`) needs the same once: publish its first version by hand, then set its Trusted Publisher.

## In the repository

The packages point their `exports` at `dist/` for users, and at `src/` under the `poney-source` condition, which this repository's TypeScript, Vite and Vitest use. So nothing needs building to develop: `npm run dev`, `npm test`, and `npm run poney -- <args>` run the source. `npm run build:packages` builds what is published (each package's `dist/`, and the Studio copied into `poney`).
