import type { PoneyDocumentInput } from '@hattoriai/poney-core'

type M = NonNullable<PoneyDocumentInput['model']>

export const behaviors: NonNullable<M['behaviors']> = [
  // ── Sign in ───────────────────────────────────────────────────────────────
  {
    kind: 'interaction',
    id: 'customer-login',
    name: 'Customer signs in',
    summary: 'From typing a password to a signed-in storefront.',
    description:
      'The gateway forwards the sign-in to the auth service, which checks the password hash, creates a session and caches it. Five failed attempts lock the account for 15 minutes.',
    participants: ['customer', 'storefront', 'api-gateway', 'auth-service', 'identity-db', 'redis'],
    steps: [
      { type: 'message', id: 'l1', kind: 'call', from: 'customer', to: 'storefront', label: 'Submit email and password', data: ['credentials'] },
      { type: 'message', id: 'l2', kind: 'call', from: 'storefront', to: 'api-gateway', label: 'POST /auth/sessions', relationship: 'r-storefront-gateway', data: ['credentials'] },
      { type: 'message', id: 'l3', kind: 'call', from: 'api-gateway', to: 'auth-service', label: 'CreateSession(credentials)', relationship: 'r-gateway-auth', data: ['credentials'] },
      { type: 'message', id: 'l4', kind: 'call', from: 'auth-service', to: 'identity-db', label: 'Find user by email', relationship: 'r-auth-identitydb' },
      { type: 'message', id: 'l5', kind: 'return', from: 'identity-db', to: 'auth-service', label: 'User row', data: ['users'] },
      {
        type: 'message',
        id: 'l6',
        kind: 'self',
        from: 'auth-service',
        to: 'auth-service',
        label: 'Verify password hash',
        description: 'argon2id with a constant-time compare, so timing does not reveal whether the email exists.',
      },
      {
        type: 'fragment',
        id: 'l-alt',
        kind: 'alt',
        label: 'Password check',
        branches: [
          {
            guard: 'password matches',
            steps: [
              { type: 'message', id: 'l7', kind: 'call', from: 'auth-service', to: 'identity-db', label: 'Insert session, reset failed attempts', relationship: 'r-auth-identitydb', data: ['sessions'] },
              { type: 'message', id: 'l8', kind: 'return', from: 'identity-db', to: 'auth-service', label: 'Session id' },
              { type: 'message', id: 'l9', kind: 'call', from: 'auth-service', to: 'redis', label: 'Cache session for 30 days', relationship: 'r-auth-redis', data: ['session-token'] },
              { type: 'message', id: 'l9r', kind: 'return', from: 'redis', to: 'auth-service', label: 'OK' },
              { type: 'message', id: 'l10', kind: 'return', from: 'auth-service', to: 'api-gateway', label: 'Session token', data: ['session-token'] },
              { type: 'message', id: 'l11', kind: 'return', from: 'api-gateway', to: 'storefront', label: '201 Created + Set-Cookie' },
              { type: 'message', id: 'l12', kind: 'return', from: 'storefront', to: 'customer', label: 'Show their account' },
            ],
          },
          {
            guard: 'password does not match',
            steps: [
              { type: 'message', id: 'l13', kind: 'call', from: 'auth-service', to: 'identity-db', label: 'Increment failed attempts', relationship: 'r-auth-identitydb' },
              { type: 'message', id: 'l13r', kind: 'return', from: 'identity-db', to: 'auth-service', label: 'Attempt count' },
              {
                type: 'fragment',
                id: 'l-opt-lock',
                kind: 'opt',
                label: 'Lock out',
                branches: [
                  {
                    guard: '5 or more failed attempts',
                    steps: [{ type: 'message', id: 'l14', kind: 'self', from: 'auth-service', to: 'auth-service', label: 'Lock account for 15 minutes' }],
                  },
                ],
              },
              { type: 'message', id: 'l15', kind: 'return', from: 'auth-service', to: 'api-gateway', label: 'Unauthenticated' },
              { type: 'message', id: 'l16', kind: 'return', from: 'api-gateway', to: 'storefront', label: '401 Unauthorized' },
              { type: 'message', id: 'l17', kind: 'return', from: 'storefront', to: 'customer', label: 'Show “Email or password is wrong”' },
            ],
          },
        ],
      },
    ],
  },

  // ── Checkout ─────────────────────────────────────────────────────────────
  {
    kind: 'interaction',
    id: 'checkout',
    name: 'Customer checks out',
    summary: 'From “Place order” to a confirmed, paid order and an email.',
    description:
      'The order service orchestrates checkout. Stock is reserved line by line before payment is requested. If payment is declined, reservations are released and the customer can try another payment method.',
    participants: ['customer', 'storefront', 'api-gateway', 'order-service', 'cart-service', 'inventory-service', 'payment-service', 'paystream', 'event-bus', 'notification-service'],
    steps: [
      { type: 'message', id: 'c1', kind: 'call', from: 'customer', to: 'storefront', label: 'Place order', data: ['checkout-request'] },
      { type: 'message', id: 'c2', kind: 'call', from: 'storefront', to: 'api-gateway', label: 'POST /checkout', relationship: 'r-storefront-gateway', data: ['checkout-request'] },
      { type: 'message', id: 'c3', kind: 'call', from: 'api-gateway', to: 'order-service', label: 'StartCheckout', relationship: 'r-gateway-order', data: ['checkout-request'] },
      { type: 'message', id: 'c4', kind: 'call', from: 'order-service', to: 'cart-service', label: 'GetCart(cart_id)', relationship: 'r-order-cart' },
      { type: 'message', id: 'c5', kind: 'return', from: 'cart-service', to: 'order-service', label: 'Cart lines with prices', data: ['cart-snapshot'] },
      { type: 'message', id: 'c6', kind: 'self', from: 'order-service', to: 'order-service', label: 'Validate cart, calculate totals', description: 'Creates the order in state Created with prices frozen.' },
      {
        type: 'fragment',
        id: 'c-loop',
        kind: 'loop',
        label: 'Reserve stock',
        branches: [
          {
            guard: 'for each line item',
            steps: [
              { type: 'message', id: 'c7', kind: 'call', from: 'order-service', to: 'inventory-service', label: 'Reserve(product, quantity)', relationship: 'r-order-inventory', data: ['reservation-request'] },
              { type: 'message', id: 'c8', kind: 'return', from: 'inventory-service', to: 'order-service', label: 'Reservation held' },
            ],
          },
        ],
      },
      { type: 'message', id: 'c9', kind: 'call', from: 'order-service', to: 'payment-service', label: 'Authorize(total, method)', relationship: 'r-order-payment', data: ['payment-authorization'] },
      { type: 'message', id: 'c10', kind: 'call', from: 'payment-service', to: 'paystream', label: 'POST /v1/payment_intents', relationship: 'r-payment-paystream', data: ['payment-authorization'] },
      { type: 'message', id: 'c11', kind: 'return', from: 'paystream', to: 'payment-service', label: 'Authorization result', data: ['payment-result'] },
      {
        type: 'fragment',
        id: 'c-alt',
        kind: 'alt',
        label: 'Payment outcome',
        branches: [
          {
            guard: 'authorized',
            steps: [
              { type: 'message', id: 'c12', kind: 'return', from: 'payment-service', to: 'order-service', label: 'Authorized', data: ['payment-result'] },
              { type: 'message', id: 'c13', kind: 'self', from: 'order-service', to: 'order-service', label: 'Mark paid, write OrderConfirmed to outbox' },
              {
                type: 'fragment',
                id: 'c-par',
                kind: 'par',
                label: 'Respond and notify',
                branches: [
                  {
                    guard: 'answer the customer',
                    steps: [
                      { type: 'message', id: 'c14', kind: 'return', from: 'order-service', to: 'api-gateway', label: 'Order K-48213 confirmed' },
                      { type: 'message', id: 'c15', kind: 'return', from: 'api-gateway', to: 'storefront', label: '201 Created' },
                      { type: 'message', id: 'c16', kind: 'return', from: 'storefront', to: 'customer', label: 'Show confirmation page' },
                    ],
                  },
                  {
                    guard: 'send the email',
                    steps: [
                      { type: 'message', id: 'c17', kind: 'async', from: 'order-service', to: 'event-bus', label: 'Publish OrderConfirmed', relationship: 'r-order-eventbus', data: ['order-confirmed'] },
                      { type: 'message', id: 'c18', kind: 'async', from: 'event-bus', to: 'notification-service', label: 'Deliver OrderConfirmed', relationship: 'r-notification-eventbus', data: ['order-confirmed'] },
                      { type: 'message', id: 'c19', kind: 'self', from: 'notification-service', to: 'notification-service', label: 'Render and send email', description: 'Sends through Postbox with the order-confirmation template.' },
                    ],
                  },
                ],
              },
            ],
          },
          {
            guard: 'declined',
            steps: [
              { type: 'message', id: 'c20', kind: 'return', from: 'payment-service', to: 'order-service', label: 'Declined (insufficient funds)', data: ['payment-result'] },
              {
                type: 'message',
                id: 'c21',
                kind: 'self',
                from: 'order-service',
                to: 'order-service',
                label: 'Mark payment failed, keep stock 30 min',
                description: 'The order moves to Payment failed. Its reservations stay held until the retry window closes.',
              },
              { type: 'message', id: 'c22', kind: 'return', from: 'order-service', to: 'api-gateway', label: 'Declined, 2 tries left' },
              { type: 'message', id: 'c23', kind: 'return', from: 'api-gateway', to: 'storefront', label: '402 Payment Required' },
              { type: 'message', id: 'c24', kind: 'return', from: 'storefront', to: 'customer', label: 'Ask for another card' },
            ],
          },
        ],
      },
    ],
  },

  // ── Retrying a declined payment ──────────────────────────────────────────
  {
    kind: 'interaction',
    id: 'payment-retry',
    name: 'Customer retries a declined payment',
    summary: 'A second card, inside the 30-minute window, on the same order.',
    participants: ['customer', 'storefront', 'api-gateway', 'order-service', 'payment-service', 'paystream'],
    steps: [
      { type: 'message', id: 'r1', kind: 'call', from: 'customer', to: 'storefront', label: 'Pay with another card', data: ['checkout-request'] },
      { type: 'message', id: 'r2', kind: 'call', from: 'storefront', to: 'api-gateway', label: 'POST /orders/K-48213/payment', relationship: 'r-storefront-gateway' },
      { type: 'message', id: 'r3', kind: 'call', from: 'api-gateway', to: 'order-service', label: 'RetryPayment(order, method)', relationship: 'r-gateway-order' },
      { type: 'message', id: 'r4', kind: 'self', from: 'order-service', to: 'order-service', label: 'Check the window: try 2 of 3' },
      {
        type: 'fragment',
        id: 'r-alt',
        kind: 'alt',
        label: 'Retry window',
        branches: [
          {
            guard: 'window open',
            steps: [
              { type: 'message', id: 'r5', kind: 'call', from: 'order-service', to: 'payment-service', label: 'Authorize(total, new card)', relationship: 'r-order-payment', data: ['payment-authorization'] },
              { type: 'message', id: 'r6', kind: 'call', from: 'payment-service', to: 'paystream', label: 'POST /v1/payment_intents', relationship: 'r-payment-paystream' },
              { type: 'message', id: 'r7', kind: 'return', from: 'paystream', to: 'payment-service', label: 'Authorized', data: ['payment-result'] },
              { type: 'message', id: 'r8', kind: 'return', from: 'payment-service', to: 'order-service', label: 'Authorized' },
              { type: 'message', id: 'r9', kind: 'self', from: 'order-service', to: 'order-service', label: 'Mark paid, commit held stock' },
              { type: 'message', id: 'r10', kind: 'return', from: 'order-service', to: 'api-gateway', label: 'Order confirmed' },
              { type: 'message', id: 'r11', kind: 'return', from: 'api-gateway', to: 'storefront', label: '200 OK' },
              { type: 'message', id: 'r12', kind: 'return', from: 'storefront', to: 'customer', label: 'Show confirmation' },
            ],
          },
          {
            guard: 'window closed',
            steps: [
              { type: 'message', id: 'r13', kind: 'return', from: 'order-service', to: 'api-gateway', label: 'Retry window closed' },
              { type: 'message', id: 'r14', kind: 'return', from: 'api-gateway', to: 'storefront', label: '410 Gone' },
              { type: 'message', id: 'r15', kind: 'return', from: 'storefront', to: 'customer', label: 'Explain the order was cancelled' },
            ],
          },
        ],
      },
    ],
  },

  // ── Checkout as an activity ──────────────────────────────────────────────
  {
    kind: 'activity',
    id: 'checkout-process',
    name: 'Checkout, step by step',
    summary: 'Who does what during checkout, including retries and failures.',
    nodes: [
      { id: 'a-start', kind: 'initial', label: 'Customer opens checkout', performedBy: 'customer' },
      { id: 'a-review', kind: 'action', label: 'Review cart and address', performedBy: 'customer' },
      { id: 'a-place', kind: 'action', label: 'Place order', performedBy: 'customer' },
      { id: 'a-validate', kind: 'action', label: 'Validate cart', performedBy: 'order-service', description: 'Checks that every product is live and prices have not changed since the cart was read.' },
      { id: 'a-valid', kind: 'decision', label: 'Cart valid?', performedBy: 'order-service' },
      { id: 'a-fix', kind: 'action', label: 'Fix cart issues', performedBy: 'customer', description: 'The storefront shows which lines changed or sold out.' },
      { id: 'a-fork', kind: 'fork', label: 'In parallel', performedBy: 'order-service' },
      { id: 'a-reserve', kind: 'action', label: 'Reserve stock', performedBy: 'inventory-service', description: 'Holds each line for 15 minutes.' },
      { id: 'a-totals', kind: 'action', label: 'Calculate tax and shipping', performedBy: 'order-service' },
      { id: 'a-join', kind: 'join', label: 'Both done', performedBy: 'order-service' },
      { id: 'a-authorize', kind: 'action', label: 'Authorize payment', performedBy: 'payment-service', description: 'Calls Paystream with an idempotency key, so retries never charge twice.' },
      { id: 'a-authorized', kind: 'decision', label: 'Authorized?', performedBy: 'payment-service' },
      { id: 'a-confirm', kind: 'action', label: 'Confirm order', performedBy: 'order-service' },
      { id: 'a-email', kind: 'action', label: 'Send confirmation email', performedBy: 'order-service', description: 'Through the event bus and the notification service.' },
      { id: 'a-done', kind: 'final', label: 'Order placed', performedBy: 'order-service', outcome: 'success' },
      { id: 'a-attempts', kind: 'decision', label: 'Attempts left?', performedBy: 'order-service', description: 'A customer gets three payment attempts per order.' },
      { id: 'a-method', kind: 'action', label: 'Choose another payment method', performedBy: 'customer' },
      { id: 'a-release', kind: 'action', label: 'Release reservations', performedBy: 'inventory-service' },
      { id: 'a-failed', kind: 'final', label: 'Checkout failed', performedBy: 'inventory-service', outcome: 'failure' },
    ],
    flows: [
      { id: 'af1', from: 'a-start', to: 'a-review' },
      { id: 'af2', from: 'a-review', to: 'a-place' },
      { id: 'af3', from: 'a-place', to: 'a-validate' },
      { id: 'af4', from: 'a-validate', to: 'a-valid' },
      { id: 'af5', from: 'a-valid', to: 'a-fork', guard: 'Yes' },
      { id: 'af6', from: 'a-valid', to: 'a-fix', guard: 'No' },
      { id: 'af7', from: 'a-fix', to: 'a-review' },
      { id: 'af8', from: 'a-fork', to: 'a-reserve' },
      { id: 'af9', from: 'a-fork', to: 'a-totals' },
      { id: 'af10', from: 'a-reserve', to: 'a-join' },
      { id: 'af11', from: 'a-totals', to: 'a-join' },
      { id: 'af12', from: 'a-join', to: 'a-authorize' },
      { id: 'af13', from: 'a-authorize', to: 'a-authorized' },
      { id: 'af14', from: 'a-authorized', to: 'a-confirm', guard: 'Yes' },
      { id: 'af15', from: 'a-authorized', to: 'a-attempts', guard: 'No' },
      { id: 'af16', from: 'a-confirm', to: 'a-email' },
      { id: 'af17', from: 'a-email', to: 'a-done' },
      { id: 'af18', from: 'a-attempts', to: 'a-method', guard: 'Yes' },
      { id: 'af19', from: 'a-method', to: 'a-authorize' },
      { id: 'af20', from: 'a-attempts', to: 'a-release', guard: 'No' },
      { id: 'af21', from: 'a-release', to: 'a-failed' },
    ],
  },

  // ── Order lifecycle ──────────────────────────────────────────────────────
  {
    kind: 'state-machine',
    id: 'order-lifecycle',
    name: 'Order lifecycle',
    summary: 'Every status an order can have, and what moves it on.',
    description: 'Stored in orders.status. Only the order domain module changes it, and every change writes an event to the outbox.',
    subject: 'orders',
    owner: 'order-service',
    states: [
      { id: 's-initial', kind: 'initial', name: 'Start' },
      { id: 's-created', kind: 'state', name: 'Created', description: 'Cart validated and prices frozen. Stock is being reserved.', entryActions: ['Snapshot cart lines', 'Calculate totals'] },
      { id: 's-awaiting', kind: 'state', name: 'Awaiting payment', description: 'Stock is held. Waiting for the payment provider.', entryActions: ['Request authorization'] },
      { id: 's-failed', kind: 'state', name: 'Payment failed', description: 'The last attempt was declined. The customer may retry.', outcome: 'failure', entryActions: ['Record decline reason'] },
      { id: 's-paid', kind: 'state', name: 'Paid', description: 'Payment authorized. The customer has been told.', outcome: 'success', entryActions: ['Publish OrderConfirmed'] },
      { id: 's-processing', kind: 'state', name: 'Processing', description: 'The warehouse is picking and packing.' },
      { id: 's-shipped', kind: 'state', name: 'Shipped', description: 'With the carrier.', entryActions: ['Capture payment', 'Send shipping email'] },
      { id: 's-delivered', kind: 'final', name: 'Delivered', description: 'The carrier confirmed delivery.', outcome: 'success' },
      { id: 's-cancelled', kind: 'final', name: 'Cancelled', description: 'Stopped before shipping. Stock released and any payment voided or refunded.', outcome: 'failure', entryActions: ['Release reservations'] },
    ],
    transitions: [
      { id: 't-start', from: 's-initial', to: 's-created', event: 'Checkout started', triggeredBy: 'order-service', actions: ['Freeze prices'] },
      { id: 't-reserved', from: 's-created', to: 's-awaiting', event: 'Stock reserved', guard: 'every line reserved', triggeredBy: 'inventory-service', actions: ['Ask payment service to authorize'] },
      { id: 't-out-of-stock', from: 's-created', to: 's-cancelled', event: 'Reservation failed', guard: 'a line is out of stock', triggeredBy: 'inventory-service', actions: ['Release partial reservations', 'Tell the customer which items sold out'] },
      { id: 't-authorized', from: 's-awaiting', to: 's-paid', event: 'Payment authorized', triggeredBy: 'payment-service', actions: ['Write OrderConfirmed to outbox', 'Commit reservations'], description: 'The happy path. Fulfilment and email both react to the OrderConfirmed event.' },
      { id: 't-declined', from: 's-awaiting', to: 's-failed', event: 'Payment declined', triggeredBy: 'payment-service', actions: ['Increment payment attempts'] },
      { id: 't-retry', from: 's-failed', to: 's-awaiting', event: 'Customer retries', guard: 'fewer than 3 attempts', triggeredBy: 'storefront', actions: ['Request authorization with new method'] },
      { id: 't-give-up', from: 's-failed', to: 's-cancelled', event: 'Retry window closed', guard: '3 attempts or 30 minutes', triggeredBy: 'order-service', actions: ['Release reservations', 'Send cancellation email'] },
      { id: 't-cancel', from: 's-paid', to: 's-cancelled', event: 'Customer cancels', guard: 'not yet picked', triggeredBy: 'storefront', actions: ['Void authorization', 'Release reservations'] },
      { id: 't-pick', from: 's-paid', to: 's-processing', event: 'Picking started', triggeredBy: 'back-office' },
      { id: 't-ship', from: 's-processing', to: 's-shipped', event: 'Label printed', triggeredBy: 'back-office', actions: ['Capture payment', 'Send shipping email'] },
      { id: 't-deliver', from: 's-shipped', to: 's-delivered', event: 'Carrier confirms delivery', actions: ['Send delivery email'] },
    ],
  },
]
