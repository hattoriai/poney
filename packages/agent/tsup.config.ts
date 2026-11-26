import { defineConfig } from 'tsup'
import { poneyBuild } from '../../scripts/tsup'

// The exports, and the two programs bin/ starts: the CLI and the MCP server.
export default defineConfig(poneyBuild({ platform: 'node' }, { cli: 'src/cli.ts', mcp: 'src/mcp.ts' }))
