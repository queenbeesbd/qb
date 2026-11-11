/**
 * The four transactional emails this shop sends, and nothing else (ADR 0030).
 *
 * They are hand-written table markup with inline styles, because that is what survives Gmail, Outlook
 * and a phone mail client without a stylesheet, a web font or a script. No external image is loaded
 * (a remote pixel is a tracker and a broken image), no CSS custom property is used (mail clients strip
 * them), and every message carries the same short plain-text alternative.
 *
 * **Every value that comes from a request is escaped.** A requested address or a link is text inside
 * this markup; without escaping, an address containing `<` would become markup in somebody's inbox.
 *
 * The palette is the owner's: `#A680FF` primary, `#F6B3CC` soft pink, `#56358C` deep purple.
 */

import type { EmailMessage } from './email';

/** A template is a message without its recipient: the caller decides who receives it. */
export type EmailTemplate = Omit<EmailMessage, 'to'>;

const BRAND = "QueenBee's";
const PURPLE = '#A680FF';
const PINK = '#F6B3CC';
const DEEP = '#56358C';
const INK = '#2b2333';
const MUTED = '#6b6175';
const PAGE = '#f7f4fb';
const SURFACE = '#ffffff';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type Layout = {
  readonly preheader: string;
  readonly heading: string;
  readonly body: readonly string[];
  /** An optional single call to action: a URL and its label. */
  readonly action?: { readonly url: string; readonly label: string };
  readonly footnote?: string;
};

function layout({ preheader, heading, body, action, footnote }: Layout): string {
  const paragraphs = body
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:${INK};">${paragraph}</p>`,
    )
    .join('');

  const button =
    action === undefined
      ? ''
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
           <tr>
             <td align="center" bgcolor="${PURPLE}" style="border-radius:8px;">
               <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 26px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:20px;color:#2b2333;text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a>
             </td>
           </tr>
         </table>
         <p style="margin:0 0 16px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:${MUTED};word-break:break-all;">${escapeHtml(action.url)}</p>`;

  const note =
    footnote === undefined
      ? ''
      : `<p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:${MUTED};">${footnote}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAGE};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${SURFACE};border-radius:14px;overflow:hidden;">
            <tr>
              <td style="height:6px;background:${PURPLE};">&nbsp;</td>
            </tr>
            <tr>
              <td style="height:3px;background:${PINK};">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px;">
                <p style="margin:0 0 20px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${DEEP};">${escapeHtml(BRAND)}</p>
                <h1 style="margin:0 0 18px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:${INK};">${escapeHtml(heading)}</h1>
                ${paragraphs}
                ${button}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px 28px;">
                <div style="border-top:1px solid #ece5f5;padding-top:16px;">${note}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 22px 28px;background:#fbf8ff;">
                <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${MUTED};">
                  ${escapeHtml(BRAND)} &middot; Cash on delivery, confirmed by phone.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function text(lines: readonly (string | undefined)[]): string {
  return lines.filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n\n');
}

/** "Reset your password" - the one message that carries a working reset link. */
export function passwordRecoveryEmail(input: {
  readonly resetUrl: string;
  readonly expiresMinutes: number;
}): EmailTemplate {
  const heading = 'Reset your password';
  return {
    subject: `${heading} - ${BRAND}`,
    html: layout({
      preheader: `A password reset was requested. The link expires in ${input.expiresMinutes} minutes.`,
      heading,
      body: [
        'We received a request to reset the password for your account.',
        `Choose a new password using the button below. The link works once and expires in ${input.expiresMinutes} minutes.`,
        'If you did not ask for this, you can ignore this message - your password has not changed.',
      ],
      action: { url: input.resetUrl, label: 'Choose a new password' },
      footnote: 'For your security, never share this link with anyone.',
    }),
    text: text([
      `${heading} - ${BRAND}`,
      'We received a request to reset the password for your account.',
      `Open this link to choose a new password (expires in ${input.expiresMinutes} minutes, works once):`,
      input.resetUrl,
      'If you did not ask for this, ignore this message - your password has not changed.',
    ]),
  };
}

