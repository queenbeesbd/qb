/**
 * Turns an account-security outcome into a message, and hands it to the caller's scheduler.
 *
 * Separated from the service so the database work never waits on a provider and the routes stay
 * readable: a route commits its transaction, then schedules the message with `after()`. A raw token or
 * a six-digit code is embedded here and **only** here - it is never stored, returned to a page or
 * logged.
 *
 * Two channels exist (owner decision, 2026-11-12): a mailed link, and an SMS code. The account's
 * identifier decides which, so a phone-first account is never told to check an inbox it never gave.
 *
 * When the deployment cannot send - no absolute origin for a link, no Resend key, no BulkSMS key or
 * sender - nothing is sent and the caller's generic answer is unchanged. A failure is recorded as one
 * closed reason, never with the recipient, the token, the code or the body.
 */

import { publicBaseUrl, sendEmail } from '@/server/integrations/email';
import { sendSms } from '@/server/integrations/sms';
import {
  emailChangedEmail,
  passwordChangedEmail,
  passwordRecoveryEmail,
  registrationCodeEmail,
} from '@/server/integrations/email-templates';
import type { PasswordRecoveryDelivery } from './account-security';
import type { RegistrationDelivery } from './registration';
import { CUSTOMER_REGISTRATION_CODE_MS, CUSTOMER_RESET_TOKEN_MS, CUSTOMER_SMS_CODE_MS } from './constants';

/** `after()` from `next/server`, narrowed to what this module needs. */
export type TaskScheduler = (task: () => Promise<void>) => void;

async function deliver(message: Parameters<typeof sendEmail>[0]): Promise<void> {
  const result = await sendEmail(message);
  if (!result.ok) console.warn(`[email] delivery failed: ${result.reason}`);
}

/** Sends one SMS and records a failure **without the number, the code or the body**. */
async function deliverSms(to: string, body: string): Promise<void> {
  const result = await sendSms({ to, body });
  if (!result.ok) console.warn(`[sms] delivery failed: ${result.reason}`);
}

function absolute(path: string): string | null {
  const base = publicBaseUrl();
  return base === null ? null : `${base}${path}`;
}

function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

/** The shop's name appears in the body because the sender id is not always a readable wordmark. */
function smsCodeBody(kind: 'register' | 'reset', code: string, lifetimeMs: number): string {
  const lead =
    kind === 'register'
      ? "QueenBee's: your registration code is"
      : "QueenBee's: your password reset code is";
  return `${lead} ${code}. It expires in ${minutes(lifetimeMs)} minutes.`;
}

export function schedulePasswordRecovery(
  schedule: TaskScheduler,
  delivery: PasswordRecoveryDelivery,
): void {
  if (delivery.channel === 'sms') {
    const body = smsCodeBody('reset', delivery.code, CUSTOMER_SMS_CODE_MS);
    schedule(async () => {
      await deliverSms(delivery.to, body);
    });
    return;
  }

  const url = absolute(`/account/reset?token=${encodeURIComponent(delivery.token)}`);
  if (url === null) return;
  const template = passwordRecoveryEmail({ resetUrl: url, expiresMinutes: minutes(CUSTOMER_RESET_TOKEN_MS) });
  schedule(async () => {
    await deliver({ ...template, to: delivery.to });
  });
}

/**
 * The code sent at registration, on whichever channel the identifier uses (ADR 0038).
 *
 * Sent after the pending row commits and **before** any account exists: the account is created only
 * when this code comes back, so a provider failure means nothing was registered - the form says so and
 * the code can be asked for again.
 */
export function scheduleRegistrationCode(
  schedule: TaskScheduler,
  delivery: RegistrationDelivery,
): void {
  if (delivery.channel === 'phone') {
    const body = smsCodeBody('register', delivery.code, CUSTOMER_REGISTRATION_CODE_MS);
    schedule(async () => {
      await deliverSms(delivery.to, body);
    });
    return;
  }

  const template = registrationCodeEmail({
    code: delivery.code,
    expiresMinutes: minutes(CUSTOMER_REGISTRATION_CODE_MS),
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
