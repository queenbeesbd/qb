import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ORDER_LIMITS,
  orderFingerprint,
  parseCartLines,
  parseContact,
  parseIdempotencyKey,
  parsePaymentMethod,
} from '../../src/server/orders/validation';

/**
 * Order input validation.
 *
 * The submitted cart is a **claim**. These tests pin what the server will accept, what it clamps and what
 * it refuses outright - before any of it reaches the order transaction in
 * `tests/db/orders.test.ts`, where the same input is priced from the database.
 */

const CONTACT = {
  recipientName: 'Rahim Uddin',
  recipientPhone: '01712345678',
  addressLine: 'House 12, Road 5',
  area: 'Dhanmondi',
  city: 'Dhaka',
  postcode: null,
  deliveryNote: null,
};

describe('cart line parsing', () => {
  it('reads ids and quantities and merges duplicate ids', () => {
    assert.deepEqual(parseCartLines('[{"productId":"12","quantity":2},{"id":"12","qty":3}]'), [
      { productId: '12', quantity: 5 },
    ]);
  });

  it('clamps a quantity to the cap rather than trusting it', () => {
    assert.deepEqual(parseCartLines('[{"productId":"7","quantity":999}]'), [
      { productId: '7', quantity: ORDER_LIMITS.maxQuantityPerLine },
    ]);
  });

  it('refuses a malformed, empty or non-id body', () => {
    for (const value of ['', 'not json', '[]', '{}', '"x"', '[{"productId":"0","quantity":1}]', '[{"productId":"-2","quantity":1}]', '[{"productId":"abc","quantity":1}]', '[{"productId":"9","quantity":0}]', '[{"productId":"9","quantity":"many"}]', '[null]', 'null', null, 42]) {
      assert.equal(parseCartLines(value), null, JSON.stringify(value));
    }
  });

  it('refuses more lines than the cap', () => {
    const lines = Array.from({ length: ORDER_LIMITS.maxLines + 1 }, (_, index) => ({ productId: String(index + 1), quantity: 1 }));
    assert.equal(parseCartLines(JSON.stringify(lines)), null);
  });
});

describe('contact parsing', () => {
  it('accepts a complete address and normalises whitespace', () => {
    assert.deepEqual(
      parseContact({ ...CONTACT, recipientName: '  Rahim   Uddin ' }),
      { ...CONTACT, recipientName: 'Rahim Uddin' },
    );
  });

  it('treats a blank optional field as absent', () => {
    const parsed = parseContact({ ...CONTACT, postcode: '', deliveryNote: '   ' });
    assert.deepEqual(parsed, { ...CONTACT, postcode: null, deliveryNote: null });
  });

  it('refuses a bad phone number, a short address and an over-long note', () => {
    assert.equal(parseContact({ ...CONTACT, recipientPhone: '0171234567' }), null);
    assert.equal(parseContact({ ...CONTACT, recipientPhone: '+8801712345678' }), null);
    assert.equal(parseContact({ ...CONTACT, addressLine: 'abc' }), null);
    assert.equal(parseContact({ ...CONTACT, deliveryNote: 'x'.repeat(301) }), null);
    assert.equal(parseContact({ ...CONTACT, city: '' }), null);
  });
});

describe('payment method parsing', () => {
  it('accepts exactly the three approved methods', () => {
    assert.equal(parsePaymentMethod('bkash'), 'bkash');
    assert.equal(parsePaymentMethod('nagad'), 'nagad');
    assert.equal(parsePaymentMethod('cod'), 'cod');
  });

  it('refuses anything else', () => {
    for (const value of ['card', 'COD', '', 'sslcommerz', undefined, 1]) {
      assert.equal(parsePaymentMethod(value), null, String(value));
    }
  });
});

describe('idempotency key parsing', () => {
  it('accepts a uuid-shaped key and refuses short or odd ones', () => {
    assert.equal(parseIdempotencyKey('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), '3f2504e0-4f89-11d3-9a0c-0305e82c3301');
    assert.equal(parseIdempotencyKey('short'), null);
    assert.equal(parseIdempotencyKey('has space in it___________'), null);
    assert.equal(parseIdempotencyKey(undefined), null);
  });
});

describe('submission fingerprint', () => {
  it('is stable for the same body regardless of line order', () => {
    const a = orderFingerprint([{ productId: '2', quantity: 1 }, { productId: '1', quantity: 1 }], CONTACT, 'bkash', null);
    const b = orderFingerprint([{ productId: '1', quantity: 1 }, { productId: '2', quantity: 1 }], CONTACT, 'bkash', null);
    assert.equal(a, b);
  });

  it('changes when a quantity, an address or the method changes', () => {
    const base = orderFingerprint([{ productId: '1', quantity: 1 }], CONTACT, 'bkash', null);
    assert.notEqual(base, orderFingerprint([{ productId: '1', quantity: 2 }], CONTACT, 'bkash', null));
    assert.notEqual(base, orderFingerprint([{ productId: '1', quantity: 1 }], { ...CONTACT, city: 'Sylhet' }, 'bkash', null));
    assert.notEqual(base, orderFingerprint([{ productId: '1', quantity: 1 }], CONTACT, 'cod', null));
    assert.notEqual(base, orderFingerprint([{ productId: '1', quantity: 1 }], CONTACT, 'bkash', {
      senderMsisdn: '01712345678', transactionReference: 'ref123', claimedAmountMinor: 100,
    }));
  });
});
