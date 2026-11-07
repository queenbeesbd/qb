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

import { CUSTOMER_PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';

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

/**
 * Ceilings for the parameters a **stored** hash may carry.
 *
 * A stored value is data this module reads, not something it wrote, so its parameters are untrusted
 * input: they decide how much memory and CPU `scrypt` is asked for. These are the largest values
 * this application will honour, and they leave room to raise the real cost well above the current
 * parameters (`128 * N * r` = 16 MiB) without touching the parser:
 *
 * - `N` at most 2^18, `r` at most 32, `p` at most 16;
 * - a working set (`128 * N * r`) of at most 128 MiB, which is 8x the current cost.
 *
 * Anything outside them is refused, so a corrupt or hostile row cannot scale the allocation.
 */
const MAX_N = 1 << 18;
const MAX_R = 32;
const MAX_P = 16;
const MAX_MEMORY_BYTES = 128 * 1024 * 1024;

/** Our own hashes are around 100 characters; anything much longer is refused before decoding. */
const MAX_HASH_LENGTH = 512;

/** base64url as `Buffer.toString('base64url')` writes it: no padding, no other characters. */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

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

  // Decoded strictly and length-checked **before** any hashing. A derived key that decodes to zero
  // bytes would otherwise reach `scrypt` as `keylen 0`, which throws instead of failing the
  // comparison - a 500 that distinguishes a corrupt row from an ordinary wrong password.
  const expected = decodeBase64Url(parsed.derived, KEY_BYTES);
  const salt = decodeBase64Url(parsed.salt, SALT_BYTES);
  if (expected === null || salt === null) return false;

  let actual: Buffer;
  try {
    actual = await scryptAsync(plain.normalize('NFC'), salt, expected.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      // Scrypt refuses to run when the working set exceeds maxmem; derived from the stored parameters
      // rather than fixed, so a raised cost in a later credential still verifies. `parseHash` bounds
      // those parameters, so this value is bounded too.
      maxmem: 256 * parsed.N * parsed.r,
    });
  } catch {
    // A stored value the runtime rejects is a failed verification, never an unhandled error.
    return false;
  }

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
  // A cheap bound before splitting or decoding, so an oversized stored value is refused at once.
  if (stored.length > MAX_HASH_LENGTH) return null;

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
  // scrypt requires a power-of-two cost of at least 2; rejecting anything else keeps a hostile
  // stored value from producing a nonsensical allocation.
  if (N < 2 || (N & (N - 1)) !== 0) return null;
  if (N > MAX_N || r > MAX_R || p > MAX_P) return null;
  // The working set scrypt allocates is `128 * N * r` bytes. Bounded explicitly rather than relying
  // on the individual ceilings, so a combination inside them cannot add up to an absurd allocation.
  if (128 * N * r > MAX_MEMORY_BYTES) return null;

  return { N, r, p, salt, derived };
}

/**
 * Decodes one base64url field strictly, or returns `null`.
 *
 * `Buffer.from(value, 'base64url')` is lenient: it ignores characters it does not recognise and
 * accepts truncated input. So the character set, the decoded length and a round-trip re-encoding are
 * all checked. A field that does not decode to exactly the expected number of bytes is not something
 * this module wrote.
 */
function decodeBase64Url(value: string, bytes: number): Buffer | null {
  if (!BASE64URL_PATTERN.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== bytes) return null;
  if (decoded.toString('base64url') !== value) return null;
  return decoded;
}

/**
 * Length-only password policy.
 *
 * No composition rules: they push people towards predictable substitutions, and length is the
 * property that actually resists offline guessing. The maximum exists because scrypt cost grows with
 * input size and an unbounded body is a cheap denial-of-service vector.
 */
/**
 * The customer rule: eight characters, and at least one character that is a letter or a symbol.
 *
 * A digits-only string of any length is refused, because a phone number or a date is the most likely
 * weak password a customer types. Letters are checked with the Unicode property so a Bangla password
 * satisfies the rule exactly as an English one does.
 */
export function customerPasswordPolicyError(plain: string): string | null {
  const length = [...plain.normalize('NFC')].length;
  if (length < CUSTOMER_PASSWORD_MIN_LENGTH) return 'too_short';
  if (length > PASSWORD_MAX_LENGTH) return 'too_long';
  if (!/[\p{L}\p{S}\p{P}]/u.test(plain.normalize('NFC'))) return 'needs_letter_or_symbol';
  return null;
}

export function passwordPolicyError(plain: string): string | null {
  const length = [...plain.normalize('NFC')].length;
  if (length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (length > PASSWORD_MAX_LENGTH) return 'too_long';
  return null;
}
