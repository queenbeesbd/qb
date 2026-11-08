# ADR 0008 - Single-store product model

- **Status:** Accepted (owner clarification, 2026-10-11)
- **Clarifies:** ADR 0004 (independent platform direction). ADR 0004 settled *who owns the platform*;
  this ADR settles *what the platform is*.
- **Related:** `docs/requirements.md`, `docs/platform-architecture.md`, `docs/data-model.md`,
  `docs/qbpanel-dashboard.md`, `docs/security.md`.

## Context

Phase 12 was planned as "merchant authentication and admin shell". That name exposed an ambiguity that
had never been resolved in writing: the documents consistently described the platform as *independent*
and *owned by QueenBee's*, but never stated plainly **how many stores it serves**.

The ambiguity was not harmless. Several documents had drifted into vocabulary borrowed from the
vendor platform that was audited in Phase 7 - "merchant dashboard", "merchant operations", "merchant
uploads", "single merchant tenant" - and `docs/data-model.md` listed "a single merchant tenant" as a
schema assumption. Read literally, that phrasing describes a **multi-vendor marketplace**: a platform
where many independent sellers each register, receive a store, and are isolated from one another.

That is not this product. The vocabulary came from the reference platform's vocabulary, not from an
approved requirement.

## Decision

**QueenBee's is a single-store, owner-operated e-commerce platform. One store owner sells that store's
own goods directly to its own customers.**

1. **There is exactly one store.** It is not a marketplace, not a multi-vendor platform, not a SaaS
   store builder, and not a hosted platform on which other businesses create stores.
2. **There are no third-party merchants.** No vendor onboarding, no seller registration, no seller
   dashboards, no commissions, no marketplace payouts, and no independent merchant storefronts.
3. **One owner.** The owner is the store operator. "Owner" means the person who owns this store - it
   does **not** mean a platform operator overseeing other people's stores.
4. **Customers** browse the public storefront and, under the approved D12 policy, create an account
   before ordering. Customer identity is a separate concept from owner identity.
5. **The private administrative interface is for this store.** Owner authentication exists to protect
   *administration*, not to onboard anyone.
6. **Staff accounts are optional and conditional.** They are supported only where a documented
   requirement justifies them and the owner approves. A large multi-role workforce is not assumed.
7. **No tenant abstraction.** No `store_id`, `tenant_id` or `merchant_id`, no store registry, and no
   row-level tenant isolation - because there is nothing to isolate.
8. **The four identity concepts stay distinct:** owner authority, optional staff permissions, customer
   identity, and anonymous public access.
9. **No Zatiq dependency.** The platform remains independently operated and does not depend on Zatiq
   APIs or any vendor-specific capability (ADR 0004).

## Why this needed stating

Without it, three concrete errors were available to whoever implemented the next phase:

- **Over-building:** a store registry, tenant scoping on every query, and per-store isolation would be
  built for a requirement that does not exist - cost with no benefit, and a permanent tax on every
  query and every schema change.
- **Mis-scoped Phase 12:** "merchant authentication" invites merchant registration and onboarding
  flows. The actual requirement is **secure owner login and a protected admin surface**.
- **Vocabulary drift:** each document that says "merchant" where it means "owner" makes the next
  document more likely to do the same, and eventually a schema or a route inherits the confusion.

## Consequences

- **Phase 12 is renamed** to **Owner/Admin Authentication & Dashboard Foundation**. Its subject is the
  private administrative interface for this store's owner, not merchant onboarding.
- **"Merchant" is retired as a term for our own product.** Precise terms are used instead: **owner**,
  **store administrator**, **staff member**, **customer**, and **payment provider**.
- **Legitimate uses of "merchant" are retained**, because a blanket find-and-replace would damage
  accurate documentation:
  - describing **Zatiq Easy**, which genuinely is a third-party multi-tenant merchant SaaS
    (`docs/backend-capability-audit.md`, ADR 0004's context, `docs/project-status.md`);
  - the **payment counterparty** - "the merchant account" and "the merchant statement" mean this
    store's own bKash/Nagad account, which an administrator reconciles against
    (`docs/payment-workflow.md`);
  - **provenance values** that record where catalog assets came from, such as the image rights tag
    `merchant_source_pending_confirmation` and the `merchant_storefront_capture` source-system
    example. These are historical facts about the Zatiq-hosted storefront, and the rights tag is
    fixture data referenced by source code and by `docs/migration-plan.md`.
- **The Phase 11 schema requires no change.** It was already single-store: no tenant or store
  identifier exists, and `store_setting` is a key-value table for **this** installation's settings
  (its primary key is the setting key), not a registry of stores. See `docs/data-model.md` section 17.3.
- **Multi-tenancy remains out of scope.** If selling across multiple independent stores is ever
  wanted, it is a new product decision requiring its own ADR and a schema review - not an extension
  to be pre-built now.
- **No approved business rule changes.** Payment methods, inventory and reservation policy, order and
  payment state machines, refund and cancellation rules, and COD handling are untouched by this ADR.
