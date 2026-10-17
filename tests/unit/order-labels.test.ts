import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PAYMENT_LABELS, prepayNoteKey } from '../../src/features/account/order-labels';
import { dictionary } from '../../src/i18n/dictionaries';

/**
 * The prepaid note on a customer's own order page (Phase 16B regression).
 *
 * The defect these cover: one unconditional sentence said prepaid instructions and manual verification
 * "are not built yet" and that **no payment details had been collected or stored**. After Phase 16A that
 * was false on the customer's own page - the order sat in `awaiting_verification` with a stored sender
 * number, transaction reference and claimed amount. The note is now chosen from the prepaid state, and
 * every state has something true to say.
 */

describe('prepaid order note', () => {
  it('has a note for every prepaid state the order can be in', () => {
    for (const state of Object.keys(PAYMENT_LABELS)) {
      const key = prepayNoteKey(state);
      assert.equal(typeof key, 'string');
      assert.equal(dictionary.en[key].length > 0, true, `en note missing for ${state}`);
      assert.equal(dictionary.bn[key].length > 0, true, `bn note missing for ${state}`);
    }
  });

  it('tells the customer in awaiting_verification that their payment details were recorded', () => {
    const key = prepayNoteKey('awaiting_verification');
    assert.match(dictionary.en[key], /payment details you submitted are recorded/i);
    assert.notEqual(key, 'orders.prepayNote');
  });

  it('distinguishes a verified payment from a rejected one', () => {
    assert.notEqual(prepayNoteKey('verified'), prepayNoteKey('rejected'));
    assert.notEqual(prepayNoteKey('rejected'), prepayNoteKey('falsely_claimed'));
  });

  it('falls back to the neutral prepaid note for a state it does not know', () => {
    assert.equal(prepayNoteKey('something_new'), 'orders.prepayNote');
  });

  it('no prepaid note claims that payment details were not collected or stored', () => {
    for (const locale of ['en', 'bn'] as const) {
      for (const [key, value] of Object.entries(dictionary[locale])) {
        if (!key.startsWith('orders.prepayNote')) continue;
        assert.doesNotMatch(value, /not built yet|not collected or stored|নেওয়া বা সংরক্ষণ করা হয়নি/iu, key);
      }
    }
  });
});
