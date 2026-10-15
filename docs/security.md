# Security and threat model

Status: Phase 1 frontend demonstration complete; **Phase 10 architecture designed** (`docs/data-model.md`), including the authorization matrix and the threat model below. **Phase 14** moved the storefront's catalog source from the local fixture to a **server-side read of the database** (`docs/decisions/0011-local-catalog-authority-and-storefront-cutover.md`); the storefront still makes no outbound runtime request and still holds no authority over price, stock, payment or orders. No production security control has been verified, because no production system exists. Every control in this document is a **requirement**, not an implemented control. No penetration test, backend probe, live order or payment test was performed. The owner has approved an **independent-platform direction** (`docs/decisions/0004-independent-platform-direction.md`), so QueenBee's will own the trusted server boundary; the requirements for it are in the section below.

## What the demo actually does

- Renders the storefront from a **server-side read of the database catalog**. Storefront routes are dynamic, so a build performs no database access and no page is prerendered from a data snapshot.
- Performs no outbound network requests at runtime: no vendor API, no payment provider, no analytics, no third-party scripts, and no remote fonts (Inter and Noto Sans Bengali are self-hosted at build time).
- Persists only `queenbees.cart.v1` (product-id and quantity pairs) and `queenbees.locale.v1` (`bn` or `en`). No customer, payment or session data.
- Renders the checkout route with zero forms, zero inputs, zero submit buttons and zero external hosts, verified in the browser suite.

## Implemented frontend controls

| Concern | Control | How it was checked |
| --- | --- | --- |
| Secret exposure | No `NEXT_PUBLIC_*` variables, no credentials in source or docs, no `process.env` reference in application code; `poweredByHeader` disabled. **Corrected 2026-10-11:** an untracked, gitignored `.env` file *does* exist in the working tree (approximately 89 bytes) holding a plaintext credential for a third-party merchant account. It is not read by any code and has never been committed, but the earlier statement that no env file exists was wrong. See "Credential exposure found in the working tree" below | Source inspection; `git check-ignore`; tracked-file scan |
| Untrusted storage | Cart JSON parsed defensively, filtered against known product ids, de-duplicated, quantities clamped to 1..20, 40-line cap; corrupt JSON discarded. Locale values validated against `bn`/`en` | Browser check 15 |
| Untrusted URL input | `parseCatalogQuery` truncates lengths, validates the category against the known category slugs supplied by the server and falls back on an unknown sort value | Browser checks 4, 6, 7 |
| Untrusted quantity input | Clamped in the stepper before reaching state, and again in the store on write and read | Browser check 11 (999 to 20, -4 to 1) |
| XSS | No `dangerouslySetInnerHTML` anywhere; all product copy is plain text rendered through JSX escaping; no untrusted SVG or HTML is injected | Source inspection |
| Unsafe URLs | No user-controlled value builds a URL. The catalog projection carries no external source URL, so a product page emits no outbound link at all | Source inspection; browser assertion that a product page has no external link |
| Third-party code | Zero runtime third-party scripts. Only two Google fonts, self-hosted at build time by `next/font` | Browser check 16 (external host list empty) |
| Accidental data collection | No form inputs outside the search field; checkout has no fields; no cookies are set | Browser checks 14, 16 |
| Demo confusion | Persistent demo notice on every route, inert checkout with an explicit banner, and `robots: noindex, nofollow` | Browser checks 14, 16, 23 |
| Dependency hygiene | Pinned exact versions, committed lockfile, minimal dependency set | `package.json` and lockfile |
| Console health | No console errors or uncaught exceptions across all 65 browser checks | Browser check 24 |

## Trust boundaries

```text
UNTRUSTED
  browser input, URL/searchParams, localStorage, product copy, future API payloads
        |
        v
THIS DEMO (no authority)
  database catalog -> server-side projection -> props -> rendered output
  no outbound request, no order path, no payment path
        |
        v
TRUSTED - NOT BUILT YET
  trusted server -> inventory and orders -> payment provider
```

The frontend is never authoritative for price, discount, stock, permissions, totals, payment status or orders. Every value shown is a display projection of the catalog the server reads from the database; the browser never supplies a price, a discount, an availability state or a total.

## Threats that remain open (production phase)

| Threat | Required control before release |
| --- | --- |
| Client price, discount or total tampering | Server resolves ids and recomputes price, discount eligibility, shipping and total; browser totals never accepted |
| Cart and order item tampering | Typed allowlist, bounded integer quantities, valid SKU/option relations, parameterized persistence |
| Inventory races and oversell | Atomic supported reservation or stock check with expiry; bundle components validated individually |
| Authentication and session compromise | Supported server auth, secure session lifecycle, cookie flags, no sensitive tokens in persistent storage |
| Authorization and account data leakage | Server enforces role and object ownership on every private request; guest order access scoped securely |
| Public/private API confusion | Explicit read-only public contract; administrative credentials stay server-side; least-privilege scopes |
| CSRF | If ambient cookies authenticate mutations, use supported CSRF tokens plus origin checks; no state-changing GET |
| Injection | Parameterized queries and validated input at the trusted boundary |
| Abuse and resource exhaustion | Rate limits on login, search, order and payment operations; quotas, timeouts and input-size limits |
| PII and privacy | Data minimisation, access control, retention and deletion policy, redacted logs, protected backups |
| Forged or replayed payment notifications | Provider signature verification, replay and idempotency control, amount/currency/order matching, reconciliation |
| Duplicate orders | Server idempotency scoped to transaction and user; stable outcome retrieval; UI button disabling is only secondary |
| Error and log disclosure | Generic user-safe messages with a request id; private diagnostic logs; rollback and tested restore |

## Backend audit findings (Phase 7, evidence-based)

A read-only audit of the Zatiq Easy merchant dashboard was performed under explicit owner authorization. Full detail: `docs/backend-capability-audit.md`. No customer record was opened, no PII captured, no write performed. These findings are limited to what was observed.

### Controls confirmed in this audit

