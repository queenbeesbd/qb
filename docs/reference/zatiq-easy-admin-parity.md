# Zatiq Easy reference - parity mapping and roadmap (Phase 29)

Companion to `docs/reference/zatiq-easy-admin-audit.md` (findings) and
`docs/reference/zatiq-easy-admin-visual-spec.md` (measured values).

**Nothing in this document is approved work.** It is a proposal produced by a research phase. Each phase
below needs the owner's explicit authorization before a single line of application code changes.

## 1. How to read the mapping

Every reference field is classified with exactly one status:

| Status | Meaning |
| --- | --- |
| **A - already supported** | the column, state and rule exist; only the presentation may differ |
| **B - UI change only** | the data exists, the admin surface does not render it |
| **C - needs a schema change** | a documented migration would be required (and is not written) |
| **D - incompatible** | contradicts an approved decision; do not build |
| **E - owner decision** | a business or data-handling choice that engineering must not make |

## 2. Category mapping

| Reference field / behaviour | QueenBee's | Status | Note |
| --- | --- | --- | --- |
| Name (single, required, 50 chars) | `name_en` + `name_bn`, 1-80 chars, required | A | bilingual by design; the UI already enforces both |
| Short description | `description_en` / `description_bn` | A | plain text, no rich text |
| Slug | `slug`, format-checked, unique | A | the reference has no visible slug |
| Sort order | `sort_order` + index | A | no drag UI exists; numeric input only |
| Visible / hidden | `is_visible` | A | |
| Subcategory | `parent_id` self-reference, depth not limited by schema | B | **no UI to create a subcategory** - the schema already allows it |
| "Total Subcategory" count | derivable (`count(*) where parent_id = x`) | B | must be one query, never a counter |
| Banner/cover image (1300x380, 4 MB) | **no category image columns exist** | C | needs `category_image` (or two columns) **and** an owner decision on where category bytes live |
| Square image (1:1, 500x500, 4 MB) | same | C | same decision |
| Upload / drag-drop / replace / remove | product images are **association-only** from `public/catalog`, metadata read from the bytes | D | no upload path exists; adding one requires object storage, which is not provisioned and not authorized |
| Delete | archive; refuses when referenced by a live product or subcategory | A (safer) | keep the refusal |
| Empty subcategory state | generic empty state | B | the copy can be specific |

## 3. Product mapping

| Reference field / behaviour | QueenBee's | Status | Note |
| --- | --- | --- | --- |
| Item name (required) | `name_en` / `name_bn` | A | |
| Short description (500 chars, under the price) | none | C | new column(s) if the owner wants a subtitle |
| SEO description (255 chars) | none | E | no SEO surface exists; a decision, not a default |
| Rich-text description | `description_en`/`description_bn`, **plain text by rule** | D | `dangerouslySetInnerHTML` is forbidden and no sanitizer is approved |
| Images (multiple, ordered, drag-drop, 4 MB) | `product_image` with `sort_order`, `alt_en`/`alt_bn`, metadata from bytes | A/B | multiple + ordering exist; **no upload UI**, association from the asset inventory only |
| Video link | none | D | no column, no player, no policy |
| Sell / current price (required) | `product_variant.price_minor` | A | prices live on the variant, not the product |
| Regular / old price | `compare_at_price_minor` | A | struck through only when genuinely greater |
| Buying price | none | D | margin is not a QueenBee's feature |
| Quantity (stock) | **`availability` state only** (ADR 0013) | D | no quantity, no deduction, no reservation |
| SKU / product code | `product_variant.sku` | A | |
| Product serial, unit name, warranty, initial sold count | none | D | no business need; sold count is derived if ever shown |
| Per-product delivery charge | three-area store-level charges (ADR 0016) | D | delivery is not a product attribute here |
| Product variants (name / option / extra price) | `product_variant` + `option_values` jsonb + `label_en`/`label_bn` | A/B | the model exists; **no option-matrix editor** |
| Variant image | none (images are product-level) | C | needs a link from image to variant |
| Variant stock | none | D | no quantity model |
| Product details (custom fields) | none | E | a JSONB column or a new table; only worth it if the owner wants spec sheets |
| Category (multi-select) | single `category_id` | A | one category is the approved model; multi-category would be a schema change |
| Brand | `brand` table + `brand_id` | A | |
| Weight / dimensions | none | E | only meaningful for courier booking, which is out of scope |
| Condition ("New") | none | D | SEO/feed artefact |
| Status ACTIVE | `is_published` **and** `availability` | A (clearer) | two explicit states beat one toggle |
| Merchant-authored reviews | none | D | inventing reviews violates the honesty rules |
| Native-only validation | inline field errors | A (safer) | do not regress |

