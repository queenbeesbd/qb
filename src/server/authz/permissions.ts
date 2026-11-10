/**
 * Authorization catalogue.
 *
 * **D10 is an owner ruling, not a code constant.** The owner approved **owner-only at launch**: the
 * seeded role set contains exactly one role, `owner`, holding every permission below. `admin` and
 * `support` are deliberately *not* seeded, so no second principal can verify a payment, approve COD,
 * complete a refund or manage staff until the owner creates that role deliberately.
 *
 * The codes and the privileged flags are still data in the database (`role`, `permission`,
 * `role_permission`, `staff_role`), not a hard-coded role list: `docs/data-model.md` 4.8 requires
 * that, because D10 was open when the schema was designed and a role change must stay a row change
 * rather than a code change. This module is the **catalogue** the seed writes and the server checks
 * against; it is not the authority. The authority is the row set, re-read per request.
 */

/** Every permission code the application knows how to check. */
export const PERMISSIONS = {
  codApprove: 'cod.approve',
  codConfirmCollection: 'cod.confirm_collection',
  financeReconcile: 'finance.reconcile',
  orderCostRecord: 'order.cost_record',
  orderRead: 'order.read',
  orderDispatch: 'order.dispatch',
  orderCancel: 'order.cancel',
  refundRequest: 'refund.request',
  refundConfirm: 'refund.confirm',
  returnInspect: 'return.inspect',
  customerRead: 'customer.read',
  customerSuspend: 'customer.suspend',
  customerRevokeSession: 'customer.revoke_session',
  customerFlag: 'customer.flag',
  catalogWrite: 'catalog.write',
  inventoryAdjust: 'inventory.adjust',
  staffRead: 'staff.read',
  staffManage: 'staff.manage',
  auditRead: 'audit.read',
  settingsWrite: 'settings.write',
  reviewModerate: 'review.moderate',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionDefinition = {
  readonly code: PermissionCode;
  readonly description: string;
  /**
   * A permission that asserts a fact about money, changes who may act, or changes published policy.
   * The database trigger `role_permission_privileged_guard` permits a privileged permission only on
   * a role with `is_owner_level`, so this flag is enforced at both layers rather than by convention.
   */
  readonly isPrivileged: boolean;
};

/**
 * The catalogue. `is_privileged` follows the owner's ruling that money facts, cash reconciliation,
 * settings and staff management are owner-level: every one of them is unreachable from an
 * authenticated session alone.
 */
export const PERMISSION_CATALOGUE: readonly PermissionDefinition[] = [
  { code: PERMISSIONS.codApprove, description: 'Approve a COD order before dispatch', isPrivileged: true },
  { code: PERMISSIONS.codConfirmCollection, description: 'Confirm COD cash was collected', isPrivileged: true },
  { code: PERMISSIONS.financeReconcile, description: 'Reconcile collected COD cash', isPrivileged: true },
  {
    code: PERMISSIONS.orderCostRecord,
    description: 'Record and void additional courier costs on an order',
    isPrivileged: true,
  },
  { code: PERMISSIONS.refundConfirm, description: 'Advance a refund to completed or failed', isPrivileged: true },
  { code: PERMISSIONS.staffManage, description: 'Create, disable or re-role a staff user', isPrivileged: true },
  { code: PERMISSIONS.settingsWrite, description: 'Write store settings', isPrivileged: true },

  { code: PERMISSIONS.orderRead, description: 'Read any order', isPrivileged: false },
  {
    code: PERMISSIONS.orderDispatch,
    description: 'Record dispatch, a delivery outcome and order completion',
    isPrivileged: false,
  },
  { code: PERMISSIONS.orderCancel, description: 'Record or decide a cancellation request', isPrivileged: false },
  { code: PERMISSIONS.refundRequest, description: 'Record a refund request', isPrivileged: false },
  { code: PERMISSIONS.returnInspect, description: 'Receive and inspect a returned parcel', isPrivileged: false },
  { code: PERMISSIONS.customerRead, description: 'Read a customer profile', isPrivileged: false },
  { code: PERMISSIONS.customerSuspend, description: 'Suspend a customer account', isPrivileged: false },
  { code: PERMISSIONS.customerRevokeSession, description: 'Revoke a customer session', isPrivileged: false },
  { code: PERMISSIONS.customerFlag, description: 'Raise or clear a customer review flag', isPrivileged: false },
  { code: PERMISSIONS.catalogWrite, description: 'Create or edit catalog content', isPrivileged: false },
  // A published review puts a customer's words on the shop's own page, which is why it is a permission
  // of its own rather than a side effect of `catalog.write` (ADR 0035). Not privileged: it neither
  // asserts a money fact nor changes who may act.
  { code: PERMISSIONS.reviewModerate, description: 'Publish or refuse a product review', isPrivileged: false },
  { code: PERMISSIONS.inventoryAdjust, description: 'Adjust stock through the movement ledger', isPrivileged: false },
  { code: PERMISSIONS.staffRead, description: 'List staff users', isPrivileged: false },
  { code: PERMISSIONS.auditRead, description: 'Read the audit trail', isPrivileged: false },
];

/** The owner role. `is_owner_level` is what the database trigger checks before allowing a privileged grant. */
export const OWNER_ROLE = {
  code: 'owner',
  name: 'Owner',
  description: 'Full administrative authority, including role management and every money fact.',
  isOwnerLevel: true,
} as const;

/** A human label for a permission code, used by the staff screen. Falls back to the code itself. */
export const PERMISSION_LABELS: Record<string, string> = {
  [PERMISSIONS.codApprove]: 'Approve COD',
  [PERMISSIONS.codConfirmCollection]: 'Confirm COD collection',
  [PERMISSIONS.financeReconcile]: 'Reconcile COD cash',
  [PERMISSIONS.orderCostRecord]: 'Record additional order costs',
  [PERMISSIONS.orderRead]: 'Read orders',
  [PERMISSIONS.orderDispatch]: 'Dispatch and delivery outcomes',
  [PERMISSIONS.orderCancel]: 'Handle cancellations',
  [PERMISSIONS.refundRequest]: 'Request refunds',
  [PERMISSIONS.refundConfirm]: 'Complete refunds',
  [PERMISSIONS.returnInspect]: 'Inspect returns',
  [PERMISSIONS.customerRead]: 'Read customers',
  [PERMISSIONS.customerSuspend]: 'Suspend customers',
  [PERMISSIONS.customerRevokeSession]: 'Revoke customer sessions',
  [PERMISSIONS.customerFlag]: 'Customer review flags',
  [PERMISSIONS.catalogWrite]: 'Edit catalog',
  [PERMISSIONS.reviewModerate]: 'Moderate reviews',
  [PERMISSIONS.inventoryAdjust]: 'Adjust stock',
  [PERMISSIONS.staffRead]: 'Read staff',
  [PERMISSIONS.staffManage]: 'Manage staff and roles',
  [PERMISSIONS.auditRead]: 'Read the audit trail',
  [PERMISSIONS.settingsWrite]: 'Write store settings',
};


/**
 * Permissions that have a **reachable server-side workflow**, so the list is a statement about the
 * product rather than about the catalogue.
 *
 * Phase 12 shipped authentication and the shell. **Phase 13 added `catalog.write`** - product, category,
 * brand and image mutations, plus the availability toggle - and kept `staff.read`/`staff.manage` for
 * owner-account management and `audit.read` for the trail.
 *
 * **Phase 16A added the COD confirmation queue and customer moderation.** **Phase 17 removed the manual
 * prepaid subsystem** - the verification queue, the payment-recipient screen and their permissions - so
 * `payment.verify`, `payment.reject`, `payment.flag_false` and `payment.recipient_manage` are no
 * longer part of the catalogue at all: no code checks them, and a permission with no check behind it is
 * a name, not an ability. Rows already written to `permission`/`role_permission` by an earlier seed are
 * untouched history; the seed only adds, never removes.
 *
 * **Phase 22 added `order.cost_record`** - recording and voiding the extra courier costs an order
 * incurred, recorded alongside payment receipt. It is privileged because it writes a money fact.
 *
 * **Phase 23's `customer.credential_reset` was removed on 2026-11-08**, together with the owner-issued
 * one-time code it guarded: recovery is self-service by email (ADR 0030), so the code, its routes, its
 * screen and its permission no longer exist. Existing `permission`/`role_permission` rows are history
 * and are left untouched.
 *
 * Everything else is still catalogued but unreachable: `refund.*` (deferred by owner decision),
 * `finance.reconcile`, `customer.flag` and `customer.revoke_session` have no route yet. `inventory.adjust` deserves a note:
 * availability is the only ordering gate (ADR 0013), so that permission has no workflow and the ledger
 * stays unused.
 */
export const PERMISSIONS_IMPLEMENTED: readonly PermissionCode[] = [
  PERMISSIONS.catalogWrite,
  PERMISSIONS.staffRead,
  PERMISSIONS.staffManage,
  PERMISSIONS.auditRead,
  // Phase 16A: the COD and customer moderation worklists and their mutations.
  PERMISSIONS.orderRead,
  PERMISSIONS.codApprove,
  PERMISSIONS.orderCancel,
  PERMISSIONS.customerRead,
  PERMISSIONS.customerSuspend,
  // Phase 19: the delivery-charge configuration screen.
  PERMISSIONS.settingsWrite,
  // Phase 20: the post-approval COD operations - dispatch, delivery outcome, return receipt,
  // inspection and cash collection. `finance.reconcile` stays out deliberately: reconciliation has
  // no defined process, so there is no workflow behind that code.
  PERMISSIONS.orderDispatch,
  PERMISSIONS.codConfirmCollection,
  PERMISSIONS.returnInspect,
  // Phase 22: additional courier costs, recorded with payment receipt.
  PERMISSIONS.orderCostRecord,
  // ADR 0035: the review moderation queue - the only way a customer's words reach the shop's own page.
  PERMISSIONS.reviewModerate,
];
