/**
 * The complete approved schema - `docs/data-model.md` sections 4 to 9.
 *
 * This barrel is the single entrypoint `drizzle-kit` reads, so every table must be re-exported
 * here or it will silently not be migrated.
 *
 * 46 tables across nine groups:
 * - identity (13)   principals, credentials, sessions, recovery, throttle, roles and permissions
 * - catalog (9)     brands, categories, products, variants, imagery, curation, import provenance
 * - inventory (3)   balance, append-only movement ledger, reservations
 * - orders (7)      order, contact, item snapshot, event log, cancellations, returns, additional costs
 * - payments (3)    recipients, claims, refunds
 * - operations (6)  notifications, exceptions, audit, idempotency, settings, customer flags
 * - delivery (2)    default charge and active district overrides
 * - promotions (2)  owner-published codes and the orders that used them
 * - integrations (1) Telegram destinations an order notification is sent to
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
