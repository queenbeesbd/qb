import type { TranslationKey } from '@/i18n/dictionaries';

/**
 * The result of an account-security action, as the server reports it on the redirect.
 *
 * One map, so a code a route can produce is either rendered with the right tone or is not produced at
 * all: the two confirmations are `passwordChanged` and `emailConfirmSent`, and every other entry is a
 * refusal the route only sends back to the form that caused it.
 */
export const SECURITY_NOTICES: Record<string, { key: TranslationKey; error: boolean }> = {
  passwordChanged: { key: 'account.notice.passwordChanged', error: false },
  wrongPassword: { key: 'account.notice.wrongPassword', error: true },
  weakPassword: { key: 'account.notice.weakPassword', error: true },
  passwordMismatch: { key: 'account.notice.passwordMismatch', error: true },
  passwordUnavailable: { key: 'account.notice.passwordUnavailable', error: true },
  throttled: { key: 'account.notice.throttled', error: true },
  emailConfirmSent: { key: 'account.notice.emailConfirmSent', error: false },
  emailWrongPassword: { key: 'account.notice.emailWrongPassword', error: true },
  emailInvalid: { key: 'account.notice.emailInvalid', error: true },
  emailSame: { key: 'account.notice.emailSame', error: true },
  emailTaken: { key: 'account.notice.emailTaken', error: true },
  emailThrottled: { key: 'account.notice.emailThrottled', error: true },
  verificationSent: { key: 'account.notice.verificationSent', error: false },
  emailAlreadyVerified: { key: 'account.notice.emailAlreadyVerified', error: false },
  verificationUnavailable: { key: 'account.notice.verificationUnavailable', error: true },
  verificationThrottled: { key: 'account.notice.verificationThrottled', error: true },
};

export function securityNotice(code: string | null) {
  if (code === null) return undefined;
  return SECURITY_NOTICES[code];
}