| Concern | Finding |
| --- | --- |
| Credential handling | Credentials were read from `.env` inside the local process only; never printed, logged, screenshotted or committed. `.env` is gitignored and untracked |
| No secret in tracked files | Verified: no `.env` reference, host name or credential in `README.md`, `AGENTS.md`, `docs/`, `src/` or `scripts/` |
| No client credential | No `process.env` usage exists in application code; no outbound API client exists in `src/` |
| Transport | Dashboard served over TLS (`strict-transport-security: max-age=63072000`) |

### Risks recorded (no live probing performed)

1. **No supported integration surface (Critical).** The only interface found is the dashboard's private API on `easybill.zatiq.tech`, used with the merchant's own session. Building on it would create unowned coupling to an undocumented, unversioned, third-party endpoint.
2. **Tenant identity unconfirmed (Critical).** The audited account shows an empty catalog; the live storefront publishes 24 products under shop id `42239`. If the credential belongs to a different tenant, every conclusion drawn from it is invalid.
3. **Credentials must never reach the client (Critical).** Merchant-tenant credentials in a shopper-facing bundle would be a severe compromise. Any integration must keep them server-side only and use a least-privilege identity.
4. **Asynchronous payment states (High).** Order statuses `Payment OnProcess` and `Payment Failed` imply asynchronous settlement. Payment state must be reconciled from the platform, never inferred by the storefront.
5. **Unknown rate limits and error semantics (Medium).** Unknown limits on a shared multi-tenant platform require conservative caching, backoff and a circuit breaker from the first request.
6. **Third-party tracking on the dashboard (Medium, informational).** GTM, Google Analytics, Google Ads/DoubleClick, Meta Pixel and Microsoft Clarity load on the merchant dashboard. This is the platform's own behaviour and does not affect the storefront, which currently loads **zero** third-party scripts - a property to preserve.
7. **CORS/cookie constraints unverified (Medium).** The dashboard calls a separate origin with preflight; whether an out-of-band server client is permitted, and under what auth model, is unverified.

### Explicitly not established

This audit proves nothing about authentication strength, authorization correctness, payment security, data retention or platform resilience. A read-only UI audit cannot establish production security, and no penetration test, fuzzing or load test was performed.

## Independent platform security requirements

Direction approved in `docs/decisions/0004-independent-platform-direction.md`; architecture in `docs/platform-architecture.md`. These are requirements for controls that **do not exist yet**. Nothing below is implemented, and none of it may be claimed as done until it is implemented and verified.

### Authority and validation

- The server is authoritative for price, discount, stock, totals, permissions and payment status. The browser submits **intent**, never authoritative values.
- Every price and total is recomputed server-side from the database at cart read and at order creation. A price submitted by the client is discarded, not validated-and-trusted.
- Input is validated at the server boundary against an explicit schema. Unknown fields are rejected rather than ignored.
- Output is encoded by the rendering layer. Product and customer copy remains plain text; no untrusted HTML is rendered, and no `dangerouslySetInnerHTML` is introduced.

### Authorization

- Admin operations are authorized **server-side per request** against the staff member's role. Hiding a control in the UI is not access control.
- Customer data access is scoped to what the role requires. There is no "read everything" default for staff.
- Object-level checks prevent one customer's order or profile being reachable by another.

### Sessions and credentials

- Staff sessions use httpOnly, `Secure`, `SameSite` cookies with server-side session records and a bounded lifetime.
- Passwords are hashed with a current adaptive algorithm. Account recovery uses single-use, expiring tokens.
- Secrets live in server-side environment variables only. They never appear in `NEXT_PUBLIC_*`, the client bundle, logs, documentation or committed files.
- A documented rotation procedure exists for every provider secret.

### CSRF, abuse and resource limits

- State-changing requests are protected against CSRF where ambient cookies authenticate them. No state-changing GET.
- Rate limits apply to login, checkout, order creation, promotion validation and any endpoint that writes.
- Request size and timeout limits are set, and failures are handled without leaking internals.

### Payments and orders

- Payment status is set **only** from a signature-verified provider callback or an explicit server-side verification call. A client-declared success is never sufficient.
- Webhook handlers verify authenticity, are idempotent, and match amount, currency and order reference before any state change.
- Order creation is idempotent via a client-supplied key; a repeat submission returns the original order.
- Replayed or duplicated payment notifications cannot produce a second order or a second stock decrement.
- Uncertain outcomes (timeout, provider error, delayed callback) are reconciled rather than resolved by assumption.

### Inventory consistency

- Stock changes occur inside the same transaction as the order, using a guarded update that fails on insufficient stock. No read-then-write.
- Every stock change is recorded in an append-only movement ledger, so the current quantity is always explainable.
- Cancellations and refunds restore stock through the same ledger.

### Auditability and logging

- Sensitive administrative changes - price, stock, order status, permissions, settings - are written to an audit log with actor, timestamp and before/after values.
- Order status transitions are recorded as append-only events.
- Logs are structured, carry request ids, and **exclude** credentials, session tokens, full payment payloads and unnecessary personal data.
- User-facing errors are generic and carry a request id; diagnostic detail stays in private logs.

### Data protection

- Collect the minimum personal data required to fulfil an order. Do not collect what is not needed.
- Define and implement a retention policy, and a deletion path for customer data requests.
- Backups are encrypted and access-controlled, and a **tested restore** is a release requirement. An untested backup is not a backup.

### Supply chain and deployment

- Dependencies are reviewed for advisories; material risks are resolved or explicitly accepted with a documented reason.
- Build and deploy pipelines do not expose secrets, and production configuration is separate from development.
- TLS is enforced with appropriate security headers.
- No customer PII, payment data or session token appears in fixtures, browser storage, logs, documentation or analytics.

### Single store, not multi-tenancy

**QueenBee's serves one store for one owner (ADR 0008).** There are no third-party merchants and no
other businesses creating stores, so multi-tenancy, tenant isolation and per-tenant scoping are **not
requirements and must not be pre-built** - there is nothing to isolate.

