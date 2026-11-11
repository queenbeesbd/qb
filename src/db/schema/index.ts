/**
 * The complete approved schema - `docs/data-model.md` sections 4 to 9.
 *
 * This barrel is the single entrypoint `drizzle-kit` reads, so every table must be re-exported
 * here or it will silently not be migrated.
 *
 * 53 tables across eleven groups:
 * - identity (14)   principals, credentials, sessions, recovery, throttle, roles, a pending registration
 * - catalog (10)    brands, categories, products, variants, imagery, hero banner, curation,
 *                   import provenance
 * - inventory (3)   balance, append-only movement ledger, reservations
 * - orders (7)      order, contact, item snapshot, event log, cancellations, returns, additional costs
 * - payments (3)    recipients, claims, refunds
 * - operations (6)  notifications, exceptions, audit, idempotency, settings, customer flags
 * - delivery (2)    default charge and active district overrides
 * - promotions (2)  owner-published codes and the orders that used them
 * - integrations (2) Telegram destinations and the SteadFast consignment per order
 * - analytics (2)   first-party visit sessions and their step log (ADR 0027)
 * - reviews (1)     a buyer's words about a product, published only by the owner (ADR 0035)
 */

export * from './values';
export * from './identity';
export * from './catalog';
export * from './inventory';
export * from './orders';
export * from './payments';
export * from './operations';
export * from './delivery';
export * from './promotions';
export * from './integrations';
export * from './analytics';
export * from './reviews';
