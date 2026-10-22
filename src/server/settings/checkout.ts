/**
 * Checkout policy the owner controls (Phase 42).
 *
 * Today there is one setting: whether a **guest** may place an order without creating an account.
 * It lives in `store_setting` beside the announcement and the delivery charges, so switching it is a
 * data change with an audit record, not a deploy.
 *
 * **The default when no row exists is `false`.** An absent setting must not widen who can order: the
 * safe state is the one this product shipped with (D12 - account-required checkout), and the owner
 * turns guests on deliberately, from the panel, once.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { storeSetting } from '@/db/schema';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';

export const GUEST_ORDERS_KEY = 'checkout.guest_orders';

export type CheckoutSettings = { readonly guestOrders: boolean };

/** Reads the policy. A missing row means guests may **not** order. */
export async function loadCheckoutSettings(tx: Transaction): Promise<CheckoutSettings> {
  const rows = await tx
    .select({ value: storeSetting.value })
    .from(storeSetting)
    .where(sql`${storeSetting.key} = ${GUEST_ORDERS_KEY}`);

  return { guestOrders: rows[0]?.value === true };
}

/**
 * Saves the toggle. The write and its audit record share the caller's transaction, so the trail cannot
 * describe a policy that did not commit.
 */
export async function saveGuestOrderPolicy(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly guestOrders: unknown },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'store_setting', 1);

  const before = await loadCheckoutSettings(tx);
  const guestOrders = input.guestOrders === true || input.guestOrders === 'true' || input.guestOrders === 'on';

  await tx
    .insert(storeSetting)
    .values({
      key: GUEST_ORDERS_KEY,
      value: guestOrders,
      valueType: 'boolean',
      updatedByStaffId: actor.staffUserId,
    })
    .onConflictDoUpdate({
      target: storeSetting.key,
      set: { value: guestOrders, updatedAt: new Date(), updatedByStaffId: actor.staffUserId },
    });

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'settings.guest_orders_updated',
    entityType: 'store_setting',
    entityId: 1,
    before: { guestOrders: before.guestOrders },
    after: { guestOrders },
  });
}
