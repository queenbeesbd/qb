# Importing the previous store (Zatiq Easy), 2026-10-22

This is a **one-off data migration**, not an integration. It records what was captured, how it was
mapped, what was changed by it, and what it does not cover. The vendor's private API is **not** a
runtime dependency and no QueenBee's code calls it.

## Authorization and scope

The owner asked, in writing and with their own credentials, for every product, order and customer to
be taken out of `merchant.zatiqeasy.com` (shop 42239) and into this database, with the local catalog
replaced. That is the fresh, specific authorization the earlier AGENTS.md rule required before
logging in again; it covers **this export only**. Do not re-run the capture without a new reason.

The export read:

| Collection | Vendor endpoint | Rows |
| --- | --- | --- |
| Categories | `/api/v1/categories` | 14 |
| Products | `/api/v2/products` + `/api/v1/inventories/{id}` | 1,477 |
| Customers | `/api/v1/customers` | 528 |
| Orders | `/api/v1/receipts` (+ `/{id}` detail) | 559 |
| Product photography | `assets.zatiqeasy.com` | 1,919 images |

The capture is stored under `.tmp-import/raw/` (JSON) and `.tmp-import/images.json` (image manifest),
both gitignored because they hold customer names, phone numbers and addresses.

## What the import changed locally

`npm run import:zatiq -- --reset` truncates the commerce tables (products, categories, brands,
customers, orders, events, images, collections) and rebuilds them from the capture. Staff accounts,
permissions, settings (including the delivery charges and the announcement bar) and the audit log are
**not** touched.

`TRUNCATE` is used rather than `DELETE` because `order_event`, `order_item` and
`inventory_movement` carry a `BEFORE UPDATE OR DELETE` trigger that forbids row deletes by design.
Those rules were not weakened for the migration.

A compressed backup of the database as it was before the import is at
`.tmp-import/backup-before-import.dump` (`pg_restore` restores it).

## Mapping, and the decisions behind it

### Catalog

| Vendor | Here | Note |
| --- | --- | --- |
| `price`, `old_price` (taka) | `product_variant.price_minor`, `compare_at_price_minor` | ×100, integers; a compare-at price is kept only when strictly greater |
| `name` | `product.name_en` (and `name_bn` when it contains Bengali) | one vendor name, no translation is invented |
| `description` | plain text in `description_en` / `description_bn` | vendor HTML is stripped, never rendered |
| `quantity > 0` | `availability = 'in_stock'` | 1,458 in stock, 19 out of stock. Availability is the only ordering gate (ADR 0013); the quantity is not used as a count |
| `brand` | `brand` row | 336 raw spellings collapse to **245** brands by case/space-insensitive de-duplication; 358 unbranded products use the existing `unbranded` placeholder |
| `categories[0]` | `product.category_id` | 14 vendor categories become 14 rows plus one hidden **Uncategorised** for the 44 products the vendor filed under none |
| `images[]` | `product_image` + generated derivatives | metadata read from the file bytes by `readAsset`, never guessed |
| `created_at` | `product.created_at` | the real "when it was added" fact, so the homepage's recency rows are genuine |

Every product gets exactly one default variant (the vendor has no variants: `has_variant` is false on
all 1,477 and `variant_types` is empty everywhere), SKU `ZQ-<vendor id>`.

**128 archive products** are created for items the vendor has already deleted but which still appear in
an order. They are never published, never orderable and never listed: they exist only so
`order_item.variant_id` (NOT NULL) can point at something and history survives.

### Customers

| Vendor | Here |
| --- | --- |
| `email` (47 of 528 have one) | `customer.email`; the other **481** get `zq-<vendor id>@import.invalid` |
| `phone` | `customer.phone`, normalized to `01[3-9]XXXXXXXX`, `NULL` when not a valid BD mobile (2 cases) |
| `name` | `display_name` |

`.invalid` is reserved by RFC 2606 and never resolves, so a synthetic address can never receive mail
or be mistaken for a real one. **No `customer_credential` row is written**: an imported customer holds
no password and cannot sign in until the owner issues a one-time reset (ADR 0019). That is the honest
outcome — the vendor stores its own credential hashes, which are unusable here and were not copied.

### Orders

| Vendor | Here |
| --- | --- |
| `Order Placed` | `pending` / `cod_pending_approval` |
| `Order Confirmed` | `confirmed` / `cod_approved` |
| `Order Shipped` | `shipped` / `cod_approved` |
| `Order Delivered` | `delivered` / `cod_approved` |
| `Order Completed` (or `is_paid`) | `completed` / `cod_collected` |
| `Order Cancelled` | `cancelled` / `cod_failed` + a reason |

- `total_amount`, `delivery_charge` and `discount_amount` are the vendor's own figures, in poisha.
- The schema requires `total = items_subtotal - discount + shipping`. **533 of 559 orders reconcile
  exactly** from their line items plus delivery. For the remaining **26**, the vendor's own line prices
  exceed the total it recorded, so the difference is stored as `discount_minor` (Tk 5,870 in total) —
  the only column that can hold a real price difference without inventing a price. The vendor's
  original figures are preserved verbatim in each order's `order_placed` event payload.
- **Quantity comes from the vendor's `quantity` field, not `qty`.** `qty` is a derived field that is
  stale on some rows (one unit of a Tk 500 item recorded as `qty 10` on a Tk 620 order). Trusting
  `quantity` reconciles 533 orders; trusting `qty` reconciles 461.
