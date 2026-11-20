import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COD_LABELS, PAYMENT_LABELS, methodLabel, statusLabel } from '../../src/features/account/order-labels';
import { dictionary } from '../../src/i18n/dictionaries';
import { orderStatus } from '../../src/app/(admin)/qbpanel/_ui/order-status';

/**
 * Order-state labels, and the one state a row states.
 *
 * The order carries separate state columns by design (fulfilment, prepaid payment, COD). Cash on
 * Delivery is the only method this release accepts (Phase 17), so a COD order must resolve to its own
 * COD state, and a historical prepaid order must still render a truthful label rather than a raw
 * database value or a note about a method the store no longer offers.
 *
 * Since 2026-11-20 a list states **one** status rather than the lifecycle pill plus a payment line -
 * "Pending" beside "Awaiting approval" read as two conditions for one order. `orderStatus` is the rule
 * that decides it, so these tests hold it to the same standard the tables were held to: every state
 * has a real label, nothing is printed raw, and the one COD fact the lifecycle cannot express survives.
 */

describe('order labels', () => {
  it('maps every COD state to a present English label', () => {
    for (const state of Object.keys(COD_LABELS)) {
      assert.equal(typeof dictionary[COD_LABELS[state] as keyof typeof dictionary], 'string', 'label missing for ' + state);
    }
  });

  it('keeps a label for every legacy prepaid state, so history renders as a state and not a raw value', () => {
    for (const state of Object.keys(PAYMENT_LABELS)) {
      assert.equal(typeof dictionary[PAYMENT_LABELS[state] as keyof typeof dictionary], 'string', 'label missing for ' + state);
    }
  });

  it('degrades an unrecognised value to a stated unknown rather than printing it', () => {
    assert.equal(statusLabel('something_new'), 'orders.status.unknown');
    assert.equal(methodLabel('something_new'), 'orders.method.unknown');
    assert.equal(orderStatus({ status: 'something_new' }).label, 'orders.status.unknown');
  });
});

describe('the one status a row states', () => {
  it('names every fulfilment state the model defines, and nothing is left to a raw column', () => {
    for (const status of Object.keys({
      pending: 1,
      confirmed: 1,
      processing: 1,
      shipped: 1,
      delivered: 1,
      completed: 1,
      cancelled: 1,
      returned: 1,
    })) {
      const resolved = orderStatus({ status });
      assert.notEqual(resolved.label, 'orders.status.unknown', 'no label for ' + status);
      assert.equal(typeof dictionary[resolved.label], 'string', 'label missing for ' + status);
    }
  });

  /**
   * This is the whole point of folding the COD state in. A failed delivery leaves `status` at
   * `shipped`, so a row that printed only the lifecycle status would tell the owner a parcel that came
   * back is still on its way. The payment line used to carry that fact; the pill carries it now.
   */
  it('says a failed delivery failed, rather than repeating that it shipped', () => {
    const failed = orderStatus({ status: 'shipped', codState: 'cod_failed' });
    assert.equal(failed.label, 'orders.cod.cod_failed');
    assert.equal(failed.tone, 'danger');
    // A plain shipped order is still shipped: the exception is the COD state, not the status.
    assert.equal(orderStatus({ status: 'shipped', codState: 'cod_approved' }).label, 'orders.status.shipped');
  });

  /**
   * The states that only repeated the lifecycle status are folded rather than echoed: a pending COD
   * order waiting for its call is "Pending", not "Pending · Awaiting approval".
   */
  it('does not let a COD state restate the lifecycle status', () => {
    assert.equal(orderStatus({ status: 'pending', codState: 'cod_pending_approval' }).label, 'orders.status.pending');
    assert.equal(orderStatus({ status: 'confirmed', codState: 'cod_approved' }).label, 'orders.status.confirmed');
    assert.equal(orderStatus({ status: 'completed', codState: 'cod_collected' }).label, 'orders.status.completed');
  });
});

describe('checkout copy', () => {
  it('states that a legacy order predates the COD-only release', () => {
    assert.match(dictionary['orders.legacyPaymentNote'], /predates cash on delivery/i);
  });

  it('names bKash only inside the payment-instruction block, never as a second method', () => {
    // ADR 0029: the owner publishes advance-payment *instructions* on checkout (the bKash number and
    // the 500 BDT rule), while Cash on Delivery stays the only method an order records. So a bKash
    // mention is allowed only under `checkout.payment.`, and no copy may offer a claim, a transaction
    // reference or a selectable prepaid method.
    for (const [key, value] of Object.entries(dictionary)) {
      if (!key.startsWith('checkout.')) continue;
      assert.doesNotMatch(value, /nagad|transaction id|sender number/iu, key);
      if (/bkash/iu.test(value)) {
        assert.ok(key.startsWith('checkout.payment.'), `${key} names bKash outside the payment block`);
      }
    }
  });
});