## 4. Customer mapping

| Reference field / behaviour | QueenBee's | Status | Note |
| --- | --- | --- | --- |
| Name | `display_name` | A | optional in the schema |
| Email | `email`, unique, required | A | the reference shows "No email on file" for phone-only customers; QueenBee's requires email (D17) |
| Phone | `phone` | A | |
| Joined date | `created_at` | A | |
| Orders count | derivable from `order` | B | one aggregate query |
| "New customer" badge | derivable (first order age) | E | the definition of "new" is a policy; the reference gives none |
| District | **not on the customer**; `order_contact.district_code` per order | B | show the most recent order's area, labelled as such - never imply a stored customer district |
| Address | `order_contact.address_line` per order | B | same caveat |
| Avatar initials | UI only | B | |
| Search by name / phone / email | search exists | A | |
| Columns control | none | B | optional |
| Row selection / bulk actions | none | E | bulk implies bulk messaging, which is not authorized |
| Export | none | E | PII export is a data-handling decision |
| Page size / pagination | `Pagination` component exists and is used | A | |
| Customer detail | `/admin/customers/[id]` with orders, suspension, credential reset | A | QueenBee's is ahead (Phase 23) |
| "Show all receipts" | order list filtered by customer | B | a link, not a new screen |
| Devices & IP list | sessions store **`ip_hash` / `user_agent_hash` only** | D | never display a raw IP; a session list with last-seen is possible |
| Block customer | `suspendCustomer` + ban (D20), reasoned and audited | A | |

## 5. Order mapping

| Reference field / behaviour | QueenBee's | Status | Note |
| --- | --- | --- | --- |
| Order number | `order_number` | A | |
| Customer + phone | `order_contact.recipient_name` / `recipient_phone` | A | |
| Date / time | `placed_at` | A | |
| Items + count | `order_item` (frozen) | A | |
| Status | `order.status` | A | |
| Type ("Online" / "Own") | none | D | single-store; there is no channel concept |
| Amount + delivery sub-line | `total_minor`, `shipping_minor` | A | snapshot, never recomputed |
| Status tabs (11) | **already implemented**: 8 tabs (all, pending, confirmed, shipped, delivered, completed, cancelled, returned) over `order.status` | A | the reference's payment tabs must never be added - payment states are a separate concept |
| Payment OnProcess / Payment Failed tabs | `payment_state` is retained but **unused** (ADR 0015) | D | do not surface a retired concept |
| Inline price / quantity editing | `order_item` frozen by trigger | D | by design |
| "Add More Product" to a placed order | none | D | would mutate a placed order |
| Discount % / VAT % | none | E | no discount or tax policy is approved |
| Payment status Fully Paid / Partial + paid amount | `cod_state`; COD is the only method | D | a COD order is not partially paid; cash is collected once |
| Delivery zone + charge | `order_contact.district_code` + `shipping_minor` | A | |
| Courier buttons / Send to Delivery | none | D | excluded module |
| Internal note (editable) | `order_event.reason` + `payload` (append-only) | B/E | a note **event** is possible today; an **editable** note needs a schema change |
| Status dropdown (10 values) | guarded `/api/admin/orders/transition` | A (safer) | expose only legal edges |
| Customer validity check | none | D | an external claim about a person |
| Fraud flag | review flag + ban, reasoned and audited | A | |
| Previous / next order | none | B | cheap navigation win |
| Print / receipt | none | E | a printable summary is useful; a **public** receipt URL is not acceptable |
| Timeline | `order_event` append-only log is rendered | A (ahead) | |
| Export | none | E | |

## 6. Dashboard and report mapping

