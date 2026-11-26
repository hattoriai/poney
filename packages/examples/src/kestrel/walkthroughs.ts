import type { PoneyDocumentInput } from '@poney/core'

type WalkthroughInput = NonNullable<PoneyDocumentInput['walkthroughs']>[number]
type Line = { kind: 'add' | 'del' | 'ctx'; old?: number; new?: number; text: string }

/** Builds diff lines from a compact notation: "+" added, "-" removed, " " context. */
function diff(startOld: number, startNew: number, text: string): Line[] {
  let o = startOld
  let n = startNew
  return text
    .replace(/^\n/, '')
    .replace(/\n$/, '')
    .split('\n')
    .map((raw) => {
      const mark = raw[0]
      const body = raw.slice(2)
      if (mark === '+') return { kind: 'add', new: n++, text: body }
      if (mark === '-') return { kind: 'del', old: o++, text: body }
      return { kind: 'ctx', old: o++, new: n++, text: body }
    })
}

export const retryWalkthrough: WalkthroughInput = {
  id: 'payment-retry',
  title: 'Let customers retry a declined card',
  summary: 'A declined card no longer cancels the order. The customer gets 30 minutes and three tries, and the stock stays theirs.',
  source: { kind: 'Merge request', ref: '!128', head: '3f9a2c1e8b7d', author: 'Reviewer agent', files: 7, added: 184, removed: 41 },
  story: {
    text: 'Today a single declined card ends the order: Kestrel cancels it, gives the stock back and the customer starts again from an empty cart. After this change the order waits. The customer can try another card for 30 minutes, up to three times, and nobody else can buy the items they held.',
    before: 'Card declined → order cancelled, stock released, cart lost.',
    after: 'Card declined → order waits 30 minutes, stock held, three tries.',
  },
  overview: 'retry-map',
  verdict: {
    risk: 'look',
    facts: [
      { label: 'Door', value: 'Two-way. A revert brings back the cancel on the first decline.' },
      { label: 'Outside', value: 'Nothing new. Paystream is called the same way.' },
      { label: 'Data', value: 'One new column, orders.payment_attempts, default 0.' },
      { label: 'Proof', value: 'CI green, 9 new tests, 1 case without a test.' },
      { label: 'Your time', value: 'About 8 minutes: 96 lines to read, 129 to skim.' },
    ],
  },
  marks: [
    { ref: 'entity:retry-worker', state: 'new' },
    { ref: 'relationship:r-retry-orderdb', state: 'new' },
    { ref: 'relationship:r-retry-inventory', state: 'new' },
    { ref: 'relationship:r-retry-eventbus', state: 'new' },
    { ref: 'entity:order-service', state: 'changed', note: 'New state, new endpoint, no release on decline.' },
    { ref: 'entity:storefront', state: 'changed', note: 'Shows the retry form.' },
    { ref: 'entity:order-db', state: 'changed', note: 'orders.payment_attempts' },
    { ref: 'state:order-lifecycle:s-failed', state: 'new' },
    { ref: 'transition:order-lifecycle:t-declined', state: 'new' },
    { ref: 'transition:order-lifecycle:t-retry', state: 'new' },
    { ref: 'transition:order-lifecycle:t-give-up', state: 'new' },
    { ref: 'transition:order-lifecycle:t-decline-cancel', state: 'removed' },
    { ref: 'message:checkout:c21', state: 'new' },
    { ref: 'message:checkout:c22', state: 'changed' },
    { ref: 'message:checkout:c24', state: 'changed' },
    { ref: 'message:payment-retry:r2', state: 'new' },
    { ref: 'message:payment-retry:r3', state: 'new' },
    { ref: 'message:payment-retry:r4', state: 'new' },
    { ref: 'message:payment-retry:r13', state: 'new' },
    { ref: 'message:payment-retry:r14', state: 'new' },
    { ref: 'message:payment-retry:r15', state: 'new' },
    { ref: 'dataType:orders#payment_attempts', state: 'new' },
  ],
  removed: {
    transitions: [
      {
        stateMachine: 'order-lifecycle',
        transition: {
          id: 't-decline-cancel',
          from: 's-awaiting',
          to: 's-cancelled',
          event: 'Payment declined',
          triggeredBy: 'payment-service',
          actions: ['Release reservations', 'Send cancellation email'],
        },
      },
    ],
  },
  scenes: [
    {
      id: 'lifecycle',
      title: 'A declined card no longer ends the order',
      text: 'Before, a decline went straight to Cancelled. Now it goes to a new state, Payment failed, where the order waits for another card. Three declines, or 30 minutes without a try, still cancel it.',
      risk: 'look',
      view: 'order-lifecycle',
      focus: [
        'state:order-lifecycle:s-awaiting',
        'state:order-lifecycle:s-failed',
        'state:order-lifecycle:s-cancelled',
        'state:order-lifecycle:s-paid',
        'transition:order-lifecycle:t-declined',
        'transition:order-lifecycle:t-retry',
        'transition:order-lifecycle:t-give-up',
        'transition:order-lifecycle:t-decline-cancel',
        'transition:order-lifecycle:t-authorized',
      ],
      callouts: [
        { target: 'transition:order-lifecycle:t-decline-cancel', text: 'Removed. The first decline cancelled the order here.' },
        { target: 'transition:order-lifecycle:t-declined', text: 'A decline now moves the order to Payment failed.' },
        { target: 'transition:order-lifecycle:t-retry', text: 'Each new card is one try. The order goes back to Awaiting payment.' },
        { target: 'transition:order-lifecycle:t-give-up', text: 'After three tries, or 30 minutes, the order is cancelled as before.' },
      ],
      cases: [
        { when: 'The first card is declined', then: 'Payment failed, stock held', note: 'new' },
        { when: 'Another card is authorized within 30 minutes', then: 'Paid', note: 'same path as a first-time success' },
        { when: 'The third card is declined', then: 'Cancelled, stock released' },
        { when: '30 minutes pass with no new card', then: 'Cancelled by the retry worker' },
      ],
      proof: [
        { text: 'A decline moves Awaiting payment to Payment failed', source: 'services/orders/internal/domain/order_test.go' },
        { text: 'A fourth try is refused', source: 'services/orders/internal/domain/order_test.go' },
        { text: 'The third decline cancels and releases', source: 'services/orders/internal/domain/order_test.go' },
        { text: 'A decline that arrives while the worker cancels the order', missing: true },
      ],
      question: 'A retry charges the price frozen at checkout, even if the catalog price changed in the 30 minutes. Is that what you want?',
      code: [
        {
          path: 'services/orders/internal/domain/order.go',
          title: 'Order.Decline',
          hunks: [
            {
              header: '@@ -88,12 +88,21 @@ func (o *Order) Decline(reason string) error',
              lines: diff(
                88,
                88,
                `
  func (o *Order) Decline(reason string) error {
  	if o.Status != AwaitingPayment {
  		return ErrNotAwaitingPayment
  	}
- 	o.Status = Cancelled
- 	o.record(OrderCancelled{Reason: reason})
- 	return nil
+ 	o.PaymentAttempts++
+ 	if o.PaymentAttempts >= MaxPaymentAttempts {
+ 		o.Status = Cancelled
+ 		o.record(OrderCancelled{Reason: reason})
+ 		return nil
+ 	}
+ 	o.Status = PaymentFailed
+ 	o.RetryUntil = o.clock.Now().Add(RetryWindow)
+ 	o.record(PaymentDeclined{Reason: reason, AttemptsLeft: MaxPaymentAttempts - o.PaymentAttempts})
+ 	return nil
  }
`,
              ),
            },
          ],
          notes: [
            { line: 92, text: 'The count goes up before the check, so the third decline cancels.' },
            { line: 98, text: 'The clock is injected: the tests move time instead of sleeping.' },
          ],
        },
      ],
    },
    {
      id: 'checkout',
      title: 'Checkout keeps the stock when the card is declined',
      text: 'In the checkout sequence, only the declined branch changes. The order service no longer releases the reservations. It marks the payment as failed and tells the storefront how many tries are left.',
      risk: 'look',
      view: 'checkout-sequence',
      focus: [
        'message:checkout:c20',
        'message:checkout:c21',
        'message:checkout:c22',
        'message:checkout:c23',
        'message:checkout:c24',
        'fragment:checkout:c-alt',
      ],
      callouts: [
        { target: 'message:checkout:c21', text: 'New. This step used to release the reservations. Now the stock stays held.' },
        { target: 'message:checkout:c22', text: 'The answer carries the tries left, so the storefront can say it.' },
        { target: 'message:checkout:c24', text: 'The storefront asks for another card instead of starting over.' },
      ],
      cases: [
        { when: 'Paystream declines the card', then: '402 with "tries_left": 2' },
        { when: 'Paystream times out', then: 'No change: retried by the payment service as before' },
      ],
      proof: [
        { text: 'Checkout keeps reservations on a decline', source: 'services/orders/internal/checkout/orchestrator_test.go' },
        { text: 'The 402 body has tries_left', source: 'services/orders/internal/api/handlers_test.go' },
      ],
      code: [
        {
          path: 'services/orders/internal/checkout/orchestrator.go',
          title: 'Orchestrator.Checkout',
          hunks: [
            {
              header: '@@ -112,9 +112,8 @@ func (c *Orchestrator) Checkout(ctx context.Context, req Request) (Result, error)',
              lines: diff(
                112,
                112,
                `
  	if result.Declined() {
- 		if err := c.stock.Release(ctx, order.ID); err != nil {
- 			return Result{}, err
- 		}
- 		order.Cancel("payment declined")
+ 		if err := order.Decline(result.Reason); err != nil {
+ 			return Result{}, err
+ 		}
  		if err := c.orders.Save(ctx, order); err != nil {
  			return Result{}, err
  		}
- 		return Result{Declined: true}, nil
+ 		return Result{Declined: true, TriesLeft: order.TriesLeft()}, nil
  	}
`,
              ),
            },
          ],
          notes: [{ line: 113, text: 'The release moved to the retry worker. Order.Decline decides between waiting and cancelling.' }],
        },
      ],
    },
    {
      id: 'retry',
      title: 'The customer tries another card',
      text: 'A new endpoint takes a new card for an order in Payment failed. The order service checks the window first. Inside it, the payment path is the one checkout already uses. Outside it, the customer gets a clear answer instead of an error.',
      risk: 'look',
      view: 'retry-sequence',
      focus: [],
      callouts: [
        { target: 'message:payment-retry:r2', text: 'New endpoint on the gateway: POST /orders/:number/payment.' },
        { target: 'message:payment-retry:r4', text: 'Checks the window and the count. A fourth try is refused here.' },
        { target: 'message:payment-retry:r5', text: 'From here on, the same authorization as checkout.' },
        { target: 'message:payment-retry:r14', text: '410 Gone once the window closed: the order is already cancelled.' },
      ],
      cases: [
        { when: 'Window open, try 2 or 3', then: 'Authorize with the new card' },
        { when: 'Window closed', then: '410, "This order was cancelled"' },
        { when: 'Order already paid', then: '409, nothing is charged', note: 'a double click on the form' },
      ],
      proof: [
        { text: 'Retry inside the window pays the order', source: 'services/orders/internal/api/handlers_test.go' },
        { text: 'Retry after the window returns 410', source: 'services/orders/internal/api/handlers_test.go' },
        { text: 'A double submit charges once', source: 'services/orders/internal/api/handlers_test.go' },
      ],
      code: [
        {
          path: 'services/orders/internal/api/handlers.go',
          title: 'RetryPayment',
          hunks: [
            {
              header: '@@ -0,0 +141,18 @@',
              lines: diff(
                1,
                141,
                `
+ func (h *Handlers) RetryPayment(w http.ResponseWriter, r *http.Request) {
+ 	order, err := h.orders.ByNumber(r.Context(), chi.URLParam(r, "number"))
+ 	if err != nil {
+ 		writeError(w, http.StatusNotFound, "order not found")
+ 		return
+ 	}
+ 	switch {
+ 	case order.Status == domain.Paid:
+ 		writeError(w, http.StatusConflict, "this order is already paid")
+ 		return
+ 	case !order.CanRetry(h.clock.Now()):
+ 		writeError(w, http.StatusGone, "this order was cancelled")
+ 		return
+ 	}
+ 	result, err := h.checkout.Authorize(r.Context(), order, decodeMethod(r))
+ 	writeResult(w, result, err)
+ }
`,
              ),
            },
          ],
          notes: [{ line: 155, text: 'Authorize is the same call that Checkout makes.' }],
        },
      ],
    },
    {
      id: 'window',
      title: 'A worker gives the stock back when time runs out',
      text: 'Someone has to cancel the orders that nobody retries. A new worker runs every minute, finds orders whose window closed, cancels them, releases their stock and publishes OrderCancelled, so the email goes out as before.',
      risk: 'routine',
      view: 'retry-map',
      focus: [
        'entity:retry-worker',
        'entity:order-db',
        'entity:inventory-service',
        'entity:event-bus',
        'relationship:r-retry-orderdb',
        'relationship:r-retry-inventory',
        'relationship:r-retry-eventbus',
      ],
      callouts: [
        { target: 'entity:retry-worker', text: 'New. Runs every minute, one transaction per order.' },
        { target: 'relationship:r-retry-inventory', text: 'The same release call that checkout made before.' },
        { target: 'relationship:r-retry-eventbus', text: 'OrderCancelled, so the cancellation email is unchanged.' },
      ],
      cases: [
        { when: 'Window closed, status Payment failed', then: 'Cancel, release, publish' },
        { when: 'Customer paid one second before the run', then: 'Skipped: status is Paid', note: 'the update checks the status' },
      ],
      proof: [
        { text: 'Expired orders are cancelled once', source: 'services/orders/internal/retrywindow/worker_test.go' },
        { text: 'A paid order is never cancelled', source: 'services/orders/internal/retrywindow/worker_test.go' },
      ],
      code: [
        {
          path: 'services/orders/internal/retrywindow/worker.go',
          title: 'Worker.Run',
          hunks: [
            {
              header: '@@ -0,0 +1,16 @@',
              lines: diff(
                1,
                24,
                `
+ func (w *Worker) Run(ctx context.Context) error {
+ 	expired, err := w.orders.RetryWindowClosed(ctx, w.clock.Now(), 100)
+ 	if err != nil {
+ 		return err
+ 	}
+ 	for _, order := range expired {
+ 		err := w.orders.InTx(ctx, func(tx Tx) error {
+ 			if !order.CancelIfStillFailed("retry window closed") {
+ 				return nil
+ 			}
+ 			return w.stock.Release(ctx, order.ID)
+ 		})
+ 		if err != nil {
+ 			w.log.Warn("could not cancel expired order", "order", order.Number, "err", err)
+ 		}
+ 	}
+ 	return nil
+ }
`,
              ),
            },
          ],
          notes: [{ line: 31, text: 'CancelIfStillFailed re-reads the status in the transaction: a payment that just landed wins.' }],
        },
      ],
    },
    {
      id: 'column',
      title: 'One new column on orders',
      text: 'The order counts its tries in orders.payment_attempts. Existing rows get 0, so orders that are in flight during the deploy behave as first tries.',
      risk: 'routine',
      view: 'retry-map',
      focus: ['entity:order-db', 'entity:order-service', 'relationship:r-order-orderdb'],
      callouts: [{ target: 'entity:order-db', text: 'orders.payment_attempts smallint, not null, default 0.' }],
      proof: [{ text: 'Migration runs up and down on a copy of production', source: 'CI job db:migrate:roundtrip' }],
      code: [
        {
          path: 'services/orders/migrations/0014_payment_attempts.sql',
          hunks: [
            {
              header: '@@ -0,0 +1,5 @@',
              lines: diff(
                1,
                1,
                `
+ ALTER TABLE orders
+   ADD COLUMN payment_attempts smallint NOT NULL DEFAULT 0,
+   ADD COLUMN retry_until timestamptz;
+
+ CREATE INDEX orders_retry_until ON orders (retry_until) WHERE status = 'payment_failed';
`,
              ),
            },
          ],
          notes: [{ line: 5, text: 'A partial index: the worker scans only the orders that wait.' }],
        },
      ],
    },
  ],
}

