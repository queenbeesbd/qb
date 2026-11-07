# Implementation plan (from scratch) - 2026-10-30

This document is the **current planning surface**. `docs/implementation-plan.md` stays as the historical
record of Phases 0-46 and is not rewritten. `docs/audit-2026-10-30.md` holds the evidence behind every
claim below. Nothing here is authorized by being written: each phase needs the approval named in its
own prerequisites.

Continuation: phases are numbered from **47** because 46 is the last implemented phase; this plan
re-sequences everything that stands between the project and a real, paid-for, customer-facing launch.

---

## 1. Premises (do not re-litigate these while executing)

These are settled and bound every phase:

1. **One store, one owner** (ADR 0008). No tenancy, no vendor onboarding, no marketplace concept.
2. **Cash on Delivery only** (ADR 0015). No gateway, no prepaid claim flow, no recipient configuration.
3. **Refunds are out of scope** (owner decision, 2026-10-20). No refund screen, route, service, figure or
   wording.
4. **Availability is the only ordering gate** (ADR 0013). No reservation, allocation, deduction or
   automatic availability change may be added.
5. **No invented policy.** Delivery charges are owner-configured (ADR 0016); deadlines, return windows,
   taxes and promises are not engineering guesses.
6. **No new dependency, provider, provisioned resource or DNS change** without explicit owner approval.
7. **The documentation must move with the code**, and a changelog entry accompanies every phase.

---

## 2. Definition of launch (the gate this plan exists to close)

Launch means a real customer can reach the shop, place a COD order and have it handled, with the owner
able to run the shop alone. All of the following must be true:

| # | Gate | Currently |
| --- | --- | --- |
| L1 | The storefront renders the real catalog with cleared image rights | images uncleared (AUD-22) |
| L2 | A guest or signed-in customer can complete checkout, including a promotion code, with errors they can act on | guest promo broken (AUD-01), native-only validation (AUD-02) |
| L3 | Every order has a confirmation the customer can actually open later | guest receipt is fragile (AUD-04) |
| L4 | The shop publishes contact, delivery, returns and privacy information | absent (AUD-06, AUD-24) |
| L5 | The owner can dispatch orders from paper and reconcile cash | no printable slip (AUD-11) |
| L6 | Abuse is bounded: guest orders, promo attempts, sign-in attempts | guest orders unthrottled (AUD-18) |
| L7 | The site is deployable: assets in object storage, cached reads, health check, restore rehearsed | none of it (AUD-14/15/17/26) |
| L8 | The site is discoverable and honest in search results | global noindex (AUD-08) |
| L9 | Retention and customer data rights are decided and implemented | undecided (AUD-23/24) |
| L10 | Verification covers the changed behaviour on a real build | partial; full suites are manual |

---

## 3. Workstreams

| Stream | Phases | Character |
| --- | --- | --- |
| A. Checkout and order truth | 47, 48, 49 | small, contained, highest customer impact |
| B. Storefront product surface | 50, 51, 57 | presentation and content; one owner-content dependency |
| C. Admin operations | 52, 54 (slice) | the owner's daily work |
| D. Delivery and performance | 53, 54 | assets, caching, budgets |
| E. Abuse, security, dependency | 55, 56 | hardening |
| F. Account and policy | 58, 59 | owner decisions |
| G. Launch | 60, 61 | provisioning, rehearsal, verification |

---

## Phase 47 - Checkout integrity, guest promo parity, explicit validation (implemented 2026-10-30)

**Status: implemented.** Guest promotion codes work; the form states its own problems; a repeated guest
submission returns the order it already created. Address model item 3 is **deferred** - the fields are
unchanged until OD-1 is answered, and the plan still treats that as the next input it needs.
Evidence: `CHANGELOG.md` (Phase 47) and the `docs/project-status.md` entry of the same date.

**Why.** AUD-01 and AUD-02. Guest ordering is enabled by an approved switch (ADR 0024) but the promo
preview route still requires a customer session, so a guest sees a promo field that can never succeed.
Separately, checkout is the only long form in the project that still relies on native constraint
validation, against the pattern the project itself established for editors.

**Work items**

