/**
 * Disposable local PostgreSQL cluster.
 *
 * Creates a throwaway cluster in the system temp directory, runs it on a free port, and removes it
 * afterwards. It exists so integration tests and migration rehearsals can exercise real PostgreSQL
 * without touching a deployed database - and without creating any cloud resource.
 *
 * Safety properties, deliberately:
 *   - the data directory is always a fresh `mkdtemp` under the OS temp directory, never inside the
 *     repository, so no generated database file can be committed;
 *   - the server listens on 127.0.0.1 only, on an ephemeral port;
 *   - authentication is `trust`, which is acceptable precisely because the cluster is local,
 *     short-lived and empty;
 *   - the cluster is stopped and deleted even when the caller throws;
 *   - every external command is bounded by a timeout, so a stuck utility fails the test instead of
 *     hanging the suite.
 *
 * Nothing here provisions anything remote. See docs/database.md.
 */

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type LocalCluster = {
  readonly dataDir: string;
  readonly port: number;
  readonly databaseName: string;
  /** Connection string for the created database. */
  readonly url: string;
  /** Connection string for the `postgres` maintenance database. */
  readonly adminUrl: string;
  stop(): Promise<void>;
};

class ClusterError extends Error {}

function bindir(): string {
  const viaPgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (viaPgConfig.status === 0 && viaPgConfig.stdout.trim() !== '') return viaPgConfig.stdout.trim();
  return '/usr/bin';
}

/**
 * Runs a PostgreSQL utility with bounded output handling.
 *
 * Two details are load-bearing, and both were learned the hard way:
 *
 * 1. Output goes to a temporary **file**, not a pipe. `pg_ctl start` daemonises `postgres`, and the
 *    daemon inherits the parent's stdio. When that stdio is a pipe, `spawnSync` waits for an EOF
 *    that never arrives because the daemon holds the write end open forever - so the call blocks
 *    indefinitely and no test ever runs. A file descriptor has no EOF to wait for.
 * 2. Every call has a hard **timeout**, so even an unexpected stall fails loudly instead of hanging
 *    the suite until something kills it and leaves a cluster behind.
 */
function run(bin: string, args: string[], label: string, timeoutMs = 120_000): void {
  const logPath = join(tmpdir(), `queenbees-pg-${randomUUID()}.log`);
  const fd = openSync(logPath, 'w');
  let status: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let failure: string | undefined;

  try {
    const result = spawnSync(join(bindir(), bin), args, {
      stdio: ['ignore', fd, fd],
      timeout: timeoutMs,
    });
    status = result.status;
    signal = result.signal;
    if (result.error) failure = result.error.message;
  } finally {
    closeSync(fd);
  }

  let output = '';
  try {
    output = readFileSync(logPath, 'utf8').trim();
  } catch {
    output = '';
  }
  rmSync(logPath, { force: true });

  const detail = output === '' ? '' : `:\n${output}`;
  if (failure !== undefined) throw new ClusterError(`${label} failed: ${failure}${detail}`);
  if (signal !== null) {
    throw new ClusterError(`${label} was terminated by ${signal} after ${timeoutMs}ms${detail}`);
  }
  if (status !== 0) throw new ClusterError(`${label} failed (exit ${status})${detail}`);
}

/** Best-effort variant for teardown, where a failure must not mask the original error. */
function runQuiet(bin: string, args: string[], timeoutMs = 60_000): void {
  try {
    run(bin, args, bin, timeoutMs);
  } catch {
    // Teardown is best effort; the data directory is removed regardless.
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new ClusterError('Could not determine a free port.'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Starts a disposable cluster and creates `databaseName`.
 *
 * Always pair with `stop()` in a `finally`, or use `withLocalCluster`.
 */
export async function startLocalCluster(databaseName = 'queenbees_test'): Promise<LocalCluster> {
  const dataDir = mkdtempSync(join(tmpdir(), 'queenbees-pg-'));
  const socketDir = mkdtempSync(join(tmpdir(), 'queenbees-pgsock-'));
  const port = await freePort();

  const cleanup = (): void => {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(socketDir, { recursive: true, force: true });
  };

  try {
    run(
      'initdb',
      ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C', '--no-sync'],
      'initdb',
      180_000,
    );
    run(
      'pg_ctl',
      [
        '-D',
        dataDir,
        '-o',
        `-p ${port} -k ${socketDir} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off`,
        '-w',
        '-t',
        '60',
        'start',
      ],
      'pg_ctl start',
      120_000,
    );
    run(
      'createdb',
      ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', databaseName],
      'createdb',
      60_000,
    );
  } catch (error) {
    // Best effort: stop a half-started server before deleting its data directory.
    runQuiet('pg_ctl', ['-D', dataDir, '-m', 'immediate', 'stop'], 30_000);
    cleanup();
    throw error;
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    runQuiet('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', '-t', '30', 'stop'], 60_000);
    cleanup();
  };

  return {
    dataDir,
    port,
    databaseName,
    url: `postgresql://postgres@127.0.0.1:${port}/${databaseName}`,
    adminUrl: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    stop,
  };
}

/** Runs `fn` against a disposable cluster and guarantees teardown. */
export async function withLocalCluster<T>(fn: (cluster: LocalCluster) => Promise<T>): Promise<T> {
  const cluster = await startLocalCluster();
  try {
    return await fn(cluster);
  } finally {
    await cluster.stop();
  }
}

/** True when the PostgreSQL server binaries this harness needs are available. */
export function clusterToolingAvailable(): boolean {
  return ['initdb', 'pg_ctl', 'createdb'].every((bin) => {
    const result = spawnSync(join(bindir(), bin), ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
    });
    return result.status === 0;
  });
}
