import assert from 'node:assert/strict';
import test from 'node:test';

import { EnvironmentError } from '@/server/env';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

/**
 * The fixture catalog is an explicit development opt-in, never a fallback. A fixture catalog served
 * from production would publish captured vendor data as this store's own catalog, so the refusal is a
 * guard worth pinning in its own file: the loader is memoised with React `cache()`, and isolation
 * keeps this case from observing another case's cached snapshot.
 */

test('the fixture opt-in is refused outside development', async () => {
  process.env.QUEENBEES_STOREFRONT_FIXTURE = '1';
  process.env.QUEENBEES_ENV = 'production';

  await assert.rejects(getStorefrontCatalog, (error: unknown) => {
    assert.ok(error instanceof EnvironmentError);
    assert.match(error.message, /only be enabled in a development environment/);
    return true;
  });
});
