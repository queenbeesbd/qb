/**
 * "Recently added" (D6, Phase 26) against real PostgreSQL.
 *
 * The homepage publishes exactly three products "most recently added", so the claim needs a real stored
 * ordering behind it. These assertions pin the three things that could quietly make that claim false:
 *
 * 1. `created_at` reaches the catalog contract at all, and is a real instant rather than a placeholder.
 * 2. The ordering is `created_at desc` with a deterministic tie-breaker - not name order, not id order,
 *    and not whatever order the planner happened to return.
 * 3. A tie is resolved to the *same* result every time, which is what makes the selection reproducible.
 *
 * The seed is deliberately made to yield **distinct** timestamps (one hour apart in fixture order) so
 * recency can be proven without leaning on a tie-break. The tie case is then constructed explicitly,
 * because "the timestamps happen to differ" is not evidence that equal timestamps behave.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { seedCatalog, seededProductTimestamp } from '../../src/db/seed-catalog';
import { products as fixtureProducts } from '../../src/data/catalog';
import { product } from '../../src/db/schema';
import { withTransaction } from '../../src/db/client';
import { listPublishedProducts } from '../../src/server/catalog/read';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';
import { sql } from 'drizzle-orm';

describe('recently added ordering (database)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  before(async () => {
    fixture = await startMigratedDatabase();
    const report = await seedCatalog();
    assert.equal(report.productsInserted, 22);
  });

  after(async () => {
    await fixture.close();
  });

  it('records a distinct creation instant for every seeded product', async () => {
    const rows = await withTransaction((tx) =>
      tx.select({ slug: product.slug, createdAt: product.createdAt }).from(product),
    );
    assert.equal(rows.length, 22);
    const instants = new Set(rows.map((row) => row.createdAt.toISOString()));
    assert.equal(instants.size, 22, 'no two seeded products share a creation instant');
  });

  it('increases the creation instant with fixture order', async () => {
    const rows = await withTransaction((tx) =>
      tx.select({ slug: product.slug, createdAt: product.createdAt }).from(product),
    );
    const bySlug = new Map(rows.map((row) => [row.slug, row.createdAt]));

    for (const [index, item] of fixtureProducts.entries()) {
      const actual = bySlug.get(item.slug);
      assert.ok(actual, `${item.slug} was seeded`);
      assert.equal(
        actual.toISOString(),
        seededProductTimestamp(index).toISOString(),
        `${item.slug} keeps its declared seed instant`,
      );
    }

    // Strictly increasing across the whole fixture: the last entries are the newest.
    const ordered = fixtureProducts.map((item) => bySlug.get(item.slug)!.getTime());
    for (let i = 1; i < ordered.length; i += 1) {
      assert.ok(ordered[i]! > ordered[i - 1]!, 'seed instants strictly increase with fixture order');
    }
  });

  it('orders the published catalog newest first and exposes createdAt', async () => {
    const rows = await withTransaction((tx) => listPublishedProducts(tx));
    assert.equal(rows.length, 22);

    for (const row of rows) {
      assert.ok(row.createdAt instanceof Date, `${row.slug} carries a Date`);
      assert.ok(!Number.isNaN(row.createdAt.getTime()), `${row.slug} carries a real instant`);
    }

    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1]!;
      const current = rows[i]!;
      const delta = previous.createdAt.getTime() - current.createdAt.getTime();
      assert.ok(delta >= 0, 'the list is non-increasing in creation time');
      if (delta === 0) {
        assert.ok(
          Number(previous.id) > Number(current.id),
          'equal instants fall back to descending id',
        );
      }
    }
  });

  it('selects the three newest as the last three seeded products', async () => {
    const rows = await withTransaction((tx) => listPublishedProducts(tx));
    const newest = rows.slice(0, 3).map((row) => row.slug);
    const expected = fixtureProducts.slice(-3).map((item) => item.slug);
    assert.deepEqual([...newest].sort(), [...expected].sort());
  });

  it('publishes those three in newest-first order, which is the reverse of the seed', async () => {
    const rows = await withTransaction((tx) => listPublishedProducts(tx));
    const expected = fixtureProducts
      .slice(-3)
      .reverse()
      .map((item) => item.slug);
    assert.deepEqual(rows.slice(0, 3).map((row) => row.slug), expected);
  });

  it('promotes a row whose creation instant becomes the newest of all', async () => {
    // The behaviour "a newly added product becomes the lead image" starts here: the ordering is what
    // decides it, and the storefront's hero and "Recently added" section both consume this list.
    const before = await withTransaction((tx) => listPublishedProducts(tx));
    const target = before[before.length - 1]!.slug;
    const newest = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await withTransaction((tx) =>
      tx.execute(sql`update ${product} set created_at = ${newest.toISOString()} where slug = ${target}`),
    );

    const after = await withTransaction((tx) => listPublishedProducts(tx));
    assert.equal(after[0]!.slug, target, 'the newly-created row now leads the catalog');
  });

  it('resolves equal creation instants deterministically by descending id', async () => {
    // Construct the tie the seed deliberately avoids. Two published products are pinned to one
    // instant; the ordering must then be decided by id, and must be the same on a repeated read.
    const tied = new Date('2026-10-20T12:00:00Z');
    const target = fixtureProducts.slice(0, 2).map((item) => item.slug);
    await withTransaction(async (tx) => {
      for (const slug of target) {
        await tx.execute(
          sql`update ${product} set created_at = ${tied.toISOString()} where slug = ${slug}`,
        );
      }
    });

    const first = await withTransaction((tx) => listPublishedProducts(tx));
    const second = await withTransaction((tx) => listPublishedProducts(tx));

    const tiedRows = first.filter((row) => target.includes(row.slug));
    assert.equal(tiedRows.length, 2);
    assert.equal(
      tiedRows[0]!.createdAt.getTime(),
      tiedRows[1]!.createdAt.getTime(),
      'the two rows really do share an instant',
    );
    assert.ok(
      Number(tiedRows[0]!.id) > Number(tiedRows[1]!.id),
      'the higher id comes first when instants are equal',
    );
    assert.deepEqual(
      first.map((row) => row.slug),
      second.map((row) => row.slug),
      'a repeated read returns the identical order',
    );
  });
});
