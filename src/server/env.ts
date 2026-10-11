/**
 * Server environment validation.
 *
 * Server-only by construction: importing this module in a client bundle throws immediately, so a
 * database URL can never be reached from browser code by accident.
 *
 * Nothing here reads a secret from a committed file. Every value comes from the process
 * environment, which is set per deployment target - that is what keeps preview, development, test
 * and production from sharing credentials.
 *
 * See docs/database.md.
 */

export const ENVIRONMENTS = ['development', 'test', 'preview', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const DRIVERS = ['pg', 'neon-serverless'] as const;
export type Driver = (typeof DRIVERS)[number];

/**
 * The shape this module reads from.
 *
 * Deliberately a plain string map rather than `NodeJS.ProcessEnv`: the function only inspects a
 * handful of keys, and accepting a partial object lets tests pass an explicit environment without
 * having to satisfy every field the ambient type requires.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export type ServerEnv = {
  readonly environment: Environment;
  readonly databaseUrl: string;
  readonly driver: Driver;
  /** True when the target host is loopback. Used to refuse production-like operations locally. */
  readonly isLocal: boolean;
};

export class EnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

/** Throws when evaluated outside a Node server runtime. */
export function assertServerRuntime(): void {
  if (typeof window !== 'undefined') {
    throw new EnvironmentError(
      'Server environment module was imported into a client bundle. Server configuration must never ' +
        'be reachable from browser code.',
    );
  }
}

function readEnvironment(raw: string | undefined): Environment {
  const value = raw ?? process.env.NODE_ENV ?? 'development';
  if ((ENVIRONMENTS as readonly string[]).includes(value)) return value as Environment;
  throw new EnvironmentError(
    `QUEENBEES_ENV must be one of ${ENVIRONMENTS.join(', ')}; received "${value}".`,
  );
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * Resolves the driver.
 *
 * The deployed runtime needs interactive transactions for the D11 claim-allocation transaction, and
 * Neon's HTTP driver does not support them. A Neon host therefore defaults to the WebSocket driver.
 * See ADR 0007.
 */
function resolveDriver(raw: string | undefined, hostname: string): Driver {
  if (raw) {
    if ((DRIVERS as readonly string[]).includes(raw)) return raw as Driver;
    throw new EnvironmentError(
      `DATABASE_DRIVER must be one of ${DRIVERS.join(', ')}; received "${raw}".`,
    );
  }
  return hostname.endsWith('.neon.tech') ? 'neon-serverless' : 'pg';
}

export function parseServerEnv(source: EnvSource = process.env): ServerEnv {
  assertServerRuntime();

  const rawUrl = source.DATABASE_URL;
  if (!rawUrl || rawUrl.trim() === '') {
    throw new EnvironmentError(
      'DATABASE_URL is required. Set it in the environment for this target - never in a committed ' +
        'file. See .env.example for the expected shape.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new EnvironmentError('DATABASE_URL is not a valid URL.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new EnvironmentError(
      `DATABASE_URL must use the postgres: or postgresql: scheme; received "${parsed.protocol}".`,
    );
  }
  if (!parsed.hostname) {
    throw new EnvironmentError('DATABASE_URL must include a host.');
  }

  const environment = readEnvironment(source.QUEENBEES_ENV);
  const isLocal = isLoopbackHost(parsed.hostname);

  // A remote target without TLS is a misconfiguration, not a preference.
  const sslMode = parsed.searchParams.get('sslmode');
  if (!isLocal && sslMode === 'disable') {
    throw new EnvironmentError(
      'DATABASE_URL points at a remote host with sslmode=disable. Remote connections must use TLS.',
    );
  }

  // Production must never point at a developer machine.
  if (environment === 'production' && isLocal) {
    throw new EnvironmentError(
      'QUEENBEES_ENV=production must not point at a loopback host. Refusing to start.',
    );
  }

  return { environment, databaseUrl: rawUrl, driver: resolveDriver(source.DATABASE_DRIVER, parsed.hostname), isLocal };
}

let cached: ServerEnv | undefined;

/** Validated environment for the current process. Throws with an actionable message if invalid. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv();
  return cached;
}

/** Test seam: clears the memoised environment. */
export function resetServerEnvCache(): void {
  cached = undefined;
}

/**
 * Refuses to touch a non-local database unless explicitly allowed.
 *
 * Integration tests and the disposable-cluster harness call this so a stray DATABASE_URL cannot
 * point a test run at a real deployment. Environment isolation is a rule, not a convention.
 */
export function assertDisposableDatabase(env: ServerEnv = serverEnv()): void {
  if (env.isLocal) return;
  if (process.env.QUEENBEES_ALLOW_REMOTE_TEST_DB === '1') return;
  throw new EnvironmentError(
    `Refusing to run against non-local database host. Tests must use a disposable local cluster. ` +
      `Set QUEENBEES_ALLOW_REMOTE_TEST_DB=1 only if you have deliberately chosen otherwise.`,
  );
}