| Reference figure | QueenBee's | Status | Note |
| --- | --- | --- | --- |
| Revenue today / this month | `sum(total_minor)` over completed+paid | B | derived per read (ADR 0018) |
| Orders today / this month | `count(*)` by `placed_at` | B | |
| Active products | `count(*) where is_published and deleted_at is null` | B | |
| Total customers | `count(*) from customer` | B | |
| Website visits | none, and no analytics vendor is authorized | D | no data source |
| Revenue chart (30 days) | derived from `order` | B | |
| Orders by status | derived from `order.status` | B | |
| Recent orders | COD queue exists | B | |
| Low stock | **no quantity exists** | D | replace with an Out of Stock list |
| Top selling | derivable from `order_item` | E | publishing sales counts is a presentation policy |
| Report period selector | none | B | |
| KPI row (amount, confirmed orders, item sales, customers served) | none | B | all four derive from orders |

## 7. Feature-parity matrix

Priority is business value divided by dependency. **Functional** parity is what the owner can do;
**visual** parity is how it looks.

| # | Capability | Functional gap | Visual gap | Priority | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | Subcategory management | missing UI (schema ready) | modal + list | **P1** | nothing |
| 2 | Order list: date-range filter, row secondary line, page-size control | partial (tabs, search and pagination exist) | medium | **P1** | nothing |
| 3 | Order detail: previous/next navigation, denser header | **page exists** (Phase 18-22); only navigation is missing | small | **P2** | nothing |
| 4 | Dashboard KPIs + revenue chart + orders-by-status | missing | large | **P1** | nothing (read-only derivations) |
| 5 | Customers list badges (orders, joined) + detail sections | partial | medium | **P2** | nothing |
| 6 | Product form sectioning (collapsible groups) | none | large | **P2** | nothing |
| 7 | Category images (banner + square) | missing | large | **P2** | **owner decision + schema change + storage decision** |
| 8 | Product image ordering UI | model ready | medium | **P2** | nothing |
| 9 | Analytics period selector + KPI row | missing | medium | **P3** | #4 (shares the derivations) |
| 10 | Product short description / SEO | missing | small | **P3** | owner decision + schema change |
| 11 | Product custom detail fields | missing | medium | **P3** | owner decision + schema change |
| 12 | Variant option-matrix editor | partial | large | **P3** | owner decision on variant depth |
| 13 | Internal order note | missing | small | **P3** | owner decision (append-only event vs new column) |
| 14 | Receipt print view | missing | medium | **P3** | owner decision |
| 15 | Promo codes / discounts | missing | large | **P4** | owner decision (pricing policy) - **not scheduled** |
| 16 | Customer export / bulk actions | missing | medium | **P4** | owner decision (PII) - **not scheduled** |

## 8. Phased implementation roadmap (proposals only)

Each phase is independently verifiable and ends with a checkpoint. **No phase below is authorized.**

### Phase 30 - Admin list-surface parity (orders, customers, products, categories) - **delivered 2026-10-21**

> **Delivered.** The owner authorized this phase and it is implemented locally; see
> `docs/implementation-plan.md` (Phase 30) and `docs/admin-dashboard.md` (The list surfaces) for what
> was actually built and verified. The plan below is retained as the specification it was built to.
> **Not built from it, deliberately:** no new column, table, field, export or bulk action, and nothing
> from the owner-decision list in section 9.

- **Scope:** one toolbar pattern (title left, primary action right, filter row below), a date-range
  filter, a page-size control, pagination on the lists that lack it (`/admin/catalog`, `/admin/categories`,
  `/admin/audit`), consistent empty states, and row anatomy with a secondary line. **Status tabs, search
  and pagination already exist** on `/admin/orders`, `/admin/customers` and `/admin/orders-cod` - this
  phase aligns them, it does not invent them.
- **Exclusions:** no new columns, no new tables, no export, no bulk actions, no schema change.
- **Prerequisites:** none. Reuses `Pagination`, `StatusPill`, `PageHeader`, `EmptyState`.
- **Likely files:** `src/app/(admin)/admin/(app)/orders/OrdersView.tsx`, `.../customers/CustomersView.tsx`,
  `.../catalog/CatalogView.tsx`, `.../categories/CategoriesView.tsx`,
  `src/app/(admin)/admin/_ui/*`, `src/app/(admin)/admin/admin.module.css`, `src/server/orders/admin-read.ts`.
- **Tests:** extend `scripts/verify-admin.ts` (list geometry, tab filtering, pagination round-trip,
  360 px overflow on each route); unit tests for any new pure filter/format helper.