Consequently: no `store_id`, `tenant_id` or `merchant_id` column exists, no store registry exists, and
no query is tenant-scoped. Adding such an abstraction "for future flexibility" would create a permanent
tax on every query and schema change to satisfy a requirement nobody has.

If selling across multiple independent stores is ever wanted, it is a **new product decision**
requiring its own ADR and a schema review. Tenant isolation would then have to be enforced at the
data-access layer with tests that attempt cross-tenant access - not by convention.

### The administrative surface as implemented (Phase 13)

**Owner-only, with no role-management surface.** Every administrative route and mutation is protected server-side
by `requireAdminPage`, `guardMutation` or `guardRead`, and every service function **re-checks the permission**
before acting - so a caller that forgets the route check fails closed. The Phase 12 staff and role screen, its
navigation entry and its four API routes were **removed** in Phase 13 (D10, ADR 0009); the retired paths return
**404**, which `npm run verify:admin` asserts rather than assumes. No replacement role UI was introduced.

**Owner accounts are managed by a minimal surface, and the role is never an input.** `createOwnerAccount` hard-codes
the owner role, so "create an account" cannot be turned into "create a privileged account". A new account has **no
credential** until an owner hands over a single-use token, so account creation alone grants nobody access. An owner
cannot disable their own account, and the **last active owner cannot be disabled** - checked under `FOR UPDATE` on the
owner rows, so two concurrent attempts cannot both pass the check (regression-tested).

**Catalog mutations require `catalog.write`, and the refusal is durable.** A denied mutation leaves protected state
unchanged and is recorded through the separate denial transaction, attributed to the **acting session** rather than to
any id the request carried. Asserted end to end, including the database effect of the refusal.

**Availability is a state the server owns.** Only `in_stock` and `out_of_stock` are accepted; anything else is refused
rather than coerced, so a client cannot invent a third state or pass a quantity where a state belongs. The orderability
decision reads the database only.

**Imagery cannot reach the filesystem from a request.** A key must match a strict format **and** appear in the
inventory derived by listing `public/catalog`; metadata is read from the file bytes. There is no upload path, so there
is no upload attack surface.

### Open findings (not fixed)

**F9 - the same-origin check prefers `x-forwarded-host` over `host`.** `src/server/auth/request-guards.ts` reads
`x-forwarded-host` first. A **non-browser** client can set both `Origin` and `X-Forwarded-Host` to a matching forged
value and pass the same-origin check. It is **not browser-exploitable** - a browser cannot set that header - and
`SameSite=Lax` plus the session-bound CSRF token are independent controls. On the unauthenticated sign-in route,
however, the origin check is the only CSRF control. **Residual risk: medium for non-browser clients, low for browsers.**
Not fixed in Phase 13 because a correct fix needs a trusted-proxy configuration decision, not a code tweak.

**F10 - password-hash robustness on a corrupt credential row.** A stored derived key that decodes to zero bytes passes
`keylen 0` to `scrypt` (which throws, yielding a 500 rather than `false`), and the hash parser accepts an arbitrarily
large power-of-two `N`, scaling memory allocation with the stored value. Both require a **corrupt or hostile
credential row**, which the schema does not produce. **Residual risk: low.** Not fixed in Phase 13 because it is
unrelated to catalog work and was not demonstrated to be reachable.

## Manual payment verification - threat model and required controls

Approved launch model (D7): **manual bKash**, **manual Nagad** and **Cash on Delivery**, with human verification for the two prepaid methods (`docs/payment-workflow.md`). **No automated gateway is authorized.** Ordering requires an account (D12).

**Every control below is a requirement. None is implemented.** The workflow does not exist yet, and none of this may be reported as done until it is built and verified.

### The governing rule

**A customer-submitted transaction id, screenshot, sender number or confirmation message is never proof that payment succeeded.** Payment is marked `verified` only after an authorized person independently confirms receipt through the merchant account. No code path derives payment success from customer-supplied data.

### Controls

| # | Threat | Required control |
| --- | --- | --- |
| P1 | Fabricated transaction reference | No auto-verification. Status changes only via an authorized administrative action after independent confirmation |
| P2 | One reference reused across orders | Duplicate-reference detection flags all affected orders for review before any decision. Not a hard block, because legitimate mistyping occurs |
| P3 | Forged or replayed request sets payment status | Payment status is server-side only; the storefront has no writable path to `verified`, `rejected` or `falsely_claimed`; refund state is a **separate field**, not part of the payment enum; transitions are state-guarded and idempotent |
| P4 | Unauthorized or insider misuse | Permissioned action; server-side authorization per request; actor identity, timestamp, decision and reason recorded in an append-only audit log |
| P5 | Order marked paid without money received | Periodic reconciliation of verified payments against the merchant statement, with a documented discrepancy procedure |
| P6 | Sensitive financial data over-retained or leaked | Minimisation; defined retention; logs exclude payment references, sender numbers and customer contact details |
| P7 | Uploaded screenshot as an attack vector | **Not applicable by default:** screenshots are not required, requested or stored (D8). If the decision is ever reversed, the controls in P11 apply |
| P8 | Submission endpoint abuse or enumeration | Rate limiting per order and per source; bounded input length and character set |
| P9 | Credential or OTP capture | PINs, OTPs, passwords and MFS credentials are **never** requested, collected, logged or stored. No customer MFS credentials are ever handled |
| P10 | Unqualified staff verifying payments | Role-based permission; only named roles may verify. Role list is an owner decision |
| P11 | Uploaded file used as an attack vector (only if screenshots are ever enabled) | Private bucket only; server-side content-type and size validation; the file decoded as an image before acceptance; **server-generated object key, never the uploaded filename**; readable only by permitted roles; deleted on a defined schedule |
| P12 | One customer reading another's order | Orders are reachable **only through the owning customer's authenticated session**. Authorization is enforced server-side per request; a request for another customer's order is refused, not merely hidden |
| P15 | Account takeover or credential stuffing on customer login | Server-side sessions in httpOnly, `Secure`, `SameSite` cookies with bounded lifetime; adaptive password hashing; rate limiting on login and recovery; generic failure messages that do not reveal whether an account exists |
| P16 | Account recovery abuse | Single-use, expiring recovery tokens delivered only to the verified contact channel; token invalidation on use; rate limited |
| P17 | Cart lost when a guest is required to authenticate | The cart is preserved across the authentication step and the customer is returned to checkout. Session and cart state are reconciled server-side after login, not left to the client |
| P18 | COD order treated as paid, or cash not reconciled | COD is a distinct method with no verification step; cash collected is recorded against the order and reconciled against courier settlement. COD orders must never enter the prepaid verification queue |
| P13 | Unauthorized refund, or a refund displayed as complete when it is not | Refunds require an explicit permission, are possible only against a `verified` payment, and are recorded append-only with actor, timestamp, amount and reason. `refund_status` is a **separate field** with `requested` / `processing` / `completed` / `failed` - **a refund is never shown as completed because it was requested or approved** |
| P19 | A customer wrongly labelled fraudulent | `rejected` (receipt not confirmed) and `falsely_claimed` (an admin **confirmed** a false claim) are **different states**. The customer review flag is **admin-set only**, never system-derived, never triggered by a delayed transaction or a mistyped reference, and always carries an audited reason and actor. An ordinary unpaid order never sets it |
| P20 | COD dispatched without approval, or cash treated as collected when it was not | COD requires an explicit owner approval before dispatch; `cod_collected` and `cod_failed` are distinct states; cash is reconciled against courier settlement, not assumed |
| P14 | Expiry releasing stock for an order the customer already paid for | Automatic release applies **only** to `awaiting_payment`. Orders in `awaiting_verification` are held until an administrative decision. Release is state-guarded so it cannot happen twice |

