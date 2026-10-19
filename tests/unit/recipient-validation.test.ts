import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RECIPIENT_LIMITS,
  formatMsisdn,
  isRecipientMethod,
  normalizeAccountLabel,
  normalizeAccountNumber,
  parseRecipientDetails,
  parseRecipientInput,
} from '../../src/server/payments/recipient-validation';

/**
 * The validation boundary for owner payment recipients (Phase 16C).
 *
 * These rules mirror the database's own CHECK constraints, so a refusal happens before a constraint
 * violation rather than instead of one. The cases that matter are the ones an owner will actually
 * type - a number with a country code, with spaces or dashes - and the ones a crafted request will
 * try: `cod`, a landline, a label carrying a newline.
 */
describe('payment-recipient validation', () => {
  it('accepts a Bangladeshi mobile number in the forms an owner types', () => {
    for (const typed of ['01712345678', '01712345678 ', '+8801712345678', '+880 1712-345678', '8801712345678']) {
      assert.equal(normalizeAccountNumber(typed), '01712345678', typed);
    }
  });

  it('refuses anything the database would refuse, rather than guessing', () => {
    for (const typed of [
      '',
      '0171234567', // ten digits
      '017123456789', // twelve digits
      '01212345678', // 012 is not a mobile prefix in the CHECK
      '01112345678',
      '0171234567a',
      '0171 234 5678 x',
      '+880171234567', // short after the country code
    ]) {
      assert.equal(normalizeAccountNumber(typed), null, typed);
    }
  });

  it('keeps the number and the label plain: control characters are stripped, whitespace collapsed', () => {
    assert.equal(normalizeAccountLabel('  bKash   —   QueenBee\'s  '), "bKash — QueenBee's");
    assert.equal(normalizeAccountLabel('bKash\nPersonal\tAccount'), 'bKash Personal Account');
    assert.equal(normalizeAccountLabel('\u0000\u0007'), null);
  });

  it('enforces the label bounds', () => {
    assert.equal(normalizeAccountLabel('a'), null);
    assert.equal(normalizeAccountLabel('ab'), 'ab');
    assert.equal(normalizeAccountLabel('x'.repeat(RECIPIENT_LIMITS.labelMax)), 'x'.repeat(RECIPIENT_LIMITS.labelMax));
    assert.equal(normalizeAccountLabel('x'.repeat(RECIPIENT_LIMITS.labelMax + 1)), null);
  });

  it('accepts only bkash and nagad: COD has no recipient to configure', () => {
    assert.equal(isRecipientMethod('bkash'), true);
    assert.equal(isRecipientMethod('nagad'), true);
    for (const method of ['cod', 'bkash ', 'BKASH', '', null, 3]) {
      assert.equal(isRecipientMethod(method), false, String(method));
    }
    assert.equal(parseRecipientInput({ method: 'cod', accountNumber: '01712345678', accountLabel: 'Cash' }), null);
  });

  it('parses a complete recipient and refuses a partial one', () => {
    assert.deepEqual(parseRecipientInput({ method: 'nagad', accountNumber: '01712345678', accountLabel: 'Nagad — QueenBee' }), {
      method: 'nagad',
      accountNumber: '01712345678',
      accountLabel: 'Nagad — QueenBee',
    });
    assert.equal(parseRecipientInput({ method: 'nagad', accountNumber: '', accountLabel: 'Nagad' }), null);
    assert.equal(parseRecipientInput({ method: 'nagad', accountNumber: '01712345678', accountLabel: ' ' }), null);
    assert.equal(parseRecipientInput({ method: 'nagad', accountNumber: undefined, accountLabel: 'Nagad' }), null);
  });

  it('parses the editable details of an existing row, without a method', () => {
    assert.deepEqual(parseRecipientDetails({ accountNumber: '01712345678', accountLabel: 'Personal' }), {
      accountNumber: '01712345678',
      accountLabel: 'Personal',
    });
    assert.equal(parseRecipientDetails({ accountNumber: '01712345678', accountLabel: undefined }), null);
  });

  it('formats a stored number for reading, and leaves an unexpected value alone', () => {
    assert.equal(formatMsisdn('01712345678'), '01712 345678');
    assert.equal(formatMsisdn('not-a-number'), 'not-a-number');
  });
});
