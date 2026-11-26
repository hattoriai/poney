# @hattoriai/poney

Poney: explain software in diagrams that agents write and people read.

```sh
npm install -g @hattoriai/poney                            # the commands poney and poney-mcp
poney render shop.poney --view architecture --format svg   # any view to SVG or PNG
poney check shop.poney                                     # errors and warnings, with fixes
poney studio                                               # Poney Studio, in your browser
poney import schema .                                      # tables from your database schema
```

Or without installing: `npx @hattoriai/poney render shop.poney …`

For agents (Claude Code, Codex, OpenCode, Copilot…), the MCP server:

```sh
claude mcp add poney -- poney-mcp                                    # installed
claude mcp add poney -- npx -y --package=@hattoriai/poney poney-mcp   # without installing
```

Then ask: "Give me a Poney tour of this code, then wait for my questions." The tour opens in Poney Studio.

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
