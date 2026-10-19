/**
 * Validation for the owner's payment-recipient configuration (Phase 16C).
 *
 * Pure functions over untrusted input: no database, no request object. The rules mirror the database's
 * own constraints exactly - `payment_recipient_method_is_mfs` (`bkash`/`nagad` only) and
 * `payment_recipient_account_format` (`^01[3-9][0-9]{8}$`) - so a refusal happens before a constraint
 * violation rather than instead of one.
 *
 * A recipient number is the account **this store's own money must arrive in**. It is validated as a
 * Bangladeshi mobile number and stored canonically, because `+880 1712-345678`, `8801712345678` and
 * `01712345678` are the same account and a stored variant that fails the CHECK would either be refused
 * by the database or, worse, displayed to a customer in a form they cannot dial.
 */

/** The methods a recipient can be configured for. COD has no recipient: the courier collects cash. */
export const RECIPIENT_METHODS = ['bkash', 'nagad'] as const;
export type RecipientMethod = (typeof RECIPIENT_METHODS)[number];

/** Bounds for the human-readable account label. Long enough to say whose account it is, short enough
 * to stay on one line in the checkout instructions and the admin table. */
export const RECIPIENT_LIMITS = { labelMin: 2, labelMax: 60 } as const;

/** The database CHECK, in one place. Mobile Financial Service numbers only; no landlines, no shortcodes. */
const MSISDN = /^01[3-9][0-9]{8}$/;

/** Control characters, which a phone number or a label must never carry into the checkout page. */
const CONTROL = /[\u0000-\u001f\u007f]/g;

export type RecipientInput = {
  readonly method: RecipientMethod;
  readonly accountNumber: string;
  readonly accountLabel: string;
};

export function isRecipientMethod(value: unknown): value is RecipientMethod {
  return typeof value === 'string' && (RECIPIENT_METHODS as readonly string[]).includes(value);
}

/**
 * Normalise a Bangladeshi mobile number to the eleven-digit local form, or refuse it.
 *
 * Accepted as the owner might type them: `01712345678`, `+8801712345678`, `8801712345678`, with spaces
 * or dashes. Anything that is not a valid BD mobile number is refused rather than guessed at.
 */
export function normalizeAccountNumber(raw: string): string | null {
  const compact = raw.replace(CONTROL, '').replace(/[\s-]/g, '');
  const local = compact.startsWith('+880')
    ? `0${compact.slice(4)}`
    : compact.startsWith('880')
      ? `0${compact.slice(3)}`
      : compact;
  return MSISDN.test(local) ? local : null;
}

/**
 * Normalise the account label: collapse whitespace, strip control characters, enforce the bounds.
 *
 * Plain text by design - the label is rendered as text in the storefront and in the admin table, and
 * the application never renders untrusted HTML.
 */
export function normalizeAccountLabel(raw: string): string | null {
  const collapsed = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (collapsed.length < RECIPIENT_LIMITS.labelMin || collapsed.length > RECIPIENT_LIMITS.labelMax) {
    return null;
  }
  return collapsed;
}

/** Parses a submitted recipient, or returns `null` when any field is missing or invalid. */
export function parseRecipientInput(input: {
  readonly method: unknown;
  readonly accountNumber: unknown;
  readonly accountLabel: unknown;
}): RecipientInput | null {
  if (!isRecipientMethod(input.method)) return null;
  const accountNumber = typeof input.accountNumber === 'string' ? normalizeAccountNumber(input.accountNumber) : null;
  const accountLabel = typeof input.accountLabel === 'string' ? normalizeAccountLabel(input.accountLabel) : null;
  if (accountNumber === null || accountLabel === null) return null;
  return { method: input.method, accountNumber, accountLabel };
}

/** Parses the editable part of an existing recipient (the method of a row never changes). */
export function parseRecipientDetails(input: {
  readonly accountNumber: unknown;
  readonly accountLabel: unknown;
}): { accountNumber: string; accountLabel: string } | null {
  const accountNumber = typeof input.accountNumber === 'string' ? normalizeAccountNumber(input.accountNumber) : null;
  const accountLabel = typeof input.accountLabel === 'string' ? normalizeAccountLabel(input.accountLabel) : null;
  if (accountNumber === null || accountLabel === null) return null;
  return { accountNumber, accountLabel };
}

/**
 * A display form of the stored number for a screen where it would otherwise be noise.
 *
 * The checkout instructions and the admin configuration screen show the **full** number on purpose -
 * a customer has to be able to send money to it, and the owner has to be able to check it. This helper
 * exists only for places that must show that a number is configured without repeating it, and is not
 * used to hide anything from the owner.
 */
export function formatMsisdn(value: string): string {
  return /^01[3-9][0-9]{8}$/.test(value) ? `${value.slice(0, 5)} ${value.slice(5)}` : value;
}