1. **Make the promo preview usable wherever ordering is** (AUD-01).
   - Option chosen: allow the preview for the same callers the order route already accepts - session
     plus CSRF when signed in; same-origin when guest ordering is on - and keep the existing
     server-side re-validation inside the order transaction as the authority.
   - Add the missing refusal reasons to the form's map (`unauthenticated`, and any new one) so no path
     falls through to the generic sentence.
   - Throttle the preview by source as part of Phase 55; do not add a client-side limit here.
   - Do **not** let the browser compute a discount, and do not accept a discount amount.
2. **Explicit checkout validation** (AUD-02).
   - `noValidate` on the form; one submit handler that computes the missing/invalid set (name, phone
     shape, address, district, area, city, optional postcode), renders a named summary in a
     `role="alert"`, sets `aria-invalid` on the affected controls and focuses the first one.
   - Keep the server as the authority; this is a reporting layer, not a new rule.
   - Keep the phone rule identical to `parseContact` so the form can never accept what the server
     refuses, and vice versa.
3. **Address field honesty** (AUD-02 adjacent, owner input required). **Deferred to OD-1** - the
   form is unchanged rather than guessed at.
   - Today the customer picks a district from three areas **and** types a free-text city. Either derive
     the city from the district or stop asking for both; whichever the owner chooses, the label must say
     what the courier actually needs. Do not change stored columns without a migration and a decision.
4. **Copy that states the next step once.** The COD note, "owner approves before dispatch" and the
   receipt's "what happens next" should say the same thing in the same words.

**Acceptance**

- A guest can apply a valid code and see the discount, and the order it creates carries exactly that
  discount; an invalid/expired/exhausted code states the specific reason.
- Empty submit on phone: visible summary lists every missing field, first invalid field receives focus
  and is not hidden behind anything; no order is posted.
- A phone number the server accepts is never rejected by the form, and vice versa (unit test over the
  shared rule).
- `typecheck`, `lint`, `check:i18n`, unit tests green; `verify:storefront` checkpoint run once at the end.

**Prerequisites.** Owner confirms the address model (item 3). No dependency, no schema change if the
answer is "derive the city".

**Risk.** A guest promo path is a new unauthenticated write-capable surface (it writes nothing, but it
does read the rule); it must not leak whether a code exists beyond the messages already published. Keep
the existing "unknown and paused share one answer" rule.

---

## Phase 48 - Cart safety (implemented 2026-10-30)

**Status: implemented.** `Clear cart` is a two-step, focus-managed question with no timer; five keys
added (i18n 1273). Evidence: `CHANGELOG.md` (Phase 48) and the `docs/project-status.md` entry.

**Why.** AUD-03. Clearing the cart is the most destructive control a shopper has and it has no
confirmation and no undo.

**Work items**

1. Two-step confirm inline ("Clear cart?" -> "Clear" / "Keep"), or a short-lived undo after clearing.
   Choose one; do not add a modal framework.
2. Announce the change politely (`role="status"`), not as an alarm, and keep focus in a predictable place.
3. State the consequence in the accessible name of the control, not only visually.

**Acceptance**

- A single tap can no longer empty the cart; the second step is required.
- Keyboard and screen-reader path reaches both choices, and cancelling restores nothing lost.
- Cart line quantity clamps and the "remove" per-line control are unchanged.

**Prerequisites.** None.

---

## Phase 49 - Guest receipt and order lookup (implemented 2026-10-30)

**Status: implemented, except the lookup (OD-2 unanswered).** Receipts moved to `/orders/<number>`, the
anonymous decision is a resolved session rather than a cookie, the old account path is a 307, and a guest
is told the address is the only way back. No "find my order" form was built, because that is OD-2 and it
was not answered. Evidence: `CHANGELOG.md` (Phase 49) and the `docs/project-status.md` entry.

**Why.** AUD-04, AUD-09. A guest's only proof of purchase is a URL under `/account`, and a stale cookie
sends them to sign in instead of showing the order they just placed.

**Work items**

1. Serve the receipt from a route that names what it is - `/orders/[orderNumber]` - with the account
   path kept only as a redirect if the old URL is already in the wild (a redirect is fine; an alias that
   renders both is not).
