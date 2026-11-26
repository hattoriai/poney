# poney

Poney: explain software in diagrams that agents write and people read.

```sh
npx poney render shop.poney --view architecture --format svg   # any view to SVG or PNG
npx poney check shop.poney                                     # errors and warnings, with fixes
npx poney studio                                               # Poney Studio, in your browser
npx poney import schema .                                      # tables from your database schema
```

For agents (Claude Code, Codex, OpenCode, Copilot…), the MCP server:

```sh
claude mcp add poney -- npx -y --package=poney poney-mcp
```

Then ask: "Give me a Poney tour of this code, then wait for my questions." The tour opens in Poney Studio.

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
