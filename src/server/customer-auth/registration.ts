/**
 * Registration, **after** the identifier is proved (owner decision, 2026-11-12; ADR 0038).
 *
 * The account does not exist until a six-digit code sent to the number or address is entered. Three
 * steps, three functions:
 *
 * 1. `startRegistration` - normalises the identifier, refuses one that already names an account or a
 *    channel this deployment cannot send on, and writes one pending row with an **scrypt** digest of a
 *    random six-digit code. The raw code exists only in the message.
 * 2. `verifyRegistrationCode` - compares the code, counts wrong guesses (the row dies at five), and
 *    hands back a 256-bit ticket whose digest is stored on the row.
 * 3. `completeRegistration` - consumes the ticket in a guarded `UPDATE ... WHERE consumed_at IS NULL`
 *    and only then writes the customer and its password credential, with the verified identifier's
 *    timestamp already set.
 *
 * Because nothing is written to `customer` before step 3, a flood of registrations costs one pending
 * row and one message each, never an account - which is the point of verifying first.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { customer, customerCredential, customerRegistration } from '@/db/schema';
import { customerPasswordPolicyError, hashPassword, verifyPassword } from '../auth/password';
import type { SessionContext } from '../auth/session';
import {
  clearThrottle,
  recordFailedAttempt,
  sourceSubject,
  throttleState,
} from '../auth/throttle';
import { createNumericCode, createOpaqueToken, looksLikeToken, sha256Hex } from '../auth/tokens';
import { emailConfigured } from '../integrations/email';
import { smsConfigured } from '../integrations/sms';
import {
  CUSTOMER_REGISTER_THROTTLE,
  CUSTOMER_REGISTRATION_CODE_ATTEMPTS,
  CUSTOMER_REGISTRATION_CODE_MS,
  CUSTOMER_REGISTRATION_IDENTIFIER_THROTTLE,
  CUSTOMER_REGISTRATION_TICKET_MS,
} from './constants';
import { parseDisplayName, parseEmail, parsePassword, parsePhone } from './validation';

export type RegistrationChannel = 'phone' | 'email';

/** The one identifier a registration will become an account with, in canonical form. */
export type RegistrationIdentifier = { readonly channel: RegistrationChannel; readonly value: string };

/** Which identifier the form was on: the submitted mode, else inferred from an `@`. */
export function parseRegistrationIdentifier(
  method: unknown,
  raw: unknown,
): RegistrationIdentifier | null {
  const channel: RegistrationChannel =
    method === 'email' || method === 'phone' ? method : typeof raw === 'string' && raw.includes('@') ? 'email' : 'phone';
  const value = channel === 'email' ? parseEmail(raw) : parsePhone(raw);
  return value === null ? null : { channel, value };
}

export type RegistrationDelivery = {
  readonly channel: RegistrationChannel;
  /** The canonical number or address, i.e. exactly what was stored. */
  readonly to: string;
  readonly code: string;
};

export type RegistrationStartFailure =
  | 'invalid_email'
  | 'invalid_phone'
  | 'email_taken'
  | 'phone_taken'
  | 'throttled'
  | 'channel_unavailable';

export type RegistrationStartResult =
  | { readonly ok: true; readonly delivery: RegistrationDelivery }
  | { readonly ok: false; readonly failure: RegistrationStartFailure };

/** Why an identifier cannot be registered on this deployment right now. */
function channelUnavailable(channel: RegistrationChannel): boolean {
  return channel === 'email' ? !emailConfigured() : !smsConfigured();
}

/**
 * Starts a registration and returns the code to send.
 *
 * A duplicate identifier is named explicitly - the same accepted enumeration surface registration has
 * always had, because a person choosing a number or address must be told it is in use. Throttling is
 * keyed on the identifier as well as the source, so one person's number cannot be texted in a loop.
 */