### Separation of concerns

Order status and payment status are **distinct enums**. Conflating them causes orders to appear paid when they are not, or fulfilled when payment was rejected. The storefront may reach `awaiting_verification`; only an administrative action reaches `verified`, `rejected` or `falsely_claimed`. **Refund state is not part of the payment enum at all** - it is a separate `refund_status` field (`none` / `requested` / `processing` / `completed` / `failed`), and a payment is never described as refunded because a refund was requested. See `docs/data-model.md` section 11.5.

### Storage and lookup controls

Product imagery is public-read by design; anything a customer uploads is not. The two must never share a bucket or an access rule, and the storefront's public image path must never be able to resolve a private object.

**Ordering requires an account (D12, approved).** Guest checkout is not offered, so there is no anonymous order-lookup surface: a customer's orders are reached only through their own authenticated session. This makes **customer authentication a launch security requirement**, not an optional later addition, and it removes the anonymous-enumeration risk that a reference-based lookup would have carried.

### Automated gateway - not authorized

SSLCommerz, automated bKash/Nagad APIs, payment webhooks, automatic confirmation and automated refunds are **not authorized**. When a gateway is later approved, the additional controls required are signature verification, webhook idempotency keyed on the provider event id, amount/currency/reference matching, replay protection, and settlement reconciliation. The manual workflow is designed to be complete and secure without them.

## Credential exposure found in the working tree

**Reported to the owner, not remediated by engineering.** During the Phase 10 inspection an untracked,
gitignored `.env` file was found in the working tree containing a plaintext credential for the
third-party merchant account (`merchant.zatiqeasy.com`) whose integration direction was withdrawn in
Phase 8. The value is **not reproduced anywhere in this repository**, and was not read into any output
by this phase beyond confirming the file exists and what kind of credential it holds.

| Fact | Detail |
| --- | --- |
| Path | `.env` in the repository root |
| Tracked? | No - untracked and gitignored (`.gitignore` lines 10-11, with `!.env.example` as the intended exception) |
| Read by code? | **No.** There is no `process.env` reference in `src/`, `scripts/` or `next.config.ts` |
| Committed to history? | Not by this repository's commits. The file is not in the index |
| Content | A plaintext third-party merchant account credential, plus a site URL |

**Why this matters even though no code reads it.** A plaintext credential in a working tree is exposed to
anything with filesystem access, to editor and agent tooling, to backup and sync processes, and to
accidental inclusion in a future commit or archive. The vendor relationship is also withdrawn, so the
credential has no legitimate use in this project.

**Recommendation to the owner (owner action, not engineering action).**

1. **Rotate the credential at the provider** if the account is still active, on the assumption that a
   plaintext secret on disk should be treated as compromised.
2. **Remove the file from future use** once the owner confirms nothing depends on it. It is currently
   unused by application code, so removal carries no functional risk - but the owner may still need the
   account for reference, so the decision is theirs.
3. **Do not commit it, and do not add a replacement.** Any future secret belongs in server-side
   environment variables configured per deployment target.

**Not done by this phase:** the file was not read into output, not modified, not moved, not deleted and
not rotated. Deleting or rotating a credential is an owner decision with real-world consequences.

---

## Authorization matrix (Phase 10 design)

**Design only.** No authorization exists yet, because no backend exists. Every cell below is a
requirement to implement and verify. The table-level ownership boundaries that back this matrix are in
`docs/data-model.md` sections 4-9, and the enforcement rules are in section 13 of that document.

**Principals.** **Guest** (no session) · **Customer** (authenticated account, required before ordering
per D12) · **Support** · **Admin** · **Owner**.

**These are four distinct identity concepts, and there is no merchant principal (ADR 0008):** owner
authority, optional staff permissions, customer identity, and anonymous public access. `Owner` is the
person who owns **this one store**, not a platform operator overseeing other people's stores.

**D10 is settled (ADR 0009): the launch surface is owner-only.** Multiple owner accounts may exist and
each has full access, but there are **no staff or support roles** and **no general permission-management
system** at launch. The `Support` and `Admin` columns below are therefore **not part of the launch
surface**; they are retained as the model the permission tables can express, and a future staff role is
a new owner decision rather than an implementation convenience. **Phase 12's role-management screen and
its grant/revoke endpoints are outside the approved launch surface** and are recorded as a follow-up
change in ADR 0009 section 3.

### Admin authorization - implementation constraints (Phase 12)

