import type { Presentation } from './schema/presentation'

/** Default styles for the core kinds. New and imported documents start here. */
export const DEFAULT_PRESENTATION: Presentation = {
  kinds: {
    person: { shape: 'person', tone: 'slate', icon: 'user-round', label: 'Person' },
    system: { shape: 'frame', tone: 'slate', icon: 'boxes', label: 'Software system' },
    'web-app': { shape: 'card', tone: 'tyrian', icon: 'app-window', label: 'Web app' },
    gateway: { shape: 'card', tone: 'slate', icon: 'route', label: 'Gateway' },
    service: { shape: 'card', tone: 'lapis', icon: 'server', label: 'Service' },
    database: { shape: 'cylinder', tone: 'malachite', icon: 'database', label: 'Database' },
    cache: { shape: 'cylinder', tone: 'verdigris', icon: 'zap', label: 'Cache' },
    queue: { shape: 'stack', tone: 'ochre', icon: 'waypoints', label: 'Event bus' },
    external: { shape: 'card', tone: 'umber', icon: 'globe', label: 'External system' },
    module: { shape: 'chip', tone: 'lapis', icon: 'box', label: 'Module' },
    interface: { shape: 'chip', tone: 'tyrian', icon: 'plug', label: 'Interface' },
    library: { shape: 'chip', tone: 'slate', icon: 'library', label: 'Library' },
  },
  relationships: {
    uses: { pattern: 'solid', head: 'arrow' },
    calls: { pattern: 'solid', head: 'arrow' },
    reads: { pattern: 'solid', head: 'arrow' },
    writes: { pattern: 'solid', head: 'arrow' },
    'reads-writes': { pattern: 'solid', head: 'none' },
    publishes: { pattern: 'dashed', head: 'open-arrow' },
    subscribes: { pattern: 'dashed', head: 'open-arrow' },
    'depends-on': { pattern: 'solid', head: 'arrow' },
    implements: { pattern: 'dashed', head: 'triangle' },
  },
  elements: {},
  views: {},
}
