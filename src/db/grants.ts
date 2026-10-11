/**
 * Least-privilege grants.
 *
 * Kept out of the migration files on purpose, so there is exactly one copy of this SQL. Grants are
 * environment-specific: they apply to a role that may not exist in a given environment, and they
 * must be re-applied whenever a migration adds a table. `npm run db:grants` runs this and is
 * idempotent.
 *
 * The role is deliberately **not created here**. Creating a login role and its credential is
 * provisioning, and provisioning is not authorized by Phase 11 (ADR 0007, docs/database.md).
 *
 * The application role is expected to be named `queenbees_app`. Where it does not exist, this is a
 * no-op, so a local cluster or a fresh environment is unaffected.
 */

import { Pool } from 'pg';

export const APPLICATION_ROLE = 'queenbees_app';

/** Tables whose history must never be rewritten (convention C5, data-model 16.4). */
export const APPEND_ONLY_TABLES = ['inventory_movement', 'order_event', 'audit_event'] as const;

/** Frozen snapshots: not append-only by grant alone, but never updated after insert. */
export const IMMUTABLE_TABLES = ['order_item'] as const;

const GRANT_SQL = `
do $$
begin
  if exists (select 1 from pg_roles where rolname = '${APPLICATION_ROLE}') then
    grant usage on schema public to ${APPLICATION_ROLE};
    grant select, insert, update, delete on all tables in schema public to ${APPLICATION_ROLE};
    grant usage, select on all sequences in schema public to ${APPLICATION_ROLE};
  end if;
end
$$;
`;

const REVOKE_SQL = `
do $$
begin
  if exists (select 1 from pg_roles where rolname = '${APPLICATION_ROLE}') then
${[...APPEND_ONLY_TABLES, ...IMMUTABLE_TABLES]
  .map((table) => `    revoke update, delete on ${table} from ${APPLICATION_ROLE};`)
  .join('\n')}
  end if;
end
$$;
`;

export type GrantReport = {
  rolePresent: boolean;
  granted: boolean;
  revokedFrom: readonly string[];
};

/**
 * Applies the least-privilege posture. Safe to run repeatedly, and safe to run before the role
 * exists.
 */
export async function applyGrants(connectionString: string): Promise<GrantReport> {
  const pool = new Pool({ connectionString, max: 2 });
  try {
    const role = await pool.query<{ present: boolean }>(
      'select exists (select 1 from pg_roles where rolname = $1) as present',
      [APPLICATION_ROLE],
    );
    const rolePresent = role.rows[0]?.present === true;

    if (rolePresent) {
      await pool.query(GRANT_SQL);
      await pool.query(REVOKE_SQL);
    }

    return {
      rolePresent,
      granted: rolePresent,
      revokedFrom: rolePresent ? [...APPEND_ONLY_TABLES, ...IMMUTABLE_TABLES] : [],
    };
  } finally {
    await pool.end();
  }
}
