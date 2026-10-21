import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { staffUser } from './identity';
import {
  colIn,
  lenAtMost,
  IMAGE_FORMAT,
  IMAGE_RIGHTS_STATUS,
  IMPORT_ENTITY_TYPE,
  PRODUCT_AVAILABILITY,
} from './values';

/**
 * Catalog, imagery and curation - data-model section 5.
 *
 * Bilingual text is stored as paired bn/en columns rather than a translation table, so a missing
 * locale is impossible rather than merely discouraged (data-model 5.1).
 */

export const brand = pgTable(
  'brand',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    slug: text('slug').notNull(),
    nameBn: text('name_bn').notNull(),
    nameEn: text('name_en').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('brand_slug_unique').on(t.slug),
    index('brand_active_name_idx').on(t.isActive, t.nameEn),
    check('brand_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('brand_name_bn_len', sql`char_length(${t.nameBn}) between 1 and 80`),
    check('brand_name_en_len', sql`char_length(${t.nameEn}) between 1 and 80`),
  ],
);

export const category = pgTable(
  'category',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    slug: text('slug').notNull(),
    parentId: bigint('parent_id', { mode: 'number' }).references((): AnyPgColumn => category.id, {
      onDelete: 'restrict',
    }),
    nameBn: text('name_bn').notNull(),
    nameEn: text('name_en').notNull(),
    descriptionBn: text('description_bn'),
    descriptionEn: text('description_en'),
    sortOrder: integer('sort_order').notNull().default(0),
    isVisible: boolean('is_visible').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('category_slug_unique').on(t.slug),
    index('category_visible_sort_idx').on(t.isVisible, t.sortOrder),
    index('category_parent_idx').on(t.parentId),
    check('category_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('category_name_bn_len', sql`char_length(${t.nameBn}) between 1 and 80`),
    check('category_name_en_len', sql`char_length(${t.nameEn}) between 1 and 80`),
    check('category_not_own_parent', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check('category_sort_order_non_negative', sql`${t.sortOrder} >= 0`),
  ],
);

export const product = pgTable(
  'product',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    slug: text('slug').notNull(),
    brandId: bigint('brand_id', { mode: 'number' })
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict' }),
    categoryId: bigint('category_id', { mode: 'number' })
      .notNull()
      .references(() => category.id, { onDelete: 'restrict' }),
    nameBn: text('name_bn').notNull(),
    nameEn: text('name_en').notNull(),
    descriptionBn: text('description_bn'),
    descriptionEn: text('description_en'),
    /**
     * The one-line summary shown under the price on the product page (Phase 35, owner decision).
     *
     * Deliberately **not** bilingual: it is a short shelf line, not catalog copy, and the storefront
     * interface is English only (Phase 28). The long description above stays bilingual because it is
     * owner content in both scripts.
     *
     * Nullable, and null means "no summary" - the product page then renders the price alone rather
     * than an empty paragraph.
     */
    shortDescription: text('short_description'),
    packSize: text('pack_size'),
    /**
     * Owner-controlled availability (D19). **Defaults to `out_of_stock` on purpose**: the fail-safe
     * direction is that a product nobody has confirmed as available cannot be ordered, so a new row
     * is never silently orderable. The owner sets `in_stock` deliberately.
     *
     * This is a state, not a quantity. `docs/decisions/0010-availability-toggle-scope.md` records why
     * no ledger, reservation or deduction participates in it, and what that leaves unguaranteed.
     */
    availability: text('availability').notNull().default('out_of_stock'),
    isPublished: boolean('is_published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('product_slug_unique').on(t.slug),
    index('product_category_published_idx').on(t.categoryId, t.isPublished, t.createdAt.desc()),
    index('product_brand_published_idx').on(t.brandId, t.isPublished),
    index('product_live_idx')
      .on(t.isPublished, t.updatedAt.desc())
      .where(sql`${t.deletedAt} is null`),
    // The storefront's orderability gate reads availability for published, non-deleted rows.
    index('product_orderable_idx')
      .on(t.availability)
      .where(sql`${t.deletedAt} is null and ${t.isPublished}`),
    check('product_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('product_name_bn_len', sql`char_length(${t.nameBn}) between 1 and 200`),
    check('product_name_en_len', sql`char_length(${t.nameEn}) between 1 and 200`),
    check('product_published_needs_timestamp', sql`${t.isPublished} = false or ${t.publishedAt} is not null`),
    check('product_deleted_not_published', sql`${t.deletedAt} is null or ${t.isPublished} = false`),
    check('product_availability_valid', colIn('availability', PRODUCT_AVAILABILITY)),
    // A shelf line, bounded at 500 characters by the documented input rule. The schema bounds it too,
    // so a value written outside the form cannot exceed what the interface promises.
    check('product_short_description_len', sql`${t.shortDescription} is null or char_length(${t.shortDescription}) between 1 and 500`),
  ],
);

export const productVariant = pgTable(
  'product_variant',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => product.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    optionValues: jsonb('option_values'),
    isDefault: boolean('is_default').notNull().default(false),
    labelBn: text('label_bn'),
    labelEn: text('label_en'),
    priceMinor: integer('price_minor').notNull(),
    compareAtPriceMinor: integer('compare_at_price_minor'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_variant_sku_unique').on(t.sku),
    uniqueIndex('product_variant_default_unique')
      .on(t.productId)
      .where(sql`${t.isDefault}`),
    index('product_variant_product_active_idx').on(t.productId, t.isActive),
    check('product_variant_sku_len', lenAtMost('sku', 64)),
    check('product_variant_price_non_negative', sql`${t.priceMinor} >= 0`),
    check(
      'product_variant_compare_at_strictly_greater',
      sql`${t.compareAtPriceMinor} is null or ${t.compareAtPriceMinor} > ${t.priceMinor}`,
    ),
  ],
);

export const productImage = pgTable(
  'product_image',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => product.id, { onDelete: 'restrict' }),
    baseKey: text('base_key').notNull(),
    contentType: text('content_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: integer('byte_size').notNull(),
    altBn: text('alt_bn'),
    altEn: text('alt_en'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    rightsStatus: text('rights_status').notNull().default('unknown'),
    rightsNote: text('rights_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    uploadedBy: bigint('uploaded_by', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('product_image_base_key_unique').on(t.baseKey),
    uniqueIndex('product_image_primary_unique')
      .on(t.productId)
      .where(sql`${t.isPrimary} and ${t.deletedAt} is null`),
    index('product_image_product_sort_idx').on(t.productId, t.sortOrder),
    check('product_image_rights_status_valid', colIn('rights_status', IMAGE_RIGHTS_STATUS)),
    check('product_image_byte_size_positive', sql`${t.byteSize} > 0`),
    check('product_image_dimensions_positive', sql`${t.width} > 0 and ${t.height} > 0`),
    check('product_image_sort_order_non_negative', sql`${t.sortOrder} >= 0`),
    // An image cannot be marked cleared without a recorded basis (data-model 5.4).
    check('product_image_cleared_needs_note', sql`${t.rightsStatus} <> 'cleared' or ${t.rightsNote} is not null`),
  ],
);

export const productImageDerivative = pgTable(
  'product_image_derivative',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productImageId: uuid('product_image_id')
      .notNull()
      .references(() => productImage.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    width: integer('width').notNull(),
    format: text('format').notNull(),
    byteSize: integer('byte_size').notNull(),
    checksum: text('checksum'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_image_derivative_storage_key_unique').on(t.storageKey),
    uniqueIndex('product_image_derivative_variant_unique').on(t.productImageId, t.width, t.format),
    check('product_image_derivative_format_valid', colIn('format', IMAGE_FORMAT)),
    check('product_image_derivative_byte_size_positive', sql`${t.byteSize} > 0`),
  ],
);

export const collection = pgTable(
  'collection',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    code: text('code').notNull(),
    titleBn: text('title_bn').notNull(),
    titleEn: text('title_en').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collection_code_unique').on(t.code),
    check('collection_code_format', sql`${t.code} ~ '^[a-z][a-z0-9_]*$'`),
  ],
);

export const collectionItem = pgTable(
  'collection_item',
  {
    collectionId: bigint('collection_id', { mode: 'number' })
      .notNull()
      .references(() => collection.id, { onDelete: 'cascade' }),
    productVariantId: bigint('product_variant_id', { mode: 'number' })
      .notNull()
      .references(() => productVariant.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.productVariantId] }),
    uniqueIndex('collection_item_position_unique').on(t.collectionId, t.position),
    check('collection_item_position_non_negative', sql`${t.position} >= 0`),
  ],
);

export const importRecord = pgTable(
  'import_record',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: bigint('entity_id', { mode: 'number' }).notNull(),
    sourceSystem: text('source_system').notNull(),
    sourceId: text('source_id').notNull(),
    sourceUrl: text('source_url'),
    sourceAssetUrl: text('source_asset_url'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true, mode: 'date' }),
    importedAt: timestamp('imported_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    importRunId: uuid('import_run_id'),
  },
  (t) => [
    uniqueIndex('import_record_idempotency_unique').on(t.entityType, t.sourceSystem, t.sourceId),
    index('import_record_entity_idx').on(t.entityType, t.entityId),
    index('import_record_run_idx').on(t.importRunId),
    check('import_record_entity_type_valid', colIn('entity_type', IMPORT_ENTITY_TYPE)),
  ],
);
