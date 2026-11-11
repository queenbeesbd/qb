import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { productOrderMessage, whatsappOrderHref } from '../../src/lib/whatsapp-order';

/**
 * The product page's "Order on WhatsApp" link.
 *
 * The owner's stored support URL is the only input; these cover the ways it can be unusable (not
 * WhatsApp, not https, not a URL), the one way it is used (the `text` parameter added), and the rule
 * that an owner-written message is never replaced.
 */

describe('WhatsApp order link', () => {
  it('adds the product message to the owner wa.me link', () => {
    const href = whatsappOrderHref('https://wa.me/8801712345678', 'Hello');
    assert.equal(href, 'https://wa.me/8801712345678?text=Hello');
  });

  it('keeps a message the owner already wrote into the link', () => {
    const href = whatsappOrderHref('https://api.whatsapp.com/send?phone=8801712345678&text=Assalamu', 'Hello');
    assert.equal(href, 'https://api.whatsapp.com/send?phone=8801712345678&text=Assalamu');
  });

  it('refuses a link that is not WhatsApp, not https, or not a URL', () => {
    assert.equal(whatsappOrderHref('https://facebook.com/shop', 'Hello'), null);
    assert.equal(whatsappOrderHref('http://wa.me/8801712345678', 'Hello'), null);
    assert.equal(whatsappOrderHref('not a url', 'Hello'), null);
    assert.equal(whatsappOrderHref('https://wa.link/abc123', 'Hello'), null);
    assert.equal(whatsappOrderHref(null, 'Hello'), null);
  });

  it('writes the product, its pack and the page into the message', () => {
    assert.equal(
      productOrderMessage({ name: 'Black Seed Honey', pack: '1kg', url: 'https://shop.test/products/honey' }),
      "Hello QueenBee's, I would like to order: Black Seed Honey (1kg) - https://shop.test/products/honey",
    );
    assert.equal(
      productOrderMessage({ name: 'Black Seed Honey', pack: null, url: null }),
      "Hello QueenBee's, I would like to order: Black Seed Honey",
    );
  });
});