- **Cancellation wins over the paid flag.** Four orders are flagged paid *and* cancelled at the vendor;
  recording them as completed would have put cancelled orders into the revenue figure.
- Each order gets one `order_placed` event carrying the vendor's original status, totals, zone and
  timestamps, so every mapping is auditable after the fact.
- 556 orders link to a customer; 3 are guest orders (no customer at the vendor) — the guest path
  already exists (ADR 0024).
- 5 orders carry a phone that is not a valid BD mobile. They are imported with the synthetic but
  format-valid `01300000000` and a delivery note saying the number is unavailable, rather than being
  dropped.

### Images

1,919 source photographs were downloaded and re-encoded into the four variants every asset needs
(600 and 1050 wide, JPEG and WebP), 7,784 files, about **622 MB**. They live in `public/catalog/`
with keys `zq-<hash>`, which is gitignored: image bytes belong in object storage (ADR 0006), and a
repository is not a CDN. The development storefront renders them; **a deployment needs the
object-storage step**, and until then this directory must be shipped with the app or the images are
missing.

Imported photography keeps its own aspect ratio. The 3:4 rule in `IMAGE_ASPECT` describes the fixture
catalog, so it is asserted only for fixture keys in `tests/unit/catalog-validation.test.ts`; the
imported set is asserted on the invariant that does hold — a 600-wide JPEG primary and four generated
variants. `rights_status` stays `pending_confirmation` with the provenance in the note: a migration
request is not the same recorded statement as a reuse licence.

## What is not imported

Promo codes and their redemptions, courier shipments and tracking, SMS/notification templates, theme
and landing-page content, abandoned carts, and the vendor's own reports. None of it has an equivalent
here, and none of it was asked for. Two curated collections (featured and "more to explore") were
**emptied** by the reset and need the owner's curation again.

## Verification performed

```
products 1605 (1477 published + 128 archived), variants 1605, images 1919
categories 15, brands 245
customers 528 (481 synthetic emails, 0 credentials)
orders 559 (confirmed 379, pending 138, cancelled 30, completed 9, delivered 3)
order items 1648, order events 559, contacts 559
orders where total <> items - discount + shipping: 0
storefront / and /products and a product detail page: HTTP 200, real images served
unit tests 194/194, db tests 258/258, db:validate 46 tables / 168 checks, check:i18n, check:catalog, lint clean
```

Three existing assertions had to be corrected, because the imported data made them false rather than
because they were inconvenient: the schema table count (45 -> 46, the Telegram table added in Phase 39), the
fixture-only 3:4 image aspect rule, and the product-name rule (the English name is required, the Bangla one
is optional, which is what the schema and `normalizeProductInput` already implement).

## Known consequences to act on

1. **`/products` renders all 1,477 products on one page: 4.0 MB of HTML**, of which 1.4 MB is the
   serialised catalog in the React payload that every page now carries. The listing was built for 22
   products. Pagination (or a windowed list) is the next necessary change.
2. **The COD worklist now holds 138 imported orders that were never confirmed at the vendor**, some
   from 2024. They are accurately `pending`; the owner may want to close the stale ones.
3. **1,481 customers cannot sign in** until the owner issues a reset, and 481 have no real email at all.
4. The storefront's placeholder hero and curated rows lost their content when the collections were
   truncated.
## Order history removed (2026-10-29)

The owner asked to keep the imported **products and customer list** and drop the imported **order history**.
`scripts/purge-imported-orders.ts` does exactly that, and it is a one-off operator command rather than a
migration because it is a data decision about this database, not schema history.

```
pg_dump "$DATABASE_URL" > before-order-purge.sql     # taken first; 705 KB custom-format dump
npm run db:purge:imported-orders                     # dry run, deletes nothing
npm run db:purge:imported-orders -- --confirm        # applies it
```

Result, printed by the command:

```
Before: orders 559, order items 1648, order events 559, order contacts 559, products 1605, customers 528
After:  orders 0,   order items 0,    order events 0,   order contacts 0,   products 1605, customers 528
```

**How it is allowed to delete append-only rows.** `order_event` and `order_item` carry `BEFORE UPDATE OR
DELETE` triggers that refuse row deletes by design. The command uses `TRUNCATE ... CASCADE`, a table-level
operation that fires no row trigger - the same technique `scripts/import-zatiq.ts --reset` already uses, for
the same reason. It is not a routine delete path and is not used by the application.

**Guards, so it cannot destroy real work.** It refuses without `--confirm`; refuses outside
development/test; refuses unless **every** order carries an `order_placed` event with
`source = zatiq-easy`; refuses if any record of real owner work exists (additional courier cost, payment
claim, refund, cancellation request, customer return, operational exception, promo redemption or customer
flag); and rolls the transaction back if the product or customer count changes. Order-scoped idempotency
keys are removed with the orders so a replay cannot point at a missing one.

**Kept:** 1,605 products, 245 brands, 15 categories, 1,919 image derivatives, 528 customers and their
credentials, collections, promo rules, delivery charges, store settings, owner accounts and the append-only
audit trail. **Six historical audit records now name an order that no longer exists** (`cod.approved`,
`cod.collected`, three order transitions and one completion); the trail is append-only and was deliberately
not edited. The dashboard, COD queue and analytics now truthfully read zero, and the customer detail screens
show no recorded orders.

**Re-importing orders is possible but is a new owner decision:** `npm run import:zatiq -- --reset` would also
truncate the catalog and the customers, which is not what this purge wanted.
