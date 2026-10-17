import { PERMISSIONS } from '@/server/authz/permissions';
import {
  countAuditEvents,
  countOpenOperationalExceptions,
} from '@/server/auth/audit';
import { countCodApprovalQueue, countVerificationQueue } from '@/server/orders/manage';
import { requireAdminPage } from '@/server/auth/guard';
import { countOwnerAccounts } from '@/server/authz/owners';
import { countCatalog } from '@/server/catalog/read';
import { withTransaction } from '@/db/client';
import { OverviewView, type Fact } from './OverviewView';

/** The overview is a session-scoped page; nothing here is cached. */
export const dynamic = 'force-dynamic';

/**
 * The overview.
 *
 * It requires `staff.read`, which every owner-level account holds. It shows **only counts that exist** -
 * orders and payments are worklist counts, not revenue figures, and a placeholder would be a
 * fabricated metric.
 *
 * The Phase 12 role and permission counters were removed in Phase 13: they described a role model that is
 * no longer part of the launch surface (D10, ADR 0009), and a count of rows nobody operates is dashboard
 * clutter. Owner accounts and catalog counts replace them.
 */
export default async function AdminOverviewPage() {
  const principal = await requireAdminPage(PERMISSIONS.staffRead);

  const { owners, catalog, auditEvents, verificationQueue, codQueue, openExceptions } = await withTransaction(
    async (tx) => ({
      owners: await countOwnerAccounts(tx),
      catalog: await countCatalog(tx),
      auditEvents: await countAuditEvents(tx),
      verificationQueue: await countVerificationQueue(tx),
      codQueue: await countCodApprovalQueue(tx),
      openExceptions: await countOpenOperationalExceptions(tx),
    }),
  );

  const facts: Fact[] = [
    { labelKey: 'admin.overview.verificationQueue', value: verificationQueue },
    { labelKey: 'admin.overview.codQueue', value: codQueue },
    { labelKey: 'admin.overview.openExceptions', value: openExceptions },
    { labelKey: 'admin.overview.ownerTotal', value: owners.total },
    { labelKey: 'admin.overview.ownerActive', value: owners.active },
    { labelKey: 'admin.overview.catalogProducts', value: catalog.products },
    { labelKey: 'admin.overview.catalogPublished', value: catalog.productsPublished },
    { labelKey: 'admin.overview.catalogInStock', value: catalog.productsInStock },
    { labelKey: 'admin.overview.catalogOutOfStock', value: catalog.productsOutOfStock },
    { labelKey: 'admin.overview.categories', value: catalog.categories },
    { labelKey: 'admin.overview.brands', value: catalog.brands },
    { labelKey: 'admin.overview.images', value: catalog.images },
    { labelKey: 'admin.overview.auditEvents', value: auditEvents },
  ];

  return (
    <OverviewView
      facts={facts}
      session={{
        email: principal.email,
        absoluteExpiresAt: principal.absoluteExpiresAt.toISOString(),
        idleExpiresAt: principal.idleExpiresAt.toISOString(),
      }}
    />
  );
}
