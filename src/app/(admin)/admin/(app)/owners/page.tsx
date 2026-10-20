import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { readIssuedTokenFlash } from '@/server/auth/flash';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listOwnerAccounts } from '@/server/authz/owners';
import { OwnersView, type OwnerNotice } from './OwnersView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly OwnerNotice[] = [
  'created',
  'tokenIssued',
  'disabled',
  'enabled',
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
 * Owner accounts.
 *
 * Requires `staff.read` to view; the create, token and status controls render only for an actor holding
 * `staff.manage`, and every route behind them re-checks that permission independently. There is no role
 * selector and no permission matrix, because the launch surface has one role (D10, ADR 0009).
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
      }))}
      currentStaffUserId={principal.staffUserId}
      canManage={canManage}
      notice={readNotice(params.notice)}
      issuedToken={issuedToken}
      csrfToken={principal.csrfToken}
    />
  );
}
