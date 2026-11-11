import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { readIssuedTokenFlash } from '@/server/auth/flash';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadModeratorAccess, listOwnerAccounts } from '@/server/authz/owners';
import { OwnersView, type OwnerNotice } from './OwnersView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly OwnerNotice[] = [
  'created',
  'tokenIssued',
  'disabled',
  'enabled',
  'accessSaved',
  'denied',
  'conflict',
  'exists',
  'invalid',
];

function readNotice(value: string | string[] | undefined): OwnerNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as OwnerNotice) : null;
}

/**
 * Staff accounts: owners and moderators (owner direction, 2026-11-12).
 *
 * Requires `staff.read` to view; the create, token, status and moderator-access controls render only for
 * an actor holding `staff.manage`, and every route behind them re-checks that permission independently.
 *
 * ADR 0009 settled administration as owner-only. The owner has since asked for a moderator account that
 * runs the shop floor, so the screen now has exactly two roles - **owner** (full access) and
 * **moderator** (the set ticked in the access matrix) - and no third picker. Anything that asserts a money
 * fact, writes settings or manages staff is owner-level by the database's own rule, so it is drawn
 * disabled rather than offered.
 */
export default async function AdminOwnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.staffRead);
  const params = await searchParams;

  const owners = await withTransaction((tx) => listOwnerAccounts(tx));
  const canManage = hasPermission(principal, PERMISSIONS.staffManage);
  const moderatorAccess = canManage
    ? await withTransaction((tx) => loadModeratorAccess(tx))
    : null;

  // Read only: the route clears the cookie before this page renders again, so a reload shows nothing.
  // Only the digest is stored and the token is single-use.
  const flash = await readIssuedTokenFlash();
  const issuedToken = flash === null ? null : { token: flash.token, expiresAt: flash.expiresAt };

  return (
    <OwnersView
      owners={owners.map((owner) => ({
        id: owner.id,
        email: owner.email,
        displayName: owner.displayName,
        status: owner.status,
        disabledAt: owner.disabledAt?.toISOString() ?? null,
        lastSeenAt: owner.lastSeenAt?.toISOString() ?? null,
        hasCredential: owner.hasCredential,
        roleCode: owner.roleCode,
        roleName: owner.roleName,
      }))}
      currentStaffUserId={principal.staffUserId}
      canManage={canManage}
      notice={readNotice(params.notice)}
      issuedToken={issuedToken}
      csrfToken={principal.csrfToken}
      moderatorAccess={
        moderatorAccess === null
          ? null
          : { granted: moderatorAccess.granted, catalogue: moderatorAccess.catalogue }
      }
    />
  );
}
