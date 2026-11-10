# Verified project status

Audit snapshot: 2026-10-19 (Phase 18), updated after **Phase 14 (storefront catalog cutover)**, ADR 0011, the **customer-authentication (D17) and ordering-gate decisions in ADR 0012 and ADR 0013**, **Phase 15 (cart validation, customer authentication and order creation)**, the **F9/F10 security hardening**, and the **Phase 16 decision record in ADR 0014** (checkout/payment/delivery decisions, deferred expiry and notifications, and the order-state review). Source of truth: working tree; roadmap in `docs/implementation-plan.md`; direction in `docs/decisions/0004-independent-platform-direction.md`; product model in ADR 0008; launch product policy and administrative model in ADR 0009; availability scope in ADR 0010 and the ordering gate in ADR 0013; catalog authority and the cutover in ADR 0011; customer authentication in ADR 0012; schema and security design in `docs/data-model.md`; Phase 7 findings (now reference only) in `docs/backend-capability-audit.md`.

## Repository and implementation

- **Phase 20 (launch-readiness sprint, then the post-approval COD lifecycle) is implemented locally on top of Phase 19** and is described in
  "Phase 20" below: the owner's order detail and order history, bounded and paginated admin lists, the
  storefront's out-of-stock and unavailable-cart states, a reproducible local database script, and one
  information-disclosure defect found and fixed by verification (a customer email that was withheld from
  the rendered page but still shipped inside the React Server Component payload). Its second slice adds the
  **post-approval COD operations**: dispatch, delivery outcome, failed delivery to return-to-store, parcel
  receipt, per-line inspection and cash collection, each a guarded, audited transition on existing columns
  (`order.status`, `order.cod_state`, `customer_return`). **No migration.**
- Branch `master`, base HEAD `85a1f6e` (Phase 13: owner catalog management and the availability toggle). The Phase 14 work reviewed here sits in the working tree on top of that base; each earlier row below records the commit its phase produced.
- Next.js 16.4.0 App Router, React 19.3.0, TypeScript 5.9.3 strict, npm lockfile; CSS Modules and custom-property tokens. npm scripts include typecheck, lint, catalog/i18n checks, build and CDP Chromium browser suite.
- App routes: homepage, products listing, 5 category routes, 22 product routes, cart, account and checkout, admin shell. The 22-product/5-category catalog is read from **PostgreSQL** server-side through the typed accessor contract (`src/server/catalog/storefront.ts`); image variants and mappings in `src/lib/images.ts`; curation stays id lists, held in `collection`/`collection_item`; typed BN/EN dictionaries; localStorage cart/locale stores.
- Checkout is a real, account-gated **Cash on Delivery** form (Phase 15; COD-only since Phase 17): it submits ids and quantities plus delivery contact and **no payment field**. The persistent locked demo announcement, checkout `noindex` and root `noindex/nofollow` remain implemented. No payment provider or gateway exists.
- Phase 14 reruns (2026-10-15, disposable local cluster + real production build): `check:catalog` 22 products, 5 categories, 13 discounts, 6 featured, 8 collection and the locked demo warning passes; `check:i18n` 344 matching keys; `test` **86/86** (17 suites); `test:db` **144/144** (22 suites); `verify:admin` **97/97**; `verify:storefront` **65/65** browser checks against the **seeded database**; `typecheck`, `lint` (0 errors, 2 pre-existing unused-import warnings), `check:secrets`, `db:rehearsal` and `build` all pass. The historical counts quoted in the rows below (53/53, 57/57, 64/64) are the recorded results of those phases, not reruns.
- **Security hardening (F9, F10) - a separate change, not a phase.** The origin guard (`src/server/auth/request-guards.ts`) no longer reads `X-Forwarded-Host`/`X-Forwarded-Proto`: the expected origin is the request's own `Host` (the URL host as fallback), and forwarded-header trust exists only as an explicit `TRUST_PROXY_HEADERS=1` opt-in that is **off by default in every environment** - F9's forged-header path is closed while the deployment fact that would justify enabling it stays unverified. The password-hash parser (`src/server/auth/password.ts`) bounds `N`, `r`, `p` and the scrypt working set, refuses a stored value over 512 characters before decoding, requires canonical base64url of exactly 16 salt bytes and 32 derived-key bytes, and returns `false` on any runtime rejection instead of reaching scrypt with `keylen 0` and producing a 500; the stored format and cost parameters are unchanged. Checks (final tree): `test` **125/125** (28 suites), `test:db` **165/165** (24 suites), `verify:admin` **97/97**, `verify:storefront` **65/65** browser + **16/16** customer-flow checks, `typecheck`, `lint` (0 errors, the same 2 pre-existing warnings), `check:secrets`, `check:i18n` (433 keys), `check:catalog`, `db:rehearsal` and `build` all pass. **Not run, and not claimed:** standalone `db:validate` against a persistent target (no cluster or `DATABASE_URL` is configured here; the rehearsal ran it against its own disposable cluster), and standalone `npm run verify:browser` (port 3000 is held by a **pre-existing stale `next-server` with no database**, so that run saw zero product cards; the same browser suite passed 65/65 inside `verify:storefront`, which serves its own seeded build on an ephemeral port).

## Completed phases — verified by history, source and recorded checks