export async function startRegistration(
  tx: Transaction,
  input: {
    readonly method: unknown;
    readonly identifier: unknown;
    readonly context: SessionContext;
  },
): Promise<RegistrationStartResult> {
  const parsed = parseRegistrationIdentifier(input.method, input.identifier);
  if (parsed === null) {
    return { ok: false, failure: input.method === 'email' ? 'invalid_email' : 'invalid_phone' };
  }
  if (channelUnavailable(parsed.channel)) return { ok: false, failure: 'channel_unavailable' };

  const taken = await tx
    .select({ email: customer.email, phone: customer.phone })
    .from(customer)
    .where(
      parsed.channel === 'email'
        ? sql`lower(${customer.email}) = ${parsed.value}`
        : sql`${customer.phone} = ${parsed.value}`,
    );
  if (parsed.channel === 'email' && taken.length > 0) return { ok: false, failure: 'email_taken' };
  if (parsed.channel === 'phone' && taken.length > 0) return { ok: false, failure: 'phone_taken' };

  const subjects = [
    sourceSubject(input.context.ipHash),
    sha256Hex(`customer-register:${parsed.value}`),
  ];
  for (const subject of subjects) {
    const state = await throttleState(tx, CUSTOMER_REGISTER_THROTTLE, subject);
    if (state.blocked) return { ok: false, failure: 'throttled' };
  }
  const identifierState = await throttleState(
    tx,
    CUSTOMER_REGISTRATION_IDENTIFIER_THROTTLE,
    subjects[1] ?? '',
  );
  if (identifierState.blocked) return { ok: false, failure: 'throttled' };

  const code = createNumericCode(6);
  const codeHash = await hashPassword(code);
  const now = new Date();

  // A new request supersedes the last one: one live row per identifier, so an earlier code stops
  // working the moment a new one is asked for.
  await tx
    .delete(customerRegistration)
    .where(
      sql`${customerRegistration.identifier} = ${parsed.value} and ${customerRegistration.consumedAt} is null`,
    );

  await tx.insert(customerRegistration).values({
    channel: parsed.channel,
    identifier: parsed.value,
    codeHash,
    expiresAt: new Date(now.getTime() + CUSTOMER_REGISTRATION_CODE_MS),
    requestedIpHash: input.context.ipHash,
  });

  // Every accepted request counts, because each one sends a message that costs the shop money.
  await recordFailedAttempt(tx, CUSTOMER_REGISTER_THROTTLE, subjects[0] ?? '');
  await recordFailedAttempt(tx, CUSTOMER_REGISTRATION_IDENTIFIER_THROTTLE, subjects[1] ?? '');

  return { ok: true, delivery: { channel: parsed.channel, to: parsed.value, code } };
}

export type RegistrationVerifyFailure = 'invalid_code' | 'throttled' | 'expired' | 'not_found';

export type RegistrationVerifyResult =
  | { readonly ok: true; readonly ticket: string; readonly channel: RegistrationChannel; readonly identifier: string }
  | { readonly ok: false; readonly failure: RegistrationVerifyFailure };

/**
 * Consumes a registration code and issues the ticket the final step presents.
 *
 * Every refusal is one `invalid_code`: unknown identifier, expired row, dead row, wrong digits. The
 * source is throttled as well as the row, so a six-digit space cannot be walked through even by
 * starting a fresh registration between guesses.
 */
export async function verifyRegistrationCode(
  tx: Transaction,
  input: { readonly identifier: unknown; readonly code: unknown; readonly context: SessionContext },
): Promise<RegistrationVerifyResult> {
  const parsed = parseRegistrationIdentifier(undefined, input.identifier);
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (parsed === null || !/^[0-9]{6}$/.test(code)) return { ok: false, failure: 'invalid_code' };

  const source = sourceSubject(input.context.ipHash);
  const state = await throttleState(tx, CUSTOMER_REGISTER_THROTTLE, source);
  if (state.blocked) return { ok: false, failure: 'throttled' };

  const rows = await tx
    .select({
      id: customerRegistration.id,
      channel: customerRegistration.channel,
      identifier: customerRegistration.identifier,
      codeHash: customerRegistration.codeHash,
      attempts: customerRegistration.attempts,
      expiresAt: customerRegistration.expiresAt,
    })
    .from(customerRegistration)
    .where(
      sql`${customerRegistration.identifier} = ${parsed.value}
          and ${customerRegistration.consumedAt} is null
          and ${customerRegistration.verifiedAt} is null`,
    );
  const row = rows[0];

  if (row === undefined) {
    await recordFailedAttempt(tx, CUSTOMER_REGISTER_THROTTLE, source);
    return { ok: false, failure: 'not_found' };
  }
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, failure: 'expired' };
  if (row.attempts >= CUSTOMER_REGISTRATION_CODE_ATTEMPTS) return { ok: false, failure: 'invalid_code' };

  if (!(await verifyPassword(code, row.codeHash))) {
    const spent = row.attempts + 1 >= CUSTOMER_REGISTRATION_CODE_ATTEMPTS;
    await tx
      .update(customerRegistration)
      .set({
        attempts: row.attempts + 1,
        consumedAt: spent ? new Date() : null,
      })
      .where(
        sql`${customerRegistration.id} = ${row.id} and ${customerRegistration.consumedAt} is null`,
      );
    await recordFailedAttempt(tx, CUSTOMER_REGISTER_THROTTLE, source);
    return { ok: false, failure: 'invalid_code' };
  }

  // The ticket is the whole authority for the final step; only its digest is stored.
  const ticket = createOpaqueToken();
  const now = new Date();
  const consumed = await tx
    .update(customerRegistration)
    .set({
      verifiedAt: now,
      ticketHash: sha256Hex(ticket),
      expiresAt: new Date(now.getTime() + CUSTOMER_REGISTRATION_TICKET_MS),
    })
    .where(
      sql`${customerRegistration.id} = ${row.id}
          and ${customerRegistration.consumedAt} is null
          and ${customerRegistration.verifiedAt} is null`,
    )
    .returning({ id: customerRegistration.id });
  if (consumed.length === 0) return { ok: false, failure: 'invalid_code' };

  await clearThrottle(tx, CUSTOMER_REGISTER_THROTTLE, [source]);
  return {
    ok: true,
    ticket,
    channel: row.channel === 'email' ? 'email' : 'phone',
    identifier: row.identifier,
  };
}

