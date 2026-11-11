/**
 * The transient sign-up cookie (ADR 0038).
 *
 * A registration now spans three requests - send a code, enter it, choose a password - so the browser
 * needs to carry which identifier the code was sent to and, after it is entered, the ticket the final
 * step presents. HttpOnly so no script reads it, `SameSite=Lax`, and cleared the moment the account
 * exists or the person starts again.
 *
 * **Nothing here is trusted.** Every value is re-parsed on read (the number or address through the
 * same validators the form uses, the ticket through the token shape, `next` through the redirect
 * allowlist), and the server still re-reads `customer_registration` by those values. A forged cookie
 * therefore selects nothing it could not have selected by typing the form.
 */

import { cookies } from 'next/headers';

import { cookiesMustBeSecure } from '../auth/session';
import { looksLikeToken } from '../auth/tokens';
import {
  CUSTOMER_REGISTRATION_TICKET_MS,
  CUSTOMER_SIGNUP_COOKIE,
} from './constants';
import { safeCustomerNext } from './paths';
import { parseEmail, parsePhone } from './validation';

export type SignupState = {
  readonly identifier: string;
  readonly channel: 'phone' | 'email';
  /** Present only after the code was entered. */
  readonly ticket: string | null;
  readonly next: string;
};

function decode(raw: string | undefined): SignupState | null {
  if (raw === undefined || raw.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  if (!('channel' in parsed) || (parsed.channel !== 'phone' && parsed.channel !== 'email')) return null;
  if (!('identifier' in parsed) || typeof parsed.identifier !== 'string') return null;

  const identifier = parsed.channel === 'email' ? parseEmail(parsed.identifier) : parsePhone(parsed.identifier);
  if (identifier === null) return null;

  const ticket = 'ticket' in parsed && typeof parsed.ticket === 'string' && looksLikeToken(parsed.ticket)
    ? parsed.ticket
    : null;

  const next = 'next' in parsed && typeof parsed.next === 'string' ? safeCustomerNext(parsed.next) : safeCustomerNext(null);

  return { identifier, channel: parsed.channel, ticket, next };
}

/** Reads the sign-up state, or `null` when it is absent or malformed. */
export async function readSignupState(): Promise<SignupState | null> {
  const store = await cookies();
  return decode(store.get(CUSTOMER_SIGNUP_COOKIE)?.value);
}

/** Writes the state. Never called from a Server Component - only from the routes that own the steps. */
export async function writeSignupState(state: SignupState): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_SIGNUP_COOKIE, Buffer.from(JSON.stringify(state), 'utf8').toString('base64url'), {
    httpOnly: true,
    secure: cookiesMustBeSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(CUSTOMER_REGISTRATION_TICKET_MS / 1000),
  });
}

/** Removes the cookie, so a completed or abandoned registration leaves nothing behind. */
export async function clearSignupState(): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_SIGNUP_COOKIE, '', {
    httpOnly: true,
    secure: cookiesMustBeSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
