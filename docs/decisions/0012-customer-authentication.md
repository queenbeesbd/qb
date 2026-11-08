# ADR 0012 - First-party customer authentication (D17)

- Status: accepted (owner-decided, 2026-10-15)
- Extends: ADR 0008 (single-store product model), ADR 0009 (owner accounts, bans, log separation),
  ADR 0011 (local catalog authority and the storefront cutover).
- Settles: **D17** - customer authentication provider - in the register in
  `docs/platform-architecture.md`.
- Related: `docs/data-model.md` sections 4 and 15, `docs/security.md`, `docs/payment-workflow.md`,
  `docs/implementation-plan.md` (Phase 15).

## Context

**D12 is approved: ordering requires a customer account.** Guests may browse and build a cart, must log
in or register before placing an order, and the cart is preserved with the customer returned to
checkout. Guest checkout must not be silently reintroduced, and no anonymous order-lookup surface is
acceptable.

Phase 12 implemented authentication for the **owner/qbpanel** interface only, and ADR 0009 section 5
records that customer registration, login, recovery, checkout and payment remain governed by **D17** and
are not implied by that work. Phase 10 designed the customer identity, credential, session, recovery
and throttle tables (`docs/data-model.md` 4.1-4.5) and the authentication architecture (section 15),
but section 15.4 deliberately left the provider choice **pending owner approval**: no dependency was
added, no provider configured and no credential created.

D17 therefore blocks the first line of Phase 15 code, because checkout cannot be built for an account
that does not exist.

## Decision

**First-party customer authentication, built with the security patterns this project already uses for
the owner, and settled as D17.**

### 1. Authentication model

- **Email and password** registration and sign-in.
- **Password hashing with scrypt**; a plaintext password is never stored, logged, or returned.
- **Opaque 256-bit session tokens**, with **only the SHA-256 hash stored** in the database. The raw
  token exists only in the client cookie.
- **HttpOnly, SameSite=Lax cookies**, with **idle and absolute session expiry** enforced server-side.
- **Account- and source-keyed throttling** on authentication (and the other writing endpoints).
- **Customer-scoped CSRF protection**: a per-session token verified server-side plus a same-origin
  check on state-changing routes. `SameSite=Lax` is a mitigation, not the whole control.
- **Strict separation between customer permissions and owner/qbpanel permissions.** Customer identity,
  credentials, sessions and authorization are distinct from the owner/qbpanel ones, and the two session
  stores stay separate so no customer-scoped query can reach an owner row.

**No external authentication provider and no new authentication dependency** is introduced. A hosted
provider or third-party library may only be considered if an identified technical constraint requires
it, and then only under a separate owner approval - not as an implementation default.

### 2. Registration identity

**Email is the sole registration and sign-in identifier at launch.** A **phone number remains optional
contact information** and is **not** an authentication credential.

**Email verification is deferred.** No Resend, no other mail provider, no Google sign-in, no OAuth, no
SMS authentication and no other external identity or delivery integration is authorized. This matches
the owner-authentication position in ADR 0009 section 4 (D22), which already deferred Resend email
verification and Google sign-in until the client confirms them.

### 3. Password recovery

**There is no self-service password recovery at launch.**

- No password-reset endpoint, email workflow or other unapproved recovery mechanism is built.
- This limitation is documented in the customer-facing and security documentation, so a customer is not
  offered a recovery path that does not exist (honesty rules, `AGENTS.md`).
- If operational customer password resets are implemented, they must use a **separately controlled,
  owner-operated process**: explicit authorization, **one-time credentials**, **audit logging**, and
  **session revocation**. Administrative reset functionality must not be exposed to customers and no
  insecure shortcut may be created.

This follows directly from the absence of an authorized mail provider: recovery cannot depend on email
delivery, so the only approved path is owner-operated and out of band, exactly as Phase 12 does for the
owner credential.

### 4. Customer bans and session revocation (D20)

