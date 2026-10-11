/**
 * Migration runtime.
 *
 * Migrations are applied with **node-postgres** deliberately, not with the WebSocket driver: this
 * works unchanged against a local cluster and against Neon's pooled TCP endpoint, and it avoids
 * making a CLI depend on WebSocket support. The application runtime still uses the driver selected
 * in `client.ts`; only migrations are pinned here. See ADR 0007.
 *
 * There are no down-migrations. Drizzle does not generate them, and the documented strategy is
 * forward-fix (data-model section 16.8). Recovery from a bad migration is a rehearsed restore, not
 * a reversed migration - see docs/database.md.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export const MIGRATIONS_FOLDER = 'drizzle';

export type JournalEntry = { idx: number; tag: string; when: number };

export type MigrationStatus = {
  /** Journal entries whose content hash is recorded as applied. */
  applied: number;
  /** Journal entries not yet applied, in order. */
  pending: JournalEntry[];
  /** All journal entries, in order. */
  entries: JournalEntry[];
  /**
   * Hashes recorded as applied that match no current migration file. A non-empty list means the
   * migration history was edited or a file was removed after being applied - environments will
   * have diverged, and this must be resolved before trusting the schema.
   */
  unknownApplied: string[];
};

export function readJournal(folder = MIGRATIONS_FOLDER): JournalEntry[] {
  const raw = readFileSync(join(folder, 'meta', '_journal.json'), 'utf8');
  const parsed = JSON.parse(raw) as { entries?: JournalEntry[] };
  return parsed.entries ?? [];
}

function sqlFileFor(entry: JournalEntry, folder: string): string {
  return join(folder, `${entry.tag}.sql`);
}

/** The hash Drizzle stores for a migration: sha256 of the file contents. */
export function hashMigration(entry: JournalEntry, folder = MIGRATIONS_FOLDER): string {
  return createHash('sha256').update(readFileSync(sqlFileFor(entry, folder), 'utf8')).digest('hex');
}

function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 2 });
}

/** Applies every pending migration in order. */
export async function applyMigrations(connectionString: string, folder = MIGRATIONS_FOLDER): Promise<void> {
  const pool = createPool(connectionString);
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}

/**
 * Reports which migrations are applied.
 *
 * Reads Drizzle's bookkeeping table rather than trusting a count, so a partially applied history or
 * an edited migration file is visible instead of silently assumed correct.
 */
export async function migrationStatus(
  connectionString: string,
  folder = MIGRATIONS_FOLDER,
): Promise<MigrationStatus> {
  const entries = readJournal(folder);
  const currentHashes = new Set(entries.map((entry) => hashMigration(entry, folder)));
  const pool = createPool(connectionString);

  try {
    const tableExists = await pool.query<{ present: boolean }>(
      `select exists (
         select 1 from information_schema.tables
         where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
       ) as present`,
    );

    const appliedHashes: string[] = [];
    if (tableExists.rows[0]?.present === true) {
      const rows = await pool.query<{ hash: string }>(
        'select hash from drizzle.__drizzle_migrations order by created_at',
      );
      for (const row of rows.rows) appliedHashes.push(row.hash);
    }

    const appliedSet = new Set(appliedHashes);
    const pending = entries.filter((entry) => !appliedSet.has(hashMigration(entry, folder)));
    const unknownApplied = appliedHashes.filter((hash) => !currentHashes.has(hash));

    return { applied: entries.length - pending.length, pending, entries, unknownApplied };
  } finally {
    await pool.end();
  }
}
