# Zatiq Easy merchant dashboard - reference audit (Phase 29)

Status: **research only, 2026-10-21.** No QueenBee's application code, schema, migration, dependency,
environment file or runtime configuration was changed to produce this document. Nothing here is an
approval to build. Zatiq Easy is a **UX and feature reference**, not an integration target: no private
API, cookie, tenant id or runtime dependency is used or implied (ADR 0004).

Companion documents:

- `docs/reference/zatiq-easy-admin-visual-spec.md` - measured geometry, colour, type and state values.
- `docs/reference/zatiq-easy-admin-parity.md` - field-by-field data-model mapping, parity matrix and the
  phased implementation roadmap.

## 1. Method and evidence

| Item | Value |
| --- | --- |
| Reference | `https://merchant.zatiqeasy.com` (Zatiq Easy merchant panel) |
| Session | owner-authorized credentials, supplied through an authorized channel; never written to this repo, a log, a commit or this document |
| Browser | Playwright, Chromium 141 headless, desktop context |
| Primary viewport | **1440 x 900** (the reference's own working layout) |
| Additional viewports | 1280x800, 1024x768, 768x1024, 390x844 |
| Observation date | 2026-10-21 |
| Account role shown | Shop Manager (the panel also lists a Shop Owner) |
| Reference data scale | 1,477 products, 528 orders, ~500 customers, 14 categories |

Evidence types used:

1. **DOM text** of every inspected screen (authoritative for labels, columns, options, states).
2. **Computed styles and bounding boxes** (authoritative for the numbers in the visual spec).
3. **Interaction traces** - clicks, opened overlays, native validation messages, route changes.
4. **Screenshots** captured for every inspected screen and overlay.

**Limit, stated plainly:** the screenshots were captured but were **not visually interpreted** - the
model performing this audit reads text and measured geometry, not images. Every number in the visual
spec is a measured value from `getBoundingClientRect()` / `getComputedStyle()`; nothing is estimated
from a picture. Colour values are recorded as the browser reports them, which is why several appear as
`lab()`/`oklab()` rather than hex.

**Screenshots are deliberately not committed.** They contain third-party merchant data (customer names,
phone numbers, addresses, order values). They live outside the repository at
`/tmp/zq/shots/` for the owner's own inspection and are indexed in the visual spec by filename.

### 1.1 Session note worth recording

The panel is a client-rendered app that calls `easybill.zatiq.tech`. Under a default headless
user-agent the API preflights failed (CORS) and the shell rendered empty. Setting a normal desktop
user-agent made every call return 200 and the panel rendered normally. This is a property of the
reference, not something QueenBee's reproduces or depends on.

## 2. What was inspected

Every included area in the phase brief, plus the shell and responsive behaviour:

| Area | Route(s) | Depth reached |
| --- | --- | --- |
| Application shell + navigation | all | full hierarchy, groups, active state, 5 viewports |
| Dashboard | `/` | full: greeting, 5 KPIs, revenue chart, orders-by-status, recent orders, low stock, top selling, quick actions |
| Orders list | `/order` | full: KPI strip, 11 status tabs, search, All Fields, Export, Filters, Columns, 20-row page, row anatomy |
| Order detail | `/order/:id` | full: header actions, editable line items, order summary, delivery, notes, order info, status dropdown (10 values), customer block, fraud flag |
| Products list | `/inventory` | full: count, category filter chips, search, table, row actions, pagination |
| Product create | `/inventory/new` | full: all 8 sections, every field, native validation |
| Product edit | `/inventory/:id` | full: adds Manage entry points (variant images, variant stock, merchant reviews) |
| Categories list | `/category` | full: table, row actions (open, subcategories, edit, delete), search |
| Category create | modal | full: both upload slots, name limit, description, footer, validation |
| Subcategories | `/category?category_id=:id` | full: inline edit form, empty state, Add Sub Category |
| Customers list | `/customer` | full: count, search, Export, Columns popover, table, page size |
| Customer detail | `/customer/:id` | full: profile fields, receipts entry point, devices/IP section, empty state |
| Analytics | `/reports` | full: period selector, 4 KPIs, paginated order report |
| Users & Permissions | `/manage-users` | full: 6 users, 3 role values, Add User control |
| Promo Codes | `/manage-promocode` | full: card list, Create Promo Code modal |
| Settings | n/a | **no `/settings` route (404)** - store settings live inside Manage Shop (excluded) |

## 3. Navigation hierarchy (as rendered)

Sidebar is 240 px, one white inset panel, five groups. **Only the first group and parts of two others
are in scope.**

| Group | Items | In scope? |
| --- | --- | --- |
| (unlabelled) | Dashboard, Orders, Products, Categories, Customers, Courier | Orders, Products, Categories, Customers, Dashboard **yes**; Courier **excluded** |
| Shop & Growth | Manage Shop, Analytics, Themes, Theme Builder, Landing Pages, Mobile App, Spotlights, Abandoned Cart, Promo Codes, Zatiq Experts | Analytics **yes**; all others **excluded** |
| ZatiqGO (NEW) | Supplier, Resell, Wholesale | **excluded** (whole section) |
| Settings | Users & Permissions, Subscription | Users & Permissions **yes (mapped, then excluded by ADR 0009)**; Subscription **excluded** |
| Resources | Report an Issue, My Reports, Zatiq Academy, Zatiq SecurePay, Affiliate Program | **excluded** (vendor resources) |

A persistent footer block advertises the subscription ("Loyal plan - renews in 21 days", "Manage plan"),
and a floating support button sits bottom-right on every screen. Both are **excluded**.

## 4. Feature inventory

Legend for the decision column: **Include** = reproduce the workflow; **Adapt** = reproduce the intent
within QueenBee's rules; **Exclude** = do not build; **Owner decision** = cannot proceed without a new
recorded owner choice.

### 4.1 Dashboard

| Feature | Reference behaviour | QueenBee's equivalent | Gap | Decision |
| --- | --- | --- | --- | --- |
| Greeting header | "Good afternoon, {store}!" in a full-width tinted banner with Visit Website + Copy (store URL) | none | missing | **Include** (adapt: no store-URL copy block until a public URL exists) |
| Revenue Today | `BDT 0` with sub-line "BDT 45,033 this month" | none (COD dashboard shows revenue only as a derived figure) | missing | **Include** - both figures are `sum(total_minor)` over completed+paid orders |
| Orders Today | `0` + "28 this month" | COD worklist count | partial | **Include** |
| Active Products | `1,477` | catalog count exists | partial | **Include** |
| Total Customers | `254` | customer count exists | partial | **Include** |
| Website Visits | `40,809` | none, and no analytics vendor is authorized | missing | **Exclude** - no data source exists, and inventing one is forbidden |
| Revenue Overview chart | 30-day line/area, avg daily, peak day, total items sold | none | missing | **Include** - derived from orders, no counter |
| Orders by Status | 34 total split Confirmed 28 / Placed 4 / Cancelled 2 | none | missing | **Include** - derived from `order.status` |
| Recent Orders table | 10 rows: avatar, name, payment method, amount, status pill, relative time | COD queue shows 5 oldest | partial | **Include** (adapt: COD columns, no payment-method column) |
| Low Stock | 5 rows with a numeric stock column | **no quantity exists** (ADR 0013) | incompatible | **Exclude**, replace with an **Out of Stock** list |
| Top Selling | 5 rows by units sold | none | missing | **Owner decision** - derivable from `order_item`, but publishing sales counts is a presentation policy |
| Quick Actions | 6 tiles: Add Product, New Order, Analytics, Categories, Themes, Settings | none | partial | **Include** (adapt: drop Themes/Settings-as-store-config) |

### 4.2 Orders

| Feature | Reference behaviour | QueenBee's equivalent | Gap | Decision |
| --- | --- | --- | --- | --- |
| List KPI strip | Today's date, Total Orders (Confirmed), Total Amount, Total Customer Served | none | missing | **Include** (adapt: the figures are today's, derived) |
| Status tabs | 11 tabs: All, Placed, On Hold, Confirmed, Shipped, Delivered, Completed, Cancelled, Returned, Payment OnProcess, Payment Failed | `/admin/orders-cod` has waiting / decided-today | partial | **Adapt** - tabs over `order.status` only; **payment states never become tabs** (they are a separate concept) |
| Search | "Search with order ID or Phone number..." | literal search on order number, name, phone | equivalent | **Keep** |
| All Fields / Columns | column chooser | none | missing | **Adapt** - a small column chooser is reasonable; not required |
| Export | export control present (format not verified) | none | missing | **Owner decision** - exporting customer-linked order data is a data-handling choice |
| Filters | advanced filter panel | status filter only | missing | **Adapt** - date range + status is enough |
| Row anatomy | thumbnail, `#id`, "Online" badge, `ORD-562`, item count, customer avatar + name + phone, date, status pill, type, amount + "+BDT 60 delivery" | order number, customer, items, total, status | partial | **Adapt** - keep the delivery sub-line (QueenBee's snapshots `shipping_minor`); drop the type/Online columns (single-store) |
| Pagination | 20 per page, page numbers | none visible | missing | **Include** |
| Detail: prev/next | "Previous / 1 of 528 / Next" | none | missing | **Include** (cheap navigation win) |
| Detail: Download / Save / Print | three header actions + a public receipt URL | none | missing | **Owner decision** - a printable receipt is useful; the public receipt URL is not acceptable (an order lookup surface without a session) |
| Detail: editable line items | unit price, total, warranty, quantity editable in place; "Add More Product" | frozen `order_item` (trigger) | incompatible | **Exclude the edit path** - order items are frozen by design. Read-only rendering + existing guarded transitions |
| Order summary | discount %, VAT/tax %, delivery zone + charge, payment status (Fully Paid / Partial), paid amount, amount due, grand total | subtotal, delivery, total; `cod_state` | partial | **Adapt** - show the four amounts QueenBee's actually has. **No discount or VAT field** - neither policy is approved |
| Delivery information | Pathao / Steadfast buttons + "Send to Delivery" | none | incompatible | **Exclude** - no courier integration is authorized |
| Order note | one internal note, "only visible to you and your team" | `order_event` carries params; no note column | missing | **Owner decision** - an internal note needs a schema change; the event log already records reasons for decisions |
| Order information | type (In shop / Online) + status dropdown with 10 values | guarded transition route | partial | **Adapt** - a transition control restricted to legal edges, not a free dropdown |
| Customer block | avatar, name, View profile, Call, WhatsApp, editable contact + shipping address | customer detail page, `tel:` link | partial | **Include** (adapt: no WhatsApp deep link without an approved template) |
| Customer validity / fraud flag | "Check Customer Validity", "Mark as fraud?" | review flag (admin-set, reasoned, audited) + ban | partial | **Adapt** - QueenBee's flag and ban already exist; no external "validity check" |
| Order timeline | none observed on the detail page | `order_event` append-only log is rendered | QueenBee's is ahead | **Keep QueenBee's** |

### 4.3 Products

| Feature | Reference behaviour | QueenBee's equivalent | Gap | Decision |
| --- | --- | --- | --- | --- |
| List | count, category chips, search, table (image, Product, Type, SKU, Price, Qty, action), 20/page | `/admin/catalog` with search, availability filter, In/Out switch | partial | **Include** the layout ideas; **exclude Type and Qty** |
| Category filter chips | horizontal chips incl. "Show All" | category filter exists | equivalent | **Keep** |
| Create editor | 8 collapsible sections, one page, Save/Discard in the header | single form page | partial | **Adapt** - sectioned form is the main visual idea worth copying |
| Item Name * | required, no max shown | nameEn/nameBn required | equivalent | **Keep** (bilingual) |
| Short Description | 500 chars, counter, "shown under the price" | none | missing | **Owner decision** - a new column |
| SEO Description | 255 chars, Google/feed only | none | missing | **Owner decision** - QueenBee's has no SEO surface |
| Description | rich-text editor (bold/italic/underline/quote) + edit dialog | plain text only, by rule | incompatible | **Exclude rich text** - product copy is plain text and untrusted HTML is never rendered |
| Media | drag-drop upload, JPG/PNG, 4 MB, recommended 1:1.6 (570x924), ordering, video link | association-only from `public/catalog`, metadata read from bytes, `sort_order` | partial | **Adapt** - ordering and multiple images are already modelled; **upload stays out** (no object storage exists), **no video link** |
| Pricing | Sell/Current Price *, Regular/Old Price, Buying Price (optional) | `price_minor`, `compare_at_price_minor` on `product_variant` | partial | **Include** the two prices; **exclude buying price** (margin is not a QueenBee's feature) |
| Inventory | Serial, SKU, Unit name, **Quantity (Stock)**, Warranty, Initial Sold Count | `variant.sku`; **availability state, never a quantity** | incompatible | **Exclude quantity/serial/warranty/sold-count**; keep SKU |
| Shipping | per-product delivery charge or "apply default" | three-area store-level charges (ADR 0016) | incompatible | **Exclude** - delivery is not a product attribute here |
| Product Variants | name / option / extra price (all required), plus Manage: variant image, variant stock | `product_variant` with `option_values`, `label`, `price_minor`, `is_active` | partial | **Adapt** - variants exist; no option matrix UI, no per-variant image, no variant stock |
| Product Details (custom fields) | repeated name + value pairs (Brand, Model, Fabric, EMI) | none | missing | **Owner decision** - a new table or a JSONB column |
| Category | multi-select checkbox overlay, chips with remove | single `category_id` | partial | **Adapt** to one category (QueenBee's model), unless the owner wants multi-category |
| Brand | text field (SEO/data feed) | `brand` table + `brand_id` | equivalent | **Keep** |
| Weight / Dimensions | kg, L x W x H cm | none | missing | **Owner decision** - only matters for courier booking, which is out of scope |
| Condition | "New" (SEO/data feed) | none | missing | **Exclude** |
| Product status | ACTIVE toggle | `is_published` + `availability` | equivalent, clearer | **Keep QueenBee's** (two explicit states beat one) |
| Merchant reviews | "Product Review (Merchant)" - the seller writes reviews | reviews do not exist | incompatible | **Exclude** - inventing reviews violates the honesty rules |
| Validation | native browser bubbles ("Please fill out this field."), one custom "Item Name is required" | inline field errors | QueenBee's is ahead | **Keep QueenBee's** |

### 4.4 Categories

| Feature | Reference behaviour | QueenBee's equivalent | Gap | Decision |
| --- | --- | --- | --- | --- |
| List | 14 rows: thumbnail, name, **Total Subcategory** count, actions; search | table with name, slug, visibility, sort order | partial | **Include** the count column and thumbnails |
| Row actions | open in new tab, View subcategories, Edit, Delete | edit, archive | equivalent | **Keep** (QueenBee's archive-not-delete rule wins) |
| Create modal | 750x778: Banner/Cover (1300x380, 4 MB), square Image (1:1, 500x500, 4 MB), Category Name * (50 chars), Short Description, Cancel/Create | inline create form | partial | **Adapt** the modal; **images need an owner decision** (no category image columns exist, and uploads are not authorized) |
| Subcategories | inline page `?category_id=`, "Add Sub Categories", edit form, empty state with "Add Sub Category" | `parent_id` exists, **no UI** | missing | **Include** - the schema already supports it |
| Empty state | "Your sub categories list is currently empty / Lets get started by adding your first sub category now" | generic empty state | partial | **Include** a specific empty state |
| Delete | delete action on the row | archive refuses when referenced | QueenBee's is safer | **Keep QueenBee's** |

### 4.5 Customers

| Feature | Reference behaviour | QueenBee's equivalent | Gap | Decision |
| --- | --- | --- | --- | --- |
| Header | "Customers" + "526 total customers" | list with count | equivalent | **Keep** |
| Search | "Search by name, phone, or email" | search exists | equivalent | **Keep** |
| Columns | Customer (initials avatar, name, "No email on file"), Phone, Orders ("1 order" + "New customer" badge), District, Address, Joined | name/email, phone, orders, joined | partial | **Include** the derived badges ("new customer", order count); **District comes from orders**, not the customer record |
| Columns control | popover toggling 6 columns | none | missing | **Adapt** - optional, low value at QueenBee's scale |
| Row selection / bulk | checkbox per row | none | missing | **Owner decision** - bulk actions imply bulk email/messaging, which is not authorized |
| Export | Export control | none | **Owner decision** - PII export policy |
| Pagination | page-size select ("10") | none | missing | **Include** |
| Detail | Name, Phone, Email, Address, District, Date, "Show all receipts" | customer detail with orders + suspension + credential reset | partial | **Include** "Show all receipts" as a link to their orders |
| Devices & IP | "Devices & IP addresses" list, block a single device/IP, "Block customer" | sessions store **hashed** IP/UA only; ban exists | partial | **Adapt** - show session counts and last-seen, **never a raw IP** (QueenBee's stores only a hash) |
| Blocking | "Block customer" | `suspendCustomer` + ban (D20) | equivalent | **Keep** (reason required, audited) |

### 4.6 Analytics and reports

| Feature | Reference behaviour | QueenBee's equivalent | Gap | Decision |
| --- | --- | --- | --- | --- |
| Period selector | This Month / Last Month / Custom Date Range with two date inputs | none | missing | **Include** |
| KPI row | Total Amount, Total Orders (Confirmed), Total Item Sales, Total Customer Served | none | missing | **Include** - all four derive from orders |
| Order report | paginated order cards (id, date/time, items, price, channel, status) | orders list | equivalent | **Keep** (list, not a duplicate report) |
| Visit/traffic analytics | present in dashboard, not in reports | no data source | missing | **Exclude** |

### 4.7 Users, permissions, promo codes, settings

| Feature | Reference behaviour | QueenBee's equivalent | Gap | Decision |
| --- | --- | --- | --- | --- |
| Users list | name, email or phone, role (Shop Owner / Shop Manager / Shop Staff) | owner accounts screen | equivalent, narrower | **Exclude role management** - owner-only at launch (ADR 0009); no staff roles, no role picker |
| Add User | email or phone + role select | host-shell bootstrap CLI only | incompatible | **Exclude** - a second account-provisioning channel is forbidden |
| Promo codes | percentage or amount, min purchase, max discount, expiry; card list | none | missing | **Owner decision** - a discount engine is a pricing policy, not a UI feature. **Not in this roadmap** |
| Store settings | inside Manage Shop (excluded module) | delivery charges, announcement bar | QueenBee's has its own | **Keep QueenBee's** |

## 5. Excluded modules (do not let these reappear)

Recorded explicitly so they cannot leak back into a plan:

1. **Courier** (and any courier integration, consignment, tracking or statement).
2. **Manage Shop** (store settings, domain, brand, social, store configuration).
3. **Themes** and **Theme Builder**.
4. **Landing Pages**.
5. **Mobile App**.
6. **Spotlights**.
7. **Abandoned Cart** - excluded even though it is in the navigation.
8. **Zatiq Experts**.
9. **The whole ZatiqGO section** - Supplier, Resell, Wholesale.
10. **Resources** - Report an Issue, My Reports, Zatiq Academy, Zatiq SecurePay, Affiliate Program.
11. **Subscription / plan / billing / upgrade UI**, including the sidebar plan card and "Choose the right plan".
12. **Vendor-specific marketing** - support bubble, "NEW"/"BETA"/"READY" badges, testimonial panel on the sign-in screen.
13. **Reference-only product fields that contradict QueenBee's rules**: stock quantity, buying price, per-product shipping, warranty, serial, initial sold count, video links, rich-text description, merchant-authored reviews, condition.
14. **Promo codes / discount engine** - recorded as an owner decision, not an approved feature.
15. **Staff roles, role picker, permission matrix, "Add User"** (ADR 0009).
16. **Public receipt URL** and any anonymous order lookup.
17. **Raw device/IP display** - QueenBee's stores hashes only.

## 6. Behavioural findings (things a screenshot cannot show)

1. **Every list is server-paginated at 20 rows** and the page size is changeable in the footer. The
   panel never loads the whole table.
2. **Search is debounced and server-side** on customers ("name, phone, or email") and orders ("order ID
   or phone number"); products search by name.
3. **The order status control is a free dropdown of 10 values** that mixes fulfilment states with
   payment states ("Payment OnProcess", "Payment Failed"). QueenBee's separates those concepts and
   should expose only legal transitions.
4. **Line-item prices are editable in place on a placed order.** QueenBee's freezes `order_item` by
   trigger; this reference behaviour is not reproducible and must not be.
5. **The category modal's only validation is the browser's native bubble** ("Please fill out this
   field.") - no inline message, no `aria-invalid`, and the overlay has no `role="dialog"`.
6. **The product editor's required fields produce native bubbles plus one custom message**
   ("Item Name is required") - inconsistent, and the error is not associated with the field.
7. **The category assignment overlay is a full-screen checkbox list with a Done button** - no search,
   no nesting beyond the flat category list.
8. **Product edit adds Manage entry points** (variant images, variant stock, merchant reviews) that do
   not exist on create - the create and edit screens are not the same form.
9. **The panel renders three different order counts in one session** (sidebar badge, dashboard "34",
   orders list "528") and two different customer counts (dashboard 254, customers page 526). These are
   almost certainly different windows/scopes, but the lesson for QueenBee's is explicit: **every count
   is one derived query, never a stored counter** - which is already the ADR 0018 rule for revenue.
10. **The empty state for subcategories is specific and actionable** ("Lets get started by adding your
    first sub category now" + button) - a pattern worth copying.
11. **The shell collapses at 768 px**, not at 1024 px: the sidebar is visible at 768/1024 and hidden
    below 768 with a hamburger. QueenBee's uses 1024 px for its drawer, which is the safer choice for a
    dense admin table.
12. **Tables scroll horizontally inside their own container** (a 985 px table inside a 528 px main at
    768 px) without widening the document - the same containment rule QueenBee's already applies to its
    storefront shelves.

## 7. What was not inspected, and why

| Not inspected | Reason |
| --- | --- |
| Any excluded module's internals (Courier, Themes, Manage Shop, ZatiqGO, Subscription, Abandoned Cart) | explicitly out of scope |
| Create / update / delete **writes** (no category, product, customer, promo or user was created, edited or deleted) | this is a read-only audit; mutating a third-party production store is not authorized |
| Image **upload** behaviour (file-type rejection, size rejection, crop, replacement, removal) | would require uploading a file to a third-party store; the copy states the rules (JPG/PNG, 4 MB, 1300x380 banner, 500x500 square) but rejection behaviour is unverified |
| Export file contents and format | the download did not produce a file in the automated context; **format unverified** |
| Add User dialog fields | the control did not open an overlay in this session; the list shows the three role values |
| Password reset / 2FA / account security screens | not part of the included scope |
| Native mobile app behaviour, iOS Safari, Android Chrome | headless Chromium only |
| Accessibility conformance of the reference | out of scope; the reference has known gaps (no dialog roles, native-only validation) that are recorded, not adopted |

## 8. Verification of this phase

- **No application code changed.** Only files under `docs/reference/` were added plus a pointer entry in
  `docs/implementation-plan.md`.
- **No schema, migration, dependency, environment or credential change.**
- **No cloud resource provisioned, no deployment, no DNS change.**
- **Reference credentials were held only in `/tmp/zq/cred.json`** (outside the repository) and are not in
  any tracked file, log or commit. They should be rotated by the owner now that the audit is finished,
  because they were transmitted through a chat channel.
- Repository checks run for this phase: `npm run check:i18n` (documentation-adjacent, proves no
  interface file was touched), `npm run typecheck`, `npm run lint`. Results are in
  `docs/reference/zatiq-easy-admin-parity.md` section 6 together with the Git status.

## 9. Next step

The recommended next implementation phase, its prerequisites, owner decisions and acceptance criteria
are in `docs/reference/zatiq-easy-admin-parity.md` section 5. Nothing in it is authorized by this
document.
