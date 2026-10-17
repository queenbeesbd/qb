import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PAYMENT_METHODS,
  defaultPaymentMethod,
  isMethodConfigured,
} from '../../src/features/checkout/payment-methods';

/**
 * Checkout payment-method availability (Phase 16B regression).
 *
 * The defect these cover: the form used to pre-select `bkash` no matter what the owner had configured.
 * With no configured recipient the radio was rendered *checked and disabled*, so the browser submitted
 * no `paymentMethod` at all while the form still demanded a sender number, a transaction reference and
 * an amount - and the customer got a generic "could not be validated" notice with nothing to fix.
 */

describe('checkout payment-method availability', () => {
  it('always offers cash on delivery, which needs no recipient', () => {
    assert.equal(isMethodConfigured('cod', []), true);
    assert.equal(isMethodConfigured('cod', ['bkash']), true);
  });

  it('offers a prepaid method only when the owner configured a recipient for it', () => {
    assert.equal(isMethodConfigured('bkash', []), false);
    assert.equal(isMethodConfigured('nagad', []), false);
    assert.equal(isMethodConfigured('bkash', ['bkash']), true);
    assert.equal(isMethodConfigured('nagad', ['bkash']), false);
    assert.equal(isMethodConfigured('nagad', ['bkash', 'nagad']), true);
  });

  it('selects COD when nothing prepaid is configured', () => {
    assert.equal(defaultPaymentMethod([]), 'cod');
    assert.equal(defaultPaymentMethod(['unknown-method']), 'cod');
  });

  it('selects the first configured prepaid method, in the order the storefront presents them', () => {
    assert.equal(defaultPaymentMethod(['bkash']), 'bkash');
    assert.equal(defaultPaymentMethod(['nagad']), 'nagad');
    assert.equal(defaultPaymentMethod(['bkash', 'nagad']), 'bkash');
    // The order the caller happens to list them in is irrelevant: the radio order is what the
    // customer sees, so the selection is stable whichever way the rows came back.
    assert.equal(defaultPaymentMethod(['nagad', 'bkash']), 'bkash');
  });

  it('never selects a method that is not available', () => {
    for (const configured of [[], ['bkash'], ['nagad'], ['bkash', 'nagad']]) {
      const selected = defaultPaymentMethod(configured);
      assert.equal(
        isMethodConfigured(selected, configured),
        true,
        `selected ${selected} with ${JSON.stringify(configured)}`,
      );
    }
  });

  it('keeps COD last, so a prepaid method is preferred while one exists', () => {
    assert.deepEqual([...PAYMENT_METHODS], ['bkash', 'nagad', 'cod']);
  });
});
