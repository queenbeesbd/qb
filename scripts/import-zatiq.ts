#!/usr/bin/env tsx
/**
 * One-off import of the owner's previous storefront (Zatiq Easy, shop 42239) into this database.
 *
 * This is a migration tool, not a product feature. It reads a captured export from .tmp-import/raw/
 * (a gitignored directory) and writes rows through the same schema every other writer uses. It
 * contacts no network service: the capture is a separate, owner-authorized step, so the vendor's
 * private API is never a runtime dependency of QueenBee's.
 *
 * Usage:
 *   npm run import:zatiq -- --reset      truncate commerce tables, then import
 *   npm run import:zatiq                 refuse to run when rows already exist
 *
 * The decisions behind each mapping are recorded in docs/migrations/zatiq-easy-import.md. Short
 * version:
 *
 * - Vendor money is whole taka and becomes integer poisha (x100); no total is re-derived.
 * - An order keeps its line items exactly as the vendor recorded them. Where the vendor's own total
 *   is lower than items + delivery (77 orders carry an item-level price difference), the difference
 *   is stored as discount_minor: the schema requires total = items - discount + shipping, and a
 *   discount is the only column that can hold a real price difference without inventing a price.
 *   The vendor's original figures are kept verbatim in the order_placed event payload.
 * - Products deleted at the vendor but present in an order are recreated as UNPUBLISHED archive
 *   rows, because order_item.variant_id is NOT NULL and history must not be dropped.
 * - A customer with no email gets zq-<vendor id>@import.invalid (RFC 2606: never resolvable, so it
 *   can never be mistaken for a real address or receive mail). No customer_credential row is
 *   written, so an imported account cannot sign in until the owner issues a reset (ADR 0019).
 * - Image metadata is read from the file bytes by readAsset, never guessed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eq, sql } from 'drizzle-orm';

import { readAsset } from '@/server/catalog/assets';
import { slugify } from '@/server/catalog/validation';

import { withTransaction, type Transaction } from '../src/db/client';
import {
  brand,
  category,
  customer,
  order,
  orderContact,
  orderEvent,
  orderItem,
  product,
  productImage,
  productVariant,
} from '../src/db/schema';
import { UNBRANDED_BRAND_SLUG } from '../src/db/schema/values';

// ---------------------------------------------------------------------------------------------
// Captured shapes (only the fields this import reads)
// ---------------------------------------------------------------------------------------------

type VendorCategory = { id: number; name: string; serial: number };

type VendorProduct = {
  id: number;
  name: string;
  price: number;
  old_price: number | null;
  quantity: number;
  description: string | null;
  brand: string | null;
  images: string[];
  categories: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
};

type VendorCustomer = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type VendorReceiptItem = {
  id: number;
  name: string;
  price: number;
  unit_price: number | null;
  quantity: string | number | null;
  qty: number | null;
  inventory_id: number;
  image_url: string | null;
};

type VendorReceipt = {
  id: number;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  receipt_items: VendorReceiptItem[];
  total_amount: number;
  discount_amount: number;
  delivery_charge: number | null;
  delivery_zone: string | null;
  status: string;
  payment_type: string;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
};

type ImageEntry = { url: string; width: number; height: number; complete: boolean };

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const ROOT = join(process.cwd(), '.tmp-import');

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(ROOT, 'raw', file), 'utf8')) as T;
}

/** HTML fragment -> one plain-text value. The interface never renders vendor HTML. */
function plainText(raw: string | null): string | null {
  if (raw === null) return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
  return text.length === 0 ? null : text;
}

const BENGALI = /[\u0980-\u09FF]/;

/** Normalizes a phone to the schema's 01[3-9]XXXXXXXX format, or returns null. */
function normalisePhone(raw: string | null | undefined): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('880')) digits = digits.slice(3);
  while (digits.startsWith('0')) digits = digits.slice(1);
  const candidate = '0' + digits;
  return /^01[3-9][0-9]{8}$/.test(candidate) ? candidate : null;
}

/**
 * The placeholder written where the vendor holds a phone this schema cannot represent. It is in the
 * valid format so the row is storable, and the delivery note records that it is synthetic, so no
 * screen presents it as a real contact number.
 */
const SYNTHETIC_PHONE = '01300000000';

