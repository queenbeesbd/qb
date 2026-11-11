/**
 * Schema validation.
 *
 * Asserts that a live database actually contains everything the migration files declare. It parses
 * the SQL in `drizzle/` and checks each object against the catalog, so a partially applied
 * migration, a silently dropped constraint or an edited migration file is caught rather than
 * assumed correct.
 *
 * This is the Phase 11 answer to "the concurrency guarantees are design claims until exercised
 * against PostgreSQL": the constraints that carry those guarantees are verified to exist, and the
 * transaction behaviour is exercised in tests/db-concurrency.test.ts.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';

export type CheckResult = { name: string; ok: boolean; detail: string };

export type ValidationReport = {
  ok: boolean;
  checks: CheckResult[];
  counts: { tables: number; checks: number; indexes: number; partialIndexes: number; triggers: number };
};

function migrationSql(folder: string): string {
  return readdirSync(folder)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(folder, file), 'utf8'))
    .join('\n');
}

function matchAll(sql: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const match of sql.matchAll(pattern)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  return found;
}

export type DeclaredObjects = {
  tables: string[];
  checkConstraints: string[];
  indexes: string[];
  partialIndexes: string[];
  triggers: string[];
  functions: string[];
};

/** Parses the objects the migration files declare. */
export function parseDeclaredObjects(folder = 'drizzle'): DeclaredObjects {
  const sql = migrationSql(folder);

  /**
   * A table may be created by one migration and dropped by a later one (0029 removes
   * `customer_email_change`), so the declared set is "created minus dropped". Its indexes and check
   * constraints go with it: PostgreSQL drops them implicitly, and keeping them here would report them
   * as missing from a database that is in fact in step with the files.
   */
  const droppedTables = new Set(matchAll(sql, /DROP TABLE (?:IF EXISTS )?"([a-z0-9_]+)"/g));
  const tables = matchAll(sql, /CREATE TABLE "([a-z0-9_]+)"/g);

  const indexes = matchAll(sql, /CREATE (?:UNIQUE )?INDEX "([a-z0-9_]+)"/g);
  const partialIndexes = matchAll(
    sql,
    /CREATE (?:UNIQUE )?INDEX "([a-z0-9_]+)"[^;]*?WHERE/g,
  );
  /** The table an index is declared on, when the file states it as `ON "table"`. */
  const indexTable = (name: string): string | null => {
    const match = new RegExp(`CREATE (?:UNIQUE )?INDEX "${name}"[\\s\\S]*? ON "([a-z0-9_]+)"`).exec(sql);
    return match?.[1] ?? null;
  };
  const kept = (name: string): boolean => droppedTables.size === 0 || ![...droppedTables].some((table) => name.startsWith(`${table}_`));
  const onLiveTable = (name: string): boolean => {
    const table = indexTable(name);
    return table === null || !droppedTables.has(table);
  };

  return {
    tables: tables.filter((table) => !droppedTables.has(table)),
    checkConstraints: matchAll(sql, /CONSTRAINT "([a-z0-9_]+)" CHECK/g).filter(kept),
    indexes: indexes.filter(onLiveTable),
    partialIndexes: partialIndexes.filter(onLiveTable),
    triggers: matchAll(sql, /CREATE TRIGGER ([a-z0-9_]+)/g),
    functions: matchAll(sql, /CREATE OR REPLACE FUNCTION ([a-z0-9_]+)/g),
  };
}

/**
 * Validates a live database against the migration files.
 *
 * `connectionString` must point at a disposable or deliberately chosen database; this function
 * only reads the catalog and never writes.
 */
export async function validateSchema(
  connectionString: string,
  folder = 'drizzle',
): Promise<ValidationReport> {
  const declared = parseDeclaredObjects(folder);
  const pool = new Pool({ connectionString, max: 2 });

  try {
    const tableRows = await pool.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const presentTables = new Set(tableRows.rows.map((row) => row.relname));

    const checkRows = await pool.query<{ conname: string }>(
      "select conname from pg_constraint where contype = 'c'",
    );
    const presentChecks = new Set(checkRows.rows.map((row) => row.conname));

    const indexRows = await pool.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where schemaname = 'public'",
    );
    const presentIndexes = new Map(indexRows.rows.map((row) => [row.indexname, row.indexdef]));

    const triggerRows = await pool.query<{ tgname: string }>(
      'select tgname from pg_trigger where not tgisinternal',
    );
    const presentTriggers = new Set(triggerRows.rows.map((row) => row.tgname));

    const functionRows = await pool.query<{ proname: string }>(
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'`,
    );
    const presentFunctions = new Set(functionRows.rows.map((row) => row.proname));

    const checks: CheckResult[] = [];
    const missing = (kind: string, names: string[], present: Set<string>): void => {
      const absent = names.filter((name) => !present.has(name));
      checks.push({
        name: `${kind} present (${names.length})`,
        ok: absent.length === 0,
        detail: absent.length === 0 ? 'all present' : `missing: ${absent.join(', ')}`,
      });
    };

    missing('tables', declared.tables, presentTables);
    missing('check constraints', declared.checkConstraints, presentChecks);
    missing('triggers', declared.triggers, presentTriggers);
    missing('guard functions', declared.functions, presentFunctions);

    const absentIndexes = declared.indexes.filter((name) => !presentIndexes.has(name));
    checks.push({
      name: `indexes present (${declared.indexes.length})`,
      ok: absentIndexes.length === 0,
      detail: absentIndexes.length === 0 ? 'all present' : `missing: ${absentIndexes.join(', ')}`,
    });

    // A partial index that lost its WHERE clause still exists - and no longer enforces anything.
    const partialWithoutPredicate = declared.partialIndexes.filter((name) => {
      const definition = presentIndexes.get(name);
      return definition === undefined || !/\bwhere\b/i.test(definition);
    });
    checks.push({
      name: `partial indexes keep their predicate (${declared.partialIndexes.length})`,
      ok: partialWithoutPredicate.length === 0,
      detail:
        partialWithoutPredicate.length === 0
          ? 'all partial indexes carry a WHERE clause'
          : `lost predicate: ${partialWithoutPredicate.join(', ')}`,
    });

    // The single most important constraint in the schema: the oversell backstop.
    checks.push({
      name: 'inventory oversell backstop enforced',
      ok: presentChecks.has('inventory_balance_reserved_within_on_hand'),
      detail: 'CHECK (reserved <= on_hand) present on inventory_balance',
    });

    // The D11 one-active-submitted-claim bound.
    const claimIndex = presentIndexes.get('payment_claim_active_unique');
    checks.push({
      name: 'one active submitted claim per order enforced',
      ok: claimIndex !== undefined && /where/i.test(claimIndex) && claimIndex.includes("'submitted'"),
      detail: claimIndex ?? 'index missing',
    });

    return {
      ok: checks.every((check) => check.ok),
      checks,
      counts: {
        tables: declared.tables.length,
        checks: declared.checkConstraints.length,
        indexes: declared.indexes.length,
        partialIndexes: declared.partialIndexes.length,
        triggers: declared.triggers.length,
      },
    };
  } finally {
    await pool.end();
  }
}
