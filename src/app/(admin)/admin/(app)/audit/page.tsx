import { sql } from 'drizzle-orm';

import { withTransaction } from '@/db/client';
import { staffUser } from '@/db/schema';
import { countAuditEvents, listRecentAudit } from '@/server/auth/audit';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuditView, type AuditRow } from './AuditView';

export const dynamic = 'force-dynamic';

/** Bounded page size: the audit trail is long-lived and must never be rendered in full. */
const PAGE_SIZE = 100;

/**
 * The audit trail.
 *
 * Requires `audit.read`. Only records the server wrote are shown; nothing is inferred or summarised.
 * The actor's display name is resolved here rather than stored in the record, so a later rename does
 * not rewrite what the trail says - the stored `actor_role_codes` snapshot is what was true at the
 * time, and it is displayed unchanged.
 */
export default async function AdminAuditPage() {
  await requireAdminPage(PERMISSIONS.auditRead);

  const { rows, total } = await withTransaction(async (tx) => {
    const entries = await listRecentAudit(tx, PAGE_SIZE);

    const actorIds = [...new Set(entries.map((entry) => entry.actorStaffId).filter((id): id is number => id !== null))];
    const names = new Map<number, string>();
    if (actorIds.length > 0) {
      const actors = await tx
        .select({ id: staffUser.id, displayName: staffUser.displayName })
        .from(staffUser)
        .where(sql`${staffUser.id} in ${actorIds}`);
      for (const actor of actors) names.set(actor.id, actor.displayName);
    }

    const total = await countAuditEvents(tx);

    const mapped: AuditRow[] = entries.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      actorType: entry.actorType,
      actorLabel:
        entry.actorStaffId === null
          ? 'system'
          : (names.get(entry.actorStaffId) ?? `staff #${entry.actorStaffId}`),
      actorRoleCodes: entry.actorRoleCodes,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason,
    }));

    return { rows: mapped, total };
  });

  return <AuditView rows={rows} total={total} shown={rows.length} />;
}
