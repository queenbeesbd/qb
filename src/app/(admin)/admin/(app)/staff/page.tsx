import { sql } from 'drizzle-orm';

import { withTransaction } from '@/db/client';
import { staffCredential } from '@/db/schema';
import { requireAdminPage } from '@/server/auth/guard';
import { readIssuedTokenFlash } from '@/server/auth/flash';
import { listRoles, listStaff } from '@/server/authz/roles';
import { PERMISSIONS } from '@/server/authz/permissions';
import { hasPermission } from '@/server/authz/principal';
import { StaffView, type RoleRow, type StaffNotice, type StaffRow } from './StaffView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly string[] = [
  'roleGranted',
  'roleRevoked',
  'tokenIssued',
  'disabled',
  'enabled',
  'denied',
  'conflict',
  'exists',
  'invalid',
];

function readNotice(value: string | string[] | undefined): StaffNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined || !NOTICES.includes(candidate)) return null;
  return candidate as StaffNotice;
}

/**
 * Staff and roles.
 *
 * Requires `staff.read` to view. The management controls are rendered only for an actor holding
 * `staff.manage`, and the route handlers behind them re-check that permission independently - so a
 * hidden control and a refused request cannot disagree.
 */
export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.staffRead);
  const params = await searchParams;
  const notice = readNotice(params.notice);

  const canManage = hasPermission(principal, PERMISSIONS.staffManage);

  const data = await withTransaction(async (tx) => {
    const staffEntries = await listStaff(tx);
    const roleEntries = await listRoles(tx);

    const credentialRows = await tx
      .select({ staffUserId: staffCredential.staffUserId })
      .from(staffCredential)
      .where(sql`${staffCredential.revokedAt} is null and ${staffCredential.kind} = 'password'`);
    const withCredential = new Set(credentialRows.map((row) => row.staffUserId));

    const staff: StaffRow[] = staffEntries.map((entry) => ({
      id: entry.id,
      email: entry.email,
      displayName: entry.displayName,
      status: entry.status,
      disabledAt: entry.disabledAt?.toISOString() ?? null,
      lastSeenAt: entry.lastSeenAt?.toISOString() ?? null,
      roles: entry.roles.map((role) => ({ code: role.code, name: role.name })),
      hasCredential: withCredential.has(entry.id),
    }));

    const roles: RoleRow[] = roleEntries.map((entry) => ({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      description: entry.description,
      isOwnerLevel: entry.isOwnerLevel,
      permissionCount: entry.permissionCount,
    }));

    return { staff, roles };
  });

  // Read once, then gone: the token is displayed to the owner exactly here and never again, because
  // only its digest is stored.
  const flash = await readIssuedTokenFlash();
  const issuedToken =
    flash === null ? null : { token: flash.token, expiresAt: flash.expiresAt };

  return (
    <StaffView
      staff={data.staff}
      roles={data.roles}
      currentStaffUserId={principal.staffUserId}
      canManage={canManage}
      notice={notice}
      issuedToken={issuedToken}
      csrfToken={principal.csrfToken}
    />
  );
}
