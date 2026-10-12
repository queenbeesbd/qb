/**
 * Staff password hashing.
 *
 * `scrypt` from Node's standard library, deliberately: it is a maintained, memory-hard,
 * password-hashing function that requires **no new dependency**, which matters because this project
 * adds a dependency only with a demonstrated need (AGENTS.md). The stored form is self-describing,
 * so parameters can be raised later without invalidating existing credentials, and
 * `needsRehash` reports when an existing row should be upgraded on next successful sign-in.
 *
 * Format: `scrypt$N=<n>,r=<r>,p=<p>$<salt-base64url>$<derived-key-base64url>`
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';

/**
 * `promisify` narrows to the three-argument overload, which drops the options object that carries the
 * cost parameters. Re-typed here rather than cast at each call site, so the parameters are checked.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Cost parameters. `N` is the CPU/memory cost (must be a power of two), `r` the block size and `p`
 * the parallelisation factor. 128 * N * r = 16 MiB per hash, which is inside Node's default 32 MiB
 * `maxmem` and takes tens of milliseconds - slow enough to make offline guessing expensive, fast
 * enough for an interactive login.
 */
const PARAMS = { N: 16_384, r: 8, p: 1 } as const;

const KEY_BYTES = 32;
const SALT_BYTES = 16;
const ALGORITHM = 'scrypt';

export type PasswordHash = string;

/** Hashes a password. The salt is random per call, so identical passwords hash differently. */
export async function hashPassword(plain: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plain.normalize('NFC'), salt, KEY_BYTES, { ...PARAMS });
  const label = `${ALGORITHM}$N=${PARAMS.N},r=${PARAMS.r},p=${PARAMS.p}`;
  return `${label}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing for a malformed or unrecognised stored value, so a corrupt
 * credential row is a failed login rather than a 500 that distinguishes the account.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (parsed === null) return false;

  const expected = Buffer.from(parsed.derived, 'base64url');
  const actual = await scryptAsync(plain.normalize('NFC'), Buffer.from(parsed.salt, 'base64url'), expected.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    // Scrypt refuses to run when the working set exceeds maxmem; derived from the stored parameters
    // rather than fixed, so a raised cost in a later credential still verifies.
    maxmem: 256 * parsed.N * parsed.r,
  });

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** True when a stored hash was produced with weaker parameters than the current policy. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  if (parsed === null) return true;
  return parsed.N < PARAMS.N || parsed.r < PARAMS.r || parsed.p < PARAMS.p;
}

type ParsedHash = { N: number; r: number; p: number; salt: string; derived: string };

/** `N=<n>,r=<r>,p=<p>` with the parameters in the fixed order this module writes them. */
const PARAMETER_PATTERN = /^N=(\d+),r=(\d+),p=(\d+)$/;

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 4) return null;
  const [algorithm, parameterText, salt, derived] = parts;
  if (algorithm !== ALGORITHM || parameterText === undefined || salt === undefined || derived === undefined) {
    return null;
  }

  const match = PARAMETER_PATTERN.exec(parameterText);
  if (match === null) return null;
  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  if (![N, r, p].every((value) => Number.isSafeInteger(value) && value > 0)) return null;
  // scrypt requires a power-of-two cost; rejecting anything else keeps a hostile stored value from
  // producing an unbounded allocation.
  if ((N & (N - 1)) !== 0) return null;

  return { N, r, p, salt, derived };
}

/**
 * Length-only password policy.
 *
 * No composition rules: they push people towards predictable substitutions, and length is the
 * property that actually resists offline guessing. The maximum exists because scrypt cost grows with
 * input size and an unbounded body is a cheap denial-of-service vector.
 */
export function passwordPolicyError(plain: string): string | null {
  const length = [...plain.normalize('NFC')].length;
  if (length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (length > PASSWORD_MAX_LENGTH) return 'too_long';
  return null;
}
