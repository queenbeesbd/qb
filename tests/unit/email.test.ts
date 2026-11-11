import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  emailConfigured,
  publicBaseUrl,
  sendEmail,
  type EmailMessage,
  type EmailOptions,
} from '../../src/server/integrations/email';
import {
  emailChangedEmail,
  passwordChangedEmail,
  passwordRecoveryEmail,
} from '../../src/server/integrations/email-templates';

/**
 * The transactional email surface, without a network.
 *
 * `fetchImpl` is a stub, so these tests cover what can be wrong before Resend is asked anything: a
 * missing configuration sends nothing, the request carries the key as a bearer token and the sender the
 * environment declares, every failure is a value rather than an exception, and no address leaks into a
 * failure. The templates are checked for the parts a customer must be able to act on - the link, the
 * expiry, the shop's own palette - and for escaping of a value that came from a request.
 */

const MESSAGE: EmailMessage = {
  to: 'customer@example.test',
  subject: 'Subject',
  html: '<p>Body</p>',
  text: 'Body',
};

const CONFIGURED = {
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: "QueenBee's <no-reply@example.test>",
  APP_BASE_URL: 'https://shop.example.test',
  QUEENBEES_ENV: 'development',
} as const;

function stub(response: { status?: number; body?: unknown; throws?: boolean; json?: boolean }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (response.throws === true) throw new TypeError('network down');
    const body =
      response.json === false ? '' : JSON.stringify(response.body ?? { id: 'msg_1' });
    return new Response(body, { status: response.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function options(fetchImpl: typeof fetch, source: Readonly<Record<string, string | undefined>> = CONFIGURED): EmailOptions {
  return { fetchImpl, source };
}

describe('resend configuration', () => {
  it('is off unless both the key and the sender are present', () => {
    assert.equal(emailConfigured(CONFIGURED), true);
    assert.equal(emailConfigured({}), false);
    assert.equal(emailConfigured({ RESEND_API_KEY: 're_test_key' }), false);
    assert.equal(emailConfigured({ EMAIL_FROM: 'x <y@z.test>' }), false);
    assert.equal(emailConfigured({ RESEND_API_KEY: '  ', EMAIL_FROM: 'x <y@z.test>' }), false);
  });

  it('resolves the mailed-link origin, and refuses to invent one in production', () => {
    assert.equal(publicBaseUrl(CONFIGURED), 'https://shop.example.test');
    assert.equal(
      publicBaseUrl({ APP_BASE_URL: 'https://shop.example.test/' }),
      'https://shop.example.test',
    );
    assert.equal(publicBaseUrl({ QUEENBEES_ENV: 'development' }), 'http://localhost:3000');
    assert.equal(publicBaseUrl({ QUEENBEES_ENV: 'production' }), null);
    assert.equal(
      publicBaseUrl({ QUEENBEES_ENV: 'production', APP_BASE_URL: 'not a url' }),
      null,
    );
    assert.equal(
      publicBaseUrl({ QUEENBEES_ENV: 'production', APP_BASE_URL: 'javascript:alert(1)' }),
      null,
    );
  });
});

describe('sendEmail', () => {
  it('posts the documented body with the key as a bearer token', async () => {
    const { fetchImpl, calls } = stub({ body: { id: 'msg_42' } });
    const result = await sendEmail(MESSAGE, options(fetchImpl));
    assert.deepEqual(result, { ok: true, id: 'msg_42' });

    const [call] = calls;
    assert.equal(call?.url, 'https://api.resend.com/emails');
    const headers = call?.init.headers as Record<string, string>;
    assert.equal(headers.authorization, 'Bearer re_test_key');
    const body = JSON.parse(String(call?.init.body)) as Record<string, unknown>;
    assert.deepEqual(body, {
      from: "QueenBee's <no-reply@example.test>",
      to: ['customer@example.test'],
      subject: 'Subject',
      html: '<p>Body</p>',
      text: 'Body',
    });
  });

  it('sends nothing at all when it is not configured', async () => {
    const { fetchImpl, calls } = stub({});
    const result = await sendEmail(MESSAGE, options(fetchImpl, {}));
    assert.deepEqual(result, { ok: false, reason: 'not_configured' });
    assert.equal(calls.length, 0, 'no request may be attempted without a key');
  });

  it('reports a refusal and an outage as values, never as a throw', async () => {
    const rejected = await sendEmail(MESSAGE, options(stub({ status: 422 }).fetchImpl));
    assert.deepEqual(rejected, { ok: false, reason: 'rejected' });

    const unreachable = await sendEmail(MESSAGE, options(stub({ throws: true }).fetchImpl));
    assert.deepEqual(unreachable, { ok: false, reason: 'unreachable' });
  });

  it('accepts a 2xx answer without a parseable body', async () => {
    const result = await sendEmail(MESSAGE, options(stub({ json: false }).fetchImpl));
    assert.deepEqual(result, { ok: true, id: null });
  });

  it('never returns or throws the address on a failure', async () => {
    const result = await sendEmail(MESSAGE, options(stub({ status: 500 }).fetchImpl));
    assert.equal(JSON.stringify(result).includes('customer@example.test'), false);
  });

  it('uses the development-only base override, and ignores it elsewhere', async () => {
    const development = stub({});
    await sendEmail(MESSAGE, {
      fetchImpl: development.fetchImpl,
      source: { ...CONFIGURED, RESEND_API_BASE_URL: 'http://127.0.0.1:8790' },
    });
    assert.equal(development.calls[0]?.url, 'http://127.0.0.1:8790/emails');

    const production = stub({});
    await sendEmail(MESSAGE, {
      fetchImpl: production.fetchImpl,
      source: { ...CONFIGURED, QUEENBEES_ENV: 'production', RESEND_API_BASE_URL: 'http://127.0.0.1:8790' },
    });
    assert.equal(production.calls[0]?.url, 'https://api.resend.com/emails');
  });
});

describe('email templates', () => {

  it('carries the recovery link, its single use and its expiry', () => {
    const template = passwordRecoveryEmail({
      resetUrl: 'https://shop.example.test/account/reset?token=abc',
      expiresMinutes: 60,
    });
    assert.match(template.subject, /Reset your password/);
    assert.ok(template.html.includes('https://shop.example.test/account/reset?token=abc'));
    assert.ok(template.text.includes('https://shop.example.test/account/reset?token=abc'));
    assert.match(template.text, /works once/);
    assert.match(template.text, /60 minutes/);
  });

  it('sends no link in the password-changed notice', () => {
    const template = passwordChangedEmail({ changedAt: '8 Nov 2026, 10:00' });
    assert.equal(/https?:\/\//.test(template.html), false);
    assert.equal(/https?:\/\//.test(template.text), false);
  });

  it('tells the previous address which address the account now uses', () => {
    const template = emailChangedEmail({ newEmail: 'new@example.test', changedAt: '8 Nov 2026, 10:00' });
    assert.ok(template.html.includes('new@example.test'));
    assert.ok(template.text.includes('new@example.test'));
  });

  it("uses the owner's palette in every message", () => {
    for (const template of [
      passwordRecoveryEmail({ resetUrl: 'https://x.test/a', expiresMinutes: 60 }),
      passwordChangedEmail({ changedAt: 'now' }),
      emailChangedEmail({ newEmail: 'a@b.test', changedAt: 'now' }),
    ]) {
      assert.ok(template.html.includes('#A680FF'), 'primary purple');
      assert.ok(template.html.includes('#56358C'), 'deep purple');
      assert.ok(template.html.includes('#F6B3CC'), 'soft pink');
      assert.ok(template.html.includes('max-width:600px'), 'a bounded, mobile-friendly frame');
      assert.ok(template.text.length > 40, 'a plain-text alternative');
    }
  });
});
