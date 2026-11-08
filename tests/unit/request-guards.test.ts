import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ADMIN_ROOT } from '../../src/server/auth/constants';
import {
  csrfTokenMatches,
  isSameOrigin,
  isStateChanging,
  proxyHeadersTrusted,
  requestCorrelationId,
  safeReturnPath,
} from '../../src/server/auth/request-guards';

function request(headers: Record<string, string>, url = 'https://qbpanel.example.test/api/qbpanel/staff'): Request {
  return new Request(url, { method: 'POST', headers });
}

describe('same-origin enforcement', () => {
  it('accepts a request whose Origin matches the Host', () => {
    assert.equal(
      isSameOrigin(request({ host: 'qbpanel.example.test', origin: 'https://qbpanel.example.test' })),
      true,
    );
  });

  it('accepts a local development origin over http, where TLS is not in play', () => {
    assert.equal(
      isSameOrigin(
        request(
          { host: '127.0.0.1:4311', origin: 'http://127.0.0.1:4311' },
          'http://127.0.0.1:4311/api/qbpanel/session/login',
        ),
      ),
      true,
    );
  });

  it('refuses a cross-site Origin', () => {
    assert.equal(
      isSameOrigin(request({ host: 'qbpanel.example.test', origin: 'https://evil.example.test' })),
      false,
    );
  });

  it('refuses a lookalike host that merely contains the real one', () => {
    assert.equal(
      isSameOrigin(request({ host: 'qbpanel.example.test', origin: 'https://qbpanel.example.test.evil.test' })),
      false,
    );
  });

  it('refuses a protocol downgrade on the same host', () => {
    assert.equal(isSameOrigin(request({ host: 'qbpanel.example.test', origin: 'http://qbpanel.example.test' })), false);
  });

  it('falls back to Referer when Origin is absent, and refuses when both are absent', () => {
    assert.equal(
      isSameOrigin(request({ host: 'qbpanel.example.test', referer: 'https://qbpanel.example.test/qbpanel/staff' })),
      true,
    );
    assert.equal(isSameOrigin(request({ host: 'qbpanel.example.test', referer: 'https://evil.test/x' })), false);
    assert.equal(isSameOrigin(request({ host: 'qbpanel.example.test' })), false);
  });

  it('falls back to the request URL host when the Host header is absent, and still refuses a mismatch', () => {
    // A browser always sends Host, but a missing header must not become a bypass: the URL host is
    // used instead, and the comparison still has to hold.
    assert.equal(isSameOrigin(request({ origin: 'https://qbpanel.example.test' })), true);
    assert.equal(isSameOrigin(request({ origin: 'https://evil.example.test' })), false);
  });

  it('treats only GET, HEAD and OPTIONS as safe methods', () => {
    assert.equal(isStateChanging('GET'), false);
    assert.equal(isStateChanging('head'), false);
    assert.equal(isStateChanging('OPTIONS'), false);
    assert.equal(isStateChanging('POST'), true);
    assert.equal(isStateChanging('PUT'), true);
    assert.equal(isStateChanging('DELETE'), true);
  });
});

describe('CSRF token comparison', () => {
  it('accepts only the exact expected value', () => {
    assert.equal(csrfTokenMatches('abc123', 'abc123'), true);
    assert.equal(csrfTokenMatches('abc123', 'abc124'), false);
    assert.equal(csrfTokenMatches('abc123', 'abc1234'), false);
  });

  it('refuses a missing, non-string or empty submission', () => {
    assert.equal(csrfTokenMatches('abc123', null), false);
    assert.equal(csrfTokenMatches('abc123', ''), false);
    assert.equal(csrfTokenMatches('abc123', new File(['abc123'], 'csrf.txt')), false);
  });
});

describe('request correlation id', () => {
  it('prefers the platform header, and accepts the conventional proxy header', () => {
    assert.equal(requestCorrelationId(request({ 'x-vercel-id': 'iad1::abc123' })), 'iad1::abc123');
    assert.equal(requestCorrelationId(request({ 'x-request-id': 'req-42' })), 'req-42');
    assert.equal(
      requestCorrelationId(request({ 'x-vercel-id': 'platform-id', 'x-request-id': 'proxy-id' })),
      'platform-id',
    );
  });

  it('returns null when the request carries neither header', () => {
    assert.equal(requestCorrelationId(request({})), null);
    assert.equal(requestCorrelationId(request({ 'x-request-id': '   ' })), null);
  });

  it('refuses a value that is not identifier-shaped, so the column cannot be used to store data', () => {
    // The header is client-controlled. Anything that is not an identifier is dropped rather than
    // stored, so the audit column cannot become a place to write arbitrary content.
    assert.equal(requestCorrelationId(request({ 'x-request-id': 'a'.repeat(101) })), null);
    // Header-legal characters that are simply not identifier-shaped. (A newline or a tab cannot be
    // tested here: the runtime refuses to construct such a request at all.)
    assert.equal(requestCorrelationId(request({ 'x-request-id': 'has space' })), null);
    assert.equal(requestCorrelationId(request({ 'x-request-id': 'has/slash' })), null);
    assert.equal(requestCorrelationId(request({ 'x-request-id': 'has@at' })), null);
    assert.equal(requestCorrelationId(request({ 'x-request-id': 'has,comma' })), null);
    assert.equal(requestCorrelationId(request({ 'x-request-id': 'semi;colon' })), null);
  });
});