2. Decide "anonymous" by **resolved session**, not cookie presence: a cookie that does not resolve is a
   guest for receipt purposes. This is the same correction the checkout page already made.
3. Use guest-appropriate copy and headings; the placed/ordered states stay identical.
4. Owner decision (propose, do not build unasked): an optional "find my order" form (order number +
   phone) with source-keyed throttling and the same non-disclosure rule as the rest of the shop. If the
   answer is no, the copy must say plainly that the confirmation link is the only way back.

**Acceptance**

- Guest order -> receipt is reachable with no session and with an expired session cookie.
- A customer's order number still 404s anonymously; another customer's number still 404s.
- Existing customer-order pages and their tests are unchanged in behaviour.
- HTTP flow test covers the expired-cookie case explicitly.

**Prerequisites.** Owner answer on item 4.

---

## Phase 50 - Product media: a gallery from images the store already has (implemented 2026-10-30)

**Status: implemented.** Thumbnail strip on the product page, one button per stored image, 17-photograph
product verified in Chromium (6/6) and single-photograph products unchanged. Evidence: `CHANGELOG.md`
(Phase 50) and the `docs/project-status.md` entry.

**Why.** AUD-05. The data supports multiple images per product (1,919 derivatives, ordered in the admin
panel) and the PDP renders one.

**Work items**

1. Render the ordered image set on the PDP: one primary frame plus thumbnails, with the primary driven
   by selection state (client component as today), keyboard-operable, `aria-current` on the active
   thumbnail, and each image's stored alt text.
2. No layout shift: fixed aspect frame, width/height on every image, `sizes` matching the rendered frame,
   the existing variant sources only.
3. No new dependency, no lightbox, no zoom (zoom is disabled by owner decision on phones).
4. Cards and rows keep using the first image; do not change the grid.

**Acceptance**

- A product with 1 image renders as today; a product with N images renders N thumbnails, and selecting
  one updates the main frame without reload.
- Thumbnails are reachable by Tab and operable by Enter/Space; the active one is announced.
- No CLS and no horizontal overflow at 320/390/768/1440.
- `npm run verify:ui` gains one check for "gallery renders the stored count".

**Prerequisites.** None (image bytes still local until Phase 53).

---

## Phase 51 - Support and policy surfaces (owner content first)

**Why.** AUD-06, AUD-21, AUD-24. The shop tells customers to contact it and publishes no way to do so.

**Work items**

1. **Owner supplies the facts** (not engineering): phone number, hours, shop address if publishable,
   delivery expectation wording the owner is willing to commit to, returns/cancellation wording, privacy
   and terms text.
2. Store the publishable facts in `store_setting` (the mechanism the announcement bar and guest switch
   already use), edited at a small Settings screen; render them on a `/contact` page, a delivery
   information page, and a footer column.
3. Link them from checkout ("need to change something? call before dispatch"), the account recovery copy,
   and the order receipt.
4. Do not publish a deadline, a refund promise or a delivery guarantee the owner did not state.
5. Retire the sentence that says "contact the store" anywhere a contact route is not shown.

**Acceptance**

- Every promise of contact in the interface resolves to a real page with the owner's real facts.
- Nothing on those pages states a policy the owner did not provide (review each sentence).
- Empty configuration renders a stated gap, never a placeholder phone number.
- `check:i18n` green; the pages are in the sitemap only when populated.

**Prerequisites.** Owner content + decision on what may be published. No schema migration if
`store_setting` keys suffice (preferred); a migration requires a decision.

---

## Phase 52 - Dispatch paperwork (implemented 2026-11-07, not deployed)

**Status: implemented.** `/admin/orders/[orderNumber]/slip` exists, behind `order.read`, outside the
admin `(app)` group so the document carries no shell; the order detail's **Print slip** control opens it
in a new tab; the slip prints only on click. Evidence: `CHANGELOG.md` (Phase 52), the
`docs/project-status.md` entry of the same date and `docs/design-system.md` ("The dispatch slip").

**The shop contact block is omitted**, and the screen says so: **Phase 51 (support and policy surfaces) is
not implemented** - the owner has not supplied a phone number, hours or a shop address, and Settings still
holds only the two support links - so a slip may not carry a placeholder. No contact setting was invented
to fill the gap.