A **customer ban** - the `active -> suspended` transition taken after a **confirmed** fake order
(D20, ADR 0009) - must prevent new order creation and invalidate the customer's active sessions.

- **Enforced server-side inside the order-creation transaction**, not by hiding a UI control.
- **Existing sessions are invalidated** at the moment of the ban, and no new session is issued.
- **Existing orders and payment records are preserved.** A ban must **not** automatically cancel an
  order or initiate a refund, and it touches no payment, refund or reservation state.

The ban is distinct from the customer review flag, which blocks nothing.

### 5. Owner and customer credentials stay separate

Owner/qbpanel authentication (ADR 0009, D22) and customer authentication are **separate stories with the
same shape**. They share the established implementation patterns - scrypt, opaque hashed session tokens,
httpOnly cookies, throttling, per-actor authorization - but they do not share credentials, sessions,
permission checks or audit actor types. "Customer" is never an owner/qbpanel actor, and an owner account
is never a customer account.

## Consequences

- **D17 is settled.** The customer-authentication provider is first-party sessions; no external
  provider, mail service or OAuth client is selected, and none may be added by an engineering default.
- **Phase 15 is unblocked on authentication.** Checkout may be built against this model, subject to the
  ordering-gate decision recorded in **ADR 0013** and to the ordinary implementation authorization -
  this ADR authorizes design and documentation only.
- **Self-service recovery does not exist and is stated, not hidden.** A customer who loses access has no
  automated path back; the documented route is an owner-operated reset with one-time credentials,
  audit logging and session revocation. This is a real usability cost accepted in exchange for not
  putting an unauthorized mail provider on the login path.
- **The designed tables map onto the decision, with two unused purposes.** `customer_credential` and
  `customer_session` are used as designed (`docs/data-model.md` 4.2, 4.3). `account_recovery_token`'s
  `password_reset` and `email_verify` purposes are **not** used at launch, and `auth_throttle`
  (`login`, `register`) is used as designed. No schema change is required by this ADR.
- **Customer PII enters scope for the first time.** Retention, safe logging and the owner-operated reset
  process become implementation requirements; no customer PII, payment data or session token may appear
  in fixtures, browser storage, logs, docs or analytics.
- **No dependency, credential, provider or resource is created by recording this decision.**

## Alternatives considered

- **A hosted identity provider (Clerk, Auth0, WorkOS).** Rejected: a recurring per-user cost against the
  approved near-zero cost policy, deliberate lock-in with identities held by the vendor, and a third
  party placed on the login path of a storefront whose backend is otherwise entirely first-party.
- **Auth.js (NextAuth) with a credentials provider and database sessions.** Rejected: it brings
  library-shaped adapter tables alongside the tables already designed and implemented, and moving off it
  later means migrating sessions and credentials. The first-party pattern is already implemented and
  tested for owner authentication, so it is the lower-risk choice here.
- **Email verification and self-service password reset via Resend or another mail provider.** Rejected
  for launch: no mail provider is authorized, and provider selection is an owner cost decision. Both
  remain deferred, not designed.
- **Google sign-in / OAuth / SMS authentication.** Rejected: deferred with the other external identity
  integrations and not authorized.

## Open questions

- **If and when a mail provider is authorized**, email verification and self-service password recovery
  become possible; neither is designed here and both would need their own approval.
- **The exact owner-operated reset procedure** (who may issue a one-time credential, under what
  authorization, with what audit record) is specified at implementation, not by this ADR.
- **Customer session lifetimes.** `docs/data-model.md` 15.2 proposes a 30-day absolute ceiling with a
  7-day idle limit; the owner surface uses 8 hours absolute with a 30-minute idle limit. The customer
  values must be confirmed at implementation and are not fixed here.

## What this does not authorize

No new dependency, no mail, OAuth, SMS or hosted identity provider, no provisioning, deployment, DNS
change, credential or bucket, no password-reset endpoint, no customer-facing authentication code, and no
change to any approved payment, refund, cancellation, order-policy or availability rule. **Nothing is
implemented by this ADR.**