describe('post-sign-in return path', () => {
  it('keeps a relative admin path', () => {
    assert.equal(safeReturnPath('/qbpanel/staff'), '/qbpanel/staff');
    assert.equal(safeReturnPath('/qbpanel'), '/qbpanel');
  });

  it('drops the query and fragment, which the admin routes do not use for state', () => {
    assert.equal(safeReturnPath('/qbpanel/staff?notice=denied'), '/qbpanel/staff');
    assert.equal(safeReturnPath('/qbpanel/staff#x'), '/qbpanel/staff');
  });

  it('refuses an absolute URL, a protocol-relative form and a backslash trick', () => {
    assert.equal(safeReturnPath('https://evil.example.test/qbpanel'), ADMIN_ROOT);
    assert.equal(safeReturnPath('//evil.example.test/qbpanel'), ADMIN_ROOT);
    assert.equal(safeReturnPath('/\\evil.example.test/qbpanel'), ADMIN_ROOT);
    assert.equal(safeReturnPath('\\\\evil.example.test'), ADMIN_ROOT);
  });

  it('refuses an encoded separator that could be decoded into a new segment', () => {
    assert.equal(safeReturnPath('/qbpanel%2f..%2fetc'), ADMIN_ROOT);
    assert.equal(safeReturnPath('/qbpanel%5cstaff'), ADMIN_ROOT);
  });

  it('refuses a path outside the admin tree, and anything that is not a path', () => {
    assert.equal(safeReturnPath('/checkout'), ADMIN_ROOT);
    assert.equal(safeReturnPath('javascript:alert(1)'), ADMIN_ROOT);
    assert.equal(safeReturnPath(''), ADMIN_ROOT);
    assert.equal(safeReturnPath(null), ADMIN_ROOT);
    assert.equal(safeReturnPath(undefined), ADMIN_ROOT);
  });
});

describe('forwarded-header trust boundary (F9)', () => {
  const proxied = (headers: Record<string, string>, url: string) =>
    request(headers, url);

  it('refuses a forged X-Forwarded-Host when proxy trust is off (the default)', () => {
    // Before the fix the expected origin was taken from the attacker-supplied header, so this
    // cross-origin request passed the guard. It is not read now, so it cannot move the expectation.
    assert.equal(
      isSameOrigin(
        request({
          host: 'qbpanel.example.test',
          origin: 'https://evil.example.test',
          'x-forwarded-host': 'evil.example.test',
        }),
      ),
      false,
    );
  });

  it('refuses a forged X-Forwarded-Proto that would claim an http request is https', () => {
    // Before the fix the forwarded scheme replaced the real one, so this passed; the scheme now comes
    // from the request URL, and the protocol downgrade is refused as it is without the header.
    assert.equal(
      isSameOrigin(
        proxied(
          { host: '127.0.0.1:4311', origin: 'https://127.0.0.1:4311', 'x-forwarded-proto': 'https' },
          'http://127.0.0.1:4311/api/account/login',
        ),
      ),
      false,
    );
  });

  it('still accepts a genuine same-origin request that carries forged forwarded headers', () => {
    assert.equal(
      isSameOrigin(
        request({
          host: 'qbpanel.example.test',
          origin: 'https://qbpanel.example.test',
          'x-forwarded-host': 'evil.example.test',
          'x-forwarded-proto': 'http',
        }),
      ),
      true,
    );
  });

  it('follows the request own Host when the runtime resolves a placeholder URL host', () => {
    // `next start` can present a placeholder host in the request URL while `Host` carries the
    // authority the browser used. The check must follow the request own host, not the placeholder - a
    // check that used the URL host alone refused every legitimate request in that runtime.
    assert.equal(
      isSameOrigin(
        request({ host: '127.0.0.1:4311', origin: 'http://127.0.0.1:4311' }, 'http://n/api/account/login'),
      ),
      true,
    );
  });

  it('honours forwarded headers only when trust is explicitly enabled', () => {
    // A reverse proxy that terminates TLS and fronts the app: the app sees its own address, and the
    // public origin arrives in the forwarded headers. Refused by default, accepted on the opt-in.
    const behindProxy = proxied(
      {
        host: '10.0.0.5:3000',
        origin: 'https://shop.example.test',
        'x-forwarded-host': 'shop.example.test',
        'x-forwarded-proto': 'https',
      },
      'http://10.0.0.5:3000/api/qbpanel/session/login',
    );
    assert.equal(isSameOrigin(behindProxy), false);
    assert.equal(isSameOrigin(behindProxy, { trustProxyHeaders: true }), true);
  });

  it('reads the opt-in from the environment, and is off unless it is exactly 1', () => {
    assert.equal(proxyHeadersTrusted({}), false);
    assert.equal(proxyHeadersTrusted({ TRUST_PROXY_HEADERS: '' }), false);
    assert.equal(proxyHeadersTrusted({ TRUST_PROXY_HEADERS: 'true' }), false);
    assert.equal(proxyHeadersTrusted({ TRUST_PROXY_HEADERS: 'yes' }), false);
    assert.equal(proxyHeadersTrusted({ TRUST_PROXY_HEADERS: '0' }), false);
    assert.equal(proxyHeadersTrusted({ TRUST_PROXY_HEADERS: '1' }), true);
  });

  it('applies the environment opt-in to the check itself, and reverts when it is removed', () => {
    const behindProxy = proxied(
      {
        host: '10.0.0.5:3000',
        origin: 'https://shop.example.test',
        'x-forwarded-host': 'shop.example.test',
        'x-forwarded-proto': 'https',
      },
      'http://10.0.0.5:3000/api/account/login',
    );
    const previous = process.env.TRUST_PROXY_HEADERS;
    try {
      delete process.env.TRUST_PROXY_HEADERS;
      assert.equal(isSameOrigin(behindProxy), false);
      process.env.TRUST_PROXY_HEADERS = '1';
      assert.equal(isSameOrigin(behindProxy), true);
    } finally {
      if (previous === undefined) delete process.env.TRUST_PROXY_HEADERS;
      else process.env.TRUST_PROXY_HEADERS = previous;
    }
  });
});
