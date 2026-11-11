import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sendSms, smsConfigured, smsRecipient } from '../../src/server/integrations/sms';

/**
 * The BulkSMSBD surface, without a network.
 *
 * `fetchImpl` is a stub, so these cover what can be wrong before the provider is asked anything: a
 * missing key or sender sends nothing, the number is converted to the provider's own form, the request
 * carries the documented fields, and every provider answer maps to one closed outcome.
 */

const CONFIGURED = {
  BULKSMS_API_KEY: 'test-key',
  BULKSMS_SENDER_ID: '8809600000000',
  QUEENBEES_ENV: 'development',
};

function stub(response: { status?: number; body?: unknown }) {
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    return new Response(JSON.stringify(response.body ?? {}), {
      status: response.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('SMS delivery', () => {
  it('is off unless both the key and the sender id are configured', () => {
    assert.equal(smsConfigured({ ...CONFIGURED }), true);
    assert.equal(smsConfigured({ ...CONFIGURED, BULKSMS_SENDER_ID: '' }), false);
    assert.equal(smsConfigured({ ...CONFIGURED, BULKSMS_API_KEY: '  ' }), false);
    assert.equal(smsConfigured({}), false);
  });

  it('converts the canonical number to the provider form and refuses anything else', () => {
    assert.equal(smsRecipient('01712345678'), '8801712345678');
    assert.equal(smsRecipient('8801712345678'), null);
    assert.equal(smsRecipient('not-a-number'), null);
  });

  it('sends the documented fields and treats 202 as accepted', async () => {
    const { calls, fetchImpl } = stub({ body: { response_code: 202, success_message: 'SMS Submitted Successfully' } });
    const result = await sendSms(
      { to: '01712345678', body: 'Your code is 123456' },
      { fetchImpl, source: CONFIGURED, baseUrl: 'https://sms.test/api/smsapi' },
    );

    assert.deepEqual(result, { ok: true, id: null });
    assert.equal(calls[0]?.url, 'https://sms.test/api/smsapi');
    const body = new URLSearchParams(calls[0]?.body ?? '');
    assert.equal(body.get('api_key'), 'test-key');
    assert.equal(body.get('senderid'), '8809600000000');
    assert.equal(body.get('number'), '8801712345678');
    assert.equal(body.get('message'), 'Your code is 123456');
  });

  it('reports a provider refusal and a network failure as closed reasons', async () => {
    const refused = await sendSms(
      { to: '01712345678', body: 'x' },
      { fetchImpl: stub({ body: { response_code: 1007, error_message: 'Balance Insufficient' } }).fetchImpl, source: CONFIGURED },
    );
    assert.deepEqual(refused, { ok: false, reason: 'rejected' });

    const unreachable = await sendSms(
      { to: '01712345678', body: 'x' },
      { fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch, source: CONFIGURED },
    );
    assert.deepEqual(unreachable, { ok: false, reason: 'unreachable' });
  });

  it('sends nothing when the sender id has not been issued yet', async () => {
    const { calls, fetchImpl } = stub({ body: { response_code: 202 } });
    const result = await sendSms(
      { to: '01712345678', body: 'x' },
      { fetchImpl, source: { ...CONFIGURED, BULKSMS_SENDER_ID: '' } },
    );
    assert.deepEqual(result, { ok: false, reason: 'not_configured' });
    assert.equal(calls.length, 0);
  });
});