const DISTRICT_NAMES = [
  'Chattogram', 'Chattagram', 'Chittagong', 'Sylhet', 'Khulna', 'Rajshahi', 'Barishal', 'Barisal',
  'Rangpur', 'Mymensingh', 'Cumilla', 'Comilla', 'Narayanganj', 'Gazipur', 'Bogura', 'Bogra',
  'Jashore', 'Jessore', 'Coxsbazar', 'Noakhali', 'Feni', 'Tangail', 'Kishoreganj', 'Manikganj',
  'Munshiganj', 'Narsingdi', 'Faridpur', 'Gopalganj', 'Madaripur', 'Shariatpur', 'Rajbari', 'Pabna',
  'Sirajganj', 'Natore', 'Naogaon', 'Nawabganj', 'Joypurhat', 'Dinajpur', 'Thakurgaon', 'Panchagarh',
  'Nilphamari', 'Lalmonirhat', 'Kurigram', 'Gaibandha', 'Sherpur', 'Jamalpur', 'Netrokona',
  'Sunamganj', 'Habiganj', 'Moulvibazar', 'Brahmanbaria', 'Chandpur', 'Lakshmipur', 'Bagerhat',
  'Satkhira', 'Jhenaidah', 'Magura', 'Narail', 'Kushtia', 'Chuadanga', 'Meherpur', 'Patuakhali',
  'Barguna', 'Bhola', 'Pirojpur', 'Jhalokati', 'Khagrachhari', 'Rangamati', 'Bandarban', 'Dhaka',
];

/** Best-effort city for a vendor free-text address: the district name it mentions last. */
function inferCity(address: string, zone: string | null): string {
  const lower = address.toLowerCase();
  let found: string | null = null;
  for (const name of DISTRICT_NAMES) {
    if (lower.includes(name.toLowerCase())) found = name;
  }
  if (found !== null) return found;
  if (zone === 'Dhaka') return 'Dhaka';
  if (zone === 'Chattogram') return 'Chattogram';
  return 'Other districts';
}

function zoneToDistrictCode(zone: string | null): string | null {
  if (zone === 'Dhaka') return 'dhaka';
  if (zone === 'Chattogram') return 'chattogram';
  if (zone === 'Others') return 'other';
  return null;
}

/** Converts a vendor timestamp (2026-10-21 04:11:53, or ISO) to a Date. */
function vendorDate(raw: string): Date {
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new Error('unparsable vendor date ' + JSON.stringify(raw));
  return parsed;
}

const TAKE = (text: string, max: number): string =>
  text.length <= max ? text : text.slice(0, max).trimEnd();

