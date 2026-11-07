# ADR 0030 - Email account security through Resend

**Date:** 2026-11-08
**Status:** Implemented locally, not deployed. **Amended 2026-11-08:** the owner-issued one-time code was removed at the owner's instruction, so decision 7 below no longer applies - recovery is the mailed link only.
**Owner decision:** Send customer-facing account email through Resend, and make password recovery
self-service, without introducing email verification.

## Context

Customer authentication is first-party (ADR 0012): email and password, scrypt hashing, opaque session
tokens, separate customer and staff tables, and **no mail provider**. Because no provider was
authorized, recovery was owner-operated (ADR 0019): the owner verifies a customer by phone and reads
out a one-time code. Registration never required email verification and no verification mail was ever
sent - that part of the requirement already held and was left alone.

The owner has now authorized **Resend** for account security email, which changes the recovery answer
but not the authentication model: the same sessions, the same hashing, the same account tables.

## Decisions

### 1. Email verification is not introduced, and registration is untouched

An account is usable the moment it is created, and registration still signs the customer in. No
verification screen, banner, redirect or message exists, and no verification mail is sent on sign-up.
Mail is sent only when the customer deliberately performs an account-security action.

### 2. Four messages, and only four

A password-recovery link, a password-changed notice, a new-address confirmation, and an
address-changed notice to the previous address. They are hand-written table HTML with inline styles in
`src/server/integrations/email-templates.ts`, using the owner's palette (`#A680FF`, `#F6B3CC`,
`#56358C`), a bounded 600px frame, no remote images and a plain-text alternative. Every value that
came from a request is escaped. No marketing, order, analytics or verification message exists.

### 3. Tokens are random, hashed, single-use and short-lived

`createOpaqueToken()` (256 bits from `crypto.randomBytes`), stored only as a SHA-256 digest. A recovery
link lives **one hour**; an address confirmation lives **one day**. Consuming either is a guarded
`UPDATE ... WHERE used_at IS NULL`, so a replay loses the race. A dead token - unknown, expired, used,
superseded - produces one indistinguishable refusal.

### 4. Recovery never reveals whether an address has an account

`POST /api/account/recovery` answers with the same redirect and the same sentence for a registered
address, a suspended account, an unknown address, a malformed one, a throttled caller and a mail
provider that is down. Every request counts against a throttle keyed on both the address and the
source (five an hour), so probing is bounded like password guessing. Requests are written as a
`system` audit record only when the password actually changes (D23: a customer is never an audit
actor).

### 5. A password change ends every session, and the current browser gets a new one

Both the mailed reset and the account-page change revoke every live customer session. The account-page
route immediately mints a fresh session for the browser that made the change, so the customer is not
thrown out of the tab they used while every other device is signed out. The mailed reset mints no
session: the customer signs in with the new password, which proves it works.

### 6. Changing the address is a two-step, confirmed operation

The account page asks for the **current password** and the new address, checks the address is not
already taken, and stores a pending request (`customer_email_change`) with a hashed token. The account
keeps its current address until the link sent **to the new address** is used; the confirmation is a
button on a page, so a mail-client prefetch cannot consume it. On confirmation the address changes, the
`email_verified_at` fact is recorded, **every session is revoked** (`email_change`) because the login
identifier moved, and the previous address is mailed a notice. Opening the link alone changes nothing.

### 7. The one-time code stays

ADR 0019's owner-issued code still exists for a customer who cannot reach the inbox, and is offered
beside the new flow. Both paths share the `password_reset` purpose, so one live reset token exists per
account and issuing either supersedes the other.

### 8. Administration is untouched

No admin route, session, password or permission was modified. The owner still signs in with email and
password and no verification step, and a customer cookie cannot reach `/admin`.

### 9. Configuration lives in the environment

`RESEND_API_KEY`, `EMAIL_FROM` and `APP_BASE_URL` are server-side values. The key is never in a
bundle, a form, a log or a record. `APP_BASE_URL` is required in production: without it no link is
mailed, because a recovery link pointing at `localhost` is worse than none. `RESEND_API_BASE_URL` is a
**development-only** test seam, ignored unless the process declares a development environment.

## Consequences

- New table `customer_email_change` (migration `0018`), plus one new `customer_session.revoked_reason`
  value (`email_change`). Schema **52 tables**. All additive; no existing row is rewritten.
- New pages `/account/forgot-password`, `/account/reset`, `/account/confirm-email`; new routes
  `/api/account/recovery`, `/api/account/reset`, `/api/account/confirm-email`,
  `/api/account/password`, `/api/account/email`; account-page forms for the password and the address.
- Four new `system` audit actions: `customer.password_reset_completed`, `customer.password_changed`,
  `customer.email_change_requested`, `customer.email_changed`. They carry the customer id and a
  boolean, never an address, a password or a digest.
- Deliberately not built: email verification, a registration confirmation message, SMS, OAuth, a
  customer-facing "resend verification" control, an owner screen over these messages, or a change of
  display name.
