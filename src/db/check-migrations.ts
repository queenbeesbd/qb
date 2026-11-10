#!/usr/bin/env tsx
/**
 * Pre-deploy migration gate.
 *
 * `main` is connected to Vercel, so a push is a deploy, and a Vercel build does not apply
 * migrations. This runs as `prebuild`, which npm runs before `build` everywhere, and refuses to let a
 * production build start when the target database has not applied every migration the commit
 * carries. Vercel then keeps the previous deployment live instead of serving code that reads a
 * schema which is not there.
 *
 * Two modes:
 *   `npm run check:migrations`        always check the database this shell points at
 *   `... check-migrations.ts --build` (the `prebuild` script) - check only when Vercel is building
 *                                     **production**; a preview build shares this database and
 *                                     leaving it un-gated keeps previews useful
 *
 * It never applies a migration and never prints the connection string: the target is reduced to
 * host, port and database, and a failure states what is pending, not where the credential is.
 *
 * **It lives in `src/db/`, not `scripts/`, on purpose.** `.vercelignore` excludes `scripts/` from the
 * deployment because the verification suites are not needed to serve the application, so a `prebuild`
 * step that pointed there died with `ERR_MODULE_NOT_FOUND` on Vercel and took every production build
 * down with it (2026-11-10). This file and everything it imports must stay inside the uploaded tree.
 * Do not move it back to `scripts/`.
 */

import { evaluateMigrationGate } from './migration-gate';
import { migrationStatus } from './migrate';
import { EnvironmentError, serverEnv } from '../server/env';

/** Host and database only. Never includes user or password. */
function describeTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
}

async function main(): Promise<void> {
  const buildMode = process.argv.includes('--build');

  if (buildMode && process.env.VERCEL_ENV !== 'production') {
    const where = process.env.VERCEL_ENV ?? 'not Vercel';
    console.log(`- migration gate skipped (${where}); only a production build refuses to start.`);
    return;
  }

  const env = serverEnv();
  console.log(`target: ${describeTarget(env.databaseUrl)} (env=${env.environment})`);

  const report = await migrationStatus(env.databaseUrl);
  const gate = evaluateMigrationGate(report);

  if (!gate.ok) {
    console.error(`✗ ${gate.detail}`);
    process.exit(1);
  }

  console.log(`✓ migrations applied: ${gate.applied}/${gate.total}`);
}

main().catch((error: unknown) => {
  // The message only names a variable or a host; the credential is not in it.
  const message = error instanceof EnvironmentError ? error.message : error instanceof Error ? error.message : String(error);
  console.error(`✗ migration gate could not run: ${message}`);
  console.error('  This gate fails closed: a build that cannot see the schema does not ship.');
  process.exit(1);
});
