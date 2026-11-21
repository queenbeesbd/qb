import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { seedOrder, SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';
import {
  loadProviderCredentials,
  providerCredentialStatus,
  PROVIDER_KEYS,
  saveProviderCredentials,
} from '../../src/server/integrations/provider-credentials';
import { ValidationError } from '../../src/server/authz/authorize';

/** ADR 0047: provider secrets enter through the panel, read back masked, and can be removed. */
const OWNER = {
  staffUserId: 0,
  permissions: new Set(['settings.write']),
  roleCodes: ['owner'],
};

const TOKEN = `123456789:${'A'.repeat(40)}`;
const RESEND_KEY = 're_testkey123456';
const SMS_KEY = 'bulksmskey123';

describe('owner-managed provider credentials (ADR 0047)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  before(async () => {
    fixture = await startMigratedDatabase();
    OWNER.staffUserId = (await seedOrder(fixture.pool)).staffId;
  });

  after(async () => {
    await fixture.close();
  });

  it('saves, masks and clears without writing a value to the audit trail', async () => {
    await withTransaction((tx) =>
      saveProviderCredentials(tx, OWNER, {
        telegramBotToken: TOKEN,
        resendApiKey: RESEND_KEY,
        resendFrom: 'shop@example.test',
        smsApiKey: SMS_KEY,
        smsSenderId: 'QUEENBEES',
        baseUrl: 'https://queenbeesbd.com',
      }),
    );

    const stored = await loadProviderCredentials();
    assert.equal(stored.telegramBotToken, TOKEN);
    assert.equal(stored.resendApiKey, RESEND_KEY);
    assert.equal(stored.baseUrl, 'https://queenbeesbd.com');

    const status = await providerCredentialStatus();
    assert.equal(status.telegramBotToken.set, true);
    assert.equal(status.telegramBotToken.hint, `••••${TOKEN.slice(-4)}`);

    const audit = await fixture.pool.query<{ after: string }>(
      `select after::text as after from audit_event where action = 'integration.provider_credentials_saved' order by id desc limit 1`,
    );
    const after = audit.rows[0]?.after ?? '';
    assert.equal(after.includes(TOKEN), false);
    assert.equal(after.includes(RESEND_KEY), false);
    assert.equal(after.includes(SMS_KEY), false);

    // An empty field keeps the stored value; only `clear` removes it.
    await withTransaction((tx) =>
      saveProviderCredentials(tx, OWNER, {
        resendApiKey: '',
        clear: [PROVIDER_KEYS.telegramBotToken],
      }),
    );
    const afterClear = await loadProviderCredentials();
    assert.equal(afterClear.resendApiKey, RESEND_KEY, 'blank keeps the saved key');
    const tokenRow = await fixture.pool.query(
      `select 1 from store_setting where key = $1`,
      [PROVIDER_KEYS.telegramBotToken],
    );
    assert.equal(tokenRow.rowCount, 0, 'an explicit clear removes the stored token');
  });

  it('refuses a malformed credential and leaves the saved one untouched', async () => {
    await assert.rejects(
      withTransaction((tx) => saveProviderCredentials(tx, OWNER, { telegramBotToken: 'short' })),
      ValidationError,
    );
    const row = await fixture.pool.query(`select 1 from store_setting where key = $1`, [PROVIDER_KEYS.telegramBotToken]);
    assert.equal(row.rowCount, 0, 'a refused save changes nothing');
  });
});
