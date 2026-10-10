# ADR 0001 - Next.js App Router + TypeScript foundation

- Status: accepted (owner-approved, Phase 1)
- Date: 2026-10-11

## Context

The Phase 0 audit found an empty, non-Git workspace containing only `.pi/` harness state and documentation. No framework, runtime or build system existed, so this is a greenfield choice rather than a migration. The delivery target is a client-ready frontend demonstration that must later be able to integrate with an unaudited merchant backend.

## Decision

Build a single storefront application with **Next.js 16 (App Router)** and **TypeScript in strict mode**, using **npm** with a committed lockfile, **CSS Modules plus CSS custom-property tokens** for styling, and **React Server Components by default** with Client Components only where interaction requires them.

Deliberately excluded: database, ORM, auth provider, CMS, state-management library, UI component library and animation library.

## Rationale

- Server rendering produces indexable product and category routes, which a cosmetics retailer needs for discovery and which a static SPA would defer to a later migration.
- Server Components keep product data resolution on the server, so the trust boundary described in `docs/architecture.md` is already in the right place when a real backend arrives.
- Strict TypeScript plus `noUncheckedIndexedAccess` catches the catalog and query-shape errors that dominate e-commerce UI bugs.
- CSS Modules with tokens avoids shipping a large dependency for a 16-product demo and keeps the design system explicit and reviewable.
- No state library is needed: locale and cart are two small external stores consumed with `useSyncExternalStore`.

## Consequences

- The project requires a Node runtime for serving, not just static hosting.
- Turbopack is the build tool in Next 16; the build emits 16 prerendered product pages and server-renders the listing route.
- Client state must be explicit about server vs client snapshots (see ADR 0003).
- If the later backend audit shows an officially supported storefront surface, revisit whether to build on it instead of calling the merchant API from a custom app.

## Verification

`npm run build`, `npm run typecheck` and `npm run lint` all pass. Build output lists `/`, `/cart`, `/checkout`, `/_not-found` as static, `/products` and `/categories/[slug]` as server-rendered, and all 16 product routes prerendered.
