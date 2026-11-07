/**
 * Visit-log retention (ADR 0027 D7) against real PostgreSQL.
 *
 * The sweep is the only delete path over the visit log, so it is tested against a real cluster rather
 * than a mock: a session older than the window must go, its events must go with it, and a session
 * inside the window must survive with its events. The window is the longest period the analytics
 * screen offers, so a figure can never read a row the sweep would have removed.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { visitEvent, visitSession } from '../../src/db/schema';
import { VISIT_RETENTION_DAYS, pruneVisitLog } from '../../src/server/analytics/visits';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

describe('visit-log retention (database)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  before(async () => {
    fixture = await startMigratedDatabase();
  });

  after(async () => {
    await fixture.close();
  });

  it('deletes a session older than the window and cascades its events', async () => {
    const old = await fixture.pool.query<{ id: string }>(
      `insert into visit_session (first_seen_at, last_seen_at, device)
       values (now() - interval '120 days', now() - interval '100 days', 'phone')
       returning id`,
    );
    await fixture.pool.query(
      `insert into visit_event (session_id, kind, path) values ($1, 'page_view', '/')`,
      [old.rows[0]!.id],
    );

    const removed = await withTransaction((tx) => pruneVisitLog(tx));
    assert.equal(removed, 1);

    const sessions = await withTransaction((tx) =>
      tx.select({ id: visitSession.id }).from(visitSession),
    );
    assert.equal(sessions.length, 0, 'the old session is gone');
    const events = await withTransaction((tx) => tx.select({ id: visitEvent.id }).from(visitEvent));
    assert.equal(events.length, 0, 'its events cascaded with it');
  });

  it('keeps a session inside the window and its events', async () => {
    const kept = await fixture.pool.query<{ id: string }>(
      `insert into visit_session (first_seen_at, last_seen_at, device)
       values (now() - interval '10 days', now() - interval '1 day', 'desktop')
       returning id`,
    );
    await fixture.pool.query(
      `insert into visit_event (session_id, kind, path) values ($1, 'page_view', '/products')`,
      [kept.rows[0]!.id],
    );

    const removed = await withTransaction((tx) => pruneVisitLog(tx));
    assert.equal(removed, 0, 'a second sweep removes nothing');

    const sessions = await withTransaction((tx) =>
      tx.select({ id: visitSession.id }).from(visitSession),
    );
    assert.deepEqual(
      sessions.map((row) => row.id),
      [kept.rows[0]!.id],
      'the session inside the window survives',
    );
    const events = await withTransaction((tx) => tx.select({ id: visitEvent.id }).from(visitEvent));
    assert.equal(events.length, 1, 'its event survives');
  });

  it('states the window the analytics screen can read', () => {
    assert.equal(VISIT_RETENTION_DAYS, 90);
  });
});