Two properties the implementation must keep, because each of them silently weakens a refusal:

1. **A page's permission check must run before the response is committed.** The admin shell layout
   renders before each page, and a **route-level `loading.tsx` would flush that shell early**. Once
   the headers are sent, a page guard that calls `redirect()` can no longer produce a redirect
   status: the refusal becomes a `200` carrying a client-side redirect, which a client without
   JavaScript never follows. The check still runs server-side and the protected data is still never
   queried - so this is not a data leak - but the refusal stops being a refusal that a non-browser
   client can observe. The admin subtree therefore has **no route-level loading boundary**, and
   `npm run verify:admin` asserts that a principal lacking `audit.read` receives a **server-side
   redirect** from `/admin/audit`, not a `200`.
2. **A refused mutation is refused before the service is called.** Each route handler runs the guard
   first and returns without invoking the service, so a denial is never a partial action. Because a
   denial is presented as a redirect back to the page with a `denied` notice - the same `303` a
   success uses - `npm run verify:admin` asserts the **database effect** (no account created, no role
   granted, no account disabled) rather than the status code alone.

### Denied-action auditing (implemented, Phase 12)

A refused administrative action is a security event, and it must outlive the refusal that produced it.

**The defect this replaced.** The denial record was written inside the caller's transaction,
immediately before the throw that refused the action - so the refusal rolled back its own evidence. A
privilege-escalation attempt was refused correctly and left no trace. Confirmed by test, not inferred.

**The rule.** A denial is written in **its own transaction**, committed independently of the business
transaction it describes, so a rollback cannot take the evidence with it.

| Property | How it is held |
| --- | --- |
| Durable | Separate transaction; a rollback of the refused action cannot remove the record |
| Cannot upgrade a refusal | The writer returns a boolean, **never throws**, and no caller branches on the result. A logging failure changes observability only - authorization is already decided |
| Actor is not client-supplied | Taken from the resolved session, never from a request field, header or path parameter. A record whose actor came from the request body would be worse than no record |
| Distinguishable | Always the action code `admin.action_denied` with a `category` (`forbidden` / `csrf`), so a denial can never be mistaken for a business event |
| Bounded | **An anonymous denial is not stored at all** - there is no actor to attribute and it would be a cheap way for any client to write rows. An authenticated actor is additionally capped per window, so a burst cannot become a storage cost |
| Recorded facts | Actor, actor roles at the time, attempted capability, target, category, reason, timestamp, correlation id, address digest. Never a password, a raw session or CSRF token, or payment data |

**Failure behaviour, stated honestly.** If the record cannot be written, the refusal still happens and
the failure is reported on stderr without payloads; it is not retried, because a retry loop inside a
refusal path is itself a denial-of-service surface. The residual limitations are real and recorded:
the per-actor bound is held in **process memory**, so a multi-instance deployment multiplies the
effective ceiling by the instance count; and a failed write leaves **no record at all**, so a database
outage is an observability gap even though it is not an authorization gap.

### Log separation (D23, approved in ADR 0009)

**Customer and business activity records are kept separate from internal administrative and security
records, wherever practical.** They share the append-only `audit_event` store, because one append-only
table with one actor model and one retention rule is safer than two stores that can disagree - and they
are **distinguishable by construction**, not by convention: a denial carries `admin.action_denied` and a
category, and a **customer is never an audit actor type**, so a customer action can never be confused
with an administrative one. Both properties are asserted by test.

### Customer ban enforcement (D20, approved in ADR 0009)

A ban that only changes a label is not a ban. After a **confirmed** fake order, an owner may ban the
account, and the enforcement boundary is what makes the ban real - all of it server-side, none of it by
hiding a control:

1. **No new session is issued**, and every existing session is **revoked** at the moment of the ban, so
   access ends on the next request rather than at the next expiry.
2. **Order creation refuses a banned account inside the order transaction**, not merely in the interface.
3. **Checkout refuses**, rather than collecting details it will not use.

A ban does **not** cancel, refund or delete an order, and touches no payment, refund or reservation
state. The finding and the enforcement stay separate: the customer flag records the finding and blocks
nothing; the account status carries the enforcement. The fate of an in-flight order for a banned
customer remains an open owner decision and is not implied by the ban.

| Capability | Guest | Customer | Support | Admin | Owner |
| --- | --- | --- | --- | --- | --- |
| Browse catalog and published products | yes | yes | yes | yes | yes |
| Build and keep a cart | yes | yes | - | - | - |
| Register / log in / recover account | yes | yes | - | - | - |
| Place an order | **no (D12)** | yes | no | no | no |
| Read own order and timeline | - | yes | - | - | - |
| Read **any** order | no | **no** | yes | yes | yes |
| Submit a payment claim | no | own order | on request | on request | on request |
| Withdraw own still-submitted claim | - | yes | - | - | - |
| Verify / reject / mark falsely claimed | no | **no** | **no** (proposed) | yes | yes |
| Approve COD before dispatch | no | no | no (proposed) | yes | yes |
| Confirm COD cash collection | no | no | no | yes | yes |
| Reconcile COD cash | no | no | no | no | yes |
| Request cancellation (own order) | - | yes | yes | yes | yes |
| Approve / reject a cancellation | no | **no** | yes | yes | yes |
| Request a refund | - | yes | yes | yes | yes |
| Complete / fail a refund | no | **no** | no (proposed) | yes | yes |
| Receive and inspect a return | no | no | no | yes | yes |
| Adjust stock | no | no | no | yes | yes |
| Edit products, images, curation | no | no | no | yes | yes |
| Set image rights status | no | no | no | no | yes |
| Read/write payment recipient accounts | no | no | no | no | yes |
| Read/write store settings | no | no | no | no | yes |
| Suspend a customer | no | no | no | yes | yes |
| Raise / clear a customer review flag | no | **no** | no | yes | yes |
| Revoke a customer session | no | own only | yes | yes | yes |
| Manage staff users and roles | no | no | no | no | yes |
| Read the audit log | no | no | no | yes | yes |
| Read / resolve an exception queue | no | no | read, own domain | yes | yes |

