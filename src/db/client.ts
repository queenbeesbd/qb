/**
 * Server-only database access layer.
 *
 * This module is the single place a connection is created. Nothing else in the application may
 * construct a driver, read DATABASE_URL, or import a driver package - that keeps the connection,
 * the credential and the transaction boundary in one reviewable place.
 *
 * It is server-only: the module performs a runtime guard on import, and it is imported exclusively
 * from server code. See docs/database.md.
 *
 * Driver choice is a consequence of ADR 0007:
 *   - `pg` (node-postgres) for local development, integration tests and migration scripts
 *   - `@neondatabase/serverless` Pool over WebSockets for the deployed runtime, because the D11
 *     claim-allocation transaction is interactive and Neon's HTTP driver cannot run one
 */

import { Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool as NodePgPool } from 'pg';

import { EnvironmentError, assertServerRuntime, serverEnv, type ServerEnv } from '@/server/env';

import * as schema from './schema';

/** The schema-aware database type. Both drivers are structurally assignable to it. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The transaction handle passed to `withTransaction`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type Connection = {
  readonly env: ServerEnv;
  readonly db: Database;
  close(): Promise<void>;
};

function createConnection(env: ServerEnv): Connection {
  if (env.driver === 'neon-serverless') {
    // The WebSocket driver is what makes an interactive transaction possible on Neon.
    if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
      throw new EnvironmentError(
        'DATABASE_DRIVER=neon-serverless requires a global WebSocket constructor. Run on Node 22+ ' +
          'or provide one explicitly.',
      );
    }
    const pool = new NeonPool({ connectionString: env.databaseUrl });
    return { env, db: drizzleNeon(pool, { schema }), close: () => pool.end() };
  }

  const pool = new NodePgPool({
    connectionString: env.databaseUrl,
    // A small pool: this is a low-traffic storefront, and an oversized pool exhausts a free-tier
    // connection limit faster than it helps.
    max: 5,
  });
  return { env, db: drizzleNodePg(pool, { schema }), close: () => pool.end() };
}

let connection: Connection | undefined;

/** The shared database handle. Created on first use, then reused. */
export function getDb(): Database {
  assertServerRuntime();
  connection ??= createConnection(serverEnv());
  return connection.db;
}

/** The validated environment the live connection was built from. */
export function connectionEnv(): ServerEnv {
  assertServerRuntime();
  connection ??= createConnection(serverEnv());
  return connection.env;
}

/**
 * Runs `fn` inside one interactive transaction.
 *
 * Interactive - not a batched one-shot - because the D11 claim-allocation transaction reads a
 * competing-claim count and decides *while holding* the row lock. An HTTP one-shot cannot express
 * that (ADR 0007).
 *
 * A throw rolls the transaction back. Callers must not perform network calls to a third party
 * inside `fn`: an object-storage call cannot join a database transaction, and holding a lock
 * across one is how a stall becomes an outage (data-model 12.6, 14.3).
 */
export async function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => fn(tx));
}

/** Closes the pool. Used by tests and by graceful shutdown; safe to call more than once. */
export async function closeDb(): Promise<void> {
  if (!connection) return;
  const current = connection;
  connection = undefined;
  await current.close();
}

export { schema };
