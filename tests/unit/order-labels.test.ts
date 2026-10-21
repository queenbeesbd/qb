import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COD_LABELS, PAYMENT_LABELS, methodLabel, paymentLabel, statusLabel } from '../../src/features/account/order-labels';
import { dictionary } from '../../src/i18n/dictionaries';

/**
 * Order-state labels on a customer's own order pages.
 *
 * The order carries separate state columns by design (fulfilment, prepaid payment, COD). Cash on
 * Delivery is the only method this release accepts (Phase 17), so a COD order must resolve to its own
 * COD state, and a historical prepaid order must still render a truthful label rather than a raw
 * database value or a note about a method the store no longer offers.
 */

describe('order labels', () => {
  it('maps every COD state to a present English label', () => {
    for (const state of Object.keys(COD_LABELS)) {
      const key = paymentLabel('cod', 'not_applicable', state);
      assert.equal(typeof dictionary[key], 'string', 'label missing for ' + state);
    }
  });

  it('shows a COD order its COD lifecycle state, never a prepaid one', () => {
    assert.equal(paymentLabel('cod', 'not_applicable', 'cod_approved'), 'orders.cod.cod_approved');
    assert.notEqual(paymentLabel('cod', 'not_applicable', 'cod_approved'), 'orders.payment.awaiting_payment');
  });

  it('keeps a label for every legacy prepaid state, so history renders as a state and not a raw value', () => {
    for (const state of Object.keys(PAYMENT_LABELS)) {
      const key = paymentLabel('bkash', state, 'not_applicable');
      assert.equal(typeof dictionary[key], 'string', 'label missing for ' + state);
    }
  });

  it('degrades an unrecognised value to a stated unknown rather than printing it', () => {
    assert.equal(paymentLabel('cod', 'not_applicable', 'something_new'), 'orders.cod.unknown');
    assert.equal(paymentLabel('bkash', 'something_new', 'not_applicable'), 'orders.payment.unknown');
    assert.equal(statusLabel('something_new'), 'orders.status.unknown');
    assert.equal(methodLabel('something_new'), 'orders.method.unknown');
  });

  it('states that a legacy order predates the COD-only release', () => {
    assert.match(dictionary['orders.legacyPaymentNote'], /predates cash on delivery/i);
  });

  it('offers no copy that implies a manual prepaid method is supported now', () => {
    for (const [key, value] of Object.entries(dictionary)) {
      if (!key.startsWith('checkout.')) continue;
      assert.doesNotMatch(value, /bkash|nagad|transaction id/iu, key);
    }
  });
});
