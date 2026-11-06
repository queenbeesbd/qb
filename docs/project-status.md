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

