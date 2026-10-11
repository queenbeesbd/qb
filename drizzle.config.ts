import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * `generate` is offline: it diffs the TypeScript schema against the migration history and emits
 * SQL. It does not need a database URL, which is deliberate - generating a migration should never
 * require production credentials.
 *
 * Applying migrations is done by `scripts/db-migrate.ts`, which reads the connection from the
 * validated server environment, so no credential is stored in this file.
 *
 * See `docs/database.md` for the workflow.
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
});
