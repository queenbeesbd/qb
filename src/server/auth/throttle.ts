/**
 * Authentication throttling.
 *
 * A fixed window with a monotonic counter, stored in `auth_throttle` (`docs/data-model.md` 4.5).
 * The database is the store because a serverless runtime has no shared memory, and the design
 * explicitly chose one row and one upsert over a token bucket.
 *
 * **The policy is a parameter, not a module constant.** Customer sign-in, customer registration and
 * owner sign-in all throttle against the same table but with different limits and different `scope`
 * values, so the window size, attempt ceiling and block length are supplied by the caller. The row
 * key is `(scope, subject_hash, window_start)`, so two flows with the same subject hash still occupy
 * different rows.
 *
 * Two subjects are counted for every attempt - the **account** and the **source address** - so
 * neither credential stuffing against one account nor spraying one password across many accounts is
 * unthrottled. Both are keyed by a SHA-256 digest; the raw email or address is never stored, and
 * neither is ever logged.
 *
 * The residual risk is documented rather than hidden: a fixed window is coarse, so a burst spanning
 * a window boundary can reach up to twice `maxAttempts` before the block applies.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { authThrottle } from '@/db/schema';
import type { THROTTLE_SCOPE } from '@/db/schema/values';

import { sha256Hex } from './tokens';

export type ThrottleScope = (typeof THROTTLE_SCOPE)[number];

/** One throttled flow's limits. */
export type ThrottlePolicy = {
  readonly scope: ThrottleScope;
  readonly windowMs: number;
  readonly maxAttempts: number;
  readonly blockMs: number;
};

export type ThrottleVerdict = { blocked: boolean; blockedUntil: Date | null };

/** Distinguishes an account subject from a source subject, so their digests cannot collide. */
export function subjectDigest(kind: 'account' | 'source', value: string): string {
  return sha256Hex(`${kind}:${value}`);
}

/** The account subject for an email address. The address itself is never stored. */
export function accountSubject(email: string): string {
  return subjectDigest('account', email);
}

/**
 * The source subject, derived from the **already-hashed** address in the session context.
 *
 * The raw address never reaches this module: `sessionContextFrom` digests it once, and the throttle
 * re-keys that digest. So the address appears in no table, no audit row and no log, and the two
 * derived keys still cannot collide because each mixes in its own label.
 */
export function sourceSubject(ipHash: string | null): string {
  return subjectDigest('source', ipHash ?? 'unknown');
}

/** Reads the current verdict for a subject without recording an attempt. */
export async function throttleState(
  tx: Transaction,
  policy: ThrottlePolicy,
  subjectHash: string,
): Promise<ThrottleVerdict> {
  const rows = await tx
    .select({ blockedUntil: authThrottle.blockedUntil })
    .from(authThrottle)
    .where(
      sql`${authThrottle.scope} = ${policy.scope}
          and ${authThrottle.subjectHash} = ${subjectHash}
          and ${authThrottle.windowStart} > now() - ${sql.raw(`interval '${policy.windowMs * 2} milliseconds'`)}`,
    );

  const now = Date.now();
  let latest: Date | null = null;
  for (const row of rows) {
    if (row.blockedUntil !== null && row.blockedUntil.getTime() > now) {
      if (latest === null || row.blockedUntil > latest) latest = row.blockedUntil;
    }
  }
  return { blocked: latest !== null, blockedUntil: latest };
}

/**
 * Records a failed attempt and returns the resulting verdict.
 *
 * The counter is incremented and the block decided in one statement, so two concurrent failures
 * cannot both read "below the limit" and both write the same incremented value.
 */
export async function recordFailedAttempt(
  tx: Transaction,
  policy: ThrottlePolicy,
  subjectHash: string,
): Promise<ThrottleVerdict> {
  const windowStart = new Date(Math.floor(Date.now() / policy.windowMs) * policy.windowMs);

  const rows = await tx
    .insert(authThrottle)
    .values({
      scope: policy.scope,
      subjectHash,
      windowStart,
      attempts: 1,
      blockedUntil: null,
    })
    .onConflictDoUpdate({
      target: [authThrottle.scope, authThrottle.subjectHash, authThrottle.windowStart],
      set: {
        attempts: sql`${authThrottle.attempts} + 1`,
        blockedUntil: sql`case
          when ${authThrottle.attempts} + 1 >= ${policy.maxAttempts}
            then greatest(
              coalesce(${authThrottle.blockedUntil}, to_timestamp(0)),
              now() + ${sql.raw(`interval '${policy.blockMs} milliseconds'`)}
            )
          else ${authThrottle.blockedUntil}
        end`,
      },
    })
    .returning({ blockedUntil: authThrottle.blockedUntil });

  const blockedUntil = rows[0]?.blockedUntil ?? null;
  const blocked = blockedUntil !== null && blockedUntil.getTime() > Date.now();
  return { blocked, blockedUntil };
}

/**
 * Clears a subject's counters after a successful attempt, so a legitimate user is not locked out by
 * their own earlier typos. Only the subjects that were checked are cleared.
 */
export async function clearThrottle(
  tx: Transaction,
  policy: ThrottlePolicy,
  subjectHashes: readonly string[],
): Promise<void> {
  if (subjectHashes.length === 0) return;
  for (const subjectHash of subjectHashes) {
    await tx
      .delete(authThrottle)
      .where(sql`${authThrottle.scope} = ${policy.scope} and ${authThrottle.subjectHash} = ${subjectHash}`);
  }
}