**Why.** AUD-11. A COD dispatch is a physical hand-off and the owner currently prints nothing.

**Work items**

1. A printable order sheet at `/admin/orders/[orderNumber]/slip` behind `order.read`, with print CSS:
   order number, recipient, phone, full address, area, delivery note, line items and quantities, the
   amount to collect, and the shop's own contact block from Phase 51.
2. Print is presentation only: no state change, no audit event, no printing of internal ids, customer
   email, or any payment state that does not exist.
3. A "Print" control on the order detail that opens it in a new tab; never auto-print on load.

**Acceptance**

- Chromium print preview at A4 and 80mm contains the address and the amount and nothing that is not a
  stored fact.
- The route refuses an unauthenticated request and a missing order.
- No change to any order state, total or event.

**Prerequisites.** Phase 51 for the shop contact block (or launch with that block omitted and say so).

---

## Phase 53 - Asset delivery and object storage (owner authorization required)

**Why.** AUD-15, AUD-13. 666 MB / 15,568 files under `public/catalog` cannot ship, and imagery cannot be
uploaded at all. ADR 0006 already approved Neon Object Storage; provisioning it is a separate explicit
authorization.

**Work items**

1. **Provisioning (blocked on owner).** One bucket per environment, branch-scoped credentials, no
   credential in the repo, `.env.example` placeholders only.
2. Upload the existing 1,919 asset variant sets keyed by their existing key; verify counts and byte sizes
   against the local tree; do not re-encode.
3. Read path: one module resolves a key to a servable URL (signed or public-read per ADR 0006), keeping
   the **key** as identity in the database. No provider URL is ever stored as a product's identity.
4. Development keeps the local directory behind the same resolver; production must not fall back to it.
5. Asset inventory moves from `readdir` to a durable source (a table row per asset, bootstrapped by the
   migration script), so Phase 54 can cache it and the admin picker stops listing the filesystem.
6. Add upload (owner-authorized slice): a validated server-side path that stores bytes, reads metadata
   from the bytes, writes the asset row, and never accepts a client path, URL or metadata.
7. Remove `public/catalog` from the deploy artifact once parity is proven.

**Acceptance**

- A served build renders every product image from storage, with no local file present.
- The upload path refuses a non-image, an oversized file, a wrong extension and a client-supplied key.
- `npm run check:catalog` and the asset integrity checks pass against the storage inventory.
- Rollback documented: the key space is unchanged, so reverting the read path restores the old behaviour.

**Prerequisites.** Owner authorization to provision; image-rights decision (AUD-22) before any public
launch, because storing a file does not make it publishable.

**Risk.** Cost and lock-in: re-check current provider pricing before selecting the plan, per the cost
policy. Never point preview at the production bucket.

---

## Phase 54 - Caching, performance budget, admin cost

**Why.** AUD-14, AUD-10, AUD-12. Every route is dynamic, every request re-reads the catalog, and the
admin media panel lists the filesystem.

**Work items**

1. **Read the installed Next documentation before choosing an API.** The project pins Next 16.4 and the
   caching model differs from older versions; do not code from memory.
2. Cache the storefront catalog and the homepage selection with a tag; invalidate the tag on every catalog
   write (product/category/collection/availability), on announcement and delivery-settings writes, and on
   asset changes. A cached page must never outlive the data it shows.
3. Keep the cart and checkout uncached (they are per-session) and keep admin uncached.
4. Cache the asset inventory in-process with an explicit invalidation, replacing the per-call `readdir`.
5. Add a **performance budget script** (built-in HTTP timings plus payload size per route, run against a
   served build) and record the baseline; fail on regression beyond an agreed threshold.
6. Optional slice (owner may decline): bulk availability change on the catalog list, behind the existing
   guarded route and audited per product, with a confirmation that states the count.

**Acceptance**

- A catalog edit is visible on the storefront immediately; a delivery-charge change is visible at checkout
  immediately; a cached route serves faster than the uncached baseline (numbers recorded).
- No stale price, availability or announcement is observable after a write.
- Budget script runs green in CI on the recorded baseline.

