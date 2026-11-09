/**
 * The pre-deploy gate's decision.
 *
 * The consequence of a wrong `ok` is a deploy that reads a schema which is not there, so the
 * boundaries matter more than the wording: no journal, everything applied, one pending, several
 * pending, and an applied hash that matches no file.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateMigrationGate } from '../../src/db/migration-gate';
import type { JournalEntry } from '../../src/db/migrate';

function entry(idx: number, tag: string): JournalEntry {
  return { idx, tag, when: 1_700_000_000_000 + idx };
}

const JOURNAL = [entry(0, '0000_first'), entry(1, '0001_second'), entry(2, '0002_third')];

test('a database with every migration applied may deploy', () => {
  const gate = evaluateMigrationGate({
    applied: 3,
    entries: JOURNAL,
    pending: [],
    unknownApplied: [],
  });
  assert.deepEqual(gate, { ok: true, applied: 3, total: 3 });
});

test('a pending migration blocks the deploy and names it', () => {
  const gate = evaluateMigrationGate({
    applied: 1,
    entries: JOURNAL,
    pending: [JOURNAL[1]!, JOURNAL[2]!],
    unknownApplied: [],
  });
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.equal(gate.kind, 'pending');
  assert.match(gate.detail, /2 migration\(s\)/);
  assert.match(gate.detail, /0001_second, 0002_third/);
  assert.match(gate.detail, /db:migrate/);
});

test('a single pending migration is still a refusal, not a warning', () => {
  const gate = evaluateMigrationGate({
    applied: 2,
    entries: JOURNAL,
    pending: [JOURNAL[2]!],
    unknownApplied: [],
  });
  assert.equal(gate.ok, false);
});

test('an applied hash that matches no file outranks a pending one', () => {
  const gate = evaluateMigrationGate({
    applied: 2,
    entries: JOURNAL,
    pending: [JOURNAL[2]!],
    unknownApplied: ['abcdef0123456789'],
  });
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.equal(gate.kind, 'unknown');
  assert.match(gate.detail, /abcdef012345/);
  assert.match(gate.detail, /diverged/);
});

test('an empty journal is not pending, only empty', () => {
  const gate = evaluateMigrationGate({
    applied: 0,
    entries: [],
    pending: [],
    unknownApplied: [],
  });
  assert.deepEqual(gate, { ok: true, applied: 0, total: 0 });
});
