/**
 * Catalog management against real PostgreSQL.
 *
 * Every assertion is about a database effect, not about a rendered page. The requirements this file
 * exists to prove are the ones a UI cannot: a price cannot be overridden by a client, an out-of-stock
 * product fails the authoritative orderability check, a referenced category cannot be archived, an
 * attached image's metadata comes from the file, and a refused mutation leaves the protected rows
 * untouched while still producing denial evidence.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { sql } from 'drizzle-orm';

import { withTransaction } from '../../src/db/client';
import {
  auditEvent,
  brand as brandTable,
  category as categoryTable,
  permission,
  product as productTable,
  productImage,
  productImageDerivative,
  productVariant,
  role,
  rolePermission,
  staffCredential,
  staffRole,
  staffUser,
} from '../../src/db/schema';
import { seedReferenceData } from '../../src/db/seed';
import { hashPassword } from '../../src/server/auth/password';
import { AuthorizationError, ConflictError, ValidationError } from '../../src/server/authz/authorize';
import { OWNER_ROLE, PERMISSIONS } from '../../src/server/authz/permissions';
import { loadStaffPermissions } from '../../src/server/authz/roles';
import { listAssetKeys } from '../../src/server/catalog/assets';
import { checkOrderability } from '../../src/server/catalog/orderability';
import {
  archiveCategory,
  archiveProduct,
  attachImage,
  createBrand,
  createCategory,
  createProduct,
  listCategoriesForAdmin,
  listProductsForAdmin,
  setAvailability,
  updateProduct,
  type ProductInput,
} from '../../src/server/catalog/service';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

type Actor = { staffUserId: number; permissions: ReadonlySet<string>; roleCodes: string[] };

describe('catalog management', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let owner: Actor;
  let limited: Actor;
  let categoryId: number;
  let brandId: number;
  let keyCursor = 0;

  async function makeStaff(email: string, roleId: number | null): Promise<number> {
    return withTransaction(async (tx) => {
      const inserted = await tx
        .insert(staffUser)
        .values({ email, displayName: email })
        .returning({ id: staffUser.id });
      const id = inserted[0]?.id;
      if (id === undefined) throw new Error('staff insert returned no id');
      await tx.insert(staffCredential).values({
        staffUserId: id,
        kind: 'password',
        secretHash: await hashPassword('password-1'),
        hashAlgorithm: 'scrypt',
      });
      if (roleId !== null) {
        await tx.insert(staffRole).values({ staffUserId: id, roleId, grantedBy: id });
      }
      return id;
    });
  }

  /** Product audit actions, oldest first, for one product. */
  async function productAudit(productId: number): Promise<{ action: string; actor: number | null; roles: string[] }[]> {
    return withTransaction((tx) =>
      tx
        .select({
          action: auditEvent.action,
          actor: auditEvent.actorStaffId,
          roles: auditEvent.actorRoleCodes,
        })
        .from(auditEvent)
        .where(sql`${auditEvent.entityType} = 'product' and ${auditEvent.entityId} = ${productId}`)
        .orderBy(auditEvent.id),
    );
  }

  async function availabilityOf(productId: number): Promise<string | null> {
    const rows = await withTransaction((tx) =>
      tx
        .select({ availability: productTable.availability })
        .from(productTable)
        .where(sql`${productTable.id} = ${productId}`),
    );
    return rows[0]?.availability ?? null;
  }

  async function priceOf(productId: number): Promise<number | null> {
    const rows = await withTransaction((tx) =>
      tx
        .select({ priceMinor: productVariant.priceMinor })
        .from(productVariant)
        .where(sql`${productVariant.productId} = ${productId} and ${productVariant.isDefault}`),
    );
    return rows[0]?.priceMinor ?? null;
  }

  before(async () => {
    fixture = await startMigratedDatabase();
    await seedReferenceData();

    const ownerRoleId = await withTransaction(async (tx) => {
      const rows = await tx.select({ id: role.id }).from(role).where(sql`${role.code} = ${OWNER_ROLE.code}`);
      return rows[0]?.id ?? 0;
    });

    // A principal with no catalog permission. The shipped seed creates no non-owner role, so the test
    // creates one - which keeps the seed exactly what the owner approved (D10).
    const limitedRoleId = await withTransaction(async (tx) => {
      const inserted = await tx
        .insert(role)
        .values({ code: 'catalog_limited', name: 'Catalog limited', isOwnerLevel: false })
        .returning({ id: role.id });
      const id = inserted[0]?.id;
      if (id === undefined) throw new Error('limited role insert returned no id');
      await tx.insert(rolePermission).values(
        await tx
          .select({ roleId: sql<number>`${id}::bigint`, permissionId: permission.id })
          .from(permission)
          .where(sql`${permission.code} = ${PERMISSIONS.auditRead}`),
      );
      return id;
    });

    const ownerId = await makeStaff('catalog-owner@example.test', ownerRoleId);
    const limitedId = await makeStaff('catalog-limited@example.test', limitedRoleId);
    owner = {
      staffUserId: ownerId,
      permissions: await withTransaction((tx) => loadStaffPermissions(tx, ownerId)),
      roleCodes: [OWNER_ROLE.code],
    };
    limited = {
      staffUserId: limitedId,
      permissions: await withTransaction((tx) => loadStaffPermissions(tx, limitedId)),
      roleCodes: ['catalog_limited'],
    };

    // Prerequisites: `product.category_id` and `product.brand_id` are both NOT NULL.
    const created = await withTransaction((tx) => createBrand(tx, owner, { nameBn: 'টেস্ট ব্র্যান্ড', nameEn: 'Test Brand' }));
    brandId = created.brandId;
    const category = await withTransaction((tx) =>
      createCategory(tx, owner, { nameBn: 'স্কিন কেয়ার', nameEn: 'Skincare', sortOrder: '1' }),
    );
    categoryId = category.categoryId;
  });

  after(async () => {
    await fixture.close();
  });

  function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
    return {
      nameBn: 'নতুন পণ্য',
      nameEn: 'A New Product',
      categoryId: String(categoryId),
      brandId: String(brandId),
      price: '750',
      availability: 'in_stock',
      ...overrides,
    };
  }

  function nextAssetKey(): string {
    const keys = assetKeys;
    const key = keys[keyCursor % keys.length];
    keyCursor += 1;
    if (key === undefined) throw new Error('no catalog asset available');
    return key;
  }

  let assetKeys: string[] = [];

  it('has a local asset inventory to attach from', async () => {
    assetKeys = await listAssetKeys();
    assert.ok(assetKeys.length > 0, 'expected generated catalog assets on disk');
  });

  it('creates a product with an integer-poisha price and an audited owner', async () => {
    const created = await withTransaction((tx) => createProduct(tx, owner, productInput()));
    assert.ok(created.productId > 0);
    assert.equal(await priceOf(created.productId), 75_000);
    assert.equal(await availabilityOf(created.productId), 'in_stock');

    const audit = await productAudit(created.productId);
    assert.deepEqual(audit.map((row) => row.action), ['catalog.product_created']);
    assert.equal(audit[0]?.actor, owner.staffUserId, 'the actor is the authenticated owner');
    assert.deepEqual(audit[0]?.roles, [OWNER_ROLE.code]);
  });

  it('converts a fractional price exactly, with no floating-point residue', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Fractional Price', price: '750.1' })),
    );
    assert.equal(await priceOf(created.productId), 75_010);
  });

  it('defaults a new product to out of stock, so nothing is orderable by accident', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Default State', availability: 'out_of_stock' })),
    );
    assert.equal(await availabilityOf(created.productId), 'out_of_stock');
    const result = await withTransaction((tx) => checkOrderability(tx, created.productId));
    assert.equal(result.orderable, false);
  });

  it('persists an availability change and audits it as its own action', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Toggle Me', availability: 'in_stock' })),
    );
    await withTransaction((tx) =>
      setAvailability(tx, owner, { productId: String(created.productId), availability: 'out_of_stock' }),
    );

    assert.equal(await availabilityOf(created.productId), 'out_of_stock');
    const audit = await productAudit(created.productId);
    assert.deepEqual(
      audit.map((row) => row.action),
      ['catalog.product_created', 'catalog.availability_changed'],
    );
    assert.ok(audit.every((row) => row.actor === owner.staffUserId));
  });

  it('does not write a second audit record when the availability is unchanged', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'No Repeat', availability: 'in_stock' })),
    );
    await withTransaction((tx) =>
      setAvailability(tx, owner, { productId: String(created.productId), availability: 'in_stock' }),
    );
    const audit = await productAudit(created.productId);
    assert.deepEqual(audit.map((row) => row.action), ['catalog.product_created']);
  });

  it('refuses any availability value outside the two documented states, and changes nothing', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Bad State', availability: 'in_stock' })),
    );

    for (const bad of ['unknown', 'IN_STOCK', 'in stock', '5', '', 'available', 'true']) {
      await assert.rejects(
        withTransaction((tx) =>
          setAvailability(tx, owner, { productId: String(created.productId), availability: bad }),
        ),
        ValidationError,
        `expected ${JSON.stringify(bad)} to be refused`,
      );
    }

    assert.equal(await availabilityOf(created.productId), 'in_stock', 'the refusal changed nothing');
    const audit = await productAudit(created.productId);
    assert.deepEqual(audit.map((row) => row.action), ['catalog.product_created'], 'no change was audited');
  });

  it('fails the authoritative orderability check for an out-of-stock product', async () => {
    // Published, so the refusal is unambiguously about availability and not about publication.
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Not Orderable', availability: 'out_of_stock', isPublished: 'on' })),
    );
    const result = await withTransaction((tx) => checkOrderability(tx, created.productId));
    assert.deepEqual(result, { orderable: false, reason: 'out_of_stock' });
  });

  it('refuses an unpublished product even when it is in stock', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Unpublished', availability: 'in_stock' })),
    );
    const result = await withTransaction((tx) => checkOrderability(tx, created.productId));
    assert.deepEqual(result, { orderable: false, reason: 'unpublished' });
  });

  it('accepts a published, in-stock product and returns its priced variant', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Orderable', availability: 'in_stock', isPublished: 'on' })),
    );
    const result = await withTransaction((tx) => checkOrderability(tx, created.productId));
    assert.equal(result.orderable, true);
    assert.ok(result.orderable && result.variantId > 0);
  });

  it('refuses a published product as soon as it is marked out of stock', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Published Then Empty', availability: 'in_stock', isPublished: 'on' })),
    );
    await withTransaction((tx) =>
      setAvailability(tx, owner, { productId: String(created.productId), availability: 'out_of_stock' }),
    );
    const result = await withTransaction((tx) => checkOrderability(tx, created.productId));
    assert.deepEqual(result, { orderable: false, reason: 'out_of_stock' });
  });

  it('refuses a category that does not exist, and writes nothing', async () => {
    const before = await withTransaction((tx) => listProductsForAdmin(tx, { limit: 100 }));
    await assert.rejects(
      withTransaction((tx) =>
        createProduct(tx, owner, productInput({ nameEn: 'Ghost Category', categoryId: '999999' })),
      ),
      ValidationError,
    );
    const afterRows = await withTransaction((tx) => listProductsForAdmin(tx, { limit: 100 }));
    assert.equal(afterRows.total, before.total, 'no product was created');
  });

  it('refuses a brand that does not exist', async () => {
    await assert.rejects(
      withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'Ghost Brand', brandId: '999999' }))),
      ValidationError,
    );
  });

  it('refuses a malformed price, a zero price and a comparison price that is not higher', async () => {
    await assert.rejects(
      withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'Bad Price', price: '12.345' }))),
      ValidationError,
    );
    await assert.rejects(
      withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'Bad Price 2', price: '750,00' }))),
      ValidationError,
    );
    await assert.rejects(
      withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'Zero Price', price: '0' }))),
      ValidationError,
    );
    await assert.rejects(
      withTransaction((tx) =>
        createProduct(tx, owner, productInput({ nameEn: 'Bad Compare', price: '750', compareAtPrice: '700' })),
      ),
      ValidationError,
    );
  });

  it('refuses a product that is missing one of its two names', async () => {
    await assert.rejects(
      withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'English Only', nameBn: '' }))),
      ValidationError,
    );
    await assert.rejects(
      withTransaction((tx) => createProduct(tx, owner, productInput({ nameBn: 'শুধু বাংলা', nameEn: '' }))),
      ValidationError,
    );
  });

  it('refuses a duplicate slug', async () => {
    await withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'Unique One', slug: 'unique-slug' })));
    await assert.rejects(
      withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'Unique Two', slug: 'unique-slug' }))),
      ConflictError,
    );
  });

  it('keeps a client from overriding protected fields', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Protected Fields', price: '750' })),
    );

    // A request that submits extra fields: they have nowhere to go, because the update object is built
    // from validated values only. `onHand` in particular cannot reach the inventory ledger, which this
    // phase never writes.
    const hostile = {
      ...productInput({ nameEn: 'Protected Fields', price: '999' }),
      id: '999999',
      deletedAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2020-01-01T00:00:00.000Z',
      onHand: '9999',
      reserved: '9999',
    } as unknown as ProductInput;
    await withTransaction((tx) => updateProduct(tx, owner, String(created.productId), hostile));

    const rows = await withTransaction((tx) =>
      tx
        .select({ id: productTable.id, deletedAt: productTable.deletedAt })
        .from(productTable)
        .where(sql`${productTable.id} = ${created.productId}`),
    );
    assert.equal(rows[0]?.id, created.productId, 'the id was not overwritten');
    assert.equal(rows[0]?.deletedAt, null, 'a submitted field did not soft-delete the row');
    assert.equal(await priceOf(created.productId), 99_900, 'the price came from the validated field');

    const balances = await withTransaction((tx) =>
      tx.select({ total: sql<number>`count(*)::int` }).from(sql`inventory_balance`),
    );
    assert.equal(balances[0]?.total, 0, 'no inventory row was created by a submitted field');
  });

  it('refuses to archive a category that still has live products', async () => {
    const category = await withTransaction((tx) =>
      createCategory(tx, owner, { nameBn: 'ব্যবহৃত', nameEn: 'In Use' }),
    );
    await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Holds The Category', categoryId: String(category.categoryId) })),
    );

    await assert.rejects(
      withTransaction((tx) => archiveCategory(tx, owner, String(category.categoryId))),
      ConflictError,
    );

    const rows = await withTransaction((tx) =>
      tx
        .select({ deletedAt: categoryTable.deletedAt })
        .from(categoryTable)
        .where(sql`${categoryTable.id} = ${category.categoryId}`),
    );
    assert.equal(rows[0]?.deletedAt, null, 'the category was not archived');
  });

  it('archives a category that nothing references', async () => {
    const category = await withTransaction((tx) =>
      createCategory(tx, owner, { nameBn: 'অব্যবহৃত', nameEn: 'Unused' }),
    );
    await withTransaction((tx) => archiveCategory(tx, owner, String(category.categoryId)));

    const rows = await withTransaction((tx) =>
      tx
        .select({ deletedAt: categoryTable.deletedAt })
        .from(categoryTable)
        .where(sql`${categoryTable.id} = ${category.categoryId}`),
    );
    assert.notEqual(rows[0]?.deletedAt, null);
  });

  it('archives a product, unpublishes it, and preserves the owner availability statement', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Archive Me', availability: 'in_stock', isPublished: 'on' })),
    );
    await withTransaction((tx) => archiveProduct(tx, owner, String(created.productId)));

    const rows = await withTransaction((tx) =>
      tx
        .select({
          deletedAt: productTable.deletedAt,
          isPublished: productTable.isPublished,
          availability: productTable.availability,
        })
        .from(productTable)
        .where(sql`${productTable.id} = ${created.productId}`),
    );
    assert.notEqual(rows[0]?.deletedAt, null);
    assert.equal(rows[0]?.isPublished, false, 'an archived product is not published');
    assert.equal(rows[0]?.availability, 'in_stock', 'the availability statement is preserved');

    const result = await withTransaction((tx) => checkOrderability(tx, created.productId));
    assert.deepEqual(result, { orderable: false, reason: 'not_orderable' });
  });

  it('attaches a real local asset and derives its metadata from the file', async () => {
    const key = nextAssetKey();
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'With Image' })),
    );
    const attached = await withTransaction((tx) =>
      attachImage(tx, owner, {
        productId: String(created.productId),
        key,
        altBn: 'ছবি',
        altEn: 'An image',
      }),
    );
    assert.equal(attached.imageId.length, 36);

    const image = await withTransaction((tx) =>
      tx
        .select({
          contentType: productImage.contentType,
          width: productImage.width,
          height: productImage.height,
          byteSize: productImage.byteSize,
          isPrimary: productImage.isPrimary,
          rightsStatus: productImage.rightsStatus,
          baseKey: productImage.baseKey,
        })
        .from(productImage)
        .where(sql`${productImage.id} = ${attached.imageId}`),
    );
    assert.equal(image[0]?.baseKey, key);
    assert.equal(image[0]?.contentType, 'image/jpeg');
    assert.equal(image[0]?.width, 600, 'width came from the JPEG header');
    assert.equal(image[0]?.height, 800);
    assert.ok((image[0]?.byteSize ?? 0) > 0, 'the byte size came from the file');
    assert.equal(image[0]?.isPrimary, true, 'the first image becomes primary');
    // The demo photography is not cleared, and recording it as cleared would be a claim we cannot support.
    assert.equal(image[0]?.rightsStatus, 'pending_confirmation');

    const derivatives = await withTransaction((tx) =>
      tx
        .select({
          width: productImageDerivative.width,
          format: productImageDerivative.format,
          byteSize: productImageDerivative.byteSize,
          storageKey: productImageDerivative.storageKey,
        })
        .from(productImageDerivative)
        .where(sql`${productImageDerivative.productImageId} = ${attached.imageId}`),
    );
    assert.equal(derivatives.length, 4, 'one row per generated variant');
    assert.ok(derivatives.every((row) => row.byteSize > 0));
    assert.ok(derivatives.every((row) => row.format === 'jpeg' || row.format === 'webp'));
    assert.ok(derivatives.every((row) => row.storageKey.startsWith('/catalog/')));
  });

  it('refuses an image key that is not in the inventory, and every path-shaped key', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Bad Image' })),
    );

    await assert.rejects(
      withTransaction((tx) =>
        attachImage(tx, owner, { productId: String(created.productId), key: 'no-such-asset', altEn: 'x' }),
      ),
      ValidationError,
    );
    for (const bad of ['../public/catalog/x', '/etc/passwd', 'http://example.test/x', 'a/b', 'Key']) {
      await assert.rejects(
        withTransaction((tx) =>
          attachImage(tx, owner, { productId: String(created.productId), key: bad, altEn: 'x' }),
        ),
        ValidationError,
        `expected ${JSON.stringify(bad)} to be refused`,
      );
    }

    const rows = await withTransaction((tx) =>
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(productImage)
        .where(sql`${productImage.productId} = ${created.productId}`),
    );
    assert.equal(rows[0]?.total, 0, 'nothing was attached');
  });

  it('refuses an image with no alt text in either language', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'No Alt' })),
    );
    await assert.rejects(
      withTransaction((tx) =>
        attachImage(tx, owner, { productId: String(created.productId), key: nextAssetKey(), altBn: '', altEn: '' }),
      ),
      ValidationError,
    );
  });

  it('refuses to attach one asset to two products', async () => {
    const key = nextAssetKey();
    const first = await withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'Asset Owner A' })));
    const second = await withTransaction((tx) => createProduct(tx, owner, productInput({ nameEn: 'Asset Owner B' })));

    await withTransaction((tx) =>
      attachImage(tx, owner, { productId: String(first.productId), key, altEn: 'first' }),
    );
    await assert.rejects(
      withTransaction((tx) =>
        attachImage(tx, owner, { productId: String(second.productId), key, altEn: 'second' }),
      ),
      ConflictError,
      'base_key is globally unique, so an asset belongs to one product',
    );
  });

  it('lets the owner choose a different primary image', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Two Images' })),
    );
    const firstKey = nextAssetKey();
    let secondKey = nextAssetKey();
    while (secondKey === firstKey) secondKey = nextAssetKey();

    const first = await withTransaction((tx) =>
      attachImage(tx, owner, { productId: String(created.productId), key: firstKey, altEn: 'first' }),
    );
    const second = await withTransaction((tx) =>
      attachImage(tx, owner, { productId: String(created.productId), key: secondKey, altEn: 'second', isPrimary: 'on' }),
    );

    const images = await withTransaction((tx) =>
      tx
        .select({ id: productImage.id, isPrimary: productImage.isPrimary })
        .from(productImage)
        .where(sql`${productImage.productId} = ${created.productId} and ${productImage.deletedAt} is null`),
    );
    assert.equal(images.length, 2);
    assert.equal(images.filter((image) => image.isPrimary).length, 1, 'exactly one primary');
    assert.equal(images.find((image) => image.id === second.imageId)?.isPrimary, true);
    assert.equal(images.find((image) => image.id === first.imageId)?.isPrimary, false);
  });

  it('pages the product list with an exact total, and never repeats a row across pages', async () => {
    for (let index = 0; index < 4; index += 1) {
      await withTransaction((tx) =>
        createProduct(tx, owner, productInput({ nameEn: `Paged Product ${index}`, availability: 'in_stock' })),
      );
    }

    const first = await withTransaction((tx) => listProductsForAdmin(tx, { limit: 2, offset: 0 }));
    const second = await withTransaction((tx) => listProductsForAdmin(tx, { limit: 2, offset: 2 }));

    assert.equal(first.rows.length, 2);
    assert.equal(first.total >= 4, true);
    assert.equal(first.total, second.total, 'the count describes the same filtered set');

    const firstIds = new Set(first.rows.map((row) => row.id));
    assert.equal(
      second.rows.every((row) => !firstIds.has(row.id)),
      true,
      'a page never repeats a row from the previous page',
    );
  });

  it('narrows the product list by search and availability over the same predicate it counts', async () => {
    const created = await withTransaction((tx) =>
      createProduct(tx, owner, productInput({ nameEn: 'Narrow Target', availability: 'out_of_stock' })),
    );

    const byName = await withTransaction((tx) => listProductsForAdmin(tx, { search: 'Narrow Target' }));
    assert.equal(byName.total, 1);
    assert.equal(byName.rows[0]?.id, created.productId);

    const outOfStock = await withTransaction((tx) =>
      listProductsForAdmin(tx, { search: 'Narrow Target', availability: 'out_of_stock' }),
    );
    assert.equal(outOfStock.total, 1);

    // The same search with the other availability state matches nothing, and says so rather than
    // returning the product anyway.
    const inStock = await withTransaction((tx) =>
      listProductsForAdmin(tx, { search: 'Narrow Target', availability: 'in_stock' }),
    );
    assert.equal(inStock.total, 0);
    assert.equal(inStock.rows.length, 0);

    // An archived product never appears in a search, whatever the term.
    await withTransaction((tx) => archiveProduct(tx, owner, String(created.productId)));
    const afterArchive = await withTransaction((tx) => listProductsForAdmin(tx, { search: 'Narrow Target' }));
    assert.equal(afterArchive.total, 0);
  });

  it('pages and filters the category list, with a live product count per row', async () => {
    const created = await withTransaction((tx) =>
      createCategory(tx, owner, { nameBn: 'পেজ', nameEn: 'Paged Category', sortOrder: '5', isVisible: 'on' }),
    );

    const byName = await withTransaction((tx) => listCategoriesForAdmin(tx, { search: 'Paged Category' }));
    assert.equal(byName.total, 1);
    assert.equal(byName.rows[0]?.id, created.categoryId);

    const hiddenOnly = await withTransaction((tx) =>
      listCategoriesForAdmin(tx, { search: 'Paged Category', visibility: 'hidden' }),
    );
    assert.equal(hiddenOnly.total, 0, 'a visible category is not in the hidden filter');

    const visibleOnly = await withTransaction((tx) =>
      listCategoriesForAdmin(tx, { search: 'Paged Category', visibility: 'visible' }),
    );
    assert.equal(visibleOnly.total, 1);

    const first = await withTransaction((tx) => listCategoriesForAdmin(tx, { limit: 1, offset: 0 }));
    const second = await withTransaction((tx) => listCategoriesForAdmin(tx, { limit: 1, offset: 1 }));
    assert.equal(first.rows.length, 1);
    assert.equal(first.total, second.total);
    assert.notEqual(first.rows[0]?.id, second.rows[0]?.id, 'consecutive pages are different rows');
  });

  it('refuses a catalog mutation from a principal without catalog.write, and leaves no row', async () => {
    const before = await withTransaction((tx) => listProductsForAdmin(tx, { limit: 100 }));

    await assert.rejects(
      withTransaction((tx) => createProduct(tx, limited, productInput({ nameEn: 'Sneaky Product' }))),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) => setAvailability(tx, limited, { productId: '1', availability: 'in_stock' })),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) =>
        createCategory(tx, limited, { nameBn: 'লুকানো', nameEn: 'Sneaky Category' }),
      ),
      AuthorizationError,
    );

    const afterRows = await withTransaction((tx) => listProductsForAdmin(tx, { limit: 100 }));
    assert.equal(afterRows.total, before.total, 'the refused mutation changed no protected state');

    const sneaky = await withTransaction((tx) =>
      tx
        .select({ id: productTable.id })
        .from(productTable)
        .where(sql`${productTable.nameEn} = 'Sneaky Product'`),
    );
    assert.equal(sneaky.length, 0, 'no product row exists');

    // The refusal is recorded durably, in its own transaction, naming the acting session - which is what
    // proves the denial survived the rollback of the refused action (F8).
    const denials = await withTransaction((tx) =>
      tx
        .select({ actor: auditEvent.actorStaffId, action: auditEvent.action })
        .from(auditEvent)
        .where(sql`${auditEvent.action} = 'admin.action_denied'`),
    );
    assert.ok(
      denials.some((row) => row.actor === limited.staffUserId),
      'the refusal names the acting session',
    );
  });

  it('does not write any inventory movement, which this phase deliberately leaves unused', async () => {
    const rows = await withTransaction((tx) =>
      tx.select({ total: sql<number>`count(*)::int` }).from(sql`inventory_movement`),
    );
    assert.equal(rows[0]?.total, 0, 'availability is a state, not a quantity (ADR 0010)');
  });
});
