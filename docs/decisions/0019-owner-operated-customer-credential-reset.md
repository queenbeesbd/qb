# ADR 0019 - Owner-operated customer credential reset

Status: **accepted 2026-10-20**. Implements the alternative ADR 0012 recorded for the recovery gap.
**No migration:** the schema already held `account_recovery_token`.

## Context

Customer authentication is first-party (D17, ADR 0012). There is **no self-service password recovery**:
no reset link, no recovery email, and **no authorized mail or SMS provider** at all. The interface states
that gap honestly, which is correct - but until now it stated it with no way out. A customer who forgot a
password was **permanently locked out** of an account holding their order history, and the owner had no
remedy. That is the one launch blocker where a real customer can be excluded with nothing anyone can do.

ADR 0012 already named the answer: an **owner-operated reset** with one-time credentials, audit logging
and session revocation. This ADR records actually building it.

## Decision

### 1. The owner issues, the customer redeems, nothing else is possible

| Step | Who | Where |
| --- | --- | --- |
| Verify the customer | Owner, manually | Their existing phone call |
| Issue a one-time code | Owner | Customer detail screen, `POST /api/admin/customers/recovery` |
| Read the code out | Owner | During that call, from the one render that shows it |
| Enter the code and a new password | Customer | `/account/recover`, `POST /api/account/recover` |

**There is no customer-initiated request step.** No "forgot password" form collects an address, because
collecting one would imply something is sent, and nothing is. `/account/recover` is an entry form for a
code the customer was already given, which is why it is honest to link it from sign-in.

### 2. Reuse `account_recovery_token`; do not invent a table

The table was designed in Phase 10 and unused since: `customer_id`, `purpose`, `token_hash`,
`expires_at`, `used_at`, with a unique index on `token_hash` and a **partial unique index on
`(customer_id, purpose) WHERE used_at IS NULL`**. That partial index is exactly the "one live credential
per account" rule this flow needs, and it is enforced by the database rather than by remembering to check.
**Schema unchanged: 43 tables.**

### 3. A one-time credential, not a temporary password

The credential is **256 bits from `crypto.randomBytes`**, base64url (43 characters), stored **only** as a
SHA-256 digest. Two consequences on purpose:

- A temporary *password* would be a working password that must also be revoked, and it would live in a
  credential row. A token is a **claim on the right to set one**, which is a smaller thing to leak and a
  simpler thing to expire.
- The owner reads 43 characters aloud - long, but it is typed once, and the alternative is a shorter code
  that a guesser could search.

The reusable password a customer ends up with is chosen **by the customer**.

### 4. Thirty minutes, matching the owner surface

`RECOVERY_TOKEN_MS = 30 minutes`, the same bound the owner token uses. It is deliberately **not** the
hours a mail-based reset would need: the hand-off is immediate, during a call that is already happening.
It is not environment-tunable, so a deployment cannot quietly lengthen it.

### 5. Two revocations, not one

- **At issuance**, every live customer session is revoked (`admin_revoke`). A customer who cannot sign in
  does not need a session left alive, and a session minted before the owner's action is not something that
  action can vouch for. It also closes the ordinary case: a shared or stolen browser session.
- **At redemption**, the old password digest is revoked and the replaced session set is left dead, with a
  fresh session minted only **after** the new credential is committed.

### 6. A suspended account is refused without saying why

`issueCustomerRecovery` returns **one** outcome - `unavailable` - for a suspended account, a soft-deleted
account and an id that names no account. The distinction is not the owner's to learn from an error
parameter, and an endpoint that answered differently would be a probe. The refusal **is** audited
(`customer.recovery_refused`) with the owner's own reason recorded verbatim; the trail never adds the
word "suspended" itself.

### 7. Redemption is atomic, single-use and cannot be half-done

Ordered so a mistake costs nothing and a success cannot be partially applied:

1. Shape check first - a value that is not 43 base64url characters is refused **before any query**.
2. Password policy next - a weak password does **not** burn the credential, so a customer who mistypes
   does not need a second call from the owner.
3. Source throttle (10 per 15 minutes), so a guesser cannot search the space.
4. One guarded `UPDATE ... WHERE used_at IS NULL`; the loser of a concurrent race is refused as invalid.
5. New credential, old one retired, sessions revoked, audit row - **all in the same transaction**.

Every failure - expired, used, superseded, unknown, malformed - returns **one** generic code.

### 8. Delivered through the flash cookie, cleared by a route

The code is shown once via the existing httpOnly, `/admin`-scoped, 2-minute flash cookie. It never travels
in a URL, a client bundle, an RSC payload or a log.

**A defect was found and fixed while verifying this.** The cookie was documented as "read once, then
gone" but was only ever *read*: every reload of the owners screen re-displayed the token for its whole
lifetime. And a page render **cannot** clear a cookie - this version of Next.js permits `.set`/`.delete`
only in a Server Function or a Route Handler, and calling `delete` in a page threw a 500. The fix is a
route, `POST /api/admin/customers/recovery/dismiss`, which overwrites the cookie empty **carrying the same
`path`** it was set with (a bare `delete(name)` targets the default path and leaves the real cookie in
place). The chromium check that proves a reload shows nothing is what caught both halves.

### 9. Audited without ever recording a secret

| Action | Actor | Records |
| --- | --- | --- |
| `customer.credential_reset_issued` | staff | the owner, the required reason, sessions revoked. **No token, no digest, no expiry value** |
| `customer.recovery_refused` | staff | the owner, their reason. **Never the suspension state** |
| `customer.credential_reset_redeemed` | `system` | that a redemption happened, and the session revocation. **No password, no credential** |

A customer is never an audit **actor** (D23), which is why redemption is a `system` record. Refusals at the
permission layer go to the **durable denial log**, in its own transaction, so a rolled-back attempt still
leaves evidence.

## Consequences

- The last launch blocker where a customer could be permanently excluded is closed, with no provider,
  no mail, no self-service surface and no schema change.
- The owner gains one more privileged action on the screen they already use for suspension, with the same
  "required reason, stated consequence" shape.
- The flash cookie's "show once" contract is now true, on both screens that use it.

## Not authorized by this ADR

Email, SMS, OAuth or any external identity provider; customer-triggered recovery; a recovery audit trail
that records a credential; changing the customer password policy; refunds; deployment, provisioning, DNS,
credentials, or any remote database mutation.
