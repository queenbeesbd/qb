import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONTACT_FIELDS,
  CONTACT_LIMITS,
  RECIPIENT_PHONE_PATTERN,
  contactProblems,
  normalizeContactText,
  type ContactValues,
} from '../../src/lib/checkout-fields';
import { parseContact } from '../../src/server/orders/validation';

const valid: ContactValues = {
  recipientName: 'Amina Rahman',
  recipientPhone: '01712345678',
  addressLine: 'House 12, Road 4, Banani',
  districtCode: 'dhaka',
  deliveryNote: '',
};

/**
 * The same values as the order route reads them. The form no longer collects an area, city or postcode
 * (2026-11-14), so a submission carries none of the three; the server still accepts them from an older
 * client or a stored row.
 */
function serverContact(values: ContactValues): Parameters<typeof parseContact>[0] {
  return { ...values, area: undefined, city: undefined, postcode: undefined };
}

/** Replace one field, keeping the rest valid. */
function withField(field: keyof ContactValues, value: string): ContactValues {
  return { ...valid, [field]: value };
}

describe('checkout contact rules', () => {
  it('reports the four required fields on an empty submission, in page order', () => {
    const empty: ContactValues = {
      recipientName: '',
      recipientPhone: '',
      addressLine: '',
      districtCode: '',
      deliveryNote: '',
    };
    assert.deepEqual(contactProblems(empty), [
      'recipientName',
      'recipientPhone',
      'addressLine',
      'districtCode',
    ]);
    // Nothing the form no longer draws can be reported as a problem.
    for (const removed of ['area', 'city', 'postcode']) {
      assert.equal((CONTACT_FIELDS as readonly string[]).includes(removed), false, removed);
    }
  });

  it('accepts a complete submission and names one order for the fields', () => {
    assert.deepEqual(contactProblems(valid), []);
  });

  it('measures length after collapsing whitespace, as the server does', () => {
    assert.equal(normalizeContactText('  Amina   Rahman  '), 'Amina Rahman');
    assert.deepEqual(contactProblems(withField('recipientName', '   A   ')), ['recipientName']);
    assert.deepEqual(contactProblems(withField('recipientName', '  Amina Rahman  ')), []);
    assert.deepEqual(contactProblems(withField('addressLine', '     a    ')), ['addressLine']);
    assert.deepEqual(contactProblems(withField('addressLine', 'Road 4')), []);
  });

  it('accepts only a Bangladeshi mobile shape and nothing that merely looks close', () => {
    for (const phone of ['01312345678', '01712345678', '01912345678', ' 01812345678 ']) {
      assert.equal(contactProblems(withField('recipientPhone', phone)).includes('recipientPhone'), false, phone);
    }
    for (const phone of [
      '',
      '0171234567', // ten digits
      '017123456789', // twelve digits
      '01212345678', // not a mobile prefix
      '017 1234 5678', // spaces
      '+8801712345678',
      'abcdefghijk',
    ]) {
      assert.equal(contactProblems(withField('recipientPhone', phone)).includes('recipientPhone'), true, phone);
    }
  });

  it('refuses a district that is not one of the three canonical areas', () => {
    for (const district of ['', 'Dhaka', 'dhaka ', 'khulna']) {
      assert.deepEqual(contactProblems(withField('districtCode', district)), ['districtCode'], district);
    }
    for (const district of ['dhaka', 'chattogram', 'others']) {
      assert.deepEqual(contactProblems(withField('districtCode', district)), [], district);
    }
  });

  it('bounds the optional delivery note without making it required', () => {
    const longNote = 'a'.repeat(CONTACT_LIMITS.deliveryNote.max + 1);
    assert.deepEqual(contactProblems(withField('deliveryNote', longNote)), ['deliveryNote']);
    assert.deepEqual(
      contactProblems(withField('deliveryNote', 'a'.repeat(CONTACT_LIMITS.deliveryNote.max))),
      [],
    );
    assert.deepEqual(contactProblems(withField('deliveryNote', '')), []);
  });

  it('agrees with the server parser in both directions', () => {
    // What the form accepts, the server accepts.
    assert.notEqual(parseContact(serverContact(valid)), null);
    for (const district of ['dhaka', 'chattogram', 'others']) {
      const values = withField('districtCode', district);
      assert.deepEqual(contactProblems(values), []);
      assert.notEqual(parseContact(serverContact(values)), null, district);
    }

    // What the form refuses, the server refuses - so a summary can never be the only thing standing
    // between a customer and an order the server would have taken.
    const refused: readonly [string, ContactValues][] = [
      ['short name', withField('recipientName', 'A')],
      ['bad phone', withField('recipientPhone', '0171234567')],
      ['short address', withField('addressLine', 'Road')],
      ['unknown district', withField('districtCode', 'khulna')],
      ['long note', withField('deliveryNote', 'a'.repeat(301))],
    ];
    for (const [label, values] of refused) {
      assert.notDeepEqual(contactProblems(values), [], label);
      assert.equal(parseContact(serverContact(values)), null, label);
    }

    // And the phone shape is one definition, not two copies of a regex that can drift apart.
    assert.equal(
      RECIPIENT_PHONE_PATTERN.source,
      /^01[3-9][0-9]{8}$/.source,
      'the shared pattern is the one the schema check was written for',
    );
  });
});
