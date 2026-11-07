#!/usr/bin/env tsx
/**
 * Deletes visit sessions older than the retention window (ADR 0027 D7).
 *
 * The tracking route already sweeps on traffic, at most once an hour per instance. This command is the
 * explicit run: it prints the target and how many sessions it removed, and it is safe to run at any
 * time because it only deletes rows the policy has already expired. Events cascade with their session,
 * so the counter and the log are always the same age.
 */

import { closeDb, withTransaction } from '../src/db/client';
import { VISIT_RETENTION_DAYS, pruneVisitLog } from '../src/server/analytics/visits';
import { serverEnv } from '../src/server/env';

/** Host and database only. Never includes user or password. */
function describeTarget(): string {
  const env = serverEnv();
  const parsed = new URL(env.databaseUrl);
  return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname} (env=${env.environment})`;
}

async function main(): Promise<void> {
  console.log(`target: ${describeTarget()}`);
  const removed = await withTransaction((tx) => pruneVisitLog(tx));
  console.log(
    `✓ removed ${removed} visit session${removed === 1 ? '' : 's'} older than ${VISIT_RETENTION_DAYS} days`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