/** A tour: Kestrel as it is, for someone who joins the team. */
export const tourWalkthrough: WalkthroughInput = {
  id: 'kestrel-tour',
  kind: 'tour',
  title: 'A first walk through Kestrel',
  summary: 'The parts of Kestrel, and the path of one order from “Place order” to the confirmation email.',
  source: { kind: 'Repository', repository: 'kestrel/platform', head: '3f9a2c1e8b7d' },
  story: {
    text: 'Kestrel is an online store: customers shop on the storefront, and the order service turns a cart into a paid order. Every other service does one job for it. This tour follows one order; it leaves out the back office, search and refunds.',
  },
  overview: 'system-map',
  verdict: {
    risk: 'routine',
    facts: [
      { label: 'Languages', value: 'Go for orders and payments; Kotlin and TypeScript elsewhere' },
      { label: 'Run it', value: 'make dev starts every service and Postgres in Docker' },
      { label: 'Tests', value: 'make test; contract tests run against a fake Paystream' },
      { label: 'Read first', value: 'services/order/checkout/orchestrator.go' },
    ],
    findings: [{ text: 'Emails are sent from events, not from checkout: a slow event bus delays them, not the order.', severity: 'note', scene: 't-checkout' }],
  },
  scenes: [
    {
      id: 't-parts',
      title: 'One service owns the order',
      text: 'The storefront talks to Kestrel through the gateway. The order service is at the centre: it asks the cart, payment and inventory services, and announces what happened on the event bus. Open it to see its modules.',
      view: 'system-map',
      callouts: [
        { target: 'entity:order-service', text: 'Checkout lives here. Open the group to see how.' },
        { target: 'entity:event-bus', text: 'Other services learn about orders from events.' },
        { target: 'entity:paystream', text: 'The only outside system in checkout.' },
      ],
      effects: [
        { target: 'entity:order-service', as: 'attention' },
        { target: 'relationship:r-order-eventbus', as: 'flow' },
      ],
    },
    {
      id: 't-checkout',
      title: 'One order, from the click to the email',
      text: 'The order service prices the cart, holds the stock, then asks for payment. On success it marks the order paid and writes an event to its outbox; the email follows from that event.',
      view: 'checkout-sequence',
      focus: ['message:checkout:c1', 'message:checkout:c2', 'message:checkout:c5', 'message:checkout:c10', 'message:checkout:c11', 'message:checkout:c12', 'message:checkout:c13', 'message:checkout:c17', 'message:checkout:c18'],
      callouts: [
        { target: 'message:checkout:c13', text: 'The order and its event are saved in one transaction.' },
        { target: 'message:checkout:c17', text: 'Published later, from the outbox.' },
      ],
      trace: [
        { ref: 'message:checkout:c1', caption: 'The customer places the order.' },
        { ref: 'message:checkout:c2', caption: 'The storefront calls the API.' },
        { ref: 'message:checkout:c5', caption: 'The cart comes back with prices.' },
        { ref: 'message:checkout:c10', caption: 'Payment asks Paystream to authorize.' },
        { ref: 'message:checkout:c12', caption: 'The payment is authorized.' },
        { ref: 'message:checkout:c13', caption: 'The order is paid; its event waits in the outbox.' },
        { ref: 'message:checkout:c17', caption: 'The event goes out on the bus.' },
        { ref: 'message:checkout:c18', caption: 'Notifications hears it and sends the email.' },
      ],
      effects: [
        { target: 'message:checkout:c10', as: 'slow' },
        { target: 'message:checkout:c17', as: 'flow' },
        { target: 'message:checkout:c18', as: 'flow' },
      ],
      badges: [{ target: 'message:checkout:c10', text: 'p95 840 ms' }],
    },
    {
      id: 't-inside',
      title: 'Inside the order service',
      text: 'The API hands checkout to one orchestrator. It uses the domain for rules and prices, and talks to other services only through ports, so the clients can be swapped in tests.',
      view: {
        type: 'map',
        title: 'Inside the order service',
        entities: ['order-service', 'order-api', 'checkout-orchestrator', 'order-domain', 'pricing', 'order-repository', 'payment-client', 'inventory-client', 'postgres-repository', 'event-publisher'],
      },
      focus: ['entity:checkout-orchestrator', 'relationship:d-api-checkout', 'relationship:d-checkout-domain', 'relationship:d-checkout-pricing', 'relationship:d-checkout-repo'],
      callouts: [{ target: 'entity:checkout-orchestrator', text: 'Start reading here: one function per step of checkout.' }],
      code: [
        {
          path: 'services/order/checkout/orchestrator.go',
          title: 'Checkout.Place',
          start: 42,
          text: 'func (c *Checkout) Place(ctx context.Context, req PlaceRequest) (*Order, error) {\n\torder, err := c.domain.NewOrder(req.Cart)\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\tif err := c.inventory.Reserve(ctx, order.Lines); err != nil {\n\t\treturn nil, err\n\t}\n\treturn c.pay(ctx, order)\n}',
          notes: [{ line: 47, text: 'Stock is held before payment, so a paid order always has its items.' }],
        },
      ],
    },
    {
      id: 't-states',
      title: 'An order moves through a few states',
      text: 'The order state machine is the best summary of the rules. Payment can fail and be retried; once the warehouse starts picking, the order can no longer be cancelled.',
      view: 'order-lifecycle',
      proof: [{ text: 'Every allowed transition, and the refused ones', source: 'services/order/domain/order_test.go', test: 'TestTransitions' }],
      question: 'From which states can a customer still cancel?',
    },
  ],
}
