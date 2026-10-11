# ADR 0005 - Neon PostgreSQL and Vercel hosting

- Status: accepted (owner-approved)
- Date: 2026-10-11
- Relates to: `docs/platform-architecture.md` section 11 decisions D1 and D2

## Context

Phase 8 approved an independent e-commerce platform (`docs/decisions/0004-independent-platform-direction.md`): QueenBee's owns its backend, database, admin dashboard and commerce workflows, and does not depend on the Zatiq merchant platform.

Phase 9 prepared an evidence-based proposal for every infrastructure decision that blocked Phase 10, with verified provider pricing (`docs/platform-architecture.md` section 11). The owner has now approved the two decisions that determine where the application and its data will run.

QueenBee's is a small cosmetics retailer. Traffic is expected to be low and spiky rather than steady, order volume is modest, and the business cannot justify meaningful fixed infrastructure spend before it has revenue to fund it.

## Decision

### D1 - Database: Neon PostgreSQL

- **Provider:** Neon (managed PostgreSQL).
- **Initial plan:** **Neon Free**.
- **Upgrade plan:** a Neon paid plan at approximately **$15/month** when business growth or operational requirements justify it.

PostgreSQL was already the recommendation on technical grounds, and the reasoning is unchanged: creating an order touches orders, order items, inventory and payment records atomically; inventory must be decremented with a guarded update that cannot oversell; and the domain is strongly relational. Those requirements eliminate a document store outright. Neon is chosen as the managed implementation because scale-to-zero suits low, spiky retail traffic and because its branching and instant restore make a **restore rehearsal** cheap - and an untested backup is not a backup.

### D2 - Application hosting: Vercel

- **Provider:** Vercel.
- **Initial plan:** **Hobby (free tier)**.
- **Upgrade plan:** **Vercel Pro** at approximately **$20/month** when required.

Vercel is chosen because the storefront is already a Next.js application, so it deploys without a bespoke pipeline, and it provides atomic deploys, instant rollback, managed TLS, secret storage and an edge CDN with points of presence in Dhaka and Chittagong. A long-running background worker is deliberately **not** provisioned now: the first background need is a scheduled reconciliation task, which does not require a long-lived process.

### Cost policy

Approved alongside the above:

1. Keep initial infrastructure costs **as close to zero as reasonably possible**.
2. **Do not upgrade pre-emptively.** Upgrades are justified by measured usage, actual plan limits, reliability requirements or business growth - not by anticipation.
3. Recheck current provider pricing and plan terms **before implementation and before any upgrade recommendation**.
4. The $15 and $20 figures are the **owner's intended future budget**, not guaranteed permanent prices. Provider pricing changes.

## Consequences

- Phase 10 (data model and security architecture) is no longer blocked by D1 and D2. It remains blocked by D3, D7, D8, D9, D11 and D12.
- Nothing is provisioned by this ADR. No Neon project, no Vercel project, no domain change, no credential.
- The schema and queries are portable: both providers are conventional managed services, and a migration would be a database dump and restore. What would be lost is Neon's branching and instant-restore convenience.
- The Hobby tier is intended for development and early production. Its limits are the trigger for review, not a surprise to be discovered under load.
- If measured usage later shows a long-running worker is genuinely required, that is a **new** decision and would be recorded separately; it does not follow automatically from this one.

## Alternatives considered

| Decision | Alternative | Why not now |
| --- | --- | --- |
| Database | **Supabase** | Stronger only if its bundled storage and auth are wanted; otherwise it ties image storage to the database vendor and costs $25/mo from the start |
| Database | Self-hosted PostgreSQL | Cheapest on paper, but transfers patching, replication, point-in-time recovery and failover to a retailer without dedicated operations capacity |
| Hosting | Managed container host (Railway, Fly.io, Render) | Reconsider only if a continuously running worker becomes a real requirement |
| Hosting | VPS | Lower steady-state cost, but the owner takes on patching, TLS, backups, monitoring and uptime |

## Verification

This ADR records approved decisions and a cost policy. No application code, dependency, configuration, credential or infrastructure changed with it. No resource was provisioned, and no deployment or DNS change was made.