| Phase | Evidence | Boundary |
|---|---|---|
| 0 | Audit, reference, requirements, architecture, design/security docs and ADRs exist; initial empty-workspace finding preserved in historical audit. | Findings are dated historical observations, not current backend facts. |
| 1 | App Router, typed fixtures, bilingual dictionaries, routes, cart store, checkout preview, SVG assets and integrity/browser scripts exist; commit `54bd974` and earlier history. | Frontend demo only. |
| 2 | Announcement, local product imagery, hero/shelf and typography changes in commit `708395b`; source/config present. | Image rights remain pending. |
| 3 | Single-row shelf, 6 cap, curation IDs, price hierarchy, 22-product catalog, mobile category behavior and overflow work; commit `61a547b`; 53/53 historical browser report. | Historical browser report not rerun. |
| 4 | Crown-of-petals brand SVGs/favicon and shelf controls; commit `3935021`; browser checks recorded in plan. | Visual approval not evidenced by repository; human inspection needed. |
| 5 | Shared `--container`/`--gutter` tokens, header breakpoint/search fixes and responsive rules; commit `d765cd4`; 64/64 historical browser report and seven-viewport geometry table recorded. | No human visual sign-off. Current audit did not rerun browser suite. |
| 6 | Documentation re-audit: repository state verified against Git history and source; stale counts and phase claims corrected; `docs/project-status.md` added; end-of-task planning rule added to `AGENTS.md`. | Documentation only; no application code changed. |
| 7 | Read-only merchant-backend audit; findings and limitations in `docs/backend-capability-audit.md`. | Authorization is spent. Findings are now reference material only, not an integration plan. |
| 8 | Strategic reset: independent-platform direction approved; `docs/platform-architecture.md`, `docs/admin-dashboard.md` and `docs/migration-plan.md` produced; vendor-integration plan withdrawn; roadmap renumbered. | Documentation and planning only. No backend, database or dashboard scaffolded; no stack selected. |
| 9 | Provider decision review: D1, D2, D3, D7, D8, D9, D11 and D12 approved and recorded in ADRs 0005-0006 and the register; `docs/payment-workflow.md` sections 13.1-13.10; `docs/admin-dashboard.md`. | Decisions and documentation only. **No resource provisioned, no account created, no code written.** |
| 11 | **Backend foundation implemented locally.** 39-table Drizzle schema in `src/db/schema/`; reviewed SQL baseline plus a hand-written guards migration (append-only triggers, order immutability, state-transition guards, privileged-permission rule); server-only connection layer; strict environment validation; migration CLI; least-privilege grants; disposable local PostgreSQL harness; unit and database tests; CI workflow; `docs/database.md` and ADR 0007. | **Local only.** No cloud resource, no credential, no deployment. Migrations and constraints were verified against a disposable local cluster; rollback is forward-fix plus restore, not a reversed migration. |
| 10 | **Data model and security architecture designed.** `docs/data-model.md` (baseline, 13 conventions, ER diagram, 35 tables with keys/constraints/indexes/retention/authorization, eight state machines, transaction and concurrency design, authorization matrix, image storage, authentication, migration and rollback) and `docs/security.md` (authorization matrix and 16-part threat model). Ten documentation contradictions corrected. | **Design only.** No application code, migration, dependency, configuration, credential or resource. The concurrency guarantees are **reasoned, not executed**. |
| 16B | **Checkout and owner-flow review; four defects fixed.** A targeted trace of the Phase 16A customer checkout and owner admin flows over the local server found and fixed: **(1)** the customer's own order page told a prepaid customer that instructions and manual verification *"are not built yet"* and that **no payment details had been collected or stored** - false for an order sitting in `awaiting_verification` with a stored claim; the note is now chosen from the prepaid state (`orders.prepayNote*`, both locales) and states what is actually true of that order. **(2)** The COD worklist and its count filtered on `cod_state` alone, so a **rejected order - which cancellation does not change `cod_state` for - stayed in `/admin/orders-cod` for good**, where every further action could only answer "already decided"; both now require `status = 'pending'`. **(3)** Checkout pre-selected **bKash regardless of configuration**: with no configured recipient the radio rendered *checked and disabled*, so the browser submitted no `paymentMethod` at all while the form still demanded a sender number, a reference and an amount, and the customer saw a generic "could not be validated" notice with nothing to fix; the selection is now the first **available** method (COD when nothing prepaid is configured, `src/features/checkout/payment-methods.ts`) and claim fields render only for a method with a configured recipient. **(4)** A dead duplicate-reference mapping in `listVerificationQueue` (both branches identical, so the flag it appeared to compute could never differ) was removed; the flag is computed where it is rendered, in `paymentsQueue`. Verified by hand against the local server - prepaid checkout with a claim, an unavailable payment method, mismatch hold and release, verification and duplicate references, COD approval and rejection - and by new regression tests: 2 new unit files (payment-method selection, prepaid note keys) plus extended `tests/db/payments.test.ts` (duplicate flag cleared once a claim is decided; a rejected COD order leaves the queue and the count) and a new `customer-flow` assertion that the prepaid order page never shows the retired wording. **No migration, no state-machine or policy change; schema stays 40 tables.** | **Local only.** Delivery charges remain unconfigured; this review also found **no owner screen to configure a payment recipient** (a `payment_recipient` row had to be written by hand, so a fresh deployment could not enable a prepaid method through the UI) - **implemented in Phase 16C, row below**; the confirmed-amount field on `/admin/payments` is in **poisha** while the queue displays taka, and no check compares the recorded verified amount with the total; the verify form supplies the mismatch acknowledgement automatically. Recorded, not fixed. |
| 16C | **Owner payment-recipient configuration implemented locally.** The owner configures which account receives bKash and which receives Nagad at `/admin/payments/recipients`, behind a new privileged permission **`payment.recipient_manage`** (seeded into the catalogue and granted to the owner role by `db:seed`). The screen shows each method's availability, the active recipient (number, label, added date), an edit form, a deactivate control and the deactivated history with reactivate - and states that availability **is** the presence of an active row rather than a second switch with its own state. **Schema unchanged: 40 tables, no migration** - the existing `payment_recipient` shape already fits (one active row per method, enforced by `payment_recipient_active_unique`), so no multi-recipient routing was invented and none is offered. Three rules are enforced in the service, not the screen: permission re-checked (`requirePermission`, so a caller that skips the route check fails closed and the attempt is recorded durably); input validated against the database's own constraints (method `bkash`/`nagad` only - COD has no recipient; the number is normalised from `+880 1712-345678`, `880...` and spaced forms to the eleven-digit local form and refused otherwise; the label is 2-60 characters with control characters stripped); and **an edit never rewrites a claim's history** - when any claim already references the row, the save retires it and inserts a successor, so a submitted claim keeps showing the account it was actually paid into. Deactivation deletes nothing and touches no order, claim or refund. Every action appends `payment.recipient_created` / `_updated` / `_deactivated` / `_reactivated` with the actor, the roles held at the time and a bounded before/after snapshot. Checkout needed no new logic: it already renders instructions from the active row, and the order route already re-resolves the recipient inside the order transaction - it now refuses an unavailable method with a **distinct `payment_unavailable` notice** instead of the generic "check your details" one. Verified by hand against the local server (owner signed in through the real screen: page 200 with every form; create → `notice=created` and the number displayed; an order placed on the configured method and stored in `awaiting_verification` with its claim; deactivate → the crafted prepaid submission refused and the instructions gone) and by tests: new `tests/unit/recipient-validation.test.ts` (8) and `tests/db/payment-recipients.test.ts` (11: authorization plus a durable denial record, create/duplicate/invalid/COD refusal, in-place edit, unchanged no-op, deactivate and reactivate guards, and a submitted claim preserved across an edit), plus **13 new `verify:admin` checks** driving the screen and the route over real HTTP with a limited principal refused - **110/110**. | **Local only.** Recipient numbers are not entered: the owner supplies them. No second receiving account per method, no per-area or per-method routing, no customer notification when a recipient changes, and no check that the entered number belongs to the store. The storefront's browser-level radio state was **not** re-probed in this phase: the selection rules are unit-tested and the availability effect is asserted server-side (an order is refused or accepted from the database's own state), but no headless-browser assertion of the rendered radios with a configured cart was added to `verify:storefront`. |
| 12 | **Owner/admin authentication and dashboard foundation implemented locally.** Hashed owner credential (scrypt), opaque session tokens stored only as a digest in an httpOnly cookie, revocation, owner-issued single-use recovery, per-permission enforcement on every admin page and mutation, append-only audit trail; migration `0002` (`staff_recovery_token`); `verify:admin` 57/57 at the time. | **Local only**, not deployed. Denied-action auditing was found broken and fixed in a follow-up. |
| 13 | **Product and category management implemented locally.** Create/edit products, categories and brands; the **In Stock / Out of Stock** availability state; the authoritative orderability refusal; role forced rather than chosen, with a last-active-owner guard under a row lock; association-only imagery with metadata read from the file bytes; a database-backed read layer and an authenticated read API; migration `0003` (purely additive, schema stays **40 tables**); `verify:admin` **97/97**. | **Local only.** Storefront not cut over at that point; no inventory movement, deduction or reservation written, so overselling was not prevented. |
| 14 | **Storefront catalog cutover implemented locally.** Catalog read from PostgreSQL server-side through the typed accessor contract, a `source: 'database' \| 'fixture'` discriminator, `force-dynamic` routes sharing one cached snapshot per request, `db:seed:catalog` seeding all 22 fixture products idempotently, the fixture demoted to a development-only opt-in, stated empty/error states, ADR 0011; `verify:storefront` **65/65** browser checks on a served build over a seeded cluster. | **Local only.** No public catalog endpoint. No inventory movement, deduction or reservation is written, so **overselling is still not prevented**. |
| 15 | **Cart validation, customer authentication and order creation implemented locally.** First-party customer accounts (email + password, scrypt, opaque session tokens stored only as a SHA-256 digest, httpOnly `SameSite=Lax` cookies with idle *and* absolute expiry, account- and source-keyed throttling, customer-scoped CSRF); server-priced, atomic, idempotent order creation gated on `in_stock` and on account standing inside the order transaction; customer-owned order reads returning 404 for another customer. Schema unchanged (**40 tables**, no migration). `test` **109/109**, `test:db` **165/165**, `verify:admin` **97/97**, `verify:storefront` **65/65** browser + **16/16** HTTP flow checks. | **Local only.** No payment instructions or verification (Phase 16), no delivery charges, no owner-facing ban control. Writes **no** reservation, deduction or movement, so **overselling is accepted, not prevented** (ADR 0013). No provisioning, deployment or credential. |

| 16A | **Checkout payments, manual verification and COD confirmation implemented locally.** The customer flow: three payment methods at checkout, prepaid payment instructions rendered **only** from a configured `payment_recipient` row (no configuration → the method is unavailable, nothing invented), claim fields (sender number, transaction reference, amount) parsed and validated server-side, and the **claim written inside the order-creation transaction** - order, contact, items, events, claim and the `awaiting_verification` transition (with `expires_at` cleared) commit together under the `order_create` idempotency key and a separate `claim_submit` key. The owner flow: `/admin/payments` (verify with confirmed amount, reject, confirmed false claim, hold, release-hold - each guarded on `state='submitted'`, idempotent by conflict, audited with actor/timestamp/decision/reason in the transaction; duplicate transaction references flagged before any decision; a mismatch an explicit-acknowledgement hold, never a verdict) and `/admin/orders-cod` (accept after the call → `cod_approved` + `confirmed`; reject → cancelled, only while `pending`). Customer suspension via the existing `suspendCustomer` on `/admin/customers`. Overview carries worklist counts. **No migration; schema stays 40 tables.** Tests: `test` **125/125**, `test:db` **172/172** (7 new Phase 16A database tests covering verification verify/reject/hold/release, duplicate-reference queue flagging, no automatic ban after rejection, COD approve/reject guards and idempotency, and claimed orders carrying no expiry), `verify:admin` **97/97** and `verify:storefront` **65/65 browser + 16/16 flow** against a served build (the flow now exercises the configured-recipient prepaid claim path), typecheck, lint (0 errors), `check:i18n` 518 keys, `check:catalog`, `check:secrets`, `db:rehearsal`, `build`. | **Local only.** No delivery charge configured (orders snapshot `shipping_minor = 0` and the storefront states delivery is arranged on confirmation), no courier/consignment, no COD collection/reconciliation states below `cod_approved`, no cancellation/refund workflow, no expiry (deferred, ADR 0014), and no notification surface beyond the order page. The customer order page's prepaid note and the checkout payment-method selection were corrected in the Phase 16B review (row below). The flow now asserts the prepaid order page's honest wording. The queues themselves are covered by `test:db` and were exercised by hand in the Phase 16B review, not by `verify:admin`. |

| 17 | **COD-only transition, documentation reset and codebase audit (implemented locally).** The manual prepaid subsystem was **removed, not disabled**: no bKash/Nagad checkout branch, no recipient configuration screen or `payment.recipient_manage` permission, no payment claim written, no verification queue or duplicate-reference reads, no prepaid translation keys, no prepaid order-page copy. **`createOrder` no longer accepts a payment method** - it writes `cod` / `not_applicable` / `cod_pending_approval` with `expires_at = NULL` - so no submission and no page can choose a prepaid method. The COD owner flow is unchanged: queue at `/admin/orders-cod`, guarded approve (`cod_approved` + `confirmed`) and cancel (`status = 'cancelled'` while `pending`), idempotent by conflict, audited with actor/timestamp/reason; a rejected order leaves the worklist. Retired paths (`/admin/payments`, `/admin/payments/recipients`, `/api/admin/payments`, `/api/admin/payment-recipients`) **404**. **Schema unchanged: 40 tables, no migration** - `payment_recipient`, `payment_claim` and the prepaid state values stay implemented and unused because they hold claim history and audit references (ADR 0015). Documentation reset: ADR 0015, requirements, roadmap (Phase 18 dashboard next), payment workflow (COD current, prepaid archived), data model, security, dashboard module scope and the **Phase 18 design brief**. | **Local only.** No gateway, provider, credential or SDK exists; **automated online payment is a future roadmap item**. Delivery charges remain unconfigured (`shipping_minor = 0`), courier/consignment, cash collection/reconciliation, cancellation/refund workflows and notifications are not built. A customer who cannot pay cash on delivery cannot order. The retained payment tables need an owner-approved retention decision if they are ever dropped. **Verified 2026-10-17:** `test` **130/130**, `test:db` **170/170**, `verify:admin` **108/108**, `verify:storefront` **65/65** browser plus **19/19** HTTP customer-flow checks, plus `typecheck`, `lint` (0 errors, 2 pre-existing warnings), `check:i18n`, `check:catalog`, `check:secrets`, `db:check`, `db:rehearsal` and `build`. |

| 18 | **Admin dashboard redesign implemented locally.** The owner panel was rebuilt as a coherent operations application: a permission-filtered grouped rail that becomes a focus-trapped drawer below 1024px, a page-header/notice/empty-state system, an overview led by the COD worklist (count, oldest wait, five oldest orders with line items, `tel:` contact and inline decision), attention for flagged customers and refused actions, and catalog counts last. `/admin/orders-cod` gained server-side search (order number, name, phone; literal, escaped) and waiting/decided-today filters; approval is one deliberate click with a prefilled, editable audit note, rejection opens a reason-requiring dialog that states the consequence. Products gained search (name/slug/SKU), an availability filter and an In Stock / Out of Stock switch posting the same guarded route. A new `/admin/customers/[id]` page shows recorded orders and keeps suspension behind a confirmed, reasoned dialog. Owners, audit, categories, sign-in and the error surface share the same system. **Schema unchanged (40 tables, no migration); no permission, state machine, total or audit contract changed.** `verify:admin` grew from **108 to 119** checks and now drives Chromium for the desktop shell, 360px overflow on six routes, the mobile drawer (modal focus, Escape, focus restoration), the rejection dialog and an inline approval that decides the order. | **Local only.** No dispatch/consignment, cash collection/reconciliation, refund or cancellation recording, owner-operated customer credential reset, analytics or delivery-charge configuration was invented. Decided orders are visible only in the decided-today filter and the customer's history - there is no owner order-detail page. A route-level `loading.tsx` was rejected because it turns a refused admin page from a 307 into a 200 shell. **Verified 2026-10-19:** `test` **130/130**, `test:db` **172/172**, `verify:admin` **119/119**, `verify:storefront` **65/65** browser plus **19/19** HTTP customer-flow checks, `typecheck`, `lint` (0 errors, 2 pre-existing warnings), `check:i18n` (592 keys), `check:catalog`, `check:secrets`, `build`. Real Safari/Android/screen-reader behaviour remains unverified. |

| 19 | **Three-area delivery charges implemented locally.** Customers choose **Dhaka**, **Chattogram** or **Other districts** at checkout; matching is by stable code, never the free-text address. The owner sets a required default (Other districts) and optional Dhaka/Chattogram overrides at **Settings → Delivery charges**, with edit, remove-to-default, reactivate, server-side taka→poisha parsing and audit. Order creation resolves the charge inside the transaction, refuses an unconfigured default, and snapshots the area and amount. Checkout, confirmation, history and COD cards show subtotal, delivery and total. Migration `0004_district_delivery_charges`: two tables plus nullable `order_contact.district_code`; schema **42 tables**. Historical orders untouched. | **Local only.** The **actual BDT amounts are owner inputs** and no price was invented; until the default is saved checkout correctly refuses orders. No courier booking, tracking, delivery promise, free-delivery threshold, pickup, failed-delivery handling, dispatch or cash-reconciliation screen. Real iOS/Android/screen-reader verification remains outstanding. **Verified 2026-10-20:** `test` **140/140**, `test:db` **181/181**, `verify:admin` **122/122** (including real Chromium configuration of the default and Dhaka charge), `verify:storefront` **65/65** browser plus **19/19** HTTP flow with a seeded override, `typecheck`, `lint` (0 errors), `check:i18n` (639 keys), `check:catalog`, `check:secrets`, `db:validate` (42 tables), `db:check`, `db:rehearsal`, `build`. |

| 20b | **Post-approval COD lifecycle implemented locally.** The owner's order detail is now the operational workspace. From it, and only from the state that permits each step: **dispatch** (`confirmed`/`processing` + `cod_approved` → `shipped`), **delivery** (`shipped` → `delivered`, **never** a cash claim), **failed delivery** (`shipped` + `cod_approved` → `cod_failed`, creating one `customer_return` per line, reason required), **parcel receipt** (order → `returned`, returns → `received`), **per-line inspection** (`received` → `inspected_accepted` / `inspected_rejected`, a note required to reject), **cash collection** (`cod_approved` → `cod_collected`, its own act, never a consequence of approval or dispatch), **completion** (`delivered` + a recorded outcome → `completed`) and **cancellation before dispatch** (`pending`/`confirmed`/`processing` → `cancelled`, reason required). Every transition is guarded in the UPDATE's WHERE clause, writes its `order_event` (unique key) and its audit record in the same transaction, re-checks its own permission in the service, and is idempotent by conflict. New permission `order.dispatch`; `cod.confirm_collection` and `return.inspect` now have workflows. **Inspection writes no movement and flips no availability**: returned goods become sellable only when the owner sets the product In Stock, by hand. **Reconciliation is deliberately unreachable** - `cod_reconciled` is written by nothing, and no figure is described as reconciled. No migration: schema stays **42 tables**. | **Local only.** **Failed-delivery charge liability is still undecided** and nothing applies one; nothing retries, cancels, refunds or reships a failed order automatically. **Reconciliation has no defined process** (period, comparison source, discrepancy meaning) and is not implemented. Historical orders and delivery-charge snapshots are untouched by every transition. Real iOS/Android/screen-reader verification remains outstanding. **Verified 2026-10-20:** 15 new data-layer tests in `tests/db/order-fulfilment.test.ts` (`test:db` **204/204**), `test` **140/140**, `verify:admin` **134/134** (including Chromium: dispatch offered only after approval, one click dispatching the order through the real route, and the page then offering delivery/failed-delivery/collection instead of dispatch), `verify:storefront` **65/65** browser + **21/21** HTTP flow, `typecheck`, `lint` (0 errors, 2 pre-existing warnings), `check:i18n` (784 keys), `check:catalog`, `check:secrets`, `db:validate` (42 tables), `db:check`, `db:rehearsal`, `build`. |
| 20 | **Launch-readiness sprint implemented locally.** The owner now has a **dedicated order detail** (`/admin/orders/[orderNumber]`) and a **paginated, searchable order history** (`/admin/orders`), reached from the COD queue, the dashboard and a customer's order list; the detail shows the reference, customer, delivery area and address, the recorded lines with their saved prices, the delivery-charge snapshot, the COD/ordered state, the order event log and - only for `audit.read` - the audit trail, with the same guarded approve/reject forms the queue uses. Admin lists are **bounded and report their total** (orders 25/page, decided COD 25/page, customers 25/page) instead of silently truncating. The storefront states an **Out of Stock** product on the card, replaces the purchase controls on the product page with a stated reason, marks unavailable cart lines, and refuses to submit checkout while one is present - all presentation over the unchanged server gate. `npm run dev:db` makes the local cluster reproducible, and the db/seed/bootstrap scripts now read `.env.local` (never overriding an exported variable). **One defect found by verification and fixed:** the order detail withheld the customer's email from the rendered page but still shipped it inside the RSC payload; the page now omits it entirely unless the principal holds `customer.read`. No migration; schema stays **42 tables**. | **Local only.** **No new order state, transition or policy was invented**: dispatch, delivery outcome, cash collection and reconciliation remain **unbuilt owner decisions**, so a COD approval is never presented as received cash. **Actual delivery amounts are still owner inputs** and checkout refuses orders until the default is saved. **Photography rights remain unconfirmed.** Real iOS/Android/screen-reader verification remains outstanding. **Verified 2026-10-20:** `test` **140/140**, `test:db` **181/181** + 8 new order-detail tests, `verify:admin` **131/131** (including Chromium checks of the order detail at 1440/390px and the 360px overflow sweep over eight admin routes), `verify:storefront` **65/65** browser plus **21/21** HTTP flow (two new out-of-stock checks), `typecheck`, `lint` (0 errors, 2 pre-existing warnings), `check:i18n` (709 keys), `check:catalog`, `check:secrets`, `db:validate` (42 tables), `db:rehearsal`, `build`. |
| 30 | **Admin list-surface parity implemented locally (2026-10-21).** All six admin lists - orders, the COD queue, products, categories, customers and the audit trail - now share one toolbar, one control scale, one row anatomy and one footer, defined once in `_ui/ListToolbar.tsx`, `_ui/ListFilters.tsx`, `_ui/Pagination.tsx` and the pure helpers in `src/lib/admin-query.ts`. Orders gained a **server-side date range** over `placed_at` and a delivery sub-line; the COD waiting tab, catalog, categories and audit gained **pagination** they did not have (catalog and audit previously reported only the rows on screen); categories gained **search and a visibility filter**; every list gained a page-size control and active-filter chips. Filtering is SQL, every state is in the URL, and a filter change drops the page number. Invalid parameters are clamped, not refused (`?page=9999` resolves to the last page, `2026-02-31` is ignored). **No schema change, no migration, no permission, state machine, money figure or audit contract changed.** Verified: `verify:admin` **172/172** (22 new checks, 320-1920px), `test` **165/165**, `test:db` **246/246**, plus `typecheck`, `lint`, `check:i18n`, `check:catalog`, `check:secrets`, `build` and `verify:storefront`. Screenshots inspected; two defects found and fixed (clipped tabs and date row at 390px; a money cell that read as clipped once a row wrapped). | **Local only**, not deployed. No export, bulk action, category image, product-form change or owner-decision item was added. |

## Limitations and owner decisions

- The 22-product fixture is not an authoritative or production-verified catalog. Snapshot prices/availability, no confirmed variant/SKU mapping, missing descriptions, and transliterated Bangla names need business review.
- All 22 product images are tagged pending permission; public visibility is not reuse permission. Get written rights confirmation or replace them with licensed assets before public launch.
- Merchant backend: audited read-only in Phase 7 and now a **UX reference only**. The platform is a third-party multi-tenant SaaS (Zatiq Easy) with no supported integration surface; the integration plan is withdrawn. QueenBee's owns its own backend, database and dashboard instead; the database and admin foundation and the catalog, customer-account and order-creation paths are **implemented locally (Phases 11-19)**, while dispatch/cash reconciliation, the actual delivery amounts and analytics are not built. **Nothing is deployed.**
- **Approved (2026-10-11):** infrastructure and hosting (Neon PostgreSQL, Vercel), image storage (Neon Object Storage), payment methods (manual bKash, manual Nagad, COD); payment fields (sender number and transaction reference required; no screenshot); account-required checkout; the **D9 payment and order policy** - the 24-hour verification maximum (internal, explicitly not a customer-facing promise), the exceptions queue for genuine payments that cannot be verified in time, fake-order findings with an audited reason and a separate customer review flag, cancellation via support, manual refunds with separate requested/processing/completed/failed states, COD approval before dispatch, **cancellation after the window as a pre-dispatch support decision or a post-dispatch return**, and the **full COD lifecycle**; and the **D11 inventory policy** - the first submitted payment claim is observed first, with **at most one active submitted claim per order**. **Amended by ADR 0013 and ADR 0014:** no reservation, allocation or deduction is written and overselling is accepted; **the 24-hour unpaid-order expiry is deferred (not a launch priority, no scheduler)**; and the binding rule is that **a submitted claim never expires**.
- **Still outstanding owner inputs (ADR 0014 Part 5, narrowed by ADR 0016):** the actual BDT delivery amounts for Other districts, Dhaka and Chattogram; the cash-reconciliation detail; the COD retry/rejection detail; retention periods; and whether a mail provider is ever authorized (which alone would enable email verification and self-service password recovery). The manual bKash/Nagad flow is retired (ADR 0015), so its recipient numbers and verification evidence are no longer needed. Couriers and COD cash-settlement terms remain open (D6), and **no courier API is authorized**. *(Verifying roles was D10 and is settled: owner-only, ADR 0009. **D17 (customer authentication) is settled in ADR 0012**, the **ordering gate in ADR 0013**, and the **Phase 16 checkout/payment/delivery decisions in ADR 0014**.)* **Deferred and not blocking:** the 24-hour expiry timer and external notification channels (ADR 0014). Delivery pricing is implemented; only the amount inputs and failed-delivery handling remain.
- **A plaintext third-party credential was found in the working tree** during Phase 10: an untracked, gitignored `.env` (~89 bytes) for the withdrawn `merchant.zatiqeasy.com` vendor. It is read by no code and is not committed, but it should be treated as exposed. **Owner action recommended: rotate it at the provider if still valid, and remove it from future use.** Engineering did not read, modify, move, delete or rotate it. `docs/security.md` previously and incorrectly claimed no env file exists; that statement is corrected.
- Production security/operations are not established: trusted server boundary, authorization, payment verification, CSRF/CORS as applicable, abuse controls, privacy/retention, monitoring/logging, backup/restore, deployment, indexing and rollback require implementation and evidence. Phase 10 **designed** the controls; **none is implemented or tested**.
- **Phase 21 corrected the COD money workflow (2026-10-20).** A courier-statement reconciliation phase had been proposed; the owner corrected the premise. **QueenBee's has no courier statement, no settlement period and no statement matching.** The confirmed workflow is: place order → owner approves → dispatch → delivery → **the owner manually marks the order Payment Received** → the order is **Completed** and its revenue reaches the dashboard. Two defects against it are fixed: payment receipt and completion were two separate owner actions (now one, `markPaymentReceived`, from `shipped`/`delivered`, behind `cod.confirm_collection`), and the dashboard reported no revenue at all (now derived from `order.total_minor` over orders that are completed **and** paid, summed per read from immutable rows, so it cannot be double-counted). **No schema change, no migration, no new table; `cod_reconciled` is still written by nothing.** Failed-delivery liability is settled: the **owner bears** it and no fee is added to the customer's total. The reconciliation/statement work is **removed from the roadmap**.
- **Phase 23 implemented the owner-operated customer credential reset (2026-10-20, ADR 0019).** The last launch blocker is closed: a customer who forgot a password could previously be **permanently locked out**, and the owner had no remedy. Now the owner issues a **one-time code** from the customer detail screen after verifying the customer by phone, and reads it out during that call. The code is **256 bits stored only as a SHA-256 digest**, valid **30 minutes**, **single-use**, and **supersedes** any earlier one (the partial unique index enforces that, not a check that could be forgotten). **Issuing revokes every live customer session**; **redemption forces a new password** and revokes again. A **suspended or deleted account is refused with one indistinguishable outcome**, so the route cannot probe account state. Redemption is **source-throttled** and every failure is generic. New **privileged** permission `customer.credential_reset`; audit actions `customer.credential_reset_issued`, `customer.recovery_refused` and `customer.credential_reset_redeemed` (`system` actor - a customer is never an audit actor). **No migration: schema unchanged at 43 tables** (`account_recovery_token` was designed in Phase 10 for exactly this). **A real defect was found and fixed:** the admin flash cookie was documented "read once, then gone" but only ever read, so **every reload re-displayed the one-time token**; a page render cannot clear a cookie in this version of Next.js (it threw a 500), so clearing is now a route that overwrites the cookie empty with the same `path`. Verified 2026-10-20: `test` **140/140**, `test:db` **234/234** (12 new recovery tests), `verify:admin` **150/150**, `verify:storefront` **65/65** plus **27/27** HTTP customer-flow checks (5 new recovery checks), `typecheck`, `lint` (0 errors), `check:i18n` (838 keys), `check:catalog`, `check:secrets`, `db:validate`, `db:check`, `db:rehearsal` and `build`.
- **Refunds are deferred by owner decision and are out of scope for this launch (2026-10-20).** The owner decided to skip refunds completely for now. **No refund feature is to be built** - no screen, service, route, permission, transition or accounting logic - and any future refund work needs a **new explicit owner decision**, not a roadmap slot. The **existing schema is untouched**: `refund` and its four states (`requested`/`processing`/`completed`/`failed`) stay in the database, unused and written by nothing, exactly like the reservation, claim and `operational_exception` tables. No migration ran and no historical record was modified. A refund is settled **outside the platform**, so the platform **cannot** state that one occurred and must not imply it. The standing rules still bind any future work: the refund state is never collapsed into `order.status` or `cod_state`, and a refund is never reported completed because it was requested or approved. **Recorded in the decision register, `docs/implementation-plan.md` and `AGENTS.md`; no ADR was written, because this adds no architecture.** The next best step was re-derived from the remaining launch blockers instead - the **owner-operated customer credential reset**.
- **Phase 22 implemented per-order additional courier costs alongside payment receipt (2026-10-20).** The owner's money workflow is now complete: customer pays price + delivery fee, the courier keeps its standard fee, the owner verifies in the courier's dashboard and marks the order **Payment Received**, and **at that moment may record any additional courier cost** for that order. New table `order_additional_cost` (migration `0005`, additive; schema 42 → **43** tables) with immutable amount/description/actor and a no-delete trigger - a mistake is **voided** with a reason, never edited or removed. Costs are saved **in the same transaction** as `cod_collected` and `completed`, so a refused receipt saves no cost and a bad amount refuses the whole action. New privileged permission `order.cost_record`; audit actions `order.cost_recorded`/`order.cost_voided`. The dashboard now reports **four separate amounts** - customer payments (gross), standard delivery fee (inside it, kept by the courier), additional courier costs, and **estimated** net proceeds - with the fee subtracted **once**, voided costs excluded, and the net figure **Unavailable** when an order cannot substantiate the split. Every figure is derived on read; no counter exists.
- **Phase 20 owner decisions still needed (each blocks a specific, named feature).** **Settled:** dispatch, delivery outcome, return-to-store, receipt, inspection and **payment receipt** now have screens, states and guards, with money recorded **only** by an explicit owner action. **(1) Failed-delivery delivery charge: settled 2026-10-20 - the owner bears it**, and no transition adds, applies or rewrites a charge. **(2) Reconciliation: withdrawn** - there is no courier statement in this business, so `cod_reconciled` remains written by nothing and no figure is described as reconciled. **(3) When cash is recorded: settled 2026-10-20** - when the payment is actually received, and that same action completes the order. **(5) Delivery amounts** for Other districts, Dhaka and Chattogram - the reason checkout still blocks. **(6) Photography rights** in writing. See `docs/admin-dashboard.md`.
- Real iOS/Android, 200% zoom, assistive technology, constrained-network image loading/performance, and native Bangla content/visual review remain unverified.
- **Open findings recorded, not fixed.** (a) `UNBRANDED_BRAND_SLUG` is a *sentinel*, not a *reserved* slug: `read.ts` maps that slug to `brand: null`, so an owner-created brand whose slug happened to match would silently lose its brand and disappear from the brand filter. The real fix is deciding whether `product.brand_id` should be nullable (a data-model/owner question, ADR 0011 section 4); until then the admin brand path should refuse the reserved slug rather than merge with it. (b) The cart seeds its known-id registry **during render** and hydrates **once per browser session**, so a line whose product later leaves the catalog stays in `localStorage` - invisible to the UI and excluded from totals, but able to consume the line cap and to reappear if the product returns. (c) `listPublishedProducts` reads the whole catalog with one image query per product and no limit: correct at 22 products for a single-store catalog, but a **scale limit, not a pattern to keep**. (d) **F9** (the origin check preferred `x-forwarded-host` over `host`) and **F10** (password-hash robustness on a corrupt credential row), open since Phase 12/13, were **fixed** in the security-hardening change recorded above; `docs/security.md` records what remains - the `TRUST_PROXY_HEADERS` opt-in stays off, and the framework-level protocol dependence on `x-forwarded-proto` is a residual, not a claim of elimination.

## Backend audit result (Phase 7)

| Question | Answer |
| --- | --- |
| Environment | Production multi-tenant SaaS (Zatiq Easy, Vercel-hosted). No staging tenant exists |
| Access | Read-only, authorized. Credentials read from `.env` in-process; never exposed |
| Modules inventoried | Orders, Products, Categories, Customers, Courier, Manage Shop (13 sections), Promo Codes, Analytics, Themes, Theme Builder, Landing Pages, Mobile App, Spotlights, Users & Permissions, Subscription |
| Documented API | **None found** |
| Audited tenant catalog | **Empty** - 0 products, 0 categories |
| Live storefront | 24 products under Zatiq shop id `42239` |
| Data modified | None |

**Blocking finding:** the audited tenant is empty while the live storefront publishes 24 products. Until the owner confirms whether the supplied credential owns that shop, no catalog integration can be designed and every capability conclusion is provisional.

## Strategic direction (approved 2026-10-11)

The owner has approved an **independent e-commerce platform**: QueenBee's builds and owns its own backend, database, admin dashboard, analytics and commerce workflows. Full decision: `docs/decisions/0004-independent-platform-direction.md`.

**Product model (ADR 0008, 2026-10-11).** QueenBee's is a **single-store, owner-operated shop** - one owner selling this store's own goods to this store's own customers. It is **not** a marketplace, multi-vendor platform, SaaS store builder or hosted store platform. No third-party merchants, vendor onboarding, seller dashboards, commissions, payouts or tenant isolation exist or are planned. "Merchant" survives only where accurate: **Zatiq Easy** (a genuine third-party multi-tenant SaaS), the **payment counterparty** (this store's own bKash/Nagad account), and catalog **provenance tags**. Full reasoning: `docs/decisions/0008-single-store-product-model.md`.