export type RegistrationCompleteFailure =
  | 'invalid_ticket'
  | 'weak_password'
  | 'invalid_name'
  | 'email_taken'
  | 'phone_taken'
  | 'throttled';

export type RegistrationCompleteResult =
  | { readonly ok: true; readonly customerId: number }
  | { readonly ok: false; readonly failure: RegistrationCompleteFailure };

/**
 * Creates the account for a verified registration.
 *
 * The ticket is consumed **before** the customer row is written, so a replay cannot create a second
 * account; the insert itself runs in a savepoint because a duplicate identifier is a normal outcome
 * that must not abort the caller's transaction.
 */
export async function completeRegistration(
  tx: Transaction,
  input: {
    readonly ticket: unknown;
    readonly password: unknown;
    readonly displayName: unknown;
    readonly context: SessionContext;
  },
): Promise<RegistrationCompleteResult> {
  const ticket = typeof input.ticket === 'string' ? input.ticket.trim() : '';
  if (!looksLikeToken(ticket)) return { ok: false, failure: 'invalid_ticket' };

  const password = parsePassword(input.password);
  if (password === null || customerPasswordPolicyError(password) !== null) {
    return { ok: false, failure: 'weak_password' };
  }
  const name = parseDisplayName(input.displayName);
  if (!name.ok) return { ok: false, failure: 'invalid_name' };

  const source = sourceSubject(input.context.ipHash);
  const state = await throttleState(tx, CUSTOMER_REGISTER_THROTTLE, source);
  if (state.blocked) return { ok: false, failure: 'throttled' };

  const ticketHash = sha256Hex(ticket);
  const rows = await tx
    .select({
      id: customerRegistration.id,
      channel: customerRegistration.channel,
      identifier: customerRegistration.identifier,
      expiresAt: customerRegistration.expiresAt,
    })
    .from(customerRegistration)
    .where(
      sql`${customerRegistration.ticketHash} = ${ticketHash}
          and ${customerRegistration.consumedAt} is null
          and ${customerRegistration.verifiedAt} is not null`,
    );
  const row = rows[0];
  if (row === undefined || row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, failure: 'invalid_ticket' };
  }

  const channel: RegistrationChannel = row.channel === 'email' ? 'email' : 'phone';

  // Re-checked here, because minutes may have passed since the code was sent.
  const taken = await tx
    .select({ id: customer.id })
    .from(customer)
    .where(
      channel === 'email'
        ? sql`lower(${customer.email}) = ${row.identifier}`
        : sql`${customer.phone} = ${row.identifier}`,
    );
  if (taken.length > 0) return { ok: false, failure: channel === 'email' ? 'email_taken' : 'phone_taken' };

  const consumed = await tx
    .update(customerRegistration)
    .set({ consumedAt: new Date() })
    .where(
      sql`${customerRegistration.id} = ${row.id} and ${customerRegistration.consumedAt} is null`,
    )
    .returning({ id: customerRegistration.id });
  if (consumed.length === 0) return { ok: false, failure: 'invalid_ticket' };

  const secretHash = await hashPassword(password);
  const now = new Date();
  const values =
    channel === 'email'
      ? { email: row.identifier, phone: null, displayName: name.value, emailVerifiedAt: now, phoneVerifiedAt: null, createdAt: now, updatedAt: now }
      : { email: null, phone: row.identifier, displayName: name.value, emailVerifiedAt: null, phoneVerifiedAt: now, createdAt: now, updatedAt: now };

  let customerId: number | null = null;
  let conflict: 'email_taken' | 'phone_taken' = channel === 'email' ? 'email_taken' : 'phone_taken';
  try {
    customerId = await tx.transaction(async (inner) => {
      const inserted = await inner.insert(customer).values(values).returning({ id: customer.id });
      const id = inserted[0]?.id;
      if (id === undefined) throw new Error('customer insert returned no id');
      return id;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    conflict = uniqueViolationConstraint(error) === 'customer_phone_unique' ? 'phone_taken' : 'email_taken';
  }
  if (customerId === null) return { ok: false, failure: conflict };

  await tx.insert(customerCredential).values({
    customerId,
    kind: 'password',
    secretHash,
    hashAlgorithm: 'scrypt',
  });

  await clearThrottle(tx, CUSTOMER_REGISTER_THROTTLE, [source]);
  return { ok: true, customerId };
}

/** True for PostgreSQL `unique_violation`, raised by the identifier indexes. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if (typeof current === 'object' && 'code' in current && current.code === '23505') return true;
    current = typeof current === 'object' && 'cause' in current ? current.cause : undefined;
  }
  return false;
}

/** The name PostgreSQL gave the constraint a unique violation broke, if the driver exposes it. */
function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if (
      typeof current === 'object' &&
      'constraint' in current &&
      typeof current.constraint === 'string'
    ) {
      return current.constraint;
    }
    current = typeof current === 'object' && 'cause' in current ? current.cause : undefined;
  }
  return null;
}
