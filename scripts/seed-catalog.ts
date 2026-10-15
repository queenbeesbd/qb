#!/usr/bin/env tsx
/**
 * Catalog seed CLI.
 *
 * Reproduces the Phase 1 verified fixture catalog as database rows, for the Phase 14 storefront
 * cutover. It is idempotent: a second run inserts nothing, updates nothing and deletes nothing, so it
 * is safe to re-run after the owner has edited a row.
 *
 * The seed writes rows, so it refuses a non-local target outright (`assertDisposableDatabase`) rather
 * than prompting: a production catalog is built by the owner through the admin surface, not by this
 * command. The host and database are printed; the connection string, and therefore any credential,
 * never is.
 */

import { closeDb } from '../src/db/client';
import { seedCatalog } from '../src/db/seed-catalog';
import { assertDisposableDatabase, serverEnv } from '../src/server/env';

/** Host and database only. Never includes user or password. */
function describeTarget(): string {
  const env = serverEnv();
  const parsed = new URL(env.databaseUrl);
  return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname} (env=${env.environment})`;
}

async function main(): Promise<void> {
  const env = serverEnv();
  console.log(`target: ${describeTarget()}`);
  assertDisposableDatabase(env);

  const report = await seedCatalog();
  console.log(
    `✓ catalog seed: ${report.categoriesInserted} categories, ${report.brandsInserted} brands, ` +
      `${report.productsInserted} products, ${report.variantsInserted} variants, ` +
      `${report.imagesInserted} images (${report.imagesSkipped} skipped - not in the asset inventory), ` +
      `${report.collectionsInserted} collections, ${report.collectionItemsInserted} collection items inserted`,
  );
  console.log('  idempotent: re-running inserts nothing, so the owner edits above are never overwritten.');
}

main()
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
