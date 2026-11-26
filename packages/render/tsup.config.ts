import { defineConfig } from 'tsup'
import { poneyBuild } from '../../scripts/tsup'

export default defineConfig(poneyBuild({ platform: 'node' }))
