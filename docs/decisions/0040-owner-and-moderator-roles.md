# ADR 0040 - Owner and moderator: a second role with a chosen screen set

Status: accepted (owner direction, 2026-11-12). Amends ADR 0009's "owner-only at launch" for the
**moderator** role only; every other rule in that ADR stands.

## Context

ADR 0009 settled administration as owner-only: every owner has full access, there are no staff or
support roles, and no permission-management interface. The permission tables were kept as data rather
than a code constant so that decision could change without a migration.

The owner has now made that decision: **a moderator account that runs the shop floor**, with the owner
choosing which screens it may open, and a default that excludes the overview, customers and integrations.

## Decision

1. **Two roles, both data.** `owner` (`is_owner_level = true`) and `moderator` (`is_owner_level = false`).
   The database trigger `role_permission_privileged_guard` refuses a **privileged** permission on a
   non-owner role, so money facts, settings and staff management are owner-level **by construction** -
   not by a list this ADR happens to write down.
2. **One permission set per role, shared by every moderator.** The owner's question is about the class of
   account, not about one person: two moderators on the same shift must not be able to see different
   screens. Editing the set applies to all of them, and the screen says so.
3. **The owner edits it on the staff screen** (`/qbpanel/owners`, renamed from "Owner accounts"), which
   gains: a role on every row, a role choice when creating an account, and a **Moderator access** matrix
   of the whole permission catalogue. Owner-level permissions are drawn **disabled with "Owner only"**
   rather than hidden - the owner should see the whole policy, and an unticked row they cannot tick must
   say why.
4. **Defaults** (`MODERATOR_DEFAULT_PERMISSIONS`): read orders, dispatch and delivery outcomes, handle
   cancellations, edit the catalog, moderate reviews, adjust stock. Excluded: the overview
   (`dashboard.read`, a new permission), customers, promo codes, storefront and every settings page
   (`settings.write`, privileged), owners, the audit trail, and the money actions
   (`cod.approve`, `cod.confirm_collection`, `order.cost_record`).
5. **`dashboard.read` is new** so the overview can be a page the owner decides about. Gating its rail
   entry and its route on one code is what makes "moderators do not see the overview" real rather than
   cosmetic.
6. **The refusal destination requires a session only.** `/qbpanel/forbidden` used to require
   `staff.read`; a moderator refused anywhere looped between the refusal and that page. A refusal
   destination must never require a capability the refused principal may not hold.
7. **A moderator cannot widen their own access.** `staff.manage` is privileged (owner only), the staff
   screen requires `staff.read` (not granted by default), and the service refuses `staff.manage`,
   `dashboard.read` and any privileged permission even if a request forges them.

## Consequences

- An owner keeps full access, including everything a moderator has, plus the money facts, settings and
  staff management.
- A moderator can approve nothing about money: they cannot accept COD, confirm cash, record a courier
  cost or change a delivery charge. Those are the four actions that state a financial fact, and they
  remain owner-only at the database.
- The audit trail records `staff.moderator_access_updated` with the resulting permission set, so a
  widening is visible after the fact.
- A future third role is another owner decision, not a code change: the tables are already data.