### Enforcement requirements

1. **Ownership comes from the session, never the request.** A customer-scoped query filters on
   `customer_id = session.customer_id`. A URL or body identifier is an extra filter, never the authority.
2. **Refuse with 404, not 403, for another customer's resource.** Distinguishing "not yours" from "does
   not exist" is an enumeration oracle.
3. **Authorization is re-derived server-side on every request.** No client-supplied role, flag or hidden
   field is consulted, and hiding a control in the UI is not access control.
4. **No self-escalation.** A staff member cannot grant themselves a role, cannot grant a role they do not
   hold, and cannot edit their own permission set.
5. **Privileged actions require a reason and an actor.** Reject, false-claim, suspend, stock adjustment,
   refund completion and exception dismissal all require a recorded reason; verification requires an actor
   and a confirmed amount.
6. **The storefront has no writable path to administrative state.** No customer-reachable code path can
   produce `verified`, `rejected`, `falsely_claimed`, any COD approval, `refund.completed`,
   `reservation.released` or a `customer_flag`.
7. **Customer and staff sessions are stored separately**, so no single query can return both kinds of
   principal and a missing filter cannot escalate privilege.
8. **Deny by default.** A capability absent from the matrix is refused, and a new endpoint inherits no
   permission from an existing one.

**Not claimed:** row-level security in the database. At launch the boundary is server-side authorization
plus least-privilege database grants; RLS is a documented future hardening step.

---

## Threat model (Phase 10 design)

Each entry states the attack scenario, its impact, the preventive control, how a violation would be
detected, how the control is verified, and the residual risk that remains after the control. **No control
below is implemented**, and none has been tested. Residual risks are stated rather than minimised.

### T1 Broken access control and insecure direct object references

- **Scenario.** A customer requests `/orders/1042` while their own order is `1088`, or changes a hidden
  `customer_id` field.
- **Impact.** Disclosure of another customer's address, phone number and order history.
- **Control.** Ownership is resolved from the session and applied as a mandatory filter on every query.
  Sequential internal ids are never exposed; URLs carry an opaque `order_number` (data-model C1).
- **Detection.** Audit-logged authorization refusals; alert on a burst of refusals from one principal.
- **Verification.** A test that authenticates as customer A and requests every route belonging to
  customer B, asserting 404 on each; plus a test that tampering with a body identifier changes nothing.
- **Residual.** A missing filter in a newly added endpoint. Mitigated by centralizing the scoped query
  helper rather than repeating the filter.

### T2 Customers viewing or changing another customer's orders

- **Scenario.** An attacker enumerates order numbers, or replays a captured request with a different
  identifier.
- **Impact.** Privacy breach; fraudulent address or delivery change.
- **Control.** Opaque order numbers with high entropy; no listing endpoint that returns other customers'
  orders; all mutations re-check ownership and state server-side.
- **Detection.** Rate-limit hits and repeated 404s on order routes; impossible-travel patterns.
- **Verification.** Enumeration test: attempt a large sample of order numbers as an authenticated customer
  and assert zero disclosures and rate limiting.
- **Residual.** A customer who shares their own order link exposes their own order; the page requires a
  session, so the link alone is not sufficient.

### T3 Privilege escalation and unauthorized owner/admin actions

- **Scenario.** A staff member calls an admin endpoint directly, edits their own role, or grants
  themselves `payment.verify`.
- **Impact.** Fraudulent verification, refunds or stock manipulation.
- **Control.** Permissions checked per request from the database, not from a token claim. No self-edit of
  roles. Owner-level grants require an owner-level actor.
- **Detection.** Every privileged action is audited with actor, role snapshot, timestamp, before/after and
  reason; alert on a permission change or an owner-level grant.
- **Verification.** A test that calls each privileged endpoint with every lower-privileged role and asserts
  refusal; a test that attempts self-escalation and asserts refusal.
- **Residual.** A compromised owner account is equivalent to full compromise; MFA for owner accounts is
  recommended and is **not** decided here.

### T4 Session theft, fixation and CSRF

- **Scenario.** A session cookie is stolen via XSS or a shared device; an anonymous session is promoted to
  authenticated; a cross-site form posts a state change.
- **Impact.** Account takeover; unauthorized order, claim or cancellation actions.
- **Control.** `httpOnly`, `Secure`, `SameSite=Lax` cookies; session tokens stored hashed; session id
  rotated at login; per-session CSRF token plus same-origin checks on state-changing routes; no
  state-changing GET.
- **Detection.** Session revocation events; alert on concurrent sessions from distant locations; audit of
  state changes with request ids.
- **Verification.** Tests for cookie flags, for session-id rotation on login, for rejection of a
  cross-origin POST, and for rejection of a POST without the CSRF token.
- **Residual.** `SameSite=Lax` does not cover every legacy browser edge case, which is why the CSRF token
  is an additional requirement rather than a replacement.

### T5 Brute force and account enumeration

- **Scenario.** Credential stuffing against login; probing registration or recovery to learn which emails
  have accounts.
- **Impact.** Account takeover; customer list disclosure.
- **Control.** Adaptive password hashing with per-row parameters; rate limiting per account and per source;
  identical responses and comparable timing for known and unknown accounts; recovery always reports the
  same generic outcome.
- **Detection.** Throttle counters; alert on a rising failure rate per subject or per source.
- **Verification.** A test that N failed logins trigger throttling, and a test asserting that the recovery
  response for a known and an unknown address is indistinguishable.
- **Residual.** The throttle is a database-backed fixed window (data-model 4.5) - coarse by design, so a
  distributed low-rate attack from many addresses is slowed rather than stopped.

### T6 Malicious or forged MFS claims

- **Scenario.** A customer submits a fabricated transaction reference, or reuses a real reference from
  another order.
- **Impact.** Goods released without payment.
- **Control.** No automatic verification exists. Payment is marked `verified` only by an authorized person
  after independently confirming receipt through the merchant account. Duplicate references are detected
  and flagged for a human, never auto-rejected (a mistyped reference is not fraud). The claimed amount is
  recorded and never trusted; the order total is authoritative.
