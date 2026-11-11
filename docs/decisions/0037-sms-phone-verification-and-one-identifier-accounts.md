# ADR 0037 - SMS verification, one-identifier accounts, and verification only at registration and recovery

- **Status:** accepted
- **Date:** 2026-11-12
- **Supersedes:** the "an email address is required in both modes", "no SMS provider", and
  "the account's address never moves when it is typed" rules of ADR 0036 and ADR 0030.
- **Amends:** ADR 0030 (the mailed account-security flows), ADR 0036 (phone and email identity).

## Context

ADR 0036 made a Bangladeshi mobile number a sign-in identifier but kept an email address mandatory for
every account, because the mailed recovery link was the only self-service way back in. No SMS provider
was authorized, so a number was never verified.

The owner has now connected **BulkSMSBD** (documented in `sms_api.md`) and directed:

1. SMS verification is available, and it is used in **exactly two places** - registration and account
   recovery - which is also where email verification is used.
2. A **password change** and a **change of email address** do not require verification of either
   identifier.
3. Opening an account with a phone number does **not** require an email address, and opening one with
   an email address does not require a phone number.

## Decision

### One identifier opens an account

`customer.email` becomes nullable and `customer.phone` stays nullable individually, with a
`customer_contact_required` check requiring at least one. Registration has two modes and each collects
exactly one identifier:

- **Phone** - a canonical `01[3-9]` 11-digit Bangladeshi number; no address field.
- **Email** - an address; no number field.

The identifier is the account's sign-in identifier and the channel its verification and recovery
message travels on. Sign-in still accepts either identifier an account holds.

### SMS integration

`src/server/integrations/sms.ts` is the only module that talks to the provider. It is configured from
the environment:

- `BULKSMS_API_KEY` - required.
- `BULKSMS_SENDER_ID` - required to send, and deliberately allowed to be **absent**: the provider has
  not issued one yet. A missing sender means nothing is sent rather than a guessed sender id.
- `SMS_CODE_SECRET` - optional; keys the code digest. Falls back to the API key.
- `BULKSMS_API_URL` - a development-only test seam.

A six-digit code is generated with `crypto.randomInt`, stored only as an **HMAC-SHA256 digest** keyed
with a server secret (six digits alone are reversible from a dump in seconds), expires in ten minutes,
is superseded by each new code, and is consumed after five wrong guesses. The digest reuses
`account_recovery_token`, whose `attempts` column is new.

### Verification only at registration and recovery

Registration sends a six-digit code (phone mode) or a verification link (email mode). The account is
usable immediately, exactly as the email link already was: the message settles `phone_verified_at` or
`email_verified_at`, it does not gate registration, sign-in or ordering. A provider outage never costs
a registration.

Recovery accepts either identifier. An address gets the mailed link; a number gets a six-digit code,
entered with a new password on `/account/reset`. The answer is identical in every case - registered,
unknown, throttled, provider down - and throttle-keyed on the identifier and the source.

### Changes that need no verification

- **Password change** - the current password, and nothing else.
- **Change of email address** - the current password, and the address is applied **directly**. The
  stored `email_verified_at` is cleared (it has not been proved), every session is revoked and one is
  re-minted for the browser that made the change, and the previous address receives a notice. The
  `customer_email_change` table and the mailed confirmation are removed (migration `0029`).

## Consequences

- A phone-first account has no address at all. Nothing may assume `customer.email` is present; the
  account screens state the gap and offer to add an address.
- Recovery for an unverified number still works: receiving the code is the proof. A typo'd number
  creates an account whose recovery channel nobody controls - the account page offers a resend, and the
  owner can still suspend it. This is accepted, as email links already had the same property.
- The SMS provider is an availability dependency for **recovery of phone-only accounts** and nothing
  else. `smsConfigured()` is false until both the key and the sender exist; the screens then state that
  no code can be sent rather than pretending one was.
- Masked sender ids may require Bengali message bodies (provider code 1012). The body is short ASCII
  today; if the provider rejects it, the sender id or the body is the fix, not a code change.

## Alternatives considered

- **Keep email mandatory in phone mode** - rejected by the owner; a customer without an inbox could not
  open an account.
- **Gate the account on the SMS code** - rejected: it turns a provider outage into a signup outage, and
  contradicts the existing non-gating email rule.
- **A reset link over SMS instead of a code** - rejected: long URLs in SMS are truncated, cost more, and
  are awkward to type on a phone.
- **Store the six-digit code as plain SHA-256** - rejected: one million hashes is trivial offline.
- **Keep the emailed change-of-address confirmation** - rejected by the owner: verification exists only
  at registration and recovery.
