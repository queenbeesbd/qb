import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ConflictError, ValidationError } from '../../src/server/authz/authorize';
import { PERMISSIONS } from '../../src/server/authz/permissions';
import {
  addHeroImage,
  listHeroImages,
  removeHeroImage,
  reorderHeroImages,
  updateHeroImage,
} from '../../src/server/settings/hero';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

/**
 * The homepage hero carousel against real PostgreSQL.
 *
 * The owner's rules are short and absolute: one to ten images, no duplicates, an explicit order, and
 * a description that can be corrected without removing the banner. These tests pin each refusal and
 * the order the storefront actually reads.
 *
 * The two asset keys used here are the generated sample banners in `public/hero`. A key that is not in
 * that inventory is refused, which is what keeps the database from naming a path the shop cannot
 * serve.
 */

describe('homepage hero carousel', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let staffId: number;

  const actor = () => ({
    staffUserId: staffId,
    permissions: new Set([PERMISSIONS.settingsWrite]),
    roleCodes: ['owner'],
  });

  before(async () => {
    fixture = await startMigratedDatabase();
    const staff = await fixture.pool.query<{ id: string }>(
      `insert into staff_user (email, display_name) values ('hero-config@example.test', 'Hero Config') returning id`,
    );
    staffId = Number(staff.rows[0]?.id);
  });

  after(async () => {
    await fixture.close();
  });

  it('adds images in order and saves the owner\'s sequence', async () => {
    await fixture.db.transaction((tx) =>
      addHeroImage(tx, actor(), { key: 'hero-1', alt: 'Wooden hair brushes in a basket' }),
    );
    await fixture.db.transaction((tx) =>
      addHeroImage(tx, actor(), { key: 'hero-2', alt: 'Pinkflash makeup collection' }),
    );

    let images = await fixture.db.transaction((tx) => listHeroImages(tx));
    assert.deepEqual(images.map((image) => image.imageKey), ['hero-1', 'hero-2']);
    assert.deepEqual(images.map((image) => image.sortOrder), [0, 1]);

    await fixture.db.transaction((tx) =>
      reorderHeroImages(tx, actor(), [String(images[1]?.id), String(images[0]?.id)]),
    );
    images = await fixture.db.transaction((tx) => listHeroImages(tx));
    assert.deepEqual(images.map((image) => image.imageKey), ['hero-2', 'hero-1']);
    assert.deepEqual(images.map((image) => image.sortOrder), [0, 1]);

    const audit = await fixture.pool.query<{ action: string }>(
      `select action from audit_event where entity_type = 'hero_image' order by id`,
    );
    assert.ok(audit.rows.some((row) => row.action === 'settings.hero_images_reordered'));
  });

  it('corrects a description without moving the image', async () => {
    const images = await fixture.db.transaction((tx) => listHeroImages(tx));
    const first = images[0];
    assert.ok(first);

    await fixture.db.transaction((tx) =>
      updateHeroImage(tx, actor(), { id: String(first.id), alt: 'Wooden brush collection' }),
    );
    const after = await fixture.db.transaction((tx) => listHeroImages(tx));
    assert.equal(after[0]?.altText, 'Wooden brush collection');
    assert.equal(after[0]?.imageKey, first.imageKey);
  });

  it('refuses a duplicate and an unknown asset, and accepts a blank description', async () => {
    await assert.rejects(
      fixture.db.transaction((tx) =>
        addHeroImage(tx, actor(), { key: 'hero-1', alt: 'Already here' }),
      ),
      ConflictError,
    );
    await assert.rejects(
      fixture.db.transaction((tx) =>
        addHeroImage(tx, actor(), { key: 'hero-not-generated', alt: 'Missing file' }),
      ),
      ValidationError,
    );
    /*
     * A description is optional (owner direction, 2026-11-10, migration 0022): a blank one is stored
     * as null and the banner then renders `alt=""`, decorative. This assertion used to require a
     * rejection, which was the rule before that decision.
     */
    const images = await fixture.db.transaction((tx) => listHeroImages(tx));
    await fixture.db.transaction((tx) =>
      updateHeroImage(tx, actor(), { id: String(images[0]?.id), alt: '   ' }),
    );
    const after = await fixture.db.transaction((tx) => listHeroImages(tx));
    assert.equal(after.find((image) => image.id === images[0]?.id)?.altText, null);
  });

  it('never removes the last image', async () => {
    let images = await fixture.db.transaction((tx) => listHeroImages(tx));
    await fixture.db.transaction((tx) => removeHeroImage(tx, actor(), String(images[0]?.id)));

    images = await fixture.db.transaction((tx) => listHeroImages(tx));
    assert.equal(images.length, 1);
    await assert.rejects(
      fixture.db.transaction((tx) => removeHeroImage(tx, actor(), String(images[0]?.id))),
      ValidationError,
    );
  });

  it('never holds more than ten images', async () => {
    const existing = await fixture.db.transaction((tx) => listHeroImages(tx));
    // Fill to ten directly: the service's bound, not the fixture's convenience, is what is under test.
    for (let index = existing.length; index < 10; index += 1) {
      await fixture.pool.query(
        'insert into hero_image (image_key, alt_text, sort_order) values ($1, $2, $3)',
        [`hero-pad-${index}`, `Padding image ${index}`, index],
      );
    }

    const images = await fixture.db.transaction((tx) => listHeroImages(tx));
    assert.equal(images.length, 10);
    await assert.rejects(
      fixture.db.transaction((tx) => addHeroImage(tx, actor(), { key: 'hero-2', alt: 'Eleventh' })),
      ValidationError,
    );
  });
});