/** A unique slug, suffixed at a hyphen boundary so the slug format still holds. */
function uniqueSlug(base: string, taken: Set<string>): string {
  let candidate = base;
  let counter = 1;
  while (taken.has(candidate)) {
    counter += 1;
    candidate = TAKE(base, 70) + '-' + String(counter);
  }
  taken.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

type Report = {
  categories: number;
  brands: number;
  products: number;
  variants: number;
  archivedProducts: number;
  images: number;
  imagesMissing: number;
  imagesUnusable: number;
  customers: number;
  customersSyntheticEmail: number;
  orders: number;
  ordersUnknownStatus: number;
  ordersSyntheticPhone: number;
  orderItems: number;
  orderItemsMissingVariant: number;
};

const VENDOR_STATUS: Record<string, { status: string; cod: string }> = {
  'Order Placed': { status: 'pending', cod: 'cod_pending_approval' },
  'On Hold': { status: 'pending', cod: 'cod_pending_approval' },
  'Order Confirmed': { status: 'confirmed', cod: 'cod_approved' },
  'Order Shipped': { status: 'shipped', cod: 'cod_approved' },
  'Order Delivered': { status: 'delivered', cod: 'cod_approved' },
  'Order Completed': { status: 'completed', cod: 'cod_collected' },
  'Order Cancelled': { status: 'cancelled', cod: 'cod_failed' },
  'Payment OnProcess': { status: 'pending', cod: 'cod_pending_approval' },
  'Payment Failed': { status: 'cancelled', cod: 'cod_failed' },
};

const COMMERCE_TABLES = [
  'order_event', 'order_item', 'order_contact', 'order_additional_cost', 'promo_code_redemption',
  'customer_notification', 'customer_flag', 'customer_return', 'cancellation_request',
  'operational_exception', 'payment_claim', 'refund', 'stock_reservation', 'inventory_movement',
  'inventory_balance', 'product_image_derivative', 'product_image', 'collection_item', 'collection',
  '"order"', 'customer_session', 'account_recovery_token', 'customer_credential', 'customer',
  'product_variant', 'product', 'brand', 'category',
];

async function reset(tx: Transaction): Promise<void> {
  // TRUNCATE, not DELETE: order_event, order_item and inventory_movement carry a BEFORE UPDATE OR
  // DELETE trigger that forbids row deletes by design, and those rules must not be weakened for a
  // migration. TRUNCATE is a table-level operation and fires no row trigger.
  await tx.execute(sql.raw('TRUNCATE TABLE ' + COMMERCE_TABLES.join(', ') + ' CASCADE'));
}

async function importCategories(tx: Transaction, report: Report): Promise<Map<number, number>> {
  const vendorCategories = load<{ data: VendorCategory[] }>('categories.json').data;
  const categoryIdByVendor = new Map<number, number>();
  const taken = new Set<string>();

  for (const item of vendorCategories) {
    const name = TAKE(item.name.trim(), 80);
    const slug = uniqueSlug(slugify(name) ?? 'category-' + String(item.id), taken);
    const inserted = await tx
      .insert(category)
      .values({ slug, nameBn: name, nameEn: name, sortOrder: item.serial ?? 0, isVisible: true })
      .returning({ id: category.id });
    const id = inserted[0]?.id;
    if (id === undefined) throw new Error('category insert returned no id');
    categoryIdByVendor.set(item.id, id);
    report.categories += 1;
  }

  const fallback = await tx
    .insert(category)
    .values({ slug: 'uncategorised', nameBn: 'Uncategorised', nameEn: 'Uncategorised', sortOrder: 999, isVisible: false })
    .returning({ id: category.id });
  const fallbackId = fallback[0]?.id;
  if (fallbackId === undefined) throw new Error('fallback category insert returned no id');
  categoryIdByVendor.set(-1, fallbackId);
  report.categories += 1;
  return categoryIdByVendor;
}

const brandKeyOf = (raw: string | null): string =>
  (raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function importBrands(tx: Transaction, productsIn: VendorProduct[], report: Report): Promise<Map<string, number>> {
  // One row per distinct brand, de-duplicated case-insensitively by keeping the most frequent
  // spelling; the vendor holds "earth beauty & you", "Earth beauty & you" and "earth beauty &you".
  const votes = new Map<string, Map<string, number>>();
  for (const item of productsIn) {
    const raw = (item.brand ?? '').trim().replace(/\s+/g, ' ');
    const key = brandKeyOf(raw);
    if (key.length === 0) continue;
    const perKey = votes.get(key) ?? new Map<string, number>();
    perKey.set(raw, (perKey.get(raw) ?? 0) + 1);
    votes.set(key, perKey);
  }

  const brandIdByKey = new Map<string, number>();
  const taken = new Set<string>([UNBRANDED_BRAND_SLUG]);

  for (const [key, perKey] of votes) {
    const best = [...perKey.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best === undefined) continue;
    const slug = uniqueSlug(slugify(best[0]) ?? 'brand-' + key.replace(/\s+/g, '-'), taken);
    const inserted = await tx
      .insert(brand)
      .values({ slug, nameBn: TAKE(best[0], 80), nameEn: TAKE(best[0], 80), isActive: true })
      .returning({ id: brand.id });
    const id = inserted[0]?.id;
    if (id === undefined) throw new Error('brand insert returned no id');
    brandIdByKey.set(key, id);
    report.brands += 1;
  }

  const unbranded = await tx
    .insert(brand)
    .values({ slug: UNBRANDED_BRAND_SLUG, nameBn: 'Unbranded', nameEn: 'Unbranded', isActive: true })
    .returning({ id: brand.id });
  const unbrandedId = unbranded[0]?.id;
  if (unbrandedId === undefined) throw new Error('unbranded insert returned no id');
  report.brands += 1;
  return brandIdByKey;
}

async function importProducts(
  tx: Transaction,
  productsIn: VendorProduct[],
  brandIdByKey: Map<string, number>,
  unbrandedId: number,
  categoryIdByVendor: Map<number, number>,
  imagesByUrl: Map<string, string>,
  report: Report,
): Promise<Map<number, number>> {
  const taken = new Set<string>();
  const variantIdByVendor = new Map<number, number>();
  const productIdByVendor = new Map<number, number>();

  for (const item of productsIn) {
    const name = TAKE(item.name.replace(/\s+/g, ' ').trim(), 200);
    const brandId = brandIdByKey.get(brandKeyOf(item.brand)) ?? unbrandedId;
    const vendorCategoryId = item.categories?.[0]?.id;
    const categoryId =
      (vendorCategoryId !== undefined ? categoryIdByVendor.get(vendorCategoryId) : undefined) ??
      categoryIdByVendor.get(-1);
    if (categoryId === undefined) throw new Error('fallback category missing');

    const description = plainText(item.description);
    const slug = uniqueSlug(slugify(name) ?? 'product-' + String(item.id), taken);
    const createdAt = vendorDate(item.created_at);
    const updatedAt = vendorDate(item.updated_at);

    const inserted = await tx
      .insert(product)
      .values({
        slug,
        brandId,
        categoryId,
        nameBn: BENGALI.test(name) ? name : null,
        nameEn: name,
        descriptionBn: description !== null && BENGALI.test(description) ? description : null,
        descriptionEn: description,
        packSize: null,
        shortDescription: null,
        availability: Number(item.quantity) > 0 ? 'in_stock' : 'out_of_stock',
        isPublished: true,
        publishedAt: createdAt,
        createdAt,
        updatedAt,
      })
      .returning({ id: product.id });
    const productId = inserted[0]?.id;
    if (productId === undefined) throw new Error('product insert returned no id');
    productIdByVendor.set(item.id, productId);
    report.products += 1;

    const compareAt =
      item.old_price !== null && Number(item.old_price) > Number(item.price)
        ? Number(item.old_price) * 100
        : null;

    const variant = await tx
      .insert(productVariant)
      .values({
        productId,
        sku: 'ZQ-' + String(item.id),
        isDefault: true,
        labelBn: BENGALI.test(name) ? name : null,
        labelEn: name,
        priceMinor: Number(item.price) * 100,
        compareAtPriceMinor: compareAt,
        isActive: true,
        createdAt,
        updatedAt,
      })
      .returning({ id: productVariant.id });
    const variantId = variant[0]?.id;
    if (variantId === undefined) throw new Error('variant insert returned no id');
    variantIdByVendor.set(item.id, variantId);
    report.variants += 1;

    let sortOrder = 0;
    for (const url of item.images ?? []) {
      const key = imagesByUrl.get(url);
      if (key === undefined) {
        report.imagesMissing += 1;
        continue;
      }
      const asset = await readAsset(key);
      if (asset === null) {
        report.imagesUnusable += 1;
        continue;
      }
      await tx.insert(productImage).values({
        productId,
        baseKey: asset.key,
        contentType: asset.contentType,
        width: asset.width,
        height: asset.height,
        byteSize: asset.byteSize,
        altBn: BENGALI.test(name) ? name : null,
        altEn: name,
        sortOrder,
        isPrimary: sortOrder === 0,
        // The photography came from the owner's own previous storefront, but "the owner asked for a
        // migration" is not the same recorded statement as a reuse licence, so this stays
        // unconfirmed and no screen claims otherwise.
        rightsStatus: 'pending_confirmation',
        rightsNote: 'Imported from the owner previous product record; written reuse confirmation not recorded.',
        createdAt,
      });
      sortOrder += 1;
      report.images += 1;
    }
  }

  return productIdByVendor;
}


/**
 * Recreates a product the vendor has since deleted, for the sole purpose of keeping an order line
 * pointing at something. These rows are never published, never orderable and never listed in the
 * storefront: they exist so order_item.variant_id (NOT NULL) can reference them and history survives.
 */
async function importArchivedOrderProducts(
  tx: Transaction,
  receipts: VendorReceipt[],
  knownProductIds: Set<number>,
  unbrandedId: number,
  categoryId: number,
  variantIdByVendor: Map<number, number>,
  report: Report,
): Promise<void> {
  const seen = new Map<number, { name: string; price: number; at: Date }>();
  for (const receipt of receipts) {
    const at = vendorDate(receipt.created_at);
    for (const item of receipt.receipt_items ?? []) {
      if (knownProductIds.has(item.inventory_id)) continue;
      const existing = seen.get(item.inventory_id);
      if (existing === undefined || at < existing.at) {
        seen.set(item.inventory_id, {
          name: String(item.name ?? 'Item').replace(/\s+/g, ' ').trim(),
          price: Math.round(Number(item.unit_price ?? item.price ?? 0)),
          at,
        });
      }
    }
  }

  const taken = new Set<string>();
  for (const [inventoryId, snapshot] of seen) {
    const name = TAKE(snapshot.name.length > 0 ? snapshot.name : 'Archived item ' + String(inventoryId), 200);
    const slug = uniqueSlug('zq-arch-' + String(inventoryId), taken);
    const inserted = await tx
      .insert(product)
      .values({
        slug,
        brandId: unbrandedId,
        categoryId,
        nameBn: BENGALI.test(name) ? name : null,
        nameEn: name,
        descriptionBn: null,
        descriptionEn: null,
        packSize: null,
        shortDescription: null,
        availability: 'out_of_stock',
        isPublished: false,
        publishedAt: null,
        createdAt: snapshot.at,
        updatedAt: snapshot.at,
      })
      .returning({ id: product.id });
    const productId = inserted[0]?.id;
    if (productId === undefined) throw new Error('archived product insert returned no id');

    const variant = await tx
      .insert(productVariant)
      .values({
        productId,
        sku: 'ZQ-ARCH-' + String(inventoryId),
        isDefault: true,
        labelBn: BENGALI.test(name) ? name : null,
        labelEn: name,
        priceMinor: snapshot.price * 100,
        compareAtPriceMinor: null,
        isActive: false,
        createdAt: snapshot.at,
        updatedAt: snapshot.at,
      })
      .returning({ id: productVariant.id });
    const variantId = variant[0]?.id;
    if (variantId === undefined) throw new Error('archived variant insert returned no id');
    variantIdByVendor.set(inventoryId, variantId);
    report.archivedProducts += 1;
  }
}

async function importCustomers(
  tx: Transaction,
  customersIn: VendorCustomer[],
  report: Report,
): Promise<Map<number, number>> {
  const customerIdByVendor = new Map<number, number>();

  for (const item of customersIn) {
    const phone = normalisePhone(item.phone);
    const rawEmail = (item.email ?? '').trim().toLowerCase();
    const usableEmail =
      rawEmail.length > 0 && rawEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
    const email = usableEmail ? rawEmail : 'zq-' + String(item.id) + '@import.invalid';
    if (!usableEmail) report.customersSyntheticEmail += 1;

    const displayName = (item.name ?? '').trim().replace(/\s+/g, ' ');
    const createdAt = vendorDate(item.created_at);

    const inserted = await tx
      .insert(customer)
      .values({
        email,
        phone,
        displayName: displayName.length >= 2 ? TAKE(displayName, 80) : null,
        status: 'active',
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: customer.id });
    const customerId = inserted[0]?.id;
    if (customerId === undefined) throw new Error('customer insert returned no id');
    customerIdByVendor.set(item.id, customerId);
    report.customers += 1;
  }

  return customerIdByVendor;
}

async function importOrders(
  tx: Transaction,
  receipts: VendorReceipt[],
  customerIdByVendor: Map<number, number>,
  variantIdByVendor: Map<number, number>,
  imagesByUrl: Map<string, string>,
  report: Report,
): Promise<void> {
  for (const receipt of receipts) {
    const mapped = VENDOR_STATUS[receipt.status];
    if (mapped === undefined) {
      report.ordersUnknownStatus += 1;
      continue;
    }

    // The vendor holds two quantity fields. `quantity` is the ordered count; `qty` is a derived
    // field that is stale on some rows (an order of one unit records qty 10 for a Tk 500 item on a
    // Tk 620 order). Using `quantity` reconciles 533 of 559 orders against the vendor's own total,
    // against 461 when `qty` is trusted, so `quantity` is the field that describes what happened.
    const lines = (receipt.receipt_items ?? []).map((item) => {
      const quantity = Math.max(1, Math.trunc(Number(item.quantity ?? 1)));
      const unit = Math.round(Number(item.unit_price ?? item.price ?? 0));
      return { item, quantity, unitMinor: unit * 100 };
    });
    const itemsSubtotalMinor = lines.reduce((sum, line) => sum + line.unitMinor * line.quantity, 0);
    const vendorTotalMinor = Math.round(Number(receipt.total_amount ?? 0)) * 100;
    const shipping = Math.round(Number(receipt.delivery_charge ?? 0)) * 100;

    // The schema requires total = items - discount + shipping, and the vendor's recorded total is
    // authoritative. The difference between it and its own line items is stored as a discount.
    let discount = itemsSubtotalMinor + shipping - vendorTotalMinor;
    if (discount < 0) discount = 0;
    if (discount > itemsSubtotalMinor) discount = itemsSubtotalMinor;
    const totalMinor = itemsSubtotalMinor - discount + shipping;

    const placedAt = vendorDate(receipt.created_at);
    const updatedAt = vendorDate(receipt.updated_at);
    // Cancellation wins over the paid flag: four orders are flagged paid AND cancelled at the
    // vendor, and recording them as completed would put a cancelled order in the revenue figure.
    const paid =
      mapped.status !== 'cancelled' && (receipt.is_paid === true || mapped.status === 'completed');
    const status = paid ? 'completed' : mapped.status;
    const codState = paid ? 'cod_collected' : mapped.cod;

    const contactPhone = normalisePhone(receipt.customer_phone);
    const phone = contactPhone ?? SYNTHETIC_PHONE;
    if (contactPhone === null) report.ordersSyntheticPhone += 1;

    // The vendor's address is a single free-text field, and some rows end with a dangling comma.
    const address = (receipt.customer_address ?? '')
      .replace(/\s+/g, ' ')
      .replace(/[\s,]+$/, '')
      .trim();
    const addressLine = TAKE(address.length >= 5 ? address : address + ' (no address recorded)', 300);
    const recipientName = TAKE((receipt.customer_name ?? '').trim() || 'Customer', 120);
    const zone = receipt.delivery_zone;
    const customerId =
      receipt.customer_id !== null ? (customerIdByVendor.get(receipt.customer_id) ?? null) : null;

    const insertedOrder = await tx
      .insert(order)
      .values({
        orderNumber: 'QBZ' + String(receipt.id),
        customerId,
        paymentMethod: 'cod',
        paymentState: 'not_applicable',
        codState,
        status,
        itemsSubtotalMinor,
        discountMinor: discount,
        shippingMinor: shipping,
        totalMinor,
        placedAt,
        confirmedAt: status === 'pending' ? null : placedAt,
        shippedAt: status === 'shipped' || status === 'delivered' || status === 'completed' ? updatedAt : null,
        deliveredAt: status === 'delivered' || status === 'completed' ? updatedAt : null,
        completedAt: status === 'completed' ? updatedAt : null,
        cancelledAt: status === 'cancelled' ? updatedAt : null,
        cancelledReason: status === 'cancelled' ? 'Cancelled in the previous store (imported)' : null,
        updatedAt,
      })
      .returning({ id: order.id });
    const orderId = insertedOrder[0]?.id;
    if (orderId === undefined) throw new Error('order insert returned no id');

    await tx.insert(orderContact).values({
      orderId,
      recipientName,
      recipientPhone: phone,
      addressLine,
      // `area` is free text on the order, so the vendor's zone becomes its readable label rather
      // than the raw code it stores ("other").
      area: zone === 'Dhaka' ? 'Dhaka' : zone === 'Chattogram' ? 'Chattogram' : zone === 'Others' ? 'Other districts' : 'Not recorded',
      city: TAKE(inferCity(address, zone), 80),
      deliveryNote:
        contactPhone === null
          ? 'Imported: the previous store held no valid Bangladesh mobile number for this order.'
          : null,
      districtCode: zoneToDistrictCode(zone),
      createdAt: placedAt,
    });

    for (const line of lines) {
      const variantId = variantIdByVendor.get(line.item.inventory_id);
      if (variantId === undefined) {
        report.orderItemsMissingVariant += 1;
        continue;
      }
      const name = TAKE(String(line.item.name ?? 'Item').replace(/\s+/g, ' ').trim(), 200);
      const imageKey = line.item.image_url !== null ? imagesByUrl.get(line.item.image_url) : undefined;
      await tx.insert(orderItem).values({
        orderId,
        variantId,
        productNameBn: BENGALI.test(name) ? name : null,
        productNameEn: name,
        variantLabel: null,
        sku: 'ZQ-' + String(line.item.inventory_id),
        unitPriceMinor: line.unitMinor,
        compareAtPriceMinor: null,
        quantity: line.quantity,
        lineTotalMinor: line.unitMinor * line.quantity,
        imageKeySnapshot: imageKey ?? null,
        createdAt: placedAt,
      });
      report.orderItems += 1;
    }

    await tx.insert(orderEvent).values({
      eventKey: 'import:zq:' + String(receipt.id),
      orderId,
      eventType: 'order_placed',
      toValue: 'pending',
      actorType: customerId !== null ? 'customer' : 'guest',
      actorCustomerId: customerId,
      occurredAt: placedAt,
      payload: {
        source: 'zatiq-easy',
        vendorReceiptId: receipt.id,
        vendorStatus: receipt.status,
        vendorTotalAmount: receipt.total_amount,
        vendorDeliveryCharge: receipt.delivery_charge,
        vendorDiscountAmount: receipt.discount_amount,
        vendorIsPaid: receipt.is_paid,
        vendorPaymentType: receipt.payment_type,
        vendorDeliveryZone: receipt.delivery_zone,
        vendorCreatedAt: receipt.created_at,
        vendorUpdatedAt: receipt.updated_at,
        importedAt: new Date().toISOString(),
      },
    });
    report.orders += 1;
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const doReset = args.has('--reset');

  const imageEntries = JSON.parse(
    readFileSync(join(ROOT, 'images.json'), 'utf8'),
  ) as Record<string, ImageEntry>;
  const imagesByUrl = new Map<string, string>();
  for (const [key, entry] of Object.entries(imageEntries)) imagesByUrl.set(entry.url, key);

  const report: Report = {
    categories: 0,
    brands: 0,
    products: 0,
    variants: 0,
    archivedProducts: 0,
    images: 0,
    imagesMissing: 0,
    imagesUnusable: 0,
    customers: 0,
    customersSyntheticEmail: 0,
    orders: 0,
    ordersUnknownStatus: 0,
    ordersSyntheticPhone: 0,
    orderItems: 0,
    orderItemsMissingVariant: 0,
  };

  const vendorProducts = load<VendorProduct[]>('products.json');
  const vendorCustomers = load<VendorCustomer[]>('customers.json');
  const receipts = load<VendorReceipt[]>('receipts.json').concat(
    load<VendorReceipt[]>('receipts-missing.json'),
  );

  await withTransaction(async (tx) => {
    if (doReset) await reset(tx);

    const categoryIdByVendor = await importCategories(tx, report);
    const brandIdByKey = await importBrands(tx, vendorProducts, report);
    const unbrandedRow = await tx
      .select({ id: brand.id })
      .from(brand)
      .where(eq(brand.slug, UNBRANDED_BRAND_SLUG));
    const unbrandedId = unbrandedRow[0]?.id;
    if (unbrandedId === undefined) throw new Error('unbranded brand missing after insert');

    const variantIdByVendor = await importProducts(
      tx,
      vendorProducts,
      brandIdByKey,
      unbrandedId,
      categoryIdByVendor,
      imagesByUrl,
      report,
    );
    const knownProductIds = new Set(vendorProducts.map((item) => item.id));
    await importArchivedOrderProducts(
      tx,
      receipts,
      knownProductIds,
      unbrandedId,
      categoryIdByVendor.get(-1) ?? unbrandedId,
      variantIdByVendor,
      report,
    );

    const customerIdByVendor = await importCustomers(tx, vendorCustomers, report);
    await importOrders(tx, receipts, customerIdByVendor, variantIdByVendor, imagesByUrl, report);
  });

  console.log(JSON.stringify(report, null, 1));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});


