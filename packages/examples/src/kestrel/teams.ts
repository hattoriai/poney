import type { PoneyDocumentInput } from '@hattoriai/poney-core'

type EntityInput = NonNullable<NonNullable<PoneyDocumentInput['model']>['entities']>[number]

/** Teams come from the ownership extension: kind "ownership/team". */
const team = (id: string, name: string, mission: string, oncall: string, channel: string): EntityInput => ({
  id,
  kind: 'ownership/team',
  name,
  summary: mission,
  ext: { ownership: { mission, oncall, channel } },
})

export const teams: EntityInput[] = [
  team('team-web', 'Web team', 'The storefront, carts and the emails customers read.', 'web-primary', '#team-web'),
  team('team-ops-tooling', 'Operations tooling', 'The back office the operations team works in.', 'ops-tooling', '#ops-tooling'),
  team('team-identity', 'Identity team', 'Accounts, sign-in and sessions.', 'identity-primary', '#team-identity'),
  team('team-catalog', 'Catalog team', 'Products, categories and prices.', 'catalog-primary', '#team-catalog'),
  team('team-checkout', 'Checkout team', 'Checkout and every order from start to delivery.', 'checkout-primary', '#team-checkout'),
  team('team-payments', 'Payments team', 'Taking money safely, and giving it back.', 'payments-primary', '#team-payments'),
  team('team-fulfilment', 'Fulfilment team', 'Stock, reservations and shipping.', 'fulfilment-primary', '#team-fulfilment'),
  team('team-platform', 'Platform team', 'The gateway, the event bus, the cache and the clusters.', 'platform-primary', '#team-platform'),
]
