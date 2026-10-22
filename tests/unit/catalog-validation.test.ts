/**
 * Catalog validation and image metadata, as pure functions.
 *
 * These are the rules that decide what may reach the database, so they are tested directly rather than
 * through a route: a price that arrives as `750.1` must become 75010 poisha and never
 * 75009.99999999999, and a path-shaped image key must be refused before anything touches the filesystem.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readImageMetadata, detectFormat } from '../../src/server/catalog/image-metadata';
import { listAssetKeys, readAsset } from '../../src/server/catalog/assets';
import {
  MAX_PRICE_MINOR,
  parseAvailability,
  parseDisplayName,
  parseEmail,
  parseId,
  parseImageKey,
  parsePoisha,
  parseRequiredText,
  parseSlug,
  parseSku,
  parseSortOrder,
  slugify,
} from '../../src/server/catalog/validation';

describe('money', () => {
  it('converts whole BDT to poisha', () => {
    assert.equal(parsePoisha('750'), 75_000);
    assert.equal(parsePoisha('0'), null, 'zero is not a price');
    assert.equal(parsePoisha('1'), 100);
  });

  it('converts a fractional price with integer arithmetic, never floating point', () => {
    // The exact values matter: 750.1 * 100 is 75009.99999999999 in IEEE-754.
    assert.equal(parsePoisha('750.1'), 75_010);
    assert.equal(parsePoisha('750.01'), 75_001);
    assert.equal(parsePoisha('750.5'), 75_050);
    assert.equal(parsePoisha('750.50'), 75_050);
    assert.equal(parsePoisha('0.1', { allowZero: true }), 10);
  });

  it('refuses anything that is not a plain decimal BDT amount', () => {
    for (const bad of ['', ' ', '-5', '750.555', '1e5', '750,00', '৳750', '৭৫০', 'abc', '1.2.3', '.5', '+750']) {
      assert.equal(parsePoisha(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
    // Surrounding whitespace is trimmed, because a form field carries the owner's text verbatim.
    assert.equal(parsePoisha(' 750 '), 75_000);
  });

  it('bounds the value and refuses one above the input limit', () => {
    assert.equal(parsePoisha(String(MAX_PRICE_MINOR / 100)), MAX_PRICE_MINOR);
    assert.equal(parsePoisha('1000000.01'), null);
    assert.equal(parsePoisha('99999999999'), null);
  });

  it('refuses a bare number, because a number has no unit', () => {
    // Accepting a number would require guessing whether it is BDT or poisha, and guessing wrong is a
    // 100x money error. A price therefore arrives only as the owner typed it.
    assert.equal(parsePoisha(750), null);
    assert.equal(parsePoisha(75_000), null);
    assert.equal(parsePoisha(1.5), null);
    assert.equal(parsePoisha(Number.MAX_SAFE_INTEGER), null);
  });
});

describe('availability', () => {
  it('accepts exactly the two documented states', () => {
    assert.equal(parseAvailability('in_stock'), 'in_stock');
    assert.equal(parseAvailability('out_of_stock'), 'out_of_stock');
  });

  it('refuses every other value, including the fixture-only and quantity-shaped ones', () => {
    for (const bad of ['unknown', 'IN_STOCK', 'in stock', '', '0', '5', 'available', 'true']) {
      assert.equal(parseAvailability(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
    assert.equal(parseAvailability(undefined), null);
    assert.equal(parseAvailability(5), null);
  });
});

describe('slugs', () => {
  it('derives a slug from Latin text', () => {
    assert.equal(slugify('Rice Ferment Foam 100ml'), 'rice-ferment-foam-100ml');
    assert.equal(slugify('  Trailing  spaces  '), 'trailing-spaces');
    assert.equal(slugify('Café Serum'), 'cafe-serum');
  });

  it('refuses to invent a slug from Bangla-only text', () => {
    // A transliteration nobody wrote would be a slug the owner cannot predict.
    assert.equal(slugify('স্কিন কেয়ার'), null);
  });

  it('validates a supplied slug without rewriting it', () => {
    assert.equal(parseSlug('rice-foam'), 'rice-foam');
    assert.equal(parseSlug('RICE-FOAM'), 'rice-foam');
    for (const bad of ['rice--foam', '-rice', 'rice-', 'rice foam', 'rice_foam', '']) {
      assert.equal(parseSlug(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});

describe('image keys', () => {
  it('accepts only the key format the storefront derives paths from', () => {
    assert.equal(parseImageKey('lilac-5-niacinamide-serum-30-ml'), 'lilac-5-niacinamide-serum-30-ml');
  });

  it('refuses every path-shaped or URL-shaped value before it can reach the filesystem', () => {
    for (const bad of [
      '../public/catalog/x',
      '..%2fetc',
      '/etc/passwd',
      'a/b',
      'a\\b',
      'http://example.test/x.jpg',
      'file:///etc/passwd',
      'key.png',
      'Key',
      'key--x',
      '',
    ]) {
      assert.equal(parseImageKey(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
    assert.equal(parseImageKey(undefined), null);
  });
});

describe('other field readers', () => {
  it('reads ids as positive safe integers only, trimming a form value first', () => {
    assert.equal(parseId('1'), 1);
    assert.equal(parseId('42'), 42);
    // A form field arrives as text, and trimming it is what every other field reader does.
    assert.equal(parseId(' 1 '), 1);
    for (const bad of ['0', '-1', '1.5', 'abc', '', '99999999999999999999', '1e3', '+1']) {
      assert.equal(parseId(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });

  it('normalizes text and bounds it by the schema limits', () => {
    assert.equal(parseRequiredText('  a   b  ', 10), 'a b');
    assert.equal(parseRequiredText('', 10), null);
    assert.equal(parseRequiredText('x'.repeat(11), 10), null);
    assert.equal(parseRequiredText(5, 10), null);
  });

  it('reads a SKU and a sort order', () => {
    assert.equal(parseSku('qb-rice-foam'), 'QB-RICE-FOAM');
    assert.equal(parseSku('has space'), null);
    assert.equal(parseSortOrder('3'), 3);
    assert.equal(parseSortOrder('-1'), null);
    assert.equal(parseSortOrder('abc'), null);
  });

  it('reads an email and a display name', () => {
    assert.equal(parseEmail(' Owner@Example.Test '), 'owner@example.test');
    assert.equal(parseEmail('not-an-email'), null);
    assert.equal(parseDisplayName('  Owner  '), 'Owner');
    assert.equal(parseDisplayName(''), null);
  });
});

describe('image metadata read from the file', () => {
  it('identifies the format from the bytes, not the name', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    assert.equal(detectFormat(jpeg), 'jpeg');

    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP', 'ascii'),
    ]);
    assert.equal(detectFormat(webp), 'webp');

    // A PNG is not a supported format, whatever a file might be named.
    assert.equal(detectFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47])), null);
    assert.equal(detectFormat(Buffer.alloc(0)), null);
  });

  it('derives the real dimensions and content type of every catalog asset', async () => {
    const keys = await listAssetKeys();
    assert.ok(keys.length > 0, 'expected the catalog asset directory to hold generated variants');

    for (const key of keys) {
      const asset = await readAsset(key);
      assert.ok(asset !== null, `expected ${key} to be readable`);
      assert.equal(asset.width, 600, `${key}: width`);
      /*
       * The fixture photography is 3:4 portrait, which is where IMAGE_ASPECT comes from. Photography
       * imported from the owner's previous store keeps its own aspect ratio (the source frames vary
       * from square to portrait), so the 3:4 assertion covers the fixture keys only - the imported
       * set is asserted on the invariant that actually holds for it: a 600-wide JPEG primary and
       * four generated variants, both checked below.
       */
      if (!key.startsWith('zq-')) assert.equal(asset.height, 800, `${key}: height`);
      assert.ok(asset.height > 0, `${key}: height`);
      assert.equal(asset.contentType, 'image/jpeg');
      assert.ok(asset.byteSize > 0);
      assert.equal(asset.variants.length, 4, `${key}: expected four generated variants`);
      for (const variant of asset.variants) {
        assert.ok(variant.byteSize > 0, `${key}: variant byte size`);
        assert.ok(variant.storageKey.startsWith('/catalog/'), `${key}: storage key prefix`);
      }
    }
  });

  it('refuses an asset key that is not in the server’s own inventory', async () => {
    assert.equal(await readAsset('this-key-does-not-exist'), null);
  });
});
