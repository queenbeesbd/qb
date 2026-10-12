/**
 * Login throttling.
 *
 * A fixed window with a monotonic counter, stored in `auth_throttle` (`docs/data-model.md` 4.5).
 * The database is the store because a serverless runtime has no shared memory, and the design
 * explicitly chose one row and one upsert over a token bucket.
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

import { LOGIN_THROTTLE } from './constants';
import { sha256Hex } from './tokens';

export type ThrottleVerdict = { blocked: boolean; blockedUntil: Date | null };

/** Distinguishes the two subject kinds that share the table, so their digests cannot collide. */
export function accountSubject(email: string): string {
  return sha256Hex(`account:${email}`);
}

/**
 * The source subject, derived from the **already-hashed** address in the session context.
 *
 * The raw address never reaches this module: `sessionContextFrom` digests it once, and the throttle
 * re-keys that digest. So the address appears in no table, no audit row and no log, and the two
 * derived keys still cannot collide because each mixes in its own label.
 */
export function sourceSubject(ipHash: string | null): string {
  return sha256Hex(`source:${ipHash ?? 'unknown'}`);
}

/** Reads the current verdict for a subject without recording an attempt. */
export async function throttleState(tx: Transaction, subjectHash: string): Promise<ThrottleVerdict> {
  const rows = await tx
    .select({ blockedUntil: authThrottle.blockedUntil })
    .from(authThrottle)
    .where(
      sql`${authThrottle.scope} = ${LOGIN_THROTTLE.scope}
          and ${authThrottle.subjectHash} = ${subjectHash}
          and ${authThrottle.windowStart} > now() - ${sql.raw(`interval '${LOGIN_THROTTLE.windowMs * 2} milliseconds'`)}`,
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
export async function recordFailedAttempt(tx: Transaction, subjectHash: string): Promise<ThrottleVerdict> {
  const windowStart = new Date(Math.floor(Date.now() / LOGIN_THROTTLE.windowMs) * LOGIN_THROTTLE.windowMs);

  const rows = await tx
    .insert(authThrottle)
    .values({
      scope: LOGIN_THROTTLE.scope,
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
          when ${authThrottle.attempts} + 1 >= ${LOGIN_THROTTLE.maxAttempts}
            then greatest(
              coalesce(${authThrottle.blockedUntil}, to_timestamp(0)),
              now() + ${sql.raw(`interval '${LOGIN_THROTTLE.blockMs} milliseconds'`)}
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
 * Clears a subject's counters after a successful sign-in, so a legitimate user is not locked out by
 * their own earlier typos. Only the subjects that were checked are cleared.
 */
export async function clearThrottle(tx: Transaction, subjectHashes: readonly string[]): Promise<void> {
  if (subjectHashes.length === 0) return;
  for (const subjectHash of subjectHashes) {
    await tx
      .delete(authThrottle)
      .where(sql`${authThrottle.scope} = ${LOGIN_THROTTLE.scope} and ${authThrottle.subjectHash} = ${subjectHash}`);
  }
}
