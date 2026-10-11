# ADR 0004 - Independent e-commerce platform direction

- Status: accepted (owner-approved, strategic reset)
- Date: 2026-10-11
- Supersedes the integration assumption in `docs/implementation-plan.md` phases 8-12 as they stood after Phase 7

## Context

Phase 7 audited the merchant dashboard at `merchant.zatiqeasy.com` read-only. Findings (`docs/backend-capability-audit.md`):

- The platform is **third-party multi-tenant SaaS** (Zatiq Easy), not a system the merchant controls.
- **No documented API, API key, webhook or supported integration mechanism was found.** The only interface observed was the dashboard's private application API (`easybill.zatiq.tech`), reached with the merchant's own session.
- The audited tenant reported an **empty catalog** while the live storefront published 24 products, leaving tenant identity unresolved.

The prior roadmap assumed QueenBee's would eventually integrate with that platform. The audit showed that assumption could not be satisfied safely: building on an undocumented private API would create unowned coupling to a vendor's internal contract.

The owner has now confirmed a different direction.

## Decision

**QueenBee's is built as an independent e-commerce platform.**

1. QueenBee's owns its **backend, database, merchant/admin dashboard, analytics and commerce workflows**.
2. QueenBee's owns the authoritative product catalog, pricing, inventory, orders, customers, shipping, promotions and analytics data.
3. **Server-side authority is explicit** for prices, discounts, inventory and order creation. The browser is never authoritative.
4. Infrastructure and architecture are chosen for **this project's needs**, not to mirror Zatiq's implementation.
5. **No dependency** on Zatiq's private API, internal endpoints, cookies, tenant identifiers or undocumented integrations. The Phase 7 findings remain as reference material only.
6. Vendor-specific features QueenBee's does not need are **not reproduced** - specifically the theme builder, landing-page builder, subscription system, proprietary mobile-app tooling, reseller and wholesale modules, and vendor growth features.
7. The **existing Next.js + TypeScript storefront remains the frontend foundation.** It is not replaced, and no new backend stack is selected without a documented technical evaluation and owner approval.

## What this changes

| Before | After |
| --- | --- |
| Next milestone: integrate with the merchant platform | Next milestone: owner approves backend architecture and infrastructure |
| Merchant platform is the system of record | QueenBee's own database is the system of record |
| Roadmap blocked on an unavailable vendor API | Roadmap blocked on owner infrastructure decisions, which are answerable |
| Zatiq dashboard was an integration target | Zatiq dashboard is a **UX and feature reference only** |

## Consequences

- The project takes on the full operational burden of commerce: hosting, database, authentication, order integrity, payment verification, image storage, backups and observability. This is a real cost, accepted deliberately in exchange for ownership and control.
- `docs/architecture.md` continues to describe the storefront's implemented module boundaries, which remain valid and are the integration seam for the new backend.
- The storefront's data layer (`src/data/`) is still reached only through typed accessors, so a backend adapter replaces the fixtures without touching view components. That design decision is now on the critical path rather than hypothetical.
- The demo safeguards (inert checkout, locked demo announcement, `noindex`) remain until a real, authorized checkout exists.
- Concrete stack choices - database, hosting, ORM, auth, payment and courier providers - are **not** made by this ADR. They require the evaluation and owner approval recorded in `docs/platform-architecture.md`.
- The 22-product fixture remains a curated sample of a public storefront, not an authoritative catalog. Migration is planned in `docs/migration-plan.md` and requires its own approval.

## Verification

This ADR records a direction, not an implementation. No application code, dependency or configuration changed with it. The storefront continues to pass its existing checks unchanged.