- **Detection.** Duplicate-reference detection; periodic reconciliation of verified payments against the
  merchant statement; `payment_mismatch` exceptions.
- **Verification.** A test that no customer-reachable path can reach `verified`; a test that a duplicate
  reference raises a flag and does not block the order.
- **Residual.** Verification depends on a human comparing records. Reconciling against the merchant
  statement is the compensating control and requires the owner to perform it.

### T7 Duplicate, replayed or concurrent verification actions

- **Scenario.** A double-clicked verify button; a replayed request; two staff resolving the same claim at
  once.
- **Impact.** Double stock effects, contradictory audit records, a claim resolved twice.
- **Control.** Every transition is a single state-guarded statement; a second attempt finds the state
  already changed and is a no-op. Release writes exactly one `inventory_movement` with a unique key.
  Idempotency keys cover retried submissions.
- **Detection.** Audit records showing one decision per claim; unique-constraint violations surfaced as
  exceptions rather than swallowed.
- **Verification.** Concurrency test: fire N simultaneous verify requests for one claim and assert exactly
  one state change and one movement row.
- **Residual.** None identified at the database level; the guarantee is structural.

### T8 Race conditions and inventory overselling

- **Scenario.** Two customers submit claims for the final unit at the same instant.
- **Impact.** Selling a unit twice; a customer paid for goods that cannot be delivered.
- **Control.** Guarded atomic reservation (`UPDATE ... WHERE on_hand - reserved >= n`), a
  `CHECK (reserved <= on_hand)` backstop, row locks taken in ascending `variant_id` order, and a unit-level
  check that at most one active submitted claim exists per unit (data-model 12.2).
- **Detection.** `reservation_conflict` exceptions; a periodic reconciliation between the ledger and
  physical stock.
- **Verification.** A concurrency test that fires simultaneous claims for a one-unit variant and asserts
  exactly one allocation, no negative availability, and one loser with a clear outcome.
- **Residual.** The loser who transferred before submitting must be refunded manually - an **accepted cost
  of the owner's priority rule**, recorded in `docs/payment-workflow.md` 13.10.7.

### T9 Forged refund, COD collection, cancellation or delivery status

- **Scenario.** A client request attempts to set `refund_status = completed`, `cod_collected`, an approved
  cancellation or a delivered status.
- **Impact.** Books and customer messages assert events that never happened; goods released without
  payment.
- **Control.** None of these states is reachable from any customer-facing path. Each requires a named
  permission, a state guard, an actor and - for refund completion - a recorded evidence note enforced by a
  database `CHECK`. COD collection, delivery completion and reconciliation are three separate states.
- **Detection.** Audit events for every transition; `unreconciled_collection` exceptions.
- **Verification.** A test that each administrative state is unreachable with a customer session, and that
  a refund cannot be marked `completed` without an evidence note and actor.
- **Residual.** Truthfulness of the recorded evidence is a human judgement; the schema forces it to be
  stated and attributed, not verified.

### T10 Malicious image uploads, MIME spoofing, oversized files, unsafe filenames

- **Scenario.** An upload that is not really an image; a polyglot file; a filename containing path
  traversal; a multi-gigabyte file.
- **Impact.** Stored XSS, resource exhaustion, filesystem traversal, hosting of malicious content.
- **Control.** Upload is admin-only; the declared content type is validated against an allowlist **and** the
  object is decoded as an image after upload; size and dimension bounds; keys are generated server-side
  from an opaque id so the filename is discarded; `public_read` delivery means no anonymous write; the
  presigned URL is short-lived and scoped to exactly one key, and is minted only after validation.
- **Detection.** `storage_orphan` exceptions; a reconciliation job comparing objects against rows.
- **Verification.** Upload tests with a mislabelled file, an oversized file, a traversal filename and a
  valid image, asserting rejection and acceptance respectively.
- **Residual.** An image-decoder vulnerability is a supply-chain risk outside this design; decoder
  dependencies must be tracked for advisories.

### T11 Exposure of Neon, Vercel, storage or authentication credentials

- **Scenario.** A secret reaches a client bundle, a log, a committed file or a `NEXT_PUBLIC_*` variable.
- **Impact.** Full database or storage compromise.
- **Control.** Secrets exist only as server-side environment variables, configured per deployment target.
  No secret is read from a committed file. Client bundles are scanned for secret material. The storefront
  never receives a storage credential - only a scoped presigned URL.
- **Detection.** A build-time scan of client output; log scanning; alert on credential use from an
  unexpected source.
- **Verification.** Grep the built client bundle for secret patterns and for every declared secret's name;
  assert zero matches. Assert no `NEXT_PUBLIC_*` variable holds a secret.
- **Residual.** **A plaintext third-party credential is currently present in the working tree** (see the
  credential-exposure section above). Rotation and removal are owner actions.

### T12 Preview or development deployments reaching production data or storage

- **Scenario.** A preview environment is misconfigured with the production endpoint and credential, then
  writes to production storage or the production database.
- **Impact.** Production catalog corruption or data disclosure.
- **Control.** One endpoint and one credential per environment, drawn from environment variables set per
  deployment target; branch-scoped credentials that are invalid outside their lineage; a deployment check
  confirming the endpoint and branch id before a new environment is used.
- **Detection.** A reconciliation job that detects writes to production objects not attributable to a
  production deployment; audit rows carrying a deployment identifier.
- **Verification.** Upload a marker object in preview and assert it is absent from the production branch;
  assert the preview credential cannot read the production bucket.
- **Residual.** **The credential is lineage-bound, not environment-bound.** A misconfigured preview can
  still reach production. Branch isolation protects data, not configuration (ADR 0006), and no technical
  control removes this entirely.

### T13 Injection, XSS and unsafe rendering

- **Scenario.** SQL injection through a filter or identifier; script injection through product copy, a
  customer note or an error message.
