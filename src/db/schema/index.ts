/**
 * The complete approved schema - `docs/data-model.md` sections 4 to 9.
 *
 * This barrel is the single entrypoint `drizzle-kit` reads, so every table must be re-exported
 * here or it will silently not be migrated.
 *
 * 39 tables across six groups:
 * - identity (12)   principals, credentials, sessions, recovery, throttle, roles and permissions
 * - catalog (9)     brands, categories, products, variants, imagery, curation, import provenance
 * - inventory (3)   balance, append-only movement ledger, reservations
 * - orders (6)      order, contact, item snapshot, event log, cancellations, returns
 * - payments (3)    recipients, claims, refunds
 * - operations (6)  notifications, exceptions, audit, idempotency, settings, customer flags
 */

export * from './values';
export * from './identity';
export * from './catalog';
export * from './inventory';
export * from './orders';
export * from './payments';
export * from './operations';
