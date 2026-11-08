import { sql } from 'drizzle-orm';

import { withTransaction } from '@/db/client';
import { staffUser } from '@/db/schema';
import { readPageNumber, readPageSize } from '@/lib/qbpanel-query';
import { countAuditEvents, listRecentAudit } from '@/server/auth/audit';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuditView, type AuditRow } from './AuditView';

export const dynamic = 'force-dynamic';

/**
 * Rows per page for the audit trail.
 *
 * The trail is long-lived, so it is never rendered in full - but it is also the record the owner
 * consults when something went wrong, so the page is generous rather than a scroll of single rows.
 */
const PAGE_SIZE = 50;

/**
 * The audit trail.
 *
 * Requires `audit.read`. Only records the server wrote are shown; nothing is inferred or summarised.
 * The actor's display name is resolved here rather than stored in the record, so a later rename does
 * not rewrite what the trail says - the stored `actor_role_codes` snapshot is what was true at the
 * time, and it is displayed unchanged.
 *
 * The list is paged with an exact total, so "the most recent N" is never mistaken for "all of it".
 * A hand-typed page beyond the end resolves to the last page.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(PERMISSIONS.auditRead);
  const params = await searchParams;
  const size = readPageSize(Array.isArray(params.size) ? params.size[0] : params.size, PAGE_SIZE);

  const data = await withTransaction(async (tx) => {
    const total = await countAuditEvents(tx);
    const pageCount = Math.max(1, Math.ceil(total / size));
    const page = Math.min(readPageNumber(Array.isArray(params.page) ? params.page[0] : params.page), pageCount);
    const entries = await listRecentAudit(tx, size, (page - 1) * size);

    const actorIds = [...new Set(entries.map((entry) => entry.actorStaffId).filter((id): id is number => id !== null))];
    const names = new Map<number, string>();
    if (actorIds.length > 0) {
      const actors = await tx
        .select({ id: staffUser.id, displayName: staffUser.displayName })
        .from(staffUser)
        .where(sql`${staffUser.id} in ${actorIds}`);
      for (const actor of actors) names.set(actor.id, actor.displayName);
    }

    const rows: AuditRow[] = entries.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      actorType: entry.actorType,
      actorLabel:
        entry.actorStaffId === null ? 'system' : (names.get(entry.actorStaffId) ?? `staff #${entry.actorStaffId}`),
      actorRoleCodes: entry.actorRoleCodes,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason,
    }));

    return { rows, total, page, pageCount };
  });

  return (
    <AuditView
      rows={data.rows}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      size={size}
      defaultSize={PAGE_SIZE}
    />
  );
}