**Prerequisites.** Phase 53 for the asset part of item 4 if the durable inventory lands there; otherwise
an interim cache is acceptable and must be deleted later.

---

## Phase 55 - Abuse controls

**Why.** AUD-18. Guest ordering is unthrottled; the auth flows are not.

**Work items**

1. Source-keyed throttle for guest order creation (the same `auth_throttle` mechanism, a new scope),
   with a customer-facing refusal sentence and the existing fixed-notice convention.
2. Source-keyed throttle for the promo preview (including once Phase 47 opens it to guests).
3. Keep signed-in orders subject to their own session/account limits; do not double-count a signed-in
   customer against the guest limit.
4. Make the denial/throttle counters observable (see Phase 60) so a false positive is diagnosable.
5. Document the chosen numbers as policy in one constants module, with the reasoning, like the auth
   limits.

**Acceptance**

- The Nth guest order from one source inside the window is refused with a stated reason and writes no
  order; a different source is unaffected; the block expires.
- A legitimate shopper is never blocked by the auth throttles (separate scopes).
- Unit + db test for the boundary, and an HTTP flow check.

**Prerequisites.** Owner-approved numbers (a limit is policy). Proposal: 5 guest orders/hour/source,
20 promo previews/15 min/source - ask, do not assume.

---

## Phase 56 - Headers, CSP, dependency advisory

**Why.** AUD-16, AUD-19.

**Work items**

1. Resolve the Next advisory: upgrade within the current major if possible; record the advisory id and the
   outcome. A major framework jump is an owner decision.
2. Content-Security-Policy in **report-only** first, then enforcing once the reports are clean: no inline
   script except what Next emits, styles as today, images from self plus the Phase 53 host, frames denied,
   forms to self.
3. Keep the existing headers; add HSTS only after HTTPS is the only path.
4. Record the policy and its residual gaps in `docs/security.md`.

**Acceptance**

- Build no longer stops on the advisory; the dependency diff is reviewed and pinned in the lockfile.
- Enforcing CSP with zero violations across storefront, admin, checkout and the print sheet in a served
  build.
- No secret or provider URL appears in any bundle (`check:secrets`).

**Prerequisites.** Owner approval for the framework upgrade if it is a major change.

---

## Phase 57 - Discoverability and search quality

**Why.** AUD-08, AUD-07.

**Work items**

1. Flip `robots` for the storefront only, keeping `noindex` on account, checkout, admin and every
   parameterised listing combination that is not canonical. Add `robots.txt`.
2. Sitemap generated from the database (published products, live categories, populated policy pages), not
   from a hand-maintained list.
3. Canonical URLs for `/products`, `/products/[slug]`, `/categories/[slug]`; `noindex` or canonical
   consolidation for filtered/sorted/paged variants.
4. OpenGraph/Twitter metadata with the product's own photograph; JSON-LD `Product` carrying only truthful
   fields (name, image, price, availability `InStock`/`OutOfStock`, brand) and `Organization` with the
   Phase 51 contact facts. **No `AggregateRating`, no review count, no priceValidUntil.**
5. Search polish inside the existing rules (name, brand, pack only - ADR 0011): case/diacritic
   normalisation, a stated empty state with one or two real next steps (browse categories, clear the
   query), and the 1024-1199px control focusing the field instead of landing on the listing.

**Acceptance**

- `curl`-level checks: `robots.txt` allows the storefront, the sitemap lists every published product and
  category, a filtered listing does not compete with the canonical one.
- Structured data validates and contains no field the shop cannot substantiate.
- No route gained a new unauthenticated API.

**Prerequisites.** Phase 51 for the Organization block; owner approval to go indexable (it is the launch
decision).

---

## Phase 58 - Customer account completion (owner decision)

**Why.** `AccountView` offers no profile edit and no password change, so every credential problem goes
through the owner. That is by design for *recovery* (ADR 0012: no self-service reset, no mail provider)
but a signed-in password change with the current password is a different thing.

**Work items (if approved)**

1. Signed-in password change: current password + new password, same policy and hashing, revokes other
   sessions, audit record without any credential material.
2. Editable display name (the field already exists on the customer record and is optional).
3. No email change (that is identity, and needs a verification channel the project does not have).
4. Keep the owner-issued recovery flow exactly as it is for a customer who cannot sign in.

