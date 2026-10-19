#!/usr/bin/env tsx
/**
 * End-to-end verification of the Phase 14 storefront cutover.
 *
 * The database tests prove the loader and the seed *behaviours*. The browser suite proves the
 * storefront renders. This script proves the thing neither can prove alone: that the **served**
 * page is the database catalog and not the Phase 1 fixture - built from the real production bundle,
 * over real HTTP, against a real (disposable) PostgreSQL cluster.
 *
 * It composes the existing pieces rather than reimplementing them:
 *
 *   1. a throwaway local cluster, created here on loopback and removed afterwards;
 *   2. the catalog seed, run through its public entry point exactly as `npm run db:seed:catalog` does;
 *   3. `next build`, so the artifact under test is the bundle a deployment would serve;
 *   4. `next start` on an ephemeral port, pointed at the seeded cluster;
 *   5. the existing `scripts/verify-browser.cjs` suite, targeted at that server.
 *
 * The fixture source is disabled explicitly (`QUEENBEES_STOREFRONT_FIXTURE` is removed from the
 * child environment), so a green run cannot be the fixture wearing the database's clothes. No cloud
 * resource, credential, deployment or DNS record is touched: the cluster is local and disposable.
 *
 * Usage:
 *   npm run verify:storefront
 *
 * Exits non-zero on any failure, and always tears the server and the cluster down.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';

import { seedCatalog } from '../src/db/seed-catalog';
import { runCustomerFlowChecks } from './customer-flow';
import { assertDisposableDatabase } from '../src/server/env';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from '../tests/db/helpers';

/** The product count the Phase 1 fixture publishes. The cutover must serve exactly this many. */
const EXPECTED_PRODUCTS = 22;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function freePort(): Promise<number> {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      reject(new Error('no free port'));
      return;
    }
    server.close(() => resolve(address.port));
  });
  return promise;
}

/** Runs a child to completion with inherited stdio and resolves with its exit code. */
function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const child = spawn(command, args, { env, stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', (code) => resolve(code ?? 1));
  return promise;
}

/**
 * Waits for the server to answer, without polling a log line and without a fixed sleep.
 *
 * A readiness signal is a real response, not the string "Ready" in a buffer. Each attempt is
 * bounded, and an early exit is reported immediately rather than after the whole budget.
 */
async function waitForReady(base: string, child: ChildProcess, log: () => string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const probe = await fetch(`${base}/`);
      if (probe.status < 500) return;
    } catch {
      // Not listening yet.
    }
    if (child.exitCode !== null) {
      throw new Error(`the production server exited early (code ${child.exitCode}):\n${log().slice(-2000)}`);
    }
    const tick = Promise.withResolvers<void>();
    setTimeout(tick.resolve, 250);
    await tick.promise;
  }
  throw new Error(`the production server did not become ready:\n${log().slice(-2000)}`);
}

