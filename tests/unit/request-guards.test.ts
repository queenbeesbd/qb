import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ADMIN_ROOT } from '../../src/server/auth/constants';
import {
  csrfTokenMatches,
  isSameOrigin,
  isStateChanging,
  requestCorrelationId,
  safeReturnPath,
} from '../../src/server/auth/request-guards';

function request(headers: Record<string, string>, url = 'https://admin.example.test/api/admin/staff'): Request {
  return new Request(url, { method: 'POST', headers });
}

describe('same-origin enforcement', () => {
  it('accepts a request whose Origin matches the Host', () => {
    assert.equal(
      isSameOrigin(request({ host: 'admin.example.test', origin: 'https://admin.example.test' })),
      true,
    );
  });

  it('accepts a local development origin over http, where TLS is not in play', () => {
    assert.equal(
      isSameOrigin(
        request(
          { host: '127.0.0.1:4311', origin: 'http://127.0.0.1:4311' },
          'http://127.0.0.1:4311/api/admin/session/login',
        ),
      ),
      true,
    );
  });

  it('refuses a cross-site Origin', () => {
    assert.equal(
      isSameOrigin(request({ host: 'admin.example.test', origin: 'https://evil.example.test' })),
      false,
    );
  });

  it('refuses a lookalike host that merely contains the real one', () => {
    assert.equal(
      isSameOrigin(request({ host: 'admin.example.test', origin: 'https://admin.example.test.evil.test' })),
      false,
    );
  });

  it('refuses a protocol downgrade on the same host', () => {
    assert.equal(isSameOrigin(request({ host: 'admin.example.test', origin: 'http://admin.example.test' })), false);
  });

  it('falls back to Referer when Origin is absent, and refuses when both are absent', () => {
    assert.equal(
      isSameOrigin(request({ host: 'admin.example.test', referer: 'https://admin.example.test/admin/staff' })),
      true,
    );
    assert.equal(isSameOrigin(request({ host: 'admin.example.test', referer: 'https://evil.test/x' })), false);
    assert.equal(isSameOrigin(request({ host: 'admin.example.test' })), false);
  });

  it('falls back to the request URL host when the Host header is absent, and still refuses a mismatch', () => {
    // A browser always sends Host, but a missing header must not become a bypass: the URL host is
    // used instead, and the comparison still has to hold.
    assert.equal(isSameOrigin(request({ origin: 'https://admin.example.test' })), true);
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
    assert.equal(safeReturnPath('/admin/staff'), '/admin/staff');
    assert.equal(safeReturnPath('/admin'), '/admin');
  });

  it('drops the query and fragment, which the admin routes do not use for state', () => {
    assert.equal(safeReturnPath('/admin/staff?notice=denied'), '/admin/staff');
    assert.equal(safeReturnPath('/admin/staff#x'), '/admin/staff');
  });

  it('refuses an absolute URL, a protocol-relative form and a backslash trick', () => {
    assert.equal(safeReturnPath('https://evil.example.test/admin'), ADMIN_ROOT);
    assert.equal(safeReturnPath('//evil.example.test/admin'), ADMIN_ROOT);
    assert.equal(safeReturnPath('/\\evil.example.test/admin'), ADMIN_ROOT);
    assert.equal(safeReturnPath('\\\\evil.example.test'), ADMIN_ROOT);
  });

  it('refuses an encoded separator that could be decoded into a new segment', () => {
    assert.equal(safeReturnPath('/admin%2f..%2fetc'), ADMIN_ROOT);
    assert.equal(safeReturnPath('/admin%5cstaff'), ADMIN_ROOT);
  });

  it('refuses a path outside the admin tree, and anything that is not a path', () => {
    assert.equal(safeReturnPath('/checkout'), ADMIN_ROOT);
    assert.equal(safeReturnPath('javascript:alert(1)'), ADMIN_ROOT);
    assert.equal(safeReturnPath(''), ADMIN_ROOT);
    assert.equal(safeReturnPath(null), ADMIN_ROOT);
    assert.equal(safeReturnPath(undefined), ADMIN_ROOT);
  });
});