/** "Your password was changed" - a notice, with no link and no secret. */
export function passwordChangedEmail(input: { readonly changedAt: string }): EmailTemplate {
  const heading = 'Your password was changed';
  return {
    subject: `${heading} - ${BRAND}`,
    html: layout({
      preheader: 'Your account password was changed.',
      heading,
      body: [
        `The password for your account was changed on ${escapeHtml(input.changedAt)}.`,
        'You can sign in with the new password now. Other devices that were signed in have been signed out.',
        'If you did not make this change, contact the shop immediately.',
      ],
      footnote: 'This message was sent because the password on your account changed.',
    }),
    text: text([
      `${heading} - ${BRAND}`,
      `The password for your account was changed on ${input.changedAt}.`,
      'Other devices that were signed in have been signed out.',
      'If you did not make this change, contact the shop immediately.',
    ]),
  };
}

/** "Confirm your new email address" - sent to the **new** address, which is the proof of ownership. */
export function emailChangeConfirmationEmail(input: {
  readonly confirmUrl: string;
  readonly newEmail: string;
  readonly expiresHours: number;
}): EmailTemplate {
  const heading = 'Confirm your new email address';
  return {
    subject: `${heading} - ${BRAND}`,
    html: layout({
      preheader: `Confirm ${input.newEmail} as the address for your account.`,
      heading,
      body: [
        `A request was made to use <strong style="color:${INK};">${escapeHtml(input.newEmail)}</strong> as the email address for a ${escapeHtml(BRAND)} account.`,
        `Confirm it using the button below. The link works once and expires in ${input.expiresHours} hours.`,
        'If you did not ask for this, ignore this message - the address on the account does not change until the link is used.',
      ],
      action: { url: input.confirmUrl, label: 'Confirm this address' },
      footnote: 'For your security, never share this link with anyone.',
    }),
    text: text([
      `${heading} - ${BRAND}`,
      `A request was made to use ${input.newEmail} as the email address for a ${BRAND} account.`,
      `Confirm it here (expires in ${input.expiresHours} hours, works once):`,
      input.confirmUrl,
      'If you did not ask for this, ignore this message.',
    ]),
  };
}

/**
 * "Confirm your email address" - the registration verification link (2026-11-11).
 *
 * The account already works when this lands; the button only confirms the address, so the copy says
 * so rather than implying the account is waiting. The wording also survives a second click: the first
 * one wins and a later one is simply a dead link.
 */
export function emailVerificationEmail(input: {
  readonly verifyUrl: string;
  readonly expiresHours: number;
}): EmailTemplate {
  const heading = 'Confirm your email address';
  return {
    subject: `${heading} - ${BRAND}`,
    html: layout({
      preheader: `Confirm the email address on your ${BRAND} account.`,
      heading,
      body: [
        'Your account is ready to use. Confirming this address lets us reach you about your account, and lets you recover a forgotten password by email.',
        `Use the button below to confirm it. The link works once and expires in ${input.expiresHours} hours.`,
        'If you did not create this account, ignore this message - nothing changes without the link.',
      ],
      action: { url: input.verifyUrl, label: 'Confirm this address' },
      footnote: 'For your security, never share this link with anyone.',
    }),
    text: text([
      `${heading} - ${BRAND}`,
      'Your account is ready to use. Confirming this address lets you recover a forgotten password by email.',
      `Confirm it here (expires in ${input.expiresHours} hours, works once):`,
      input.verifyUrl,
      'If you did not create this account, ignore this message.',
    ]),
  };
}

/** "Your email address was changed" - sent to the **previous** address after the change. */
export function emailChangedEmail(input: {
  readonly newEmail: string;
  readonly changedAt: string;
}): EmailTemplate {
  const heading = 'Your email address was changed';
  return {
    subject: `${heading} - ${BRAND}`,
    html: layout({
      preheader: `The account address was changed to ${input.newEmail}.`,
      heading,
      body: [
        `The email address used to sign in to your account was changed on ${escapeHtml(input.changedAt)}.`,
        `The account now signs in with <strong style="color:${INK};">${escapeHtml(input.newEmail)}</strong>.`,
        'If you did not make this change, contact the shop immediately.',
      ],
      footnote: 'This message was sent to the previous address because the account address changed.',
    }),
    text: text([
      `${heading} - ${BRAND}`,
      `The email address used to sign in to your account was changed on ${input.changedAt}.`,
      `The account now signs in with ${input.newEmail}.`,
      'If you did not make this change, contact the shop immediately.',
    ]),
  };
}
