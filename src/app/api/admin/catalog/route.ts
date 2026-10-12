/**
 * GET /api/admin/catalog - the catalog read API.
 *
 * Returns the same projection the Phase 14 storefront adapter will consume: published products with
 * their bilingual names, integer-poisha prices, owner-set availability and image keys, plus visible
 * categories. It is deliberately **authenticated**: this phase adds no public catalog endpoint, because a
 * public surface with no consumer would be a new exposure added without a requirement. Opening it is part
 * of the Phase 14 cutover, together with a revalidation policy.
 *
 * `guardRead` requires a session and `catalog.write`, and records a durable denial when the permission is
 * missing. The response is `no-store`, because every admin response is session-scoped.
 */

import { withTransaction } from '@/db/client';
import { guardRead } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { readCatalogSnapshot } from '@/server/catalog/read';
import { deny, json } from '../responses';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const guard = await guardRead(request, PERMISSIONS.catalogWrite);
  if (!guard.ok) return deny(guard.status);

  const snapshot = await withTransaction((tx) => readCatalogSnapshot(tx));
  return json({
    source: 'database',
    isDemo: false,
    products: snapshot.products,
    categories: snapshot.categories,
  });
}
