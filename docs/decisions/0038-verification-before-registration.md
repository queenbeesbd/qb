# ADR 0038 - Verification before registration

- **Status:** accepted
- **Date:** 2026-11-12
- **Amends:** ADR 0037 (SMS verification, one-identifier accounts) - the identifier is now verified
  **before** the account is created, and the code is hashed with scrypt rather than an HMAC.

## Context

ADR 0037 sent a six-digit code (phone) or a verification link (email) **after** creating the account,
and the account worked immediately. The owner's objection is the spam consequence: anyone can create
unlimited accounts by submitting a number or an address they simply typed, and the shop pays for a
message per row. Verification that happens afterwards proves nothing at the moment the row is written.

Owner direction: **the code must be entered during registration, before the account exists**, on both
channels - the same way for a number and for an email address.

## Decision

### Three steps, and the account is created last

1. **Start** (`POST /api/account/register/start`) - one identifier, phone or email. It is normalised,
   checked against existing accounts, and a pending `customer_registration` row is written with an
   **scrypt** digest of a random six-digit code. The raw code exists only in the message.
2. **Verify** (`POST /api/account/register/verify`) - the code is compared; a wrong one counts against
   the row (dead at five) and against the source. Success stores a 256-bit ticket digest and hands the
   raw ticket back in an httpOnly cookie.
3. **Finish** (`POST /api/account/register`) - the ticket is consumed by a guarded
   `UPDATE ... WHERE consumed_at IS NULL`, then the `customer` row and its password credential are
   written with `email_verified_at` or `phone_verified_at` already set.

Nothing is written to `customer` before step 3. A registration flood therefore costs one pending row
and one message per attempt, and never an account.

### The code is scrypt-hashed, not HMAC'd

ADR 0037 keyed a SHA-256 digest with `SMS_CODE_SECRET`. Six digits are a one-in-a-million space, and
scrypt with a per-row salt already makes an offline sweep impractical - while an HMAC key would have to
exist in every environment before any code (including an email-only shop's) could be issued. The
password hash is the one primitive already required, tested and documented, so codes reuse it and
`SMS_CODE_SECRET` is gone.

### State, and what is trusted

- `customer_registration` holds channel, canonical identifier, code hash, attempts, expiry, ticket
  digest and consumption time. One live row per identifier (partial unique on `consumed_at is null`),
  so asking again supersedes the previous code.
- The browser carries `qb_signup`: httpOnly, `SameSite=Lax`, holding the identifier and, after step 2,
  the ticket. **Nothing in it is trusted** - every value is re-parsed on read and the server re-reads the
  pending row. A forged cookie can only name an identifier the person could have typed.
- Throttles: the source may start five registrations an hour; one identifier may be texted three an
  hour; a code dies after five wrong guesses.

### Postal and SMS providers are now load-bearing

A channel that cannot send cannot register. When SMS is not configured, step 1 refuses a phone with
`channel_unavailable` and the form says to use an email address; the reverse holds for email. This is
deliberate: silently accepting a number nobody can receive would create an account whose recovery
channel is unreachable.

### Consequences for the surfaces ADR 0037 added

- The post-registration verification link, its page, its route, the "resend" controls on Security, and
  the phone-verification page are **removed**, not kept as a second path.
- `email_verified_at` / `phone_verified_at` are set at creation. A later change of address still clears
  `email_verified_at` (the new address has not been proved) and no flow will re-prove it - the screen
  states the gap.
- Emails now carry a code, not a link: `registrationCodeEmail` replaces the verification link template.

## Alternatives considered

- **Keep post-registration verification** - rejected: it does not stop account spam.
- **Email link before registration** - rejected by the owner: both channels take a code, and a code
  cannot be opened by a mail scanner or forwarded as a working key.
- **Verify the code and create the account in one request, holding the password from step 1** - rejected:
  it would keep a password in the cookie or a form field across the code step.
- **A signed ticket instead of a row** - rejected: the code itself needs server-side state for attempts
  and expiry, so the row exists either way; the ticket is simply its digest.