**Acceptance**

- Wrong current password refuses; throttled; other sessions revoked; the new password works and the old
  one does not.
- No password, digest or token appears in any audit row or log.
- Recovery path unchanged and still tested.

**Prerequisites.** Owner decision. This must be recorded as an ADR because ADR 0012 says "no
self-service password recovery"; a signed-in change is adjacent but must be stated, not inferred.

---

## Phase 59 - Retention, privacy and customer data rights (owner decision)

**Why.** AUD-23, AUD-24.

**Work items**

1. Decide retention for orders, order events, audit rows, sessions, throttle rows and customer accounts;
   write it down; implement only the parts that are automatic and safe (session and throttle expiry
   already exist). **Do not** delete order history: the append-only tables and the ledger are the record.
2. Publish privacy wording that matches what is actually stored (name, phone, address, email, order
   history, audit), and who can see it.
3. Decide whether a customer may request export or deletion; if yes, implement an owner-run, audited
   process - not a self-service endpoint - with the legal and bookkeeping limits stated.
4. No new third-party processor: there is none today, and adding one is a separate decision.

**Acceptance**

- Published policy text is checkable against the schema table by table.
- Any deletion path refuses to break an order or an append-only row and says why.
- The interface never promises a right the project cannot honour.

**Prerequisites.** Owner decision + legal review the owner trusts.

---

## Phase 60 - Deployment readiness and go-live rehearsal (separate authorizations)

**Why.** Nothing is deployed; L7 is entirely open.

**Work items**

1. **Provisioning (owner authorization, one resource at a time):** database branch per environment,
   storage branch per environment, host project, domain and DNS. Each is its own approval.
2. Migrations in the pipeline, not by hand: apply on deploy, verify schema hash, fail closed.
3. Environment validation for the deployed target (`QUEENBEES_ENV`, driver, TLS, no loopback) and the
   `TRUST_PROXY_HEADERS` decision **verified** against the actual proxy before enabling.
4. Health endpoint that checks the database with a bounded timeout and returns no internal detail.
5. Structured logs with request correlation, plus an uptime alert to the owner; keep Telegram alerts
   advisory as today.
6. **Backup/restore rehearsal** on a disposable branch: restore, verify row counts and a sample order,
   record the time taken.
7. Staging smoke: guest order, customer order, promo order, approval, dispatch, payment received,
   dashboard figures, audit trail, announcement, delivery charge change.
8. Credential hygiene pass: rotate or remove the known `.env` vendor credential (owner action), rotate
   any credential that ever touched a shared machine, confirm `check:secrets`.

**Acceptance**

- A staging order walks the whole COD lifecycle with correct figures and audit rows.
- Restore rehearsal documented with real numbers.
- Rollback plan written and once exercised.

**Prerequisites.** Owner authorizations for each resource; Phases 53, 55, 56 complete.

---

## Phase 61 - Verification cadence that can fail

**Why.** The full browser suites are manual, and every phase since 43 was verified with one-off probes.
Phase 46 fixed the *fixture coupling*; the remaining gap is cadence and coverage.

**Work items**

1. CI: keep typecheck/lint/build/unit/secret checks; add the database job's coverage for any new
   migration; add the performance budget script (Phase 54).
2. A documented **per-change** check (`verify:ui`, ~1 minute) and a **checkpoint** check (full suites),
   matching the owner's 2026-10-30 cadence decision; never quote a suite for a change it did not cover.
3. Add checks for every behaviour this plan introduces: guest promo, checkout summary, cart confirm,
   guest receipt with a dead cookie, gallery, print sheet, throttle refusal, sitemap/metadata.
4. Real-device and screen-reader plan written down with what is still unverified (iOS Safari, Android
   Chrome, VoiceOver/TalkBack, physical touch).
5. Remove or rewrite any assertion that no longer means anything, with the reason recorded - never
   weaken one silently.

**Acceptance**

- A deliberately broken behaviour is caught by the suite that claims to guard it (do this once, prove it,
  revert).
- The README/AGENTS verification section names exactly which commands gate what.

---

## 4. Sequencing