- **Impact.** Data disclosure or destruction; session theft.
- **Control.** Parameterized queries only, through the chosen data layer. All product and customer copy
  stays plain text rendered through JSX escaping; no `dangerouslySetInnerHTML`; no unreviewed sanitizer.
  Filter and sort parameters are validated against an explicit allowlist - including `brand`, which the
  current client-side parser does not validate (discrepancy B4).
- **Detection.** Error-rate monitoring; a content-security-policy violation report endpoint if a CSP is
  adopted.
- **Verification.** Injection tests against every filter and identifier; a test asserting that a script
  payload in product copy renders as text.
- **Residual.** No CSP is currently configured, so XSS defence-in-depth is incomplete; adopting one is a
  hardening task, not a claim made here.

### T14 Sensitive data exposure through logs, analytics, errors or public endpoints

- **Scenario.** A transaction reference, sender number or address appears in a log, an error response, a
  third-party analytics payload or a public endpoint.
- **Impact.** Privacy and regulatory exposure; correlation of customers with payments.
- **Control.** Audit payloads record decisions, not financial detail. Logs exclude credentials, session
  tokens, MFS references, sender numbers and contact details. User-facing errors are generic with a
  request id. Analytics derive from our own database rather than a third-party product, so no customer
  data is shipped to a vendor.
- **Detection.** Log scanning for reference-like patterns; review of error responses.
- **Verification.** Assert that a full order and claim flow writes no reference, sender number or address
  to logs; assert that an induced error returns no internal detail.
- **Residual.** Log discipline is a code-review responsibility; no automated redaction is claimed.

### T15 Abuse of customer flags or administrative audit records

- **Scenario.** A flag is raised automatically or without basis; an audit record is edited or deleted to
  hide an action; a flag is used as a permanent verdict.
- **Impact.** Unfair treatment of a customer; loss of accountability; inability to investigate a dispute.
- **Control.** A flag requires a **named staff actor** and a reason of at least ten characters, is
  reversible with an audited clear reason, allows only one live flag per customer, and **cannot be raised
  by any system actor** - there is no timer, expiry, rejection or duplicate-detection path that can set
  it. Audit and movement tables are append-only **by database grant**, so the application cannot update or
  delete them. Role codes are snapshotted so a later role change cannot rewrite history.
- **Detection.** Any flag creation or clearance is an audit event; a periodic review of open flags.
- **Verification.** A test asserting no automatic path produces a flag; a test asserting the application
  role's `UPDATE`/`DELETE` grants on audit tables are absent.
- **Residual.** **A database superuser can still alter or delete audit rows.** Append-only grants stop the
  application, not an operator. Tamper-evidence beyond that (hash chaining, external log shipping) is not
  proposed and not claimed.

### T16 Delayed or disputed genuine payment

- **Scenario.** A real payment cannot be verified within the 24-hour maximum, or a customer disputes a
  decision.
- **Impact.** A paying customer loses their order or their money.
- **Control.** A submitted claim **never expires automatically** and **never releases its reservation by
  timer**. Past the maximum it enters the `verification_overdue` exceptions queue with the hold intact,
  and only an explicit administrative decision resolves it. Refunds are recorded as `completed` only when
  the real-world action is confirmed.
- **Detection.** The exceptions queue itself; `verification_overdue` and `refund_stalled` alerts.
- **Verification.** A test that an order with a submitted claim is untouched by the expiry sweep after
  24 hours; a test that the sweep expires only orders with no claim.
- **Residual.** Requires a person to work the queue. This is an **operational** risk that no schema can
  remove.



- [ ] Owner-approved infrastructure and stack decisions (`docs/platform-architecture.md` section 11). D1, D2, D3, D7, D8, **D9**, **D11** and D12 are approved; **no decision blocks Phase 10**.
- [ ] **D9 rules implemented:** 24-hour unpaid-order expiry that never releases stock held by a submitted claim; cancellation after the window as a pre-dispatch support decision or a post-dispatch return; and the COD lifecycle with return-to-store and separate delivery, cash-collection and reconciliation states. (The 24-hour verification maximum, exceptions handling, fake-order rule, manual refund states, COD approval and state separation are approved.)
- [ ] **D11 approved and implemented:** the **first submitted payment claim wins**, a later claim preempts an earlier **unsubmitted** hold, and **at most one active submitted claim exists per unit**. Reservation expiry, release and stock restoration must be consistent with D9.
- [ ] **Approved D9 rules implemented:** exceptions queue, `falsely_claimed` with an audited reason and a separate customer flag, separate `refund_status`, the COD approval queue, and no automatic release of stock for any order whose customer submitted a payment claim.
- [ ] Customer authentication implemented and verified: hashing, sessions, recovery, object-level authorization, rate limiting, and cart preservation across the login step (D12).
- [ ] Manual payment verification controls P1-P18 implemented and verified, including duplicate-reference detection, reconciliation and COD cash reconciliation.
- [ ] Owner-confirmed courier arrangement and delivery charges, including COD cash settlement.
- [ ] API route inventory and explicit authentication/authorization decisions.
- [ ] Trusted price, discount, shipping, stock and order validation proved.
- [ ] Account access controls, secure sessions and CSRF/CORS defenses verified. (No guest checkout exists, so no anonymous order surface should remain.)
- [ ] Payment sandbox signature, status, amount and replay tests pass; refunds and reconciliation covered.
- [ ] XSS, content, URL and CSP boundaries reviewed.
- [ ] TLS, security headers, secret separation and bundle/log scans verified.
- [ ] Dependency advisory triage complete; material risks resolved.
- [ ] Rate limiting, resource bounds and monitored abuse response verified.
- [ ] Privacy and retention policies approved; backups restore tested.
- [ ] No customer PII, payment data or session tokens in fixtures, browser storage, docs or analytics.
- [ ] Delivery, return and payment policies approved, and imagery rights cleared.
- [ ] Bilingual, responsive and accessibility checks repeated on real devices with evidence.
- [ ] Named operational owner, alerts and rollback criteria recorded.

A passing build, HTTPS or a dependency scan alone never establishes system security.
