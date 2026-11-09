/**
 * The pre-deploy migration gate's decision, as a pure function.
 *
 * It is separated from the CLI and from the database so the rule can be tested without a cluster:
 * given the journal and what a database reports as applied, either the code may deploy or it may
 * not, and the refusal names the migrations that are missing.
 *
 * **Why this exists.** `main` is connected to Vercel, so a push is a deploy, and Vercel's build does
 * not apply migrations. That combination shipped code ahead of its schema four times (0015, 0016-0018,
 * 0019-0020, 0021-0023), each time taking a live screen down or leaving the storefront alive only on a
 * warm cache. The gate makes the build itself refuse instead.
 *
 * It never applies a migration: applying one is a deliberate act against a named target, and doing it
 * from a build would hide which environment changed.
 */

import type { MigrationStatus } from './migrate';

export type MigrationGate =
  | { readonly ok: true; readonly applied: number; readonly total: number }
  | { readonly ok: false; readonly kind: 'pending' | 'unknown'; readonly detail: string };

/** The parts of a status report the decision reads. */
export type MigrationGateInput = Pick<
  MigrationStatus,
  'applied' | 'entries' | 'pending' | 'unknownApplied'
>;

/**
 * An edited history outranks a pending migration: if a file was changed or removed after being
 * applied, the environments have already diverged and applying more will not reconcile them.
 */
export function evaluateMigrationGate(status: MigrationGateInput): MigrationGate {
  const total = status.entries.length;

  if (status.unknownApplied.length > 0) {
    const count = status.unknownApplied.length;
    return {
      ok: false,
      kind: 'unknown',
      detail:
        `${count} applied migration(s) match no current file ` +
        `(${status.unknownApplied.map((hash) => hash.slice(0, 12)).join(', ')}). ` +
        'The migration history was edited or a file was removed after it was applied, so this ' +
        'database has diverged. Reconcile the history before deploying this code.',
    };
  }

  if (status.pending.length > 0) {
    const tags = status.pending.map((entry) => entry.tag);
    return {
      ok: false,
      kind: 'pending',
      detail:
        `${tags.length} migration(s) this commit carries are not applied to the target database: ` +
        `${tags.join(', ')}. Apply them with \`npm run db:migrate\` against that target (and ` +
        '`npm run db:validate` afterwards) before pushing, or the deployed code will read a schema ' +
        'that does not exist.',
    };
  }

  return { ok: true, applied: status.applied, total };
}
