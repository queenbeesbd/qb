import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EnvironmentError, parseServerEnv } from '../../src/server/env';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:5432/queenbees_dev';
const REMOTE = 'postgresql://user:pw@db.example.com:5432/queenbees';
const NEON = 'postgresql://user:pw@ep-cool-name-123456.us-east-2.aws.neon.tech/queenbees';

describe('server environment validation', () => {
  it('requires DATABASE_URL', () => {
    assert.throws(() => parseServerEnv({}), EnvironmentError);
    assert.throws(() => parseServerEnv({ DATABASE_URL: '   ' }), EnvironmentError);
  });

  it('rejects a non-postgres scheme', () => {
    assert.throws(() => parseServerEnv({ DATABASE_URL: 'mysql://host/db' }), EnvironmentError);
    assert.throws(() => parseServerEnv({ DATABASE_URL: 'not-a-url' }), EnvironmentError);
  });

  it('accepts a local postgres URL and reports it as local', () => {
    const env = parseServerEnv({ DATABASE_URL: LOCAL });
    assert.equal(env.isLocal, true);
    assert.equal(env.driver, 'pg');
  });

  it('refuses a remote host with TLS disabled', () => {
    assert.throws(
      () => parseServerEnv({ DATABASE_URL: `${REMOTE}?sslmode=disable` }),
      /sslmode=disable/,
    );
  });

  it('refuses production pointing at a loopback host', () => {
    assert.throws(
      () => parseServerEnv({ DATABASE_URL: LOCAL, QUEENBEES_ENV: 'production' }),
      /must not point at a loopback host/,
    );
  });

  it('selects the WebSocket driver for a Neon host', () => {
    const env = parseServerEnv({ DATABASE_URL: NEON, QUEENBEES_ENV: 'production' });
    assert.equal(env.driver, 'neon-serverless');
    assert.equal(env.isLocal, false);
  });

  it('honours an explicit driver and rejects an unknown one', () => {
    assert.equal(parseServerEnv({ DATABASE_URL: NEON, DATABASE_DRIVER: 'pg' }).driver, 'pg');
    assert.throws(
      () => parseServerEnv({ DATABASE_URL: LOCAL, DATABASE_DRIVER: 'neon-http' }),
      /DATABASE_DRIVER must be one of/,
    );
  });

  it('rejects an unknown environment name', () => {
    assert.throws(
      () => parseServerEnv({ DATABASE_URL: LOCAL, QUEENBEES_ENV: 'staging' }),
      /QUEENBEES_ENV must be one of/,
    );
  });

  it('never returns the password in a derived description', () => {
    // Guards the logging rule: only host and database may be surfaced.
    const env = parseServerEnv({ DATABASE_URL: REMOTE });
    const parsed = new URL(env.databaseUrl);
    assert.equal(parsed.password, 'pw');
    assert.equal(`${parsed.hostname}${parsed.pathname}`, 'db.example.com/queenbees');
  });
});