- **Acceptance:** every admin list uses one toolbar vocabulary, one control height (`--admin-control`),
  one row density; filters and pagination are server-side and reflected in the URL; `verify:admin`
  passes with new checks; no permission, state machine or total changes.
- **Owner decisions:** none.
- **Risks:** scope creep into new fields; keep it presentation-only.

### Phase 31 - Subcategories

- **Scope:** create / edit / archive a subcategory under an existing category; "Total Subcategory"
  count; specific empty state; breadcrumb.
- **Exclusions:** category images, drag-reorder, bulk move.
- **Prerequisites:** none (schema already supports `parent_id`).
- **Likely files:** `.../categories/CategoriesView.tsx`, `src/app/api/admin/catalog/category/route.ts`,
  `src/server/catalog/service.ts`, `src/server/catalog/validation.ts`.
- **Tests:** unit (depth rule, cycle refusal, slug uniqueness), db (parent FK, archive refusal when a live
  child exists), `verify:admin` (create a subcategory through Chromium, count updates).
- **Acceptance:** a subcategory can be created and edited from the UI; a cycle is refused; a category
  with a live child cannot be archived; the storefront shows the subcategory in its parent.
- **Owner decisions:** whether depth is limited to two levels.
- **Risks:** storefront navigation changes - verify `verify:storefront` stays green.

### Phase 32 - Order detail parity polish

**The page already exists** (`/admin/orders/[orderNumber]`, Phase 18-22: money panel, additional costs,
items, returns, delivery, history, audit, customer, decisions, operations, and every guarded transition).
This phase adds only what the reference has and QueenBee's does not, without touching the lifecycle.

- **Scope:** previous/next navigation between orders in the current filtered set; a denser header
  (order number, status pill, placed time, contact on one line); a "Show all receipts" equivalent link
  from the customer detail to that customer's orders.
- **Exclusions:** editing prices or quantities, adding products, courier buttons, discounts/VAT,
  refunds, any new transition, any new money field.
- **Prerequisites:** Phase 30 (so "next" respects the active filter).
- **Likely files:** `src/app/(admin)/admin/(app)/orders/[orderNumber]/page.tsx`,
  `src/app/(admin)/admin/(app)/orders/[orderNumber]/OrderDetailView.tsx`,
  `src/server/orders/admin-order.ts` (a neighbour query), `.../customers/[id]/CustomerDetailView.tsx`.
- **Tests:** unit (neighbour resolution at the first/last row and with an active filter), `verify:admin`
  (open an order, page forward and back, confirm the filter survives, confirm no editable money field
  appears, confirm a refused transition states its reason).
- **Acceptance:** previous/next never leaves the filtered set and never 404s at the edges; the totals
  shown equal the immutable snapshot exactly; no new editable money field exists anywhere on the page.
- **Owner decisions:** none.
- **Risks:** duplicating the COD card logic - extract, do not fork.

### Phase 33 - Dashboard and analytics derivations

- **Scope:** today/this-month revenue and orders, active products, customers, 30-day revenue chart,
  orders-by-status, Out of Stock list (replacing "low stock"), period selector on the report screen.
- **Exclusions:** website visits, top-selling counts, any stored counter.
- **Prerequisites:** none; every figure is a read-time aggregate.
- **Likely files:** `.../(app)/OverviewView.tsx`, `src/server/orders/admin-read.ts`,
  `src/server/catalog/read.ts`, possibly a new `src/server/analytics/read.ts`.
- **Tests:** db (aggregate equals the sum of seeded rows; a cancelled order never counts; a completed
  but unpaid order never counts), `verify:admin` (a completed order moves revenue by exactly its total
  once, and a repeated submission does not move it again).
- **Acceptance:** every figure is reproducible from SQL over immutable rows; no counter table exists;
  "Unavailable" is shown wherever a figure cannot be substantiated (e.g. orders without a fee split).
- **Owner decisions:** whether "top selling" is published at all.
- **Risks:** presenting a derived figure as revenue when it is gross customer payment - the ADR 0018
  wording rules apply.

### Phase 34 - Product form parity (sectioning and images)

- **Scope:** collapsible sections (General / Media / Pricing / Availability / Category / Brand), image
  ordering with explicit `sort_order`, inline validation summary.
- **Exclusions:** uploads, video links, rich text, buying price, stock quantity, per-product shipping,
  custom detail fields, short/SEO descriptions.
