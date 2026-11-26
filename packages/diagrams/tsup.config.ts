import { defineConfig } from 'tsup'
import { poneyBuild } from '../../scripts/tsup'

// The renderers' JSX imports this package's own runtime, which the
// declaration bundler cannot follow: `tsc -p tsconfig.build.json` writes the
// declarations instead (dist/**/*.d.ts, one per source file).
export default defineConfig(
  poneyBuild({
    dts: false,
    esbuildOptions(options) {
      options.alias = { '@hattoriai/poney-diagrams/jsx-runtime': './src/runtime/jsx-runtime.ts' }
    },
  }),
)
