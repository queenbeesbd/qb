import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  divisionFromHeaders,
  deviceFromUserAgent,
  isBotUserAgent,
  isVisitSessionId,
  normalisePath,
} from '../../src/server/analytics/visits';

/**
 * The visit tracker's pure helpers (ADR 0027).
 *
 * These are the rules that decide what is written to the database, so they are tested without a
 * cluster: a query string must never reach storage, a crawler must never be counted, and a cookie
 * value must be a session id before it is used as one.
 */
describe('visit tracking helpers', () => {
  it('strips the query string, so a search term is never stored', () => {
    assert.equal(normalisePath('/products?q=niacinamide'), '/products');
    assert.equal(normalisePath('/?utm_source=facebook'), '/');
    assert.equal(normalisePath('/categories/skincare?page=2'), '/categories/skincare');
  });

  it('keeps a clean path and roots one that is not', () => {
    assert.equal(normalisePath('/cart'), '/cart');
    assert.equal(normalisePath('products'), '/products');
    assert.equal(normalisePath(''), '/');
  });

  it('bounds a path to the column length', () => {
    const long = '/' + 'a'.repeat(400);
    assert.equal(normalisePath(long).length, 200);
  });

  it('classifies a phone, a tablet and a desktop', () => {
    assert.equal(
      deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'),
      'phone',
    );
    assert.equal(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile'), 'phone');
    assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
    assert.equal(deviceFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'desktop');
    assert.equal(deviceFromUserAgent(null), 'desktop');
  });

  it('drops crawlers, link previews and headless browsers', () => {
    assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
    assert.equal(isBotUserAgent('facebookexternalhit/1.1'), true);
    assert.equal(isBotUserAgent('WhatsApp/2.23'), true);
    assert.equal(isBotUserAgent('Mozilla/5.0 HeadlessChrome/120'), true);
    assert.equal(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1'), false);
    assert.equal(isBotUserAgent(null), false);
  });

  it('turns the platform region into one of the eight divisions, and never guesses', () => {
    // The ISO 3166-2:BD subdivisions are exactly the divisions.
    assert.equal(divisionFromHeaders('BD', 'BD-C'), 'dhaka');
    assert.equal(divisionFromHeaders('BD', 'BD-B'), 'chattogram');
    assert.equal(divisionFromHeaders('BD', 'BD-H'), 'mymensingh');
    // Some networks report only the letter.
    assert.equal(divisionFromHeaders('bd', 'g'), 'sylhet');
    // Outside the country is a real answer, not an error.
    assert.equal(divisionFromHeaders('GB', 'ENG'), 'outside_bd');
    // No country, an unknown subdivision, or no headers at all: "not known", never a default.
    assert.equal(divisionFromHeaders(null, 'BD-C'), null);
    assert.equal(divisionFromHeaders('', ''), null);
    assert.equal(divisionFromHeaders('BD', 'BD-Z'), null);
    assert.equal(divisionFromHeaders('BD', null), null);
  });

  it('accepts only a UUID-shaped session id', () => {
    assert.equal(isVisitSessionId('f4cbf3a5-88c0-44b9-a2cd-71c6e78c4829'), true);
    assert.equal(isVisitSessionId('F4CBF3A5-88C0-44B9-A2CD-71C6E78C4829'), true);
    assert.equal(isVisitSessionId('not-a-uuid'), false);
    assert.equal(isVisitSessionId(''), false);
    assert.equal(isVisitSessionId(null), false);
    assert.equal(isVisitSessionId(undefined), false);
  });
});