- **Prerequisites:** none.
- **Likely files:** `.../catalog/CatalogView.tsx`, `src/app/api/admin/catalog/product/route.ts`,
  `src/app/api/admin/catalog/image/route.ts`, `src/server/catalog/validation.ts`.
- **Tests:** unit (ordering, duplicate keys, metadata from bytes), db (sort order persisted, image
  association validated against the inventory), `verify:admin` (reorder two images, confirm the
  storefront order).
- **Acceptance:** one form vocabulary; a required field is never hidden in a collapsed section; image
  metadata still comes only from the file bytes.
- **Owner decisions:** none for this slice.
- **Risks:** the collapsible pattern can hide required fields - default every section containing a
  required field to open.

### Phase 35 - Owner-decision bundle (not scheduled)

Everything in status **E** that the owner has not answered: category images and their storage, short/SEO
descriptions, custom detail fields, variant depth, editable internal note, receipt printing, customer
export, bulk actions, promo codes, top-selling publication, weight/dimensions. Each answer becomes its own
small phase with its own ADR where it changes a business rule.

## 9. Owner decisions required before any of the above grows

1. **Category images** - do categories get a banner and a square image, and if so where do the bytes
   live? (No upload path exists; object storage is not provisioned.)
2. **Product copy depth** - is a short description and/or SEO description wanted?
3. **Variant depth** - is an option matrix (size x colour) needed, or is one variant per SKU enough?
4. **Product spec fields** - custom detail fields, weight and dimensions: needed, or noise?
5. **Internal order note** - an append-only note event (no schema change) or an editable note (schema
   change)?
6. **Receipt** - is a printable order summary wanted, and it must never be a public URL.
7. **Customer export / bulk actions** - any PII leaving the system needs an explicit decision.
8. **Top selling** - may sales counts be published on the dashboard?
9. **Promo codes** - a discount engine is a pricing policy; not scheduled.

## 10. Verification and Git status for this phase

Documentation-only phase. What was checked:

| Check | Result |
| --- | --- |
| Application code changed | **none** - only `docs/reference/*` added and one pointer in `docs/implementation-plan.md` |
| Schema / migration / dependency / env changed | **none** |
| Cloud resource / deployment / DNS | **none** |
| `npm run typecheck` | see the report in the phase summary |
| `npm run lint` | see the report in the phase summary |
| `npm run check:i18n` | see the report in the phase summary (proves no interface file was touched) |

Git: the three reference documents and the implementation-plan pointer are the only intended changes.
`.codegraph/` and `docs/ux-audit-phase24.md` were left untouched and untracked. No credential, cookie or
browser storage file is staged. Reference screenshots stay in `/tmp/zq/shots/` and are **not** committed.

**One unrelated observation, recorded and not fixed:** `src/components/LanguageToggle.module.css` (71
bytes) survived the Phase 28 English-only removal and is referenced by nothing. It is a dead file, not a
Phase 29 change.

## 11. Recommended next step

**Phase 30 - Admin list-surface parity - was delivered on 2026-10-21.** Every admin list now shares one
toolbar, one control scale, one row anatomy and one footer; the date range is server-side and in the URL;
catalog, categories, the COD waiting tab and the audit trail are paginated with exact totals; `verify:admin`
grew from 150 to **172** checks. See `docs/implementation-plan.md` for the delivered scope and
`docs/admin-dashboard.md` for the contract.

**The next proposal is Phase 31 - subcategories.**

- **Why this one:** it is the next item on the roadmap that needs **no schema change and no owner
  decision**. `category.parent_id` already exists, is indexed, and carries a "not its own parent" CHECK,
  so the work is a create/edit/archive surface, a derived "Total Subcategory" count, a specific empty
  state and a breadcrumb - all of which now have a toolbar and pagination vocabulary to sit in.
- **Prerequisites:** none beyond the owner's authorization.
- **Owner approval:** required before any code changes.
- **Acceptance condition:** a subcategory can be created and edited from the categories surface; a cycle
  is refused server-side; a category with a live child cannot be archived; the count is one derived
  query rather than a stored counter; and `verify:storefront` stays green because the storefront
  navigation renders the subcategory under its parent.

**Still open, and not engineering's to decide:** the nine owner decisions in section 9, and the actual
BDT delivery amounts (D-item 5), which remain the one input that makes checkout work at all.