The Zatiq Easy dashboard is now a **UX and feature reference only** - not a target backend and not a platform dependency. The previous plan to integrate with it is withdrawn. The Phase 7 audit findings remain as reference material.

Supporting documents produced in Phase 8: `docs/platform-architecture.md` (architecture proposal, evaluated options, open decisions), `docs/admin-dashboard.md` (dashboard scope and analytics design), `docs/migration-plan.md` (catalog migration workflow).

## Production readiness

**Not production-ready, and not deployed.** The public application serves the imported catalogue and stays `noindex` until the owner chooses to launch (it is no longer presented as a demonstration - ADR 0020), and the backend exists **locally**: the database foundation (Phase 11), owner authentication and catalog management (Phases 12-13), the database-backed storefront catalog (Phase 14), and customer accounts with atomic order creation (Phase 15). **Cash on Delivery is the only payment method (ADR 0015)**; delivery charges, courier recording, cash collection/reconciliation and the post-dispatch lifecycle are not built, and **no cloud resource, credential or deployment exists**. Frontend checks do not establish backend, payment, privacy, operational or production security. Do not remove `noindex` (that is the owner's launch decision, AUD-08), and do not submit real orders.

## Current phase and gate

**Phase 11 is complete, locally.** The database foundation exists: the 39-table schema (**40** now that Phase 12 added `staff_recovery_token`), reviewed SQL migrations, a server-only typed data-access layer, strict environment validation, migration tooling, least-privilege grants and a test suite that exercises the schema constraints and the Phase 10 concurrency invariants against real PostgreSQL. `docs/database.md` documents the workflow and its limits.

**Nothing is deployed and no QueenBee's-bound cloud resource exists.** No Neon project, branch, database, role, credential or object-storage bucket for this product has been created, and no DNS or production configuration has changed. The only Neon resource reachable from the account belongs to a **different product** and is **out of scope**: it must not be queried or modified. Provisioning requires separate explicit owner authorization - approval of a provider (ADR 0005) is not approval to provision it.

**Owner decisions recorded (2026-10-12, ADR 0009).** **D10 is settled:** administration is **owner-only**, multiple owners are permitted and each has full access, there are no staff or support roles, and no permission-management system is in the launch surface. **D13 is settled in shape:** owner authentication is first-party **email and password**, with **Resend email verification and Google sign-in deferred** until the client confirms them. **D19:** product availability is an **owner-controlled In Stock / Out of Stock state**, and an out-of-stock product cannot be ordered. **D20:** the owner may **ban a customer after a confirmed fake order**, with a defined server-side enforcement boundary (sessions revoked, new orders and checkout refused). **D23:** customer/business activity records are kept separate from internal administrative and security records. One deliberate inconsistency is created and recorded: the Phase 12 role-management screen is **outside the approved launch surface** and needs a follow-up change (ADR 0009 section 3).


[Showing lines 1-109 of 421 (50.0KB limit). Use offset=110 to continue.]
## Phase 47 - checkout integrity, guest promo parity, explicit validation (2026-10-30)

**The defect was real and it was on the money path.** An approved feature (guest ordering, ADR 0024) could
not use another approved feature (promotion codes, ADR 0021): the promo preview route kept the
session-only guard after guest checkout shipped, so a guest could fill in the whole form and every code


[Showing lines 1-117 of 153 (50.0KB limit). Use offset=118 to continue.]
## Phase 50 - the product page shows every photograph (2026-10-30)

**The gap:** the catalog holds 1,919 image derivatives, the admin panel orders multiple images per product,
and the storefront render used only `images[0]` - so an owner who added a second photograph could not tell
whether it had been saved, and customers could not see it at all.

**The change:** a thumbnail strip under the main frame on `/products/[slug]`, rendered only when a product
has more than one image. Each thumbnail is a real button (keyboard operable) with `aria-pressed`
marking the chosen one; the main `ProductPhoto` swaps to the chosen image and keeps a product description
as its alt text. The strip scrolls inside its own box (`overflow-x: auto`, `contain: layout paint`) so a
17-photograph product cannot widen the page, and thumbnails are 72px at 3:4 - above the phone's 40px
touch floor and small enough that five fit across 390px. Two keys added (i18n 1277).

**Verified 2026-10-30:** `typecheck`, `lint` 0 errors (3 pre-existing warnings), `check:i18n` 1277 keys,
unit **208/208**, `build` green. Against the real imported catalogue: `/products/facial-sheet-mask`
renders **17** thumbnails and a single-photograph product renders **0**; headless Chromium at 390px **6/6**
(17 thumbnails, one pressed initially, no overflow, choosing the fifth moves `aria-pressed` and swaps the
main frame, alt text preserved). The admin list's row photographs were re-checked on the same catalogue
(25 rows / 25 images on page one).

**Also recorded here - the local demo session:** the project is running at `http://localhost:3000` against
the persistent development cluster (1,605 products). Because no password was recorded for
`demo@queenbees.test`, a single-use credential token was issued for it through the application's own
issuer and redeemed at `/admin/redeem`; the password is **`queenbees-demo-2026` in this local database
only**, and other sessions for that account were revoked. `127.0.0.1` must not be used for the dev server:
Next 16 blocks its own dev resources on a foreign host and no page hydrates.

**Not done, and not claimed:** `verify:browser`, `verify:admin`, `verify:ui`, real devices and screen
readers. Nothing is deployed.


## Product listing redesign (client request, 2026-10-30)

The client asked for the listing pages to be redesigned rather than restyled. `/products` and
`/categories/[slug]` now share one listing view, `CatalogView`, with a compact page header, a bordered
filter rail, a toolbar, active-filter chips, a 4:5 listing card and a phone drawer. The filter model
was extended to what the catalog can actually support: **multi-brand** (repeated `brand`), **price**
(whole taka in the URL, integer poisha in the query) and **availability** (the owner's two states).
Category stays a single choice expressed as a route, and the flat taxonomy is rendered flat because the
storefront accessor exposes no parent. Every facet count and price bound is derived on the server from
the same snapshot the grid renders; there are no fixture or hard-coded counts.

**Behaviour that was verified locally (22-product seeded catalog, production build, headless Chromium):**
one brand filters and becomes a removable chip; two brands match either value and compose as an OR;
availability shows only in-stock rows; a 100-700 Tk range returns only prices inside it; an inverted
range is refused in words with no URL change; sort rewrites the URL and orders the grid; the category
rail link opens the category route and marks its row current; All categories returns to `/products`;
a refresh preserves brand, availability and sort; search submits on Enter, narrows the grid, clears and
states an empty result; removing a chip unchecks its rail control; the 1024px layout is three columns,
1280px four, 768px three with the drawer button, 390px two with a full-width listing search. The phone
drawer opens as a modal, traps focus, locks body scroll, commits a draft on Apply, closes on Escape and
returns focus to Filters. **12/12** interaction checks and **12/12** search/state checks passed. One
earlier probe assertion compared a mid-transition opacity with `1` and was corrected without a product
change; the final run measures the settled control.
No horizontal overflow was measured at 390, 768, 1024, 1280 or 1440.

**Full `verify:browser` ran (2026-10-30) against the same served 22-product production build: 97/97
checks passed**, with the two stated `created_at` recency skips. The run also added a durable check that
the desktop rail is static and does not scroll inside itself. Three failures in the first run were real
and corrected: the 320px listing overflow came from grid tracks sizing to the toolbar's min-content, so
the results/toolbar/body tracks are now explicitly `minmax(0, 1fr)` (checks 38 and 44); and the suite's
compact-search selector matched `/products` exactly while the 1024-1199px control links to
`/products#catalog-search`, so it counted zero surfaces (check 42b). **Still not run, and not claimed:**
`verify:storefront`, `verify:admin`, `verify:ui`, real iOS Safari, Android Chrome or screen readers;
pagination against a catalog larger than one page (the local seed is 22 products); out-of-stock
rendering (the seed is all in-stock, though the filter branch is unit-tested); and the imported
catalog's long brand and category lists (the rail's Show more and truncation paths were exercised only
on the five-category, thirteen-brand seed). Types, lint (0 errors), `check:i18n` (1,314 keys),
`check:catalog`, unit **214/214**, `check:secrets`, `db:validate` and `build` were run. Nothing is
deployed.


## Sidebar refinement (client feedback, 2026-10-30)

The client's next note was specific: the sidebar was too big and "scrollable by default". The cause was
the rail's own `position: sticky` plus `max-height` and `overflow-y`: on an ordinary laptop it became
a second scroll container, so the filters had to be scrolled inside the page as well as scrolling the
page itself. The rail is now **static** - no sticky, no max-height, no inner overflow - and the page is
the only scroll container. It also opens as a contents list: Category is open, Brand/Price/Availability
start collapsed, and a section with an applied filter opens by itself and states the value in its header
("Brand 1 selected", "Price Tk 100 - Tk 700", "Availability In Stock"). Brand shows six options and a
"Show N more brands" row; Price uses a compact bounds row with Apply and Reset instead of a full-width
Apply; section headers are 40px targets with a full-row hover/focus state.

**Measured at 1280x800 on the seeded 22-product production build:** the default rail is **511px** tall,
ends at **742px** inside an **800px** viewport, and reports `scrollHeight - clientHeight = 0` with
`position: static` and `overflow-y: visible`. Opening Brand gives six options and "Show 6 more brands";
choosing one states "1 selected" and keeps zero inner scroll; collapsing it keeps the summary; applying
Tk 100-700 and In Stock adds their summaries; a filtered URL reopens Brand, Price and Availability with
the summaries intact. The phone drawer opens with three sections collapsed, traps focus, applies a brand
and returns focus to Filters; no horizontal overflow at 390. A second probe covers the disclosure and
the no-inner-scroll rule **10/10**. The full `verify:browser` then passed **97/97** on the same build,
after the 320px grid-track overflow and the suite's compact-search selector were corrected; its new
check 6b pins the static, non-scrolling rail.


## Phase 51 - homepage revision (2026-11-02)

Owner feedback on the homepage, and what changed in answer to it:

- **Pastel section fields removed.** The hero, the offer row and the brand row sat on lavender and pink
  panels; the page is now one canvas, and the campaign band uses the same bordered surface as a card. The
  hero keeps its composition - its redesign is the owner's next taste decision.
- **Explanatory lines removed from every section.** "Priced below their published comparison price" and its
  seven siblings are gone, from the page and from the dictionary.
- **One carousel, one card size.** `src/components/Carousel.tsx` replaces the offer-only slider: a CSS
  scroll-snap track with measured page counts, `aria-current` dots and desktop paging buttons. Its
  `size="product"` reproduces the featured grid's track exactly, so On offer (10), Recently added (10) and
  the featured grid draw the same card at the same width.
- **Category circles (10) and brand cards (10)** ride the same carousel. The category hover no longer clips:
  the ring and lift became a border on the circle's own box, a zoom the circle crops, and an inset outline.
  The brand row became a card per brand (the owner's Ghorer Bazar reference, anatomy only).
- **Row counts on a phone**: featured draws four of five cards, "More to explore" eight of ten (nine between
  720px and 1199px, ten from 1200px). CSS hides the extra cards; nothing is duplicated or re-ordered.
- **The footer is short**: no department directory, two groups of three links and the year.
- **Brands is its own destination**: last item of the desktop navigation, fourth tab of the phone bar (six
  tabs), a footer link, and no longer a teaser block on `/categories`.

**Verified locally:** typecheck, lint (0 errors), `check:i18n` (1,360 keys), `check:catalog`, `check:secrets`,
unit **214/214**, `build`, hand-driven headless Chromium at 360/390/768/1024/1440 (sections, dots, card
counts, tab-label widths, zero horizontal overflow), and `verify:browser` **91/97** against the served build.
The six failures are explained, not outstanding work: four are data-limited (this database holds the
22-product seed, so it has 2 featured products, 4 offers and 5 categories against checks that expect 5, 5+ and
10), and two read the product page, where the uncommitted Phase 50 gallery renders 24px dot buttons and lazy
photographs below the fold - neither file is touched by this change. The row limits (10/10/10/10 and two browse
rows) are reached only by the imported catalogue. Real devices and screen readers remain unverified. Nothing
is deployed.


## Phase 51 - homepage hero carousel (2026-11-04)

Implemented locally and not deployed. The homepage's first screen is now the owner's ordered image
carousel, and the sequence is read from `hero_image` on every request. Migration
`0013_homepage_hero_images` adds the 47th table; `npm run assets:hero` generates the 800/1600px WebP and
JPEG variants from the masters in `hero/`, and Settings -> Homepage hero associates them: 1..10 images,
manual order, required descriptions, audited writes. There is no upload - the shop's asset pipeline owns
files and the database owns which of them the carousel shows. The former copy, spotlight rows and
three-photograph collage are removed; an empty table renders no hero rather than a placeholder. Verified
locally with typecheck, lint, `check:i18n`, unit **207/207**, `tests/db/hero.test.ts` **5/5**, build, served
HTTP mutations and headless Chromium at 390 and 1440. `verify:storefront` reached **91/97** browser checks:
28/28b/28c/36/36b pass; the six failures are the already-recorded Phase 50 gallery checks (8, 20) and the
seed's data limits (27, 31, 35, 36d: 2 featured, 4 offers, 5 categories), so the customer HTTP flow was not
reached. `verify:admin` reached **198/200**, with the hero route in the control-scale sweep passing; its two
failures are a pre-existing Telegram removal-dialog flake and the documented absent-CSP check. Real devices,
screen readers and the imported catalogue were not used. Nothing is deployed and no
cloud resource exists.

## Phase 31 - one level of subcategory management (2026-11-06)

Owner-authorized and implemented locally, not deployed. `category.parent_id` already existed, so there
is **no schema change and no migration**. A category editor now offers a parent picker over live roots,
the service refuses self-parenting, grandchildren and moving a category with live children under
another, and a parent is locked to the top level in the UI as well. The admin list groups a child beside
its parent and labels it **In &lt;parent&gt;**; archive remains refused while a live child exists (archive
the child first). The storefront index, homepage rail, header drawer and filter rail show roots only; a
parent page lists its children and includes their products; a child breadcrumb names the parent; and
department counts include child products.

Verified with typecheck, lint (0 errors), `check:i18n` (1,462 keys), `check:catalog`, unit **212/212**,
`tests/db/catalog.test.ts` **36/36**, `build`, and `verify:admin` **202/205** (the three failures are the
pre-existing category-visibility hydration race, Telegram removal-dialog flake and the documented absent
CSP). A dev-server walk-through created a child under Skincare, checked the count/lock, moved it to top
level and back, and observed the storefront index, parent strip/listing and child breadcrumb.
`verify:storefront` completed **91/97** once a stale escaped regex in `scripts/verify-browser.cjs` was
corrected (it previously aborted at check 26). The six failures are on untouched surfaces: checks 8 and
32 (product-page image/price), 20 (24px gallery dots), 27d (section link), 36d (the seed's five
departments) and 40b (favicon ink). Real devices and screen readers were not used. Nothing is deployed.

## Site-open offer popup (2026-11-06)

Implemented locally, not deployed. Settings -> Offer popup edits the `offer_popup` singleton (migration
`0014_offer_popup`, schema 47 -> 48 tables): one image, one description, one active switch. The image is
uploaded through `saveUpload`; `saveOfferPopupUpload` chooses the square or 16:9 frame from the file's own
ratio. The storefront layout reads the active row and `OfferPopup` opens once per browsing session as an
accessible modal (Escape, backdrop, body lock, focus return). No scheduling, exit-intent, countdown,
claim or link.

Verified with typecheck, lint (0 errors), `check:i18n`, `check:catalog`, unit **212/212**,
`tests/db/catalog.test.ts` **38/38**, `db:validate` (48 tables), `build`, `verify:admin` **206/208** (the
two pre-existing Telegram-dialog and absent-CSP failures) and a dev-server walk-through of a square popup,
a wide popup, dismissal and session memory, and the inactive state. Test uploads were removed.

## Category and brand editors (2026-11-06)

Implemented locally, not deployed. Category create/edit and brand create/edit are full pages with the
same sticky action bar and the shared `CatalogImageField`. The category photo or brand mark is uploaded
from the browser (or chosen from `public/catalog`) and saved **with** the record in one multipart
transaction; the old image-only routes and the edit-only image section were removed. Brand creation is
now `/admin/catalog/brands/new` rather than a disclosure on the product list, and the brand editor
edits names, slug and mark with `catalog.brand_updated` audit.

Verified: typecheck, lint (0 errors), `check:i18n`, unit **212/212**, `tests/db/catalog.test.ts`
**37/37**, `build`; a dev-server walk-through created a category with an uploaded photo and a brand with
an uploaded logo, renamed the brand, removed both images and checked the stored keys and audit rows;
`verify:admin` **204/207** (two pre-existing Telegram removal-dialog checks and the absent-CSP
assertion). No schema change.

## Storefront egress reduction (2026-11-07)

The production recovery exposed the real cost driver: the 5 GB Neon Free allowance is **network
transfer**, not disk. The database was 13 MB and the catalog bucket 630 MB; the spend came from
re-reading the full catalog on every dynamic storefront request and serving every image from Neon.

Two changes address it:

- **Catalog snapshot cache.** `getStorefrontCatalog` now reads through `unstable_cache` tagged
  `storefront-catalog` (five-minute TTL backstop). Every catalog write route invalidates the tag after
  commit, so availability, product, category, brand and image changes appear on the next request.
  Verified locally against the production database: six page requests produced **one** catalog read,
  and toggling a product between `in_stock` and `out_of_stock` produced exactly one fresh read per
  change.
- **Image edge cache.** `/catalog/[...path]` now proxies the bucket object and returns it with
  `Cache-Control`, `CDN-Cache-Control` and `Vercel-CDN-Cache-Control` set to one year, `immutable`.
  The first request per object still reaches Neon; repeat requests are served by Vercel's edge.
  Verified directly against the production bucket: `200`, `image/webp`, immutable headers, 31,864
  bytes.

Development and the unit/database tests bypass the cache; they import the loader outside a Next
server, where `unstable_cache` has no incremental cache.

## Production recovery (2026-11-06)

The live Vercel deployment failed because the original Neon Free project exhausted its **5 GB/month
public network transfer** allowance; every database request returned HTTP 402. Under the owner's
direction the site was moved to a fresh Free project (`autumn-wave-01272789`, branch `production`) and
restored from the 29 Oct dump. The owner confirmed only catalog data was needed: **1,605 products,
15 categories, 245 brands and 1,919 images** were restored; later order/customer history was not carried
over. Migrations 0013 and 0014 were applied and `db:validate` passes with 48 tables.

Catalog bytes were re-uploaded from `public/catalog` and `public/hero` into the new
`queenbees-catalog` bucket (**10,104 objects**). Vercel's `DATABASE_URL`, `CATALOG_STORAGE_*` and
`CATALOG_ASSET_BASE_URL` now point at the new project, and `CATALOG_ASSET_VERSION` was bumped to 4 so
browsers do not follow a cached redirect to the exhausted bucket. Live checks: storefront 200, admin
login 200, authenticated dashboard 200, all sampled catalog images 200 after the bump.

## Overview refresh (2026-11-06)

Implemented locally and not deployed. The overview now uses the reference's information architecture
without the SaaS product: greeting and subtitle, **View storefront** and **Add product**, five icon KPI
tiles (revenue today, orders today, active products, total customers, waiting on a call), a revenue
panel with average/peak/items above the chart, the order-status ring, recent orders including guests,
and a closing row of **Out of stock**, **Top selling** and **Quick actions**. The COD worklist remains
first. Traffic, low stock, themes/builder/app/vendor links and subscription prompts are absent by rule.

Verified with typecheck, lint (0 errors), `check:i18n`, unit **212/212**, `tests/db/admin-orders.test.ts`
**12/12** (including a guest recent-order case), `build`, `verify:admin` **203/206** with the three
pre-existing failures, and Chromium at 1280 and 390 (five tiles, three closing panels, six actions, no
horizontal overflow). No schema change and no migration. Real devices and screen readers were not used.


## Production schema lag: the visit log (applied 2026-11-07)

`/admin/analytics` returned the admin error boundary in production with
`relation "visit_session" does not exist` (`42P01`) while every other admin page loaded. The deployment
(`dpl_H6srHpHSu1zUNeJfi1XCakEbTi5P`) carried the traffic block from ADR 0027, but migration
`0015_free_thunderbolt` had never been applied to the production database: it held **48** tables and a
migration history ending at `0014_offer_popup`.

The same gap had a second, quieter effect: `POST /api/checkout/order` calls `markOrderPlaced` inside the
order transaction for any visitor carrying the `qb_visit` cookie, so an order placed from a tracked
browser was refused rather than recorded.

**Fix.** `0015_free_thunderbolt` was applied to `autumn-wave-01272789` / branch `production` / database
`queenbees` in one transaction as the owning role `queenbees_owner` - the two tables, the foreign key,
the four indexes - and Drizzle's history row was written with the file's own SHA-256 and the journal's
`when` (`1794036259343`), so `db:status` reports the same history the migrator would have written. No
code changed.

**Verified.** Public tables **50**; `visit_session` and `visit_event` present with 6 indexes and 8
constraints; migration history 16 rows, latest hash `396de18d…`; the exact failing statement now
returns (`visits`/`views`/`live` all `0`); a real `POST /api/track` from a normal user agent answered
**204** and created one session, which was then removed so production traffic starts empty. `/admin/analytics`
still answers **307** to `/admin/login` for an anonymous request, which is the correct refusal.

**Not verified:** an authenticated load of `/admin/analytics` in production - no owner credential is
available to this session. The data path behind it was exercised directly against the production
database instead.

The deploy sequence this exposed - code first, migration never - is now written into
`docs/database.md` (Rollout sequencing).

## Dispatch slip (2026-11-07)

Implemented locally, not deployed. `/admin/orders/[orderNumber]/slip` is the paper a COD parcel travels
with: reference, recipient, phone, the composed address with its delivery area, the customer's note, the
frozen lines with quantities, and **Amount to collect** with subtotal, implied discount and delivery above
it. It requires exactly `order.read` (a limited principal with that permission reads it; the customer
email, account state, order id, payment state and courier costs are never printed), a missing order is a
404, an anonymous request is sent to `/admin/login`, and the page writes nothing - no state change, no
event, no audit row. The order detail gained a **Print slip** control that opens it in a new tab.

The route lives in a `(print)` group under `/admin`, outside the `(app)` shell, so the rail and tab bar are
not part of the document. One stylesheet serves A4 and an 80mm roll: `@page { margin: 8mm }`, and under
`@media print and (max-width: 30rem)` the unit-price column is dropped and the headers shrink so quantity
and amount fit 64mm of content. The screen's controls and its gap note are hidden on paper. **There is no
shop contact block:** no shop phone or address is stored anywhere, so the screen states that gap rather
than printing a placeholder. No schema change, no migration, no new permission.

Verified with typecheck, lint (0 errors, 2 pre-existing warnings), `check:i18n` (1,557 keys),
`check:catalog`, unit **218/218**, `build`, and `verify:admin` **214/215** - the one failure is the
documented "no CSP is claimed" assertion. The suite's new checks: the slip over HTTP (content, limited
`order.read` access, anonymous 307 to sign-in, missing 404, no email/payment/cost state), `window.print`
never called on load and called once on click, the screen wrapper hidden and the price column dropped at
80mm but kept at A4, no horizontal overflow at either width, and Chromium rendering **one A4 page** and a
**1-3 page 80mm roll**. `npm run verify:storefront` was not re-run for this change; real printers, real
iOS Safari, Android Chrome and screen readers were not used.

## Contact and policy surfaces (2026-11-07)

Implemented locally, not deployed. The shop can now publish **its own** contact facts and policy text:
`store_setting` keys `contact.phone`, `contact.hours`, `contact.address`, `policy.delivery`,
`policy.returns`, `policy.privacy`, `policy.terms`, edited at **Settings -> Contact and policies**
(`settings.write`, audited `settings.contact_updated`). No schema change and no migration.

The storefront gained `/contact` and `/policies/[policy]` (`delivery`, `returns`, `privacy`, `terms`).
Nothing is invented: a blank field is not rendered, the contact page states which facts are missing, an
unwritten policy page states that the owner has not published it, and the footer's Help column links
contact always and each policy page only once it has text. Free text is refused if it contains `<` or `>`
rather than being stored for a later render, the phone must be dialable (6-15 digits plus `+ - ( )` and
spaces) so `tel:` never carries a sentence, and every edit shares the caller's transaction with its audit
row. The copy that said "contact the store" now renders a `/contact` link at checkout, in the account
recovery copy and on the order receipt (cancelled, returned and failed-delivery states plus the legacy
payment note), so the promise resolves.

**Owner content is still missing, deliberately.** No phone number, hours, address or policy wording was
supplied, and none was written: production will show the stated gaps until the owner fills the fields.

Verified with typecheck, lint (0 errors, 2 pre-existing warnings), `check:i18n` (1,604 keys),
`check:catalog`, unit **218/218**, `build`, and `verify:admin` **224/225** - the one failure is the
documented "no CSP is claimed" assertion. The nine new checks cover the settings screen and its fields,
a save that stores all seven keys and audits its actor, an undialable phone and markup refused without
changing anything, the contact page's phone/hours/address and `tel:` target, a written policy page versus
an unwritten one and a 404 for an unknown slug, the footer's population rule, the saved values prefilling
the admin screen, and Chromium at 1440 and 390 with no overflow. `verify:storefront` and
`verify:browser` were not re-run for this change; real devices and screen readers were not used.

## SteadFast courier booking (2026-11-08)

Implemented locally, not deployed. Approving a confirmed COD order in `/admin/orders-cod` now books the
parcel with **SteadFast** immediately after the approval commits, and the consignment id, tracking code
and courier status are stored in **`steadfast_consignment`** (migration `0016`, schema 50 -> **51
tables**, one row per order). The courier account is entered at **Settings -> Integrations -> SteadFast**
(`settings.write`): `Api-Key`, `Secret-Key` and a switch that is **off by default**. The keys live in
`store_setting`, never reach the browser (`••••` plus the last four characters only), are never logged,
redirected or audited as values, and are removed by a confirmed action. **Test connection** reads the
account balance with the saved keys.

Booking runs in its own transaction after the approval, so a courier outage cannot undo the owner's
decision: the order remains `cod_approved` / `confirmed`, the failure is audited
(`order.steadfast_booking_failed`) and the order screen offers **Send to SteadFast**. One consignment per
order is enforced by a unique `order_id`, a unique `invoice` and a transaction-scoped advisory lock. A
booking, a failure and a **Refresh status** never touch `order.status`, `order.cod_state`, payment,
refund or stock - SteadFast's `delivered` is stored with the time it was read, not applied to the order.
The amount to collect is the frozen `total_minor` in BDT, the invoice is the order number, and the
address is composed from the stored line plus area, city and postcode.

Verified locally with typecheck, lint (0 errors), `check:i18n` (1,666 keys), `build`, unit **238/238**
(20 new), `db:migrate`/`db:validate` (51 tables) and two HTTP smokes through the real admin routes against
a **stub** courier: keys saved and masked, balance read, an approval booking the exact payload, the order
page showing the consignment, a refresh storing `delivered` without moving the order, a second send
answering "already booked" with one row, a non-bookable order refused with an audit entry, the account
removed, and - with the stub down - an approval that still succeeded, wrote no row, audited the failure
and offered the retry. `verify:admin`, `verify:browser`, `verify:storefront`, the db suite, the live
SteadFast API, real devices and screen readers were not run. Nothing is deployed.

## Conditional and repeat-customer pricing, and payment instructions (2026-11-08)

Implemented locally, not deployed. Settings -> Delivery charges now holds three optional rules beside
the existing default and district charges, stored as eleven additive columns on `delivery_setting`
(migration `0017_pricing_rules`, schema unchanged at **51 tables**, every rule off by default):
**conditional delivery** (a lower charge above a configured goods subtotal, priced for Dhaka,
Chattogram and the rest), **repeat-customer delivery** (Chattogram has its own rate; Dhaka and other
districts share the second; it outranks conditional pricing) and an **automatic repeat-customer
discount** (whole percent above a minimum).

One pure resolver - `quoteOrderDelivery` in `src/lib/delivery.ts` - is used by the cart, the checkout
preview and `createOrder`, so the shown price and the stored snapshot cannot disagree. The hierarchy is
repeat -> conditional -> district override -> default -> refusal, and a **guest stops at the district
override**. "Repeat customer" is `order.status = 'completed'`, read inside the order transaction: a
pending, cancelled, rejected or unpaid order does not count. The automatic discount is added to any
promotion code and the pair is capped at the goods subtotal; `order.discount_minor` and
`order.shipping_minor` keep the snapshot the customer was charged.

Checkout also publishes a **static payment notice** (owner decision, 2026-11-10): the four Bangla lines in
`CHECKOUT_PAYMENT_NOTICE` (`src/data/payment-instructions.ts`) - the 500 BDT advance-delivery rule, the
advance-payment instruction naming Business WhatsApp **01871161571** with the WhatsApp mark beside it, the
gift terms, and the Cash on Delivery sentence - are printed verbatim and are **not** editable in the admin.
`payment.instructions` is no longer read or written. Still settings, edited at **Settings -> Other settings
-> Advance payment**: the bKash Advance number with a copy button, its show/hide switch, the "Payment, not
Send Money" caution and the subtotal below which the delivery charge is expected in advance; markup is
refused. The separate WhatsApp number card and its setting were removed rather than kept beside the inline
number. **Cash on Delivery remains the only method an order records:** no payment state, claim, screenshot
upload or verification queue exists, and the block is an instruction the owner confirms on the phone.

Verified for the static notice with typecheck, lint (0 errors), `check:i18n` (1781 keys), `build` and unit
**294/294**; the browser and admin suites were not re-run, and nothing was deployed.

Verified with typecheck, lint (0 errors, 2 pre-existing warnings), `check:i18n` (1,714 keys), `build`,
unit **251/251**, `db:migrate`/`db:validate` (51 tables, 191 checks), an HTTP settings walk-through
(four saves, audit rows, a half-configured rule refused), ten `createOrder` matrix scenarios matching
the brief, and Chromium at 1440px and 390px (owner copy and copy control, default vs conditional vs
repeat rates, the 5% row, the advance line below 500 BDT, the rules-off fallback in checkout and cart,
no horizontal overflow). `verify:admin`, `verify:browser`, `verify:storefront`, the db suite, the
clipboard write, real devices and screen readers were not exercised. Nothing is deployed.

## Customer email account security (2026-11-08)

Implemented locally, not deployed. Customers can recover a password by email, change their password
and change their registered address; **registration and sign-in are unchanged and never require email
verification**, and no verification mail exists.

Recovery: `/account/forgot-password` mails a single-use link through **Resend** (256-bit token, stored
only as a SHA-256 digest, one hour, throttled by address and source), `/account/reset` sets the new
password and revokes every session. The request answers **identically** for a registered address, an
unknown one, a suspended account, a malformed one, a throttled caller and a provider failure. The
owner-issued one-time code (ADR 0019) remains for a customer who cannot reach the inbox. The account
page adds a password change (current password required, all sessions revoked, one replacement minted
for the current browser) and a two-step address change (current password required, confirmation mailed
to the **new** address, nothing changes until that button is pressed, every session revoked and the
previous address notified). Migration `0018_customer_email_change` adds `customer_email_change` and one
session-revocation reason; schema **52 tables**, additive.

Email is server-only: `RESEND_API_KEY`, `EMAIL_FROM` and `APP_BASE_URL` come from the environment,
`APP_BASE_URL` is required in production or no link is sent, and `RESEND_API_BASE_URL` is a
development-only seam. Four branded templates use `#A680FF`, `#F6B3CC` and `#56358C` with escaped
values and plain-text alternatives. **Administration was not modified**: the owner signs in exactly as
before, and a customer cookie still cannot reach `/admin`.

Verified with typecheck, lint (0 errors, 2 pre-existing warnings), `check:i18n` (1,759 keys), `build`,
unit **264/264**, `db:migrate`/`db:validate` (52 tables, 194 checks), a 59-check stub-Resend HTTP flow
covering every flow plus reuse, expiry, enumeration parity, throttling, CSRF refusal, session
revocation and admin isolation, and Chromium at 390px for the three new pages and the two account
forms. `verify:admin`, `verify:browser`, `verify:storefront`, the db suite, real inboxes, real devices
and screen readers were not exercised. Nothing is deployed.

## Production migration catch-up (2026-11-08)

`https://queenbees.vercel.app/admin/settings/delivery` rendered the admin error boundary. Vercel runtime
logs gave the cause: `column "conditional_enabled" does not exist`, from the delivery page's own
`loadDeliveryRates` select. Production was at **16 applied migrations** while the deployed code expects
**19**, so the three migrations authored after the last release had never been applied:

| Migration | Adds |
| --- | --- |
| `0016_steadfast_consignments` | `steadfast_consignment` |
| `0017_pricing_rules` | eleven `delivery_setting` columns and their checks |
| `0018_customer_email_change` | `customer_email_change`, the `email_change` revocation reason |

All three were applied to Neon project `autumn-wave-01272789` (branch `production`, database
`queenbees`) in order, each in its own transaction, and recorded in `drizzle.__drizzle_migrations` with
the same content hashes the runner computes - so a later `db:migrate` sees them as applied instead of
replaying them. Verified against the live database: **52 tables, 19 applied migrations**,
`delivery_setting` has 15 columns, both new tables and their eight indexes exist, the pricing range
checks are present, and the session check accepts `email_change`. The exact failing select and the
district-override select both return cleanly now, and anonymous `/admin` and `/admin/settings/delivery`
answer **307 to the sign-in page** rather than the error boundary. The storefront (`/`) and
`/account/login` answer 200.

**Two gaps found while checking, both owner actions:**

1. **Delivery is unconfigured in production.** `delivery_setting` has no row and no district override is
   active, so `quoteDelivery` refuses and checkout cannot place an order. The values are owner inputs and
   were not invented; **Settings -> Delivery charges** must be filled in (default charge, then Dhaka and
   Chattogram if wanted, then the optional pricing rules).
2. **The database credential appears in Vercel runtime logs.** A Neon connection error serialised the
   driver's client object, including the `queenbees_owner` connection string. The value is not repeated
   here. Rotation of that role's password and a review of what error objects reach the platform log are
   owner actions.

## One-time code recovery removed (2026-11-08)

At the owner's instruction the Phase 23 owner-issued one-time code is gone: the customer
`/account/recover` page and its route, the admin **Issue a code** panel with `POST
/api/admin/customers/recovery` and its dismiss route, `src/server/customer-auth/recovery.ts`, the
`customer.credential_reset` permission and its catalogue/label/implemented entries, and the code links
on sign-in and the forgot-password page. The account page's quiet "Password" card was removed with it.
Recovery is the mailed single-use link (ADR 0030, amended); the `account_recovery_token` table stays
because the self-service reset stores its digest there, and historical audit action codes are
untouched.

**Email is configured for the URL, not for sending.** `APP_BASE_URL` was added to the Vercel project,
but **`RESEND_API_KEY` and `EMAIL_FROM` are absent**, so `emailConfigured()` is false and
`sendEmail` returns `not_configured` without a request - which is why no confirmation mail arrived.
Both values must come from the owner's Resend account (with a verified sender domain), and a new
deployment is required before they take effect. A failed send now logs one line with the reason only.

## Checkout copy trimmed and Checkout instructions moved (2026-11-09)

Three statements the owner asked to remove are gone: the receipt's "Cash is paid to the courier on
delivery — there is nothing to pay online." body under **Order placed**, and the checkout payment card's
"needs the owner's approval before dispatch" and "only method in this release" lines. Each is removed
from the dictionary as well as the view, so nothing re-renders them; the order's method line, its status
and the status explanation still state the same facts.

The owner's advance-payment copy is now its own topic: **Settings -> Other settings -> Checkout
instructions**, with the number labelled **bKash Advance** on the checkout card. The block was already
`store_setting` data (`payment.instructions`, `payment.bkash_number`, `payment.send_money_note`,
`payment.advance_threshold_minor`); the editor moved off Contact and policies, `POST
/api/qbpanel/settings/payment` now redirects to the Other settings page, and the audit action is
unchanged (`settings.payment_instructions_updated`). One key was added: **`payment.bkash_visible`**
(text `true`/`false`, value type `boolean`, default on), the owner's explicit show/hide for the number
card. Off hides the card without deleting the number and still prints the paragraphs; a blank number
with the switch on keeps the stated "not published" line.

**No schema change and no migration** - `store_setting` is key/value, and the boolean value type was
already in its check constraint.

**Verification (2026-11-10, local, against the development cluster and a production build).**
`typecheck` clean, `lint` 0 errors (18 pre-existing warnings), `check:i18n` 1,776 keys with every
referenced key present, unit suite **273/273**, `build` success. A served build was then walked through
over HTTP and in headless Chromium: the panel's Other settings page renders **Checkout instructions**
with its own form beside the guest switch, Contact and policies renders no payment form; saving through
that form redirects to `?notice=paymentSaved` and writes the rows; with the switch **off** the checkout
payment card prints the saved paragraphs and no number or label, and with it **on** it prints
**bKash Advance**, the stored number, the copy button and the caution; the removed approval and
"only method" lines are absent; and a guest order placed through the rendered form lands on its receipt
under **Order placed** with the removed "nothing to pay online" sentence absent. `verify:admin`,
`verify:browser` and the db suite were not re-run for this change, and nothing is deployed.

## Search as you type, with one fuzzy matcher (2026-11-10)

Owner request: both search boxes should work in real time and fuzzily, with no press on the magnifier.

- **`src/lib/fuzzy.ts`** is the single matcher, with no dependency: exact field, prefix, word start,
  substring, letters in order, and one-character tolerance (substitution, insertion, adjacent swap).
  Terms under three characters are matched only as prefixes/substrings. Stores ranks, not probabilities;
  callers sort on the score with name and id as tie-breakers.
- **Storefront.** The listing's `ProductSearch` commits a trimmed term 300ms after typing stops and the
  `CatalogView` applies it with `router.replace`, so a search adds no history entries; the header field
  commits after 400ms (push from any other page, replace on `/products`), which is what makes typing a
  single letter open results. The submit button and `GET` form remain for Enter and no-JavaScript. The
  scope is unchanged (name in both locales, brand, pack - ADR 0011) and the default relevance sort now
  ranks by match strength.
- **Admin.** `listProductsForAdmin` ranks in memory when a search is present: it reads the live rows'
  name/Bangla name/slug/SKU, scores them with the same matcher, pages the ranked ids and loads full rows
  for that page only. A blank search keeps the original single paged query. `ListSearch` gained an
  opt-in `live` prop (300ms `replace`) that only the products list sets.
- **No new surface**: no endpoint, no client-side catalog index, no search dependency, no change to the
  admin search's permission or to the storefront's no-index rules.

## Per-product delivery charges (2026-11-10)

The owner asked for a product to be able to carry its own delivery charge, with three optional fields
(Chattogram, Dhaka, other districts), a blank field falling back to the store's charge, and the **lowest**
fee winning when a basket holds several. Recorded in ADR 0034, which amends ADR 0029's hierarchy.

- **Schema:** migration `0021` adds `delivery_chattogram_minor`, `delivery_dhaka_minor` and
  `delivery_others_minor` to `product` (nullable integers with non-negative checks). Additive; **52 tables
  unchanged**, `db:validate` reports 199 checks.
- **Resolver:** `src/lib/delivery.ts` gains `ProductDeliveryMinor` and `customDeliveryMinor`, and
  `quoteOrderDelivery` gained a fourth argument that answers first - before the repeat, conditional,
  district and default steps - so a product fee applies to a guest, is never re-priced by the rate rules,
  and can price an order with no default configured. Zero is accepted and means free delivery.
- **Threading:** the storefront catalog projection, the cart's compact product and the order lines each
  carry the three numbers, so the checkout preview and the order transaction call the same resolver with
  the same inputs.
- **Editor:** the product form's Shipping card became **Delivery charge** with the three optional money
  fields; the service parses them with `parsePoisha` (blank -> NULL, zero allowed), stores them, returns
  them for prefill and records them in the audit `before`/`after`.
- **Checkout:** a `source: 'product'` quote renders "A product in this order carries its own delivery
  charge for this area.", and `deliveryConfigured` now counts a product charge as configured.

**Verified (local dev cluster + production build).** `typecheck`, `lint` (0 errors), `check:i18n` (1,780
keys), unit suite **289/289** (six new precedence cases), `db:validate` (52 tables, 199 checks),
`db:check`, `build`. Through the running panel and storefront in headless Chromium: the editor renders
**Delivery charge** and prefill, fees saved as 40/60/90 BDT and 120/150/200 BDT; the checkout showed
Tk 60 for product 1 in Dhaka, **Tk 60** for the basket of both (lowest), Tk 150 for product 2 alone and
Tk 100 (the store's Dhaka override) for a product without a fee; a guest order of both products stored
`items_subtotal_minor = 140000`, `shipping_minor = 6000`, `total_minor = 146000` on the Dhaka area. Test
fees were then cleared and guest ordering switched back off; the test order remains in the local cluster.
`verify:admin`, `verify:browser` and the db suite were not re-run, and nothing is deployed.

## A WhatsApp number under the bKash block (2026-11-10)

Owner direction: the checkout payment card carries a WhatsApp number under the bKash number, with the
same copy mechanism, edited beside the bKash number in **Settings -> Other settings -> Checkout
instructions**; a number that is not set renders no block.

- **`payment.whatsapp_number`** is a sixth `store_setting` key with **no default**, so nothing is
  published until the owner saves one. It is validated as an 11-digit Bangladeshi mobile
  (`parseWhatsappNumber`), loaded and saved in the same transaction and audit as the rest of the block.
- **Checkout** renders a second card with the same label/number/**Copy number** control and its own
  copied state; a blank number renders nothing at all. `bkash_visible` still governs only the bKash
  block.
- **One form, both numbers**: the Checkout instructions editor gains the WhatsApp field beside the bKash
  number. No schema change and no migration.

**Verified (local dev cluster + served build).** `typecheck`, `lint` (0 errors), `check:i18n` (1,783
keys), unit suite **289/289**, `build`; through the running panel a WhatsApp number was saved and the
checkout showed both cards, the copy control put the number on the clipboard, clearing the number
removed the block, and guest ordering was left as it was found. `verify:admin`, `verify:browser` and the
db suite were not re-run, and nothing is deployed.

## COD approval note: placeholder, default on Accept, and an aligned row (2026-11-10)

Owner feedback on the overview worklist: the audit note was prefilled with "Confirmed by phone" and had
to be backspaced before every order, and the note/actions row was bottom-aligned so the buttons sat level
with the hint instead of the field.

- **The field is empty** with `Confirmed by phone` as its placeholder. `CodOrderCard` and the order
  detail's action band fill that default in their form `onSubmit` when the field is blank, and
  `POST /api/qbpanel/orders-cod` applies the same default for an approval, so the no-JavaScript path is
  unchanged. A typed note is validated (10-500) and stored verbatim; a rejection still needs its reason.
- **Layout**: `.approveFormRow` is now a one-column grid - note first, actions second and right-aligned -
  instead of a flex row with `align-items: flex-end`. At 1365px the input is 485-525, the hint 525-542
  and both buttons 550-590 (Accept ending on the field's right edge); at 390px the form stacks full width
  with no horizontal overflow.
- The hint now says what an empty note will record.

**Verified** on the served build against the dev cluster: the worklist showed an empty input with the
placeholder, clicking it left it empty, Accept recorded `cod.approved` with reason `Confirmed by phone`,
and a second order approved with a typed note recorded that note verbatim. `verify:admin`,
`verify:browser` and the db suite were not re-run; nothing is deployed.

## Hero banner descriptions are optional (2026-11-10)

Owner direction: the homepage hero's per-image description was required and did not need to be.

- **Migration `0022`** drops `NOT NULL` from `hero_image.alt_text` and changes its `CHECK` to
  `NULL or char_length between 1 and 200`. Existing rows keep their text; **52 tables unchanged**,
  `db:validate` reports 200 checks.
- **Service**: `HeroImageRow.altText` is `string | null`, `parseAltText` maps blank to `null` and still
  bounds a supplied description at `HERO_ALT_MAX`.
- **Editor**: both description fields are labelled `Description Optional` and are no longer `required`;
  a row without one reads "No description (decorative)".
- **Storefront**: `HeroCarousel` renders `alt=""` for a null description rather than fabricating one.

**Verified** on the served build against the dev cluster: the hero editor showed the optional labels,
saving a blank description stored NULL and the row displayed the decorative label, the storefront banner
rendered `alt=""`, and restoring the text brought the description back. `verify:admin`, `verify:browser`
and the db suite were not re-run; nothing is deployed.

## Offer popup description is optional (2026-11-10)

Same owner direction as the hero banner: the popup's description was required and does not need to be.

- **Migration `0023`** drops `NOT NULL` from `offer_popup.alt_text` and changes its `CHECK` to
  `NULL or char_length between 1 and 200`. Existing rows keep their text; **52 tables unchanged**.
- **Service**: `OfferPopupRow.altText` is `string | null`; `parseAltText` maps blank to `null` and still
  bounds a supplied description at `OFFER_POPUP_ALT_MAX`.
- **Editor**: the field is labelled `Description Optional`, is not `required`, and the help says a blank
  one gives the popup a plain "Offer" label.
- **Storefront**: the dialog's `aria-label` is the owner's description when present, otherwise the
  dictionary string `popup.label` ("Offer"); the image keeps `alt=""` because the dialog is the labelled
  surface.

**Verified** on the served build against the dev cluster: the editor accepted a blank description, and
the popup dialog rendered `aria-label="Offer"`. `verify:admin`, `verify:browser` and the db suite were
not re-run; nothing is deployed.

## Production traffic screen repaired by applying two pending migrations (2026-11-10)

`https://queenbees.vercel.app/qbpanel/traffic` rendered the admin error boundary. Neon and Vercel were
used to read the production project directly rather than guessing.

- **Cause.** The deployed code selects `visit_session.division` (ADR 0033) and expects
  `order_claimed` in `order_event_type_valid` (ADR 0032), but production's `drizzle.__drizzle_migrations`
  ended at `0018_customer_email_change` (19 applied, latest `1794084805097`). `0019_pink_blonde_phantom`
  and `0020_puzzling_slipstream` were never applied, so the traffic queries failed on a missing column and
  the visit beacon could not write (`visit_session` had no session after 2026-11-08).
- **Fix.** Both migrations were applied to Neon project `autumn-wave-01272789`, branch `production`,
  database `queenbees` as one transaction, then recorded in `drizzle.__drizzle_migrations` with
  sha256 hashes of the committed SQL and the journal's `when` values. Production is at **21 migrations /
  52 tables**; `division` exists with its check, and the event check now includes `order_claimed`.
- **Evidence.** A temporary insert through the new column returned `division = 'dhaka'` and was rolled
  back with the row deleted in the same transaction; loading the production storefront once recorded a
  real session (`22` total, latest `2026-11-09T20:18:14Z`, `division` non-null); the page's aggregate
  queries (today/window/series/funnel/paths/totals/divisions/devices) execute; `/api/track` answers 204.
- **Not applied:** `0021`-`0023` (per-product delivery, optional hero and popup descriptions) belong to
  undeployed code and stay local. The next deploy must run `db:status` and apply them first.
- **Limit.** The authenticated page was not opened with owner credentials, so its rendered output was not
  seen; the database-level cause is removed and every query it runs succeeds against production.

## Neon network transfer reduced, and the deployed-code migration gap closed (2026-11-10)

**Measurement.** Neon project `autumn-wave-01272789` reported `data_transfer_bytes = 2,336,824,279`
(2.34 GB) for the cycle starting 2026-11-01, with the project created 2026-11-06 - about **20 GB/month
at that pace**, against the Free plan's **5 GB per project per month** (and object storage and
functions share that allowance). Production data: 1,477 published products whose descriptions alone are
503,643 characters (~0.5 MB); 1,919 live image rows whose rendered columns are ~138 kB; the whole bulk
snapshot was therefore ~0.8 MB per refresh. The function region is `sin1` (co-located with the Neon
project); catalog images answer `x-vercel-cache: HIT` after the first fetch, so image egress is bounded
by first fetch per image per POP and is not the recurring cost.

**Applied.**
1. `STOREFRONT_CATALOG_REVALIDATE_SECONDS` 300 -> 3600. Writes still call `invalidateStorefrontCatalog`
   immediately; the TTL is only a backstop, so an owner's edit is visible on the next request.
2. `listPublishedProducts(tx, { includeDescription: false })` for the storefront snapshot, and a new
   `getPublishedProductDescription` / `getProductDescription(slug)` cached under the same tag for the
   product page (body and meta description). `ProductDetailView` now takes `description` as a prop.
   The default `includeDescription: true` keeps the full projection for the db tests and future callers.

**Estimate (80-100 visitors/day).** Snapshot ≈ 0.25-0.3 MB × 24 refreshes/day ≈ 7 MB/day; description
reads ≈ a few MB/month; visit-log writes and admin reads are small; image egress is one-time per asset
per POP. Expected **0.2-0.5 GB/month**, roughly a tenth of the allowance. Before the change the same
model gives 0.8 MB × 288 ≈ 230 MB/day (≈7 GB/month) from the snapshot alone, which is consistent with
the measured pace.

**Cost if it ever exceeds 5 GB.** On **Free** there is no overage charge - the compute is **suspended**
until the next billing cycle or an upgrade, which takes the storefront down. On **Launch** (no monthly
minimum) the first 500 GB are included; beyond that it is **$0.10/GB** (so 6 GB would be $0.10; even the
old 20 GB pace would be $1.50). Launch compute is $0.106/CU-hour at 0.25 CU with scale-to-zero, and
storage $0.35/GB-month, so the realistic Launch bill for this shop is dominated by compute (order of
$5-15/month with ~100 visitors/day), not transfer. Invoices under $0.50 are not collected.

**Also this day:** `main` is wired to Vercel and every push deploys production. The feature commits
auto-deployed code that required migrations `0021`-`0023`, so those were applied too (production now at
**24 migrations**); the site was serving from a warm Data Cache and would have failed on the next cache
miss. See the AGENTS production note.

**Limitations.** `pg_stat_statements` is not installed on the production database, so per-query transfer
could not be ranked; Neon exposes only the combined `data_transfer_bytes` per project, not a
Postgres-vs-object-storage split. The estimate is a model from row sizes and the observed total. The
egress change was verified locally (product description renders in body and meta; listing 200) and takes
effect in production on the deploying commit.

## Pre-deploy migration gate (Phase 60, item 2, 2026-11-10)

**Why.** `main` is wired to Vercel and a push deploys; Vercel's build applies no migration. That
combination put code ahead of its schema four times - `0015` (traffic and order writes), `0016`-`0018`
(delivery settings), `0019`-`0020` (traffic screen), and `0021`-`0023` earlier the same day, where the
storefront only survived because a warm Data Cache masked the missing columns.

**What exists now.** `npm run prebuild` runs `src/db/check-migrations.ts --build` before `next build`.

- `evaluateMigrationGate` (`src/db/migration-gate.ts`) is the decision, pure and unit-tested
  (`tests/unit/migration-gate.test.ts`, 5 cases). An applied hash with no current file outranks a
  pending migration; both block.
- On Vercel **production** the CLI compares the journal with `drizzle.__drizzle_migrations` and exits 1
  with the missing tags, so the build never starts and the previous deployment stays live.
- `VERCEL_ENV` other than `production`, or no `VERCEL_ENV` at all (a local `npm run build`), prints one
  skip line - a preview shares the production database, and building locally must not need a database.
- `npm run check:migrations` runs it on demand against the current `DATABASE_URL`.
- **Fails closed**: missing `DATABASE_URL`, an unreachable host (10 s pool timeout newly set in
  `src/db/migrate.ts`) or any error refuses the build. No override flag. It never applies a migration
  and never prints the connection string - only host, port, database and environment.
- **Requirement:** `DATABASE_URL` must be readable at build time in the Vercel production environment.

**Verified 2026-11-10, locally.**
- `npm run check:migrations` against the dev cluster: `✓ migrations applied: 24/24`.
- A scratch database created in the local cluster with no migrations: `✗ 24 migration(s) ... are not
  applied`, listing every tag, **exit 1** (checked without a pipe), then dropped.
- `VERCEL_ENV=preview` and a non-Vercel run: skip line, exit 0.
- `DATABASE_URL` removed: refuses with the environment module's message, exit 1.
- Unroutable host `10.255.255.1`: refuses in **10.3 s**, exit 1 (bounded, no hang).
- `lint` 0 errors (18 pre-existing warnings), unit **294/294**, `npm run build` green with the gate
  skipping, `typecheck` clean.

**Correction (2026-11-10, later the same day): that first Vercel verification was wrong.** The
paragraph that stood here claimed a real production build had run the gate, inferred from a changed
`/_next/static/immutable/chunks/` filename. Reading the deployments through the Vercel MCP shows the
opposite: **every** production deployment after the gate landed ended in `ERROR`
(`1cfa6e8`, `ffbee0e`, `cb97367`) and production kept serving the previous READY build (`e1d66a8`),
whose chunk filenames are what had changed. The build log named the cause exactly:

```
> tsx scripts/check-migrations.ts --build
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/vercel/path0/scripts/check-migrations.ts'
```

`.vercelignore` excludes `scripts/`, so the gate was never uploaded. The CLI now lives at
`src/db/check-migrations.ts` (inside the uploaded tree) and `prebuild` points there; behaviour, output
and the fail-closed refusal are unchanged. **Verified 2026-11-10 against a real Vercel production
build** (`dpl_3mAQf1y4X6AFaWoGL1kL515AvWiZ`, commit `5b37faf`, state READY in 37 s): the log shows
`> tsx src/db/check-migrations.ts --build`, then
`target: ep-sparkling-leaf-azreahxh.c-3.ap-southeast-1.aws.neon.tech:5432/queenbees (env=production)`,
then the build proceeding to `Build Completed`, so `DATABASE_URL` is readable at build time and
production's `drizzle.__drizzle_migrations` holds exactly the 24 committed hashes (checked through the
Neon MCP). The alias `queenbees.vercel.app` serves that deployment: `/`, `/products`, `/categories`,
`/contact`, `/checkout`, `/cart` and `/robots.txt` answer 200, `/qbpanel` 307 to `/qbpanel/login`, and
`/qbpanel/login` 200. The refusal path is still demonstrated only against a scratch database locally.

## Customer account dashboard, and the checkout WhatsApp link (2026-11-10)

**Deployed and observed.** Commit `e22100c` reached READY as `dpl_4qS1QuYLj3FWCQPTn5Q2m94xNWdH` and the
production aliases (`queenbees.vercel.app`, `queenbeesbd.com`, `www.queenbeesbd.com`) serve it.

**What replaced the account hub.** `/account` is now three screens behind a labelled sidebar —
`/account` (overview), `/account/orders`, `/account/security` — with `AccountFrame` as the shell. The
overview leads with the newest order and a five-mark progress track derived by `orderProgress` from the
order's own `status`/`cod_state`; a COD order still awaiting the shop's call has not reached
"confirmed", and a cancelled or returned order draws no track. Three figures above the panels (orders
placed, cash due, money recorded as received) are summed from the same rows the page lists. The orders
screen filters by four exhaustive groups whose counts add up to the account's order count, and the group
is a URL parameter checked against a closed set on the server. Both account-security routes now return
their notice code to `/account/security`, beside the form that produced it. Signed out, `/account`
redirects to sign-in with the path preserved.

**Removed rather than aliased:** `AccountView`, `OrdersView`, the eighteen hub/orders rules left in
`account.module.css` (that file is now the sign-in surfaces and the order receipt only) and twelve
dictionary keys only those views used.

**Checkout.** The Business WhatsApp number and its mark on the payment card are one link to
`https://wa.me/8801871161571` (built from the printed local number by `whatsappLinkNumber`), opened in a
new tab with `rel="noopener noreferrer"`; the glyph is `--whatsapp-green` (#25d366) and the action is
named in words beside it. This supersedes the earlier "never WhatsApp's green" rule for this one mark,
recorded in `AGENTS.md`.

**Verified locally, 2026-11-10.** `typecheck`, `lint` (0 errors, 18 pre-existing warnings), `check:i18n`
(1817 keys), unit **294/294**, `build`; the app-screen inspector at 1440/768/390 reports **0 FAIL** on all
three screens (one accepted warning, `no-data-hue`: no chart is drawn and the hue is on the track); two
page-wide allowances (`palette-purple`, `edge-text`) are the shop's existing header icon buttons and the
phone tab bar's "Account" label, which the untouched `/products` page reports identically.

**Verified against a real session, locally.** `/account`, `/account/orders`, `/account/orders?state=open`
and `/account/security` answer 200; a wrong current password and an invalid address each return to
`/account/security` with the right notice; a real password change rewrites the credential, renders its
confirmation and lets the customer sign in with the new one; sign-out ends the session; signed out,
`/account` 307s to `/account/login?next=%2Faccount`; `/account/orders/<number>` still 307s to
`/orders/<number>`. On a signed-in checkout the anchor resolves to `wa.me/8801871161571` with
`target="_blank"`, `rel="noopener noreferrer"` and a 266x28 hit area.

**Verified on the live domain.** `queenbeesbd.com` serves deployment `e22100c`: `/`, `/products` and
`/account/login` answer 200; `/account` and `/account/security` 307 to the sign-in page with their own
path preserved in `next`. **Not verified:** an authenticated walk-through on production, because no
production customer credential is held here and creating one would write real customer data; real iOS
Safari, Android Chrome, screen readers and 200% zoom. `verify:admin`, `verify:browser`, `verify:storefront`
and the database suite were not re-run for this change.

## The account dashboard's phone composition (2026-11-10)

Owner feedback: "the bar shows way too bad now" at phone width. The folded sidebar was four bordered
chips that wrapped to two rows, one of them the sign-out, which read as a destination among equals.

**What changed.** The phone state is now a **segmented track** of three equal cells (the current one on
white, 40px tall, capped at 440px above 480px so a tablet does not get a progress bar), an **identity
row** carrying the customer's name and a plain **Sign out** at 40px, and no contact item (the shop's
footer carries it). The third screen is named **Security** in the navigation and in its `h1`. Every
`main` link and button on the phone is at least 40px tall - the earlier build left 19-24px text links.
The three figures now align on one baseline (`grid-template-rows: auto 1fr` with the value on the cell
floor) and their notes are hidden at this width. The order block puts its amount under the order line,
the track becomes five stacked rows, and the line under the title no longer repeats the order number the
panel below names. "1 orders" is "One order".

**Verified 2026-11-10** at 390, 768 and 1440 on the real signed-in pages against the dev cluster: no
horizontal overflow on `/account`, `/account/orders` or `/account/security`; no `main` link or button
under 40px; two corner radii on the surface (6px controls, 10px panels); the three figures sharing one
baseline; the desktop sidebar unchanged. `typecheck`, `lint` (0 errors, 18 pre-existing warnings),
`check:i18n` and `build` green.

**Not verified:** real iOS Safari and Android Chrome, screen readers, 200% zoom, and an authenticated
walk-through on the production domain (no production customer credential is held here). The storefront
tab bar's own 10.5px labels are outside this change.
