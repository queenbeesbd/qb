#!/usr/bin/env tsx
/**
 * Database operations CLI.
 *
 * Subcommands:
 *   status    - which migrations are applied, pending, or unrecognised
 *   migrate   - apply every pending migration
 *   validate  - assert the live database contains everything the migrations declare
 *   grants    - (re-)apply least-privilege grants to the application role
 *
 * The target host is printed, never the connection string, so no credential reaches a log or a
 * terminal transcript.
 */

import { applyGrants, APPLICATION_ROLE } from '../src/db/grants';
import { applyMigrations, migrationStatus } from '../src/db/migrate';
import { validateSchema } from '../src/db/validate';
import { serverEnv } from '../src/server/env';

/** Host and database only. Never includes user or password. */
function describeTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function status(): Promise<void> {
  const env = serverEnv();
  console.log(`target: ${describeTarget(env.databaseUrl)} (env=${env.environment}, driver=${env.driver})`);

  const report = await migrationStatus(env.databaseUrl);
  console.log(`migrations: ${report.applied}/${report.entries.length} applied`);

  if (report.pending.length > 0) {
    console.log('pending:');
    for (const entry of report.pending) console.log(`  - ${entry.tag}`);
  }
  if (report.unknownApplied.length > 0) {
    console.log(`⚠ ${report.unknownApplied.length} applied migration(s) match no current file.`);
    console.log('  The migration history was edited or a file removed; environments may have diverged.');
    process.exitCode = 2;
    return;
  }
  if (report.pending.length === 0) console.log('✓ schema is up to date');
}

async function migrate(): Promise<void> {
  const env = serverEnv();
  console.log(`target: ${describeTarget(env.databaseUrl)} (env=${env.environment}, driver=${env.driver})`);

  const before = await migrationStatus(env.databaseUrl);
  if (before.pending.length === 0) {
    console.log('✓ nothing to apply');
    return;
  }
  console.log(`applying ${before.pending.length} migration(s): ${before.pending.map((e) => e.tag).join(', ')}`);
  await applyMigrations(env.databaseUrl);
  console.log('✓ migrations applied');
}

async function validate(): Promise<void> {
  const env = serverEnv();
  console.log(`target: ${describeTarget(env.databaseUrl)}`);

  const report = await validateSchema(env.databaseUrl);
  for (const check of report.checks) {
    console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}${check.ok ? '' : ` - ${check.detail}`}`);
  }
  console.log(
    `declared: ${report.counts.tables} tables, ${report.counts.checks} checks, ` +
      `${report.counts.indexes} indexes (${report.counts.partialIndexes} partial), ${report.counts.triggers} triggers`,
  );

  if (!report.ok) fail('schema validation failed');
  console.log('✓ schema validation passed');
}

async function grants(): Promise<void> {
  const env = serverEnv();
  console.log(`target: ${describeTarget(env.databaseUrl)}`);

  const report = await applyGrants(env.databaseUrl);
  if (!report.rolePresent) {
    console.log(`- role ${APPLICATION_ROLE} does not exist; grants are a no-op here.`);
    console.log('  Creating that role is provisioning and is not part of Phase 11.');
    return;
  }
  console.log(`✓ grants applied to ${APPLICATION_ROLE}`);
  console.log(`  append-only (no UPDATE/DELETE): ${report.revokedFrom.join(', ')}`);
}

// Wrapped in a function rather than using top-level await: the project has no "type": "module",
// so tsx transpiles these scripts as CommonJS, where top-level await is not supported.
async function main(): Promise<void> {
  const command = process.argv[2];
  const commands: Record<string, () => Promise<void>> = { status, migrate, validate, grants };

  const selected = command === undefined ? undefined : commands[command];
  if (selected === undefined) {
    fail(`unknown subcommand "${command ?? ''}". Use one of: ${Object.keys(commands).join(', ')}`);
  }
  await selected();
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
