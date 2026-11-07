import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCreateOrderPayload,
  composeAddress,
  createOrder,
  getBalance,
  getDeliveryStatus,
  maskCredential,
  parseCredential,
  publicStatus,
  toBdt,
  type SteadfastCredentials,
  type SteadfastOrderData,
} from '../../src/server/integrations/steadfast';

/**
 * The SteadFast integration's offline surface.
 *
 * No connection is opened: `fetchImpl` is a stub, so these tests cover the payload the courier will
 * receive, the phone/name/address rules, what a success and every kind of failure look like, and the
 * one thing that must never leave the server - the keys, which the screen only ever sees masked.
 */

const CREDENTIALS: SteadfastCredentials = { apiKey: 'api-key-1234', secretKey: 'secret-key-5678' };

const DATA: SteadfastOrderData = {
  invoice: 'QB0123456789ABCDEF',
  recipientName: 'Ayesha  Rahman',
  recipientPhone: '01712345678',
  addressLine: 'House 12, Road 4, Dhanmondi',
  area: 'Dhanmondi',
  city: 'Dhaka',
  postcode: '1209',
  note: 'Please call before delivery',
  codAmountMinor: 79500,
};

/** A stub for exactly one request, recording what was asked. */
function stubFetch(response: { status?: number; body?: unknown; throws?: Error }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (response.throws !== undefined) throw response.throws;
    return new Response(response.body === undefined ? '' : JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('steadfast credentials', () => {
  it('masks a stored key down to its last four characters', () => {
    assert.equal(maskCredential('abcdefgh1234'), '••••1234');
    assert.equal(maskCredential('abc'), '••••abc');
  });

  it('never exposes a key through the screen status', () => {
    const status = publicStatus({ apiKey: 'api-key-1234', secretKey: 'secret-key-5678', enabled: true });
    assert.deepEqual(status, {
      configured: true,
      enabled: true,
      apiKeyHint: '••••1234',
      secretKeyHint: '••••5678',
    });
    const serialised = JSON.stringify(status);
    assert.ok(!serialised.includes('api-key-1234'));
    assert.ok(!serialised.includes('secret-key-5678'));
  });

  it('treats missing keys as absent rather than an empty credential', () => {
    assert.deepEqual(publicStatus({ apiKey: null, secretKey: null, enabled: false }), {
      configured: false,
      enabled: false,
      apiKeyHint: null,
      secretKeyHint: null,
    });
  });

  it('accepts the shape SteadFast issues and refuses a value with spaces', () => {
    assert.equal(parseCredential('  1m9mwrrwsjbrg0w  ', 'API key'), '1m9mwrrwsjbrg0w');
    assert.throws(() => parseCredential('key with spaces', 'API key'), /API key/);
    assert.throws(() => parseCredential('   ', 'secret key'), /secret key/);
    assert.throws(() => parseCredential(42, 'secret key'), /secret key/);
  });
});

describe('steadfast order payload', () => {
  it('maps the order to the documented fields, in BDT', () => {
    const result = buildCreateOrderPayload(DATA);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.payload, {
      invoice: 'QB0123456789ABCDEF',
      recipient_name: 'Ayesha Rahman',
      recipient_phone: '01712345678',
      recipient_address: 'House 12, Road 4, Dhanmondi, Dhaka, 1209',
      cod_amount: 795,
      note: 'Please call before delivery',
    });
  });

  it('never repeats an area or city already inside the address line', () => {
    assert.equal(
      composeAddress({ addressLine: 'Dhanmondi, Dhaka', area: 'Dhanmondi', city: 'Dhaka', postcode: null }),
      'Dhanmondi, Dhaka',
    );
    assert.equal(
      composeAddress({ addressLine: '  House 12  ', area: '', city: 'Dhaka', postcode: '  ' }),
      'House 12, Dhaka',
    );
  });

  it('converts poisha to BDT without floating-point drift', () => {
    assert.equal(toBdt(79500), 795);
    assert.equal(toBdt(19999), 199.99);
    assert.equal(toBdt(0), 0);
  });

  it('omits an empty note rather than sending an empty string', () => {
    const result = buildCreateOrderPayload({ ...DATA, note: '   ' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal('note' in result.payload, false);
  });

  it('refuses a phone that is not an 11-digit Bangladeshi mobile', () => {
    for (const phone of ['', '0171234567', '+8801712345678', '02712345678']) {
      const result = buildCreateOrderPayload({ ...DATA, recipientPhone: phone });
      assert.equal(result.ok, false, phone);
      if (!result.ok) assert.match(result.message, /phone/);
    }
  });

  it('refuses a missing name or address before asking the courier', () => {
    const noName = buildCreateOrderPayload({ ...DATA, recipientName: '  ' });
    assert.equal(noName.ok, false);
    if (!noName.ok) assert.match(noName.message, /name/);

    const noAddress = buildCreateOrderPayload({ ...DATA, addressLine: '', area: '', city: '', postcode: null });
    assert.equal(noAddress.ok, false);
    if (!noAddress.ok) assert.match(noAddress.message, /address/);
  });

  it('clips the provider field limits instead of blocking a confirmed parcel', () => {
    const result = buildCreateOrderPayload({
      ...DATA,
      recipientName: 'A'.repeat(140),
      addressLine: 'B'.repeat(400),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.recipient_name.length, 100);
    assert.equal(result.payload.recipient_address.length, 250);
  });

  it('refuses an invoice that cannot be its own reference', () => {
    assert.throws(() => buildCreateOrderPayload({ ...DATA, invoice: 'QB 123' }), /invoice/);
    assert.throws(() => buildCreateOrderPayload({ ...DATA, invoice: '' }), /invoice/);
  });
});

describe('steadfast client', () => {
  it('sends both keys as headers and the documented body', async () => {
    const { fetchImpl, calls } = stubFetch({
      body: {
        status: 200,
        message: 'Consignment has been created successfully.',
        consignment: {
          consignment_id: 1424107,
          invoice: 'QB0123456789ABCDEF',
          tracking_code: '15BAEB8A',
          status: 'in_review',
        },
      },
    });
    const built = buildCreateOrderPayload(DATA);
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const result = await createOrder(CREDENTIALS, built.payload, { fetchImpl });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.consignment, {
      consignmentId: 1424107,
      invoice: 'QB0123456789ABCDEF',
      trackingCode: '15BAEB8A',
      status: 'in_review',
    });

    const [call] = calls;
    assert.equal(call?.url, 'https://portal.packzy.com/api/v1/create_order');
    assert.equal(call?.init.method, 'POST');
    const headers = call?.init.headers as Record<string, string>;
    assert.equal(headers['Api-Key'], CREDENTIALS.apiKey);
    assert.equal(headers['Secret-Key'], CREDENTIALS.secretKey);
    assert.deepEqual(JSON.parse(String(call?.init.body)), built.payload);
  });

  it('is a failure when SteadFast answers without a consignment', async () => {
    const { fetchImpl } = stubFetch({ body: { status: 200, message: 'ok' } });
    const result = await createOrder(CREDENTIALS, { invoice: 'X', recipient_name: 'A', recipient_phone: '01712345678', recipient_address: 'Y', cod_amount: 1 }, { fetchImpl });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /consignment/);
  });

  it('surfaces the courier\'s own refusal message, bounded', async () => {
    const { fetchImpl } = stubFetch({
      status: 200,
      body: { status: 422, message: `The invoice has already been taken. ${'x'.repeat(400)}` },
    });
    const result = await createOrder(CREDENTIALS, { invoice: 'X', recipient_name: 'A', recipient_phone: '01712345678', recipient_address: 'Y', cod_amount: 1 }, { fetchImpl });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /invoice has already been taken/);
      assert.ok(result.message.length <= 200);
    }
  });

  it('names a refused key rather than echoing the answer', async () => {
    const { fetchImpl } = stubFetch({ status: 401, body: { message: 'Unauthenticated.' } });
    const result = await createOrder(CREDENTIALS, { invoice: 'X', recipient_name: 'A', recipient_phone: '01712345678', recipient_address: 'Y', cod_amount: 1 }, { fetchImpl });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /refused the API key/);
  });

  it('reports an unreachable courier and a timeout as failures, never as success', async () => {
    const network = stubFetch({ throws: new TypeError('fetch failed') });
    const unreachable = await createOrder(CREDENTIALS, { invoice: 'X', recipient_name: 'A', recipient_phone: '01712345678', recipient_address: 'Y', cod_amount: 1 }, { fetchImpl: network.fetchImpl });
    assert.equal(unreachable.ok, false);
    if (!unreachable.ok) assert.match(unreachable.message, /could not be reached/);

    const timeout = new Error('aborted');
    timeout.name = 'TimeoutError';
    const slow = stubFetch({ throws: timeout });
    const timedOut = await createOrder(CREDENTIALS, { invoice: 'X', recipient_name: 'A', recipient_phone: '01712345678', recipient_address: 'Y', cod_amount: 1 }, { fetchImpl: slow.fetchImpl });
    assert.equal(timedOut.ok, false);
    if (!timedOut.ok) assert.match(timedOut.message, /did not answer/);
  });

  it('reads a balance and a delivery status', async () => {
    const balance = await getBalance(CREDENTIALS, {
      fetchImpl: stubFetch({ body: { status: 200, current_balance: 0 } }).fetchImpl,
    });
    assert.deepEqual(balance, { ok: true, balance: 0 });

    const status = await getDeliveryStatus(CREDENTIALS, 1424107, {
      fetchImpl: stubFetch({ body: { status: 200, delivery_status: 'delivered' } }).fetchImpl,
    });
    assert.deepEqual(status, { ok: true, status: 'delivered' });
  });

  it('is a failure when a status answer carries no delivery status', async () => {
    const result = await getDeliveryStatus(CREDENTIALS, 1, {
      fetchImpl: stubFetch({ body: { status: 200 } }).fetchImpl,
    });
    assert.equal(result.ok, false);
  });

  it('builds the status path from the consignment id', async () => {
    const { fetchImpl, calls } = stubFetch({ body: { delivery_status: 'in_review' } });
    await getDeliveryStatus(CREDENTIALS, 1424107, { fetchImpl });
    assert.equal(calls[0]?.url, 'https://portal.packzy.com/api/v1/status_by_cid/1424107');
  });
});
