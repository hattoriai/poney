import { PONEY_VERSION, type PoneyDocumentInput } from '@hattoriai/poney-core'
import { entities } from './entities'
import { relationships } from './relationships'
import { dataTypes, dataRelations, dataFlows } from './data'
import { behaviors } from './behaviors'
import { useCases, views } from './views'
import { teams } from './teams'
import { retryWalkthrough, tourWalkthrough } from './walkthroughs'

/** Kestrel Commerce — the sample project. One model, its views, a change walkthrough and a tour. */
export const commerce: PoneyDocumentInput = {
  poneyVersion: PONEY_VERSION,
  project: {
    id: 'kestrel-commerce',
    name: 'Kestrel Commerce',
    description:
      'An online store built from small services. Customers browse, fill a cart and check out; the platform reserves stock, takes payment through Paystream, and emails the customer. Operators manage products, stock and fulfilment from the back office.',
    repository: 'github.com/kestrel/commerce',
    defaultView: 'architecture',
  },
  extensions: [{ name: 'ownership', version: '0.1.0' }],
  model: { entities: [...entities, ...teams], relationships, dataTypes, dataRelations, dataFlows, behaviors, useCases },
  views: [
    ...views,
    {
      id: 'team-map',
      type: 'extension',
      extension: 'ownership/team-map',
      category: 'ownership',
      title: 'Team map',
      description: 'Every team, what it owns, and how to reach it. Drawn by the ownership extension.',
      entities: teams.map((t) => t.id),
      data: { teams: teams.map((t) => t.id) },
    },
  ],
  walkthroughs: [retryWalkthrough, tourWalkthrough],
  presentation: {
    kinds: {
      'ownership/team': { shape: 'card', tone: 'ochre', icon: 'users', label: 'Team' },
      person: { shape: 'person', tone: 'slate', icon: 'user-round', label: 'Person' },
      system: { shape: 'frame', tone: 'slate', icon: 'boxes', label: 'Software system' },
      'web-app': { shape: 'card', tone: 'tyrian', icon: 'app-window', label: 'Web app' },
      gateway: { shape: 'card', tone: 'slate', icon: 'route', label: 'Gateway' },
      service: { shape: 'card', tone: 'lapis', icon: 'server', label: 'Service' },
      database: { shape: 'cylinder', tone: 'malachite', icon: 'database', label: 'Database' },
      cache: { shape: 'cylinder', tone: 'verdigris', icon: 'zap', label: 'Cache' },
      'message-broker': { shape: 'stack', tone: 'ochre', icon: 'waypoints', label: 'Message broker' },
      external: { shape: 'card', tone: 'umber', icon: 'globe', label: 'External system' },
      component: { shape: 'chip', tone: 'lapis', icon: 'box', label: 'Component' },
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
    elements: {
      'auth-service': { icon: 'key-round' },
      'catalog-service': { icon: 'book-open' },
      'cart-service': { icon: 'shopping-cart' },
      'order-service': { icon: 'receipt', emphasis: true },
      'retry-worker': { icon: 'timer' },
      'payment-service': { icon: 'credit-card' },
      'inventory-service': { icon: 'package' },
      'notification-service': { icon: 'mail' },
      paystream: { icon: 'landmark' },
      postbox: { icon: 'send' },
      storefront: { icon: 'store' },
      'back-office': { icon: 'clipboard-list' },
      'store-operator': { icon: 'user-cog' },
    },
  },
}
