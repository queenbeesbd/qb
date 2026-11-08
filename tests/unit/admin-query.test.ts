import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PAGE_SIZE_OPTIONS,
  buildQueryHref,
  dateRangeBounds,
  readDateInput,
  readPageNumber,
  readPageSize,
} from '../../src/lib/qbpanel-query';

/**
 * The admin list query state (Phase 30).
 *
 * Every admin list keeps its filters, its page size and its page number in the URL and applies them
 * in SQL. These are the pure parts of that contract, and each one is a place a hand-edited URL could
 * otherwise produce a wrong list rather than a page:
 *
 * 1. an unparseable page or page size must fall back to a documented default, not throw;
 * 2. an impossible calendar date must be ignored, not silently rolled forward into another week;
 * 3. the date window must include both named days and exclude the day after;
 * 4. a filter change must not carry a page number forward.
 */

describe('admin list query state', () => {
  it('reads a page number defensively', () => {
    assert.equal(readPageNumber(undefined), 1);
    assert.equal(readPageNumber('3'), 3);
    assert.equal(readPageNumber('0'), 1, 'a page is 1-based');
    assert.equal(readPageNumber('-2'), 1);
    assert.equal(readPageNumber('2.5'), 1);
    assert.equal(readPageNumber('25abc'), 1);
    assert.equal(readPageNumber(' 2'), 1, 'whitespace is not a page');
    assert.equal(readPageNumber('99999999999999999999'), 1, 'beyond a safe integer');
  });

  it('accepts only a documented page size, and falls back rather than clamping', () => {
    assert.equal(readPageSize(undefined, 25), 25);
    assert.equal(readPageSize('50', 25), 50);
    for (const option of PAGE_SIZE_OPTIONS) assert.equal(readPageSize(String(option), 25), option);
    assert.equal(readPageSize('7', 25), 25, 'an undocumented size is refused, not rounded');
    assert.equal(readPageSize('0', 25), 25);
    assert.equal(readPageSize('all', 25), 25);
  });

  it('accepts a real calendar date and refuses an impossible one', () => {
    assert.equal(readDateInput('2026-10-21'), '2026-10-21');
    assert.equal(readDateInput('2026-02-31'), '', '31 February does not roll into March');
    assert.equal(readDateInput('2026-13-01'), '');
    assert.equal(readDateInput('2026-10'), '');
    assert.equal(readDateInput('21-10-2026'), '');
    assert.equal(readDateInput(''), '');
    assert.equal(readDateInput(undefined), '');
    assert.equal(readDateInput('2026-02-29'), '', '2026 is not a leap year');
    assert.equal(readDateInput('2024-02-29'), '2024-02-29');
  });

  it('builds a half-open window that includes both named days', () => {
    const { start, end } = dateRangeBounds('2026-10-01', '2026-10-03');
    assert.equal(start?.getFullYear(), 2026);
    assert.equal(start?.getMonth(), 9);
    assert.equal(start?.getDate(), 1);
    assert.equal(start?.getHours(), 0);

    // The end is the start of the day *after* the last chosen day, so the whole of the 3rd is inside
    // the window and nothing on the 4th is.
    assert.equal(end?.getMonth(), 9);
    assert.equal(end?.getDate(), 4);
    assert.equal(end?.getHours(), 0);
  });

  it('treats one date as a genuine half-open range', () => {
    const since = dateRangeBounds('2026-10-01', '');
    assert.notEqual(since.start, null);
    assert.equal(since.end, null);

    const until = dateRangeBounds('', '2026-10-01');
    assert.equal(until.start, null);
    assert.equal(until.end?.getDate(), 2);
  });

  it('swaps a backwards range instead of emptying the list', () => {
    const forwards = dateRangeBounds('2026-10-01', '2026-10-03');
    const backwards = dateRangeBounds('2026-10-03', '2026-10-01');
    assert.equal(backwards.start?.getTime(), forwards.start?.getTime());
    assert.equal(backwards.end?.getTime(), forwards.end?.getTime());
  });

  it('returns an unbounded window when no date is given', () => {
    assert.deepEqual(dateRangeBounds('', ''), { start: null, end: null });
  });

  it('builds a clean path when nothing is set, and drops empty values', () => {
    assert.equal(buildQueryHref('/qbpanel/orders', { q: '', filter: '', page: null, size: undefined }), '/qbpanel/orders');
    assert.equal(buildQueryHref('/qbpanel/orders', { q: 'a b', filter: 'pending', page: 2 }), '/qbpanel/orders?q=a+b&filter=pending&page=2');
    assert.equal(buildQueryHref('/qbpanel/audit', { size: 50 }), '/qbpanel/audit?size=50');
  });

  it('produces one identical string for equivalent states', () => {
    // Callers pass `''` for "no filter", which is why the unfiltered list is one canonical path.
    assert.equal(
      buildQueryHref('/qbpanel/orders', { q: '', filter: '', page: null }),
      buildQueryHref('/qbpanel/orders', {}),
    );
  });
});