async function stopServer(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const settled = Promise.withResolvers<void>();
  setTimeout(settled.resolve, 300);
  await settled.promise;
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function main(): Promise<void> {
  if (!toolingAvailable) fail(SKIP_REASON);

  console.log('starting a disposable local PostgreSQL cluster');
  const fixture: DbFixture = await startMigratedDatabase();

  let server: ChildProcess | undefined;
  try {
    // The helper already asserted the target is loopback; asserting again here is cheap and keeps
    // the safety property visible at the point the connection string is about to be handed to a
    // child process.
    assertDisposableDatabase();

    const report = await seedCatalog();
    if (report.productsInserted !== EXPECTED_PRODUCTS) {
      throw new Error(
        `the catalog seed inserted ${report.productsInserted} products, expected ${EXPECTED_PRODUCTS}`,
      );
    }
    if (report.imagesSkipped !== 0) {
      throw new Error(
        `the catalog seed skipped ${report.imagesSkipped} image(s): a fixture asset is missing from disk`,
      );
    }
    // Host, port and database only. The connection string - and therefore any credential - is never
    // printed, matching `scripts/seed-catalog.ts`.
    console.log(
      `seeded ${report.productsInserted} products into ` +
        `127.0.0.1:${fixture.cluster.port}/${fixture.cluster.databaseName} ` +
        `(env=test), ${report.imagesInserted} image(s) attached`,
    );

    // No payment configuration is seeded: Cash on Delivery is the only method this release accepts
    // (Phase 17), so the customer flow needs no recipient account and nothing is invented here.

    // Delivery pricing is owner configuration, so the test environment supplies explicit values: a
    // default for Other districts and a Dhaka override. The customer flow submits Dhaka and asserts
    // the override, which proves the stored charge came from configuration rather than the browser.
    const deliveryStaff = await fixture.pool.query<{ id: string }>(
      `insert into staff_user (email, display_name) values ('delivery-verify@example.test', 'Delivery Verify') returning id`,
    );
    const deliveryStaffId = Number(deliveryStaff.rows[0]?.id);
    await fixture.pool.query(
      `insert into delivery_setting (id, default_minor, updated_by_staff_id) values (1, 8000, $1)`,
      [deliveryStaffId],
    );
    await fixture.pool.query(
      `insert into delivery_district_charge (district_code, amount_minor, updated_by_staff_id) values ('dhaka', 12000, $1)`,
      [deliveryStaffId],
    );

    // Both children get the same environment. The fixture opt-in is deleted, not merely unset: a
    // stray value in the caller's shell must not turn this run into a fixture run.
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: fixture.cluster.url,
      QUEENBEES_ENV: 'test',
      DATABASE_DRIVER: 'pg',
      NEXT_TELEMETRY_DISABLED: '1',
    };
    delete childEnv.QUEENBEES_STOREFRONT_FIXTURE;

    console.log('\nbuilding the production bundle (next build)');
    const buildCode = await run('npx', ['next', 'build'], childEnv);
    if (buildCode !== 0) throw new Error(`next build exited ${buildCode}`);
    if (!existsSync('.next/BUILD_ID')) {
      throw new Error('next build reported success but produced no .next/BUILD_ID');
    }

    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    console.log(`\nstarting the production server on ${base}`);

    server = spawn('npx', ['next', 'start', '-p', String(port)], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    server.stdout?.on('data', (chunk: Buffer) => {
      serverLog += chunk.toString();
    });
    server.stderr?.on('data', (chunk: Buffer) => {
      serverLog += chunk.toString();
    });

    await waitForReady(base, server, () => serverLog);

    console.log('\nrunning the storefront browser suite against the served database catalog');
    const browserCode = await run('node', ['scripts/verify-browser.cjs'], {
      ...process.env,
      QUEENBEES_BASE_URL: base,
    });
    if (browserCode !== 0) {
      throw new Error(`the browser suite exited ${browserCode}`);
    }

    // The routes are the layer neither the database tests nor the browser suite can reach: an
    // unauthenticated order, a cross-origin submission, a forged price and another customer's order
    // are all properties of the served HTTP surface.
    console.log('\nrunning the customer authentication and checkout flow against the served build');
    const flowChecks = await runCustomerFlowChecks({ base, pool: fixture.pool });
    for (const check of flowChecks) {
      console.log(`${check.ok ? '  PASS  ' : '  FAIL  '}${check.step}`);
    }
    const flowFailures = flowChecks.filter((check) => !check.ok);
    if (flowFailures.length > 0) {
      throw new Error(
        `${flowFailures.length} customer-flow check(s) failed: ` + JSON.stringify(flowFailures),
      );
    }

    console.log(
      `\n✓ storefront verification passed: the served catalog is the seeded database, and ` +
        `${flowChecks.length} customer authentication and checkout checks passed over HTTP`,
    );
  } finally {
    await stopServer(server);
    await fixture.close();
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
