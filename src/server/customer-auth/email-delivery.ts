/**
 * Turns an account-security outcome into a message, and hands it to the caller's scheduler.
 *
 * Separated from the service so the database work never waits on a mail provider and the routes stay
 * readable: a route commits its transaction, then schedules the message with `after()`. The raw token is
 * embedded here and **only** here - it is never stored, returned to a page or logged.
 *
 * When the deployment has no absolute origin (`APP_BASE_URL` missing in production) nothing is sent: a
 * recovery link that points at `localhost` would be worse than silence. The customer still sees the same
 * generic "we sent it if the address exists" answer, which is what that branch must look like anyway.
 */

import { publicBaseUrl, sendEmail } from '@/server/integrations/email';
import {
  emailChangeConfirmationEmail,
  emailChangedEmail,
  emailVerificationEmail,
  passwordChangedEmail,
  passwordRecoveryEmail,
} from '@/server/integrations/email-templates';
import {
  CUSTOMER_EMAIL_CHANGE_TOKEN_MS,
  CUSTOMER_EMAIL_VERIFY_TOKEN_MS,
  CUSTOMER_RESET_TOKEN_MS,
} from './constants';

/** `after()` from `next/server`, narrowed to what this module needs. */
export type TaskScheduler = (task: () => Promise<void>) => void;

/**
 * Sends one scheduled message and records a failure **without the recipient**.
 *
 * The customer's page must never learn that a provider failed - that would describe the account - but a
 * deployment where nothing is being sent must not fail silently either: the reason alone (`not_configured`,
 * `rejected`, `unreachable`) is enough to see a missing key or an unverified sender in the platform log,
 * and it names no address, no token and no message body.
 */
async function deliver(message: Parameters<typeof sendEmail>[0]): Promise<void> {
  const result = await sendEmail(message);
  if (!result.ok) console.warn(`[email] delivery failed: ${result.reason}`);
}

function absolute(path: string): string | null {
  const base = publicBaseUrl();
  return base === null ? null : `${base}${path}`;
}

function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export function schedulePasswordRecovery(
  schedule: TaskScheduler,
  delivery: { readonly to: string; readonly token: string },
): void {
  const url = absolute(`/account/reset?token=${encodeURIComponent(delivery.token)}`);
  if (url === null) return;
  const template = passwordRecoveryEmail({ resetUrl: url, expiresMinutes: minutes(CUSTOMER_RESET_TOKEN_MS) });
  schedule(async () => {
    await deliver({ ...template, to: delivery.to });
  });
}

/**
 * The registration verification link (2026-11-11).
 *
 * Sent after the account is already usable, so a mail failure never blocks a registration. The link
 * only records that the person controls the address - it changes no password and needs no session.
 */
export function scheduleEmailVerification(
  schedule: TaskScheduler,
  delivery: { readonly to: string; readonly token: string },
): void {
  const url = absolute(`/account/verify-email?token=${encodeURIComponent(delivery.token)}`);
  if (url === null) return;
  const template = emailVerificationEmail({
    verifyUrl: url,
    expiresHours: Math.round(CUSTOMER_EMAIL_VERIFY_TOKEN_MS / 3_600_000),
  });
  schedule(async () => {
    await deliver({ ...template, to: delivery.to });
  });
}

export function schedulePasswordChanged(
  schedule: TaskScheduler,
  input: { readonly to: string; readonly changedAt: Date },
): void {
  const template = passwordChangedEmail({
    changedAt: input.changedAt.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', timeStyle: 'short', dateStyle: 'medium' }),
  });
  schedule(async () => {
    await deliver({ ...template, to: input.to });
  });
}

export function scheduleEmailChangeConfirmation(
  schedule: TaskScheduler,
  input: { readonly to: string; readonly token: string },
): void {
  const url = absolute(`/account/confirm-email?token=${encodeURIComponent(input.token)}`);
  if (url === null) return;
  const template = emailChangeConfirmationEmail({
    confirmUrl: url,
    newEmail: input.to,
    expiresHours: Math.round(CUSTOMER_EMAIL_CHANGE_TOKEN_MS / 3_600_000),
  });
  schedule(async () => {
    await deliver({ ...template, to: input.to });
  });
}

export function scheduleEmailChanged(
  schedule: TaskScheduler,
  input: { readonly previousEmail: string; readonly newEmail: string; readonly changedAt: Date },
): void {
  const template = emailChangedEmail({
    newEmail: input.newEmail,
    changedAt: input.changedAt.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', timeStyle: 'short', dateStyle: 'medium' }),
  });
  schedule(async () => {
    await deliver({ ...template, to: input.previousEmail });
  });
}