```
47 (checkout) --> 48 (cart) --> 49 (receipt) --> 51 (contact/policy) --> 50 (gallery)
                                                        |
                                                        v
55 (abuse) --> 52 (print) --> 54 (cache/perf) --> 53 (assets/storage) --> 56 (csp/upgrade)
                                                        |
                                                        v
57 (discoverability) --> 58 (account, decision) --> 59 (retention, decision) --> 60 (deploy) --> 61 (cadence)
```

Hard dependencies: 53 before 60; 51 before 52's contact block; 47 before 57's promo checks; 55 after 47.

**First three moves (smallest set with the largest launch value):** Phase 47, Phase 48, Phase 49. They
are contained, need no schema change and no dependency, and each one closes a way a real customer can be
stranded today.

---

## 5. Owner decisions needed (blocking, in order)

| # | Decision | Why it blocks | Options (recommendation in bold) |
| --- | --- | --- | --- |
| OD-1 | Address model at checkout: district + area + city, or district + area + city derived? | Phase 47 item 3 | **Derive city from the district; keep one free-text area line** / keep both / drop city |
| OD-2 | May a guest look up an order by number + phone? | Phase 49 item 4 | **No for launch, state the limitation** / yes with throttle |
| OD-3 | Which contact facts and policy wording may be published? | Phase 51 | Owner supplies text; **publish only what is stated** |
| OD-4 | Throttle numbers for guest orders and promo previews | Phase 55 | **5 orders/hour/source, 20 previews/15 min/source** |
| OD-5 | Framework upgrade scope (patch/minor vs major) | Phase 56 | **Patch/minor now if it clears the advisory** / major upgrade as its own phase |
| OD-6 | May the shop be indexed? | Phase 57 | **Yes at launch, storefront only** |
| OD-7 | Signed-in password change and display-name edit? | Phase 58 | **Yes, with ADR** / no |
| OD-8 | Retention windows, export/deletion rights, privacy text | Phase 59 | Owner + legal |
| OD-9 | Provisioning: database, storage, host, domain (separate approvals) | Phase 60 | **One at a time, staging first** |
| OD-10 | Image rights for the 1,919 imported photographs | L1, before public launch | Owner must clear or replace; **no launch on uncleared assets** |

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Guest promo path becomes an enumeration or spam vector | medium | medium | throttle (55), non-disclosing messages, no discount from the browser |
| Cache serves a stale price or availability | medium | high | tag invalidation on every write, and a test that edits then reads |
| Object-storage migration breaks images in production | medium | high | key space unchanged, counted migration, staging verification, rollback path |
| Owner content arrives late and blocks launch | medium | high | start Phase 51 collection early; every page states its gap instead of inventing |
| Printable slip prints a figure that is not a stored fact | low | high | slip is a projection of stored columns only; reviewed copy |
| Deploy without restore rehearsal | medium | high | Phase 60 gate |
| Verification coverage rots again | high | medium | Phase 61: a broken behaviour must be caught, proven once |

---

## 7. Explicitly out of scope

Refunds; payment gateways; courier API integration; inventory reservation or automatic stock deduction;
multi-store or multi-vendor; staff roles and permission management; a second interface language; a chart
library; an analytics tracker; email/SMS providers; a second state-management library. Each would need
a new owner decision and, in several cases, a migration.

---

## 8. Recommended next step

**Phase 51 - support and policy surfaces, starting with the owner's content.** The code side of Phase 51
is small and ready (store the owner's contact facts in `store_setting`, render `/contact` and a delivery
information page, link them from checkout, the receipt and the recovery copy). What it needs first is
**the owner's real facts**: a phone number, hours, a publishable address if any, the delivery wording the
owner is willing to stand behind, and the returns/cancellation wording. That content is the phase's
prerequisite and its risk: no engineering guess may become a published promise (AUD-06, AUD-21, OD-3).
Prerequisites: the owner supplies the text and approves what may be published, plus explicit
authorization to implement Phase 51. Acceptance: every "contact the store" sentence in the interface
resolves to a real page with the owner's own facts; an unconfigured setting renders a stated gap rather
than a placeholder number; and nothing published states a deadline, refund or guarantee the owner did not
write.
