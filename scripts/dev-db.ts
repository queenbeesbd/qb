#!/usr/bin/env tsx
/**
 * The local development database, reproducibly.
 *
 * The verification suites each create their own disposable cluster and delete it. A developer needs the
 * opposite: one cluster that survives between commands, at a stable port, so `.env.local` keeps
 * pointing at it. This script provides exactly that, and nothing more.
 *
 * Safety properties, deliberately:
 *
 * 1. **It never initialises over an existing data directory.** If `PG_VERSION` is already there, the
 *    directory is treated as a cluster to *start*, not one to overwrite. `initdb` would refuse a
 *    non-empty directory anyway, but the explicit check means a typo cannot even try.
 * 2. **It never drops or resets a database.** `createdb` runs only when the database does not exist.
 * 3. **It listens on loopback only**, with a fixed development port that matches `.env.local`.
 * 4. **It touches no remote host.** There is no code path here that can address anything but 127.0.0.1.
 *
 * Usage:
 *   npm run dev:db            # start (or report) the local cluster
 *   npm run dev:db -- --stop  # stop it, keeping its data directory
 *   npm run dev:db -- --status
 *
 * The schema is not applied here: run `npm run db:migrate` and `npm run db:seed:catalog` afterwards,
 * so the same commands are used against this cluster as against any other.
 */

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Stable, repository-external location. The repository must never contain a data directory. */
const DATA_DIR = process.env.QUEENBEES_DEV_PG_DIR ?? join(tmpdir(), 'queenbees-dev-pg');
/** Matches `DATABASE_URL` in `.env.local`; override only if that file is changed too. */
const PORT = process.env.QUEENBEES_DEV_PG_PORT ?? '55432';
const DATABASE = process.env.QUEENBEES_DEV_PG_NAME ?? 'queenbees_dev';
const URL = `postgresql://postgres@127.0.0.1:${PORT}/${DATABASE}`;

class DevDbError extends Error {}

function bindir(): string {
  const viaPgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (viaPgConfig.status === 0 && viaPgConfig.stdout.trim() !== '') return viaPgConfig.stdout.trim();
  return '/usr/bin';
}

/** Runs a PostgreSQL utility with output to a file, so a daemon inheriting stdio cannot block us. */
function run(bin: string, args: string[], label: string, timeoutMs = 120_000): string {
  const logPath = join(tmpdir(), `queenbees-devdb-${randomUUID()}.log`);
  const fd = openSync(logPath, 'w');
  let status: number | null = null;
  let failure: string | undefined;
  let output = '';
  try {
    const result = spawnSync(join(bindir(), bin), args, { stdio: ['ignore', fd, fd], timeout: timeoutMs });
    status = result.status;
    if (result.error) failure = result.error.message;
  } finally {
    closeSync(fd);
  }
  try {
    output = readFileSync(logPath, 'utf8').trim();
  } catch {
    output = '';
  }
  rmSync(logPath, { force: true });

  if (failure !== undefined) throw new DevDbError(`${label} failed: ${failure}`);
  if (status !== 0) throw new DevDbError(`${label} failed (exit ${status})${output === '' ? '' : `:\n${output}`}`);
  return output;
}

/** `pg_isready` is the cheapest honest answer to "is this cluster up?". */
function ready(): boolean {
  const result = spawnSync(join(bindir(), 'pg_isready'), ['-h', '127.0.0.1', '-p', PORT], {
    stdio: 'ignore',
    timeout: 10_000,
  });
  return result.status === 0;
}

function initialised(): boolean {
  return existsSync(join(DATA_DIR, 'PG_VERSION'));
}

function start(): void {
  if (ready()) {
    console.log(`The development cluster is already running on 127.0.0.1:${PORT}.`);
    report();
    return;
  }

  if (!initialised()) {
    // The directory must be absent or empty: `initdb` would refuse anything else, and this check makes
    // the intent explicit rather than relying on its error message.
    if (existsSync(DATA_DIR)) {
      const entries = spawnSync('ls', ['-A', DATA_DIR], { encoding: 'utf8' }).stdout.trim();
      if (entries !== '') {
        throw new DevDbError(
          `${DATA_DIR} exists and is not empty but holds no PostgreSQL cluster.` +
            ' Move it aside, or set QUEENBEES_DEV_PG_DIR to another path. This script never overwrites it.',
        );
      }
    }
    console.log(`initialising a development cluster in ${DATA_DIR}`);
    mkdirSync(DATA_DIR, { recursive: true });
    run('initdb', ['-D', DATA_DIR, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C'], 'initdb');
  } else {
    console.log(`starting the existing development cluster in ${DATA_DIR}`);
  }

  // Loopback only. The socket directory stays inside the data directory so no shared path is used.
  run(
    'pg_ctl',
    [
      '-D',
      DATA_DIR,
      '-l',
      join(DATA_DIR, 'server.log'),
      // The socket directory is inside the data directory: a packaged PostgreSQL build may default to a
      // system path that does not exist for this user, and the TCP listener is all this cluster needs.
      '-o',
      `-p ${PORT} -h 127.0.0.1 -k ${DATA_DIR}`,
      '-w',
      '-t',
      '60',
      'start',
    ],
    'pg_ctl start',
  );

  const exists = spawnSync(
    join(bindir(), 'psql'),
    [`postgresql://postgres@127.0.0.1:${PORT}/postgres`, '-tAc', `select 1 from pg_database where datname = '${DATABASE}'`],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (exists.status !== 0) {
    throw new DevDbError(`could not inspect the cluster: ${exists.stderr.trim()}`);
  }
  if (exists.stdout.trim() !== '1') {
    // Created only when absent: an existing database is never dropped, reset or recreated.
    run('createdb', ['-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', DATABASE], 'createdb');
    console.log(`created database ${DATABASE}`);
  }

  report();
}

function stop(): void {
  if (!initialised()) {
    console.log(`No development cluster at ${DATA_DIR}; nothing to stop.`);
    return;
  }
  if (!ready()) {
    console.log('The development cluster is not running.');
    return;
  }
  run('pg_ctl', ['-D', DATA_DIR, '-m', 'fast', '-w', '-t', '60', 'stop'], 'pg_ctl stop');
  console.log(`stopped. The data directory is kept at ${DATA_DIR} (nothing was deleted).`);
}

function report(): void {
  console.log('');
  console.log(`  DATABASE_URL=${URL}`);
  console.log('');
  console.log('Next steps, in this order (each is a separate, explicit command):');
  console.log('  npm run db:migrate         # schema');
  console.log('  npm run db:seed            # permission catalogue and the owner role');
  console.log('  npm run db:seed:catalog    # the 22-product catalog');
  console.log('  npm run staff:bootstrap -- you@example.test "Owner"   # prints a one-time token; redeem at /qbpanel/redeem');
  console.log('  npm run dev');
}

function main(): void {
  const flag = process.argv[2];
  if (flag === '--stop') return stop();
  if (flag === '--status') {
    console.log(ready() ? `running on 127.0.0.1:${PORT}` : 'not running');
    return;
  }
  start();
}

try {
  main();
} catch (error) {
  console.error(error instanceof DevDbError ? error.message : error);
  process.exit(1);
}
