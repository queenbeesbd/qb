import { PERMISSIONS } from '@/server/authz/permissions';
import { countAuditEvents } from '@/server/auth/audit';
import { requireAdminPage, systemCounts } from '@/server/auth/guard';
import { withTransaction } from '@/db/client';
import { OverviewView, type Fact } from './OverviewView';

/** The overview is a session-scoped page; nothing here is cached. */
export const dynamic = 'force-dynamic';

/**
 * The overview.
 *
 * It requires no permission beyond a session, because it discloses nothing an authenticated staff
 * member does not already know about their own account. It shows **only counts that exist** - there
 * is no order, revenue or growth figure, because no order can be created yet and a placeholder would
 * be a fabricated metric.
 */
export default async function AdminOverviewPage() {
  const principal = await requireAdminPage(PERMISSIONS.staffRead);

  const counts = await systemCounts();
  const auditEvents = await withTransaction((tx) => countAuditEvents(tx));

  const facts: Fact[] = [
    { labelKey: 'admin.overview.staffTotal', value: counts.staffTotal },
    { labelKey: 'admin.overview.staffActive', value: counts.staffActive },
    { labelKey: 'admin.overview.roles', value: counts.roles },
    { labelKey: 'admin.overview.permissions', value: counts.permissions },
    { labelKey: 'admin.overview.rolePermissions', value: counts.rolePermissions },
    { labelKey: 'admin.overview.staffRoles', value: counts.staffRoles },
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
