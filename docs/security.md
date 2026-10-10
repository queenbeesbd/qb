# Security and threat model

Status: Phase 1 frontend demonstration complete. No production security control has been verified, because no production system exists. No penetration test, backend probe, live order or payment test was performed.

## What the demo actually does

- Serves a prerendered/static storefront from local fixtures.
- Performs no outbound network requests at runtime: no merchant API, no payment provider, no analytics, no third-party scripts, and no remote fonts (Inter and Noto Sans Bengali are self-hosted at build time).
- Persists only `queenbees.cart.v1` (product-id and quantity pairs) and `queenbees.locale.v1` (`bn` or `en`). No customer, payment or session data.
- Renders the checkout route with zero forms, zero inputs, zero submit buttons and zero external hosts, verified in the browser suite.

## Implemented frontend controls

| Concern | Control | How it was checked |
| --- | --- | --- |
| Secret exposure | No env files exist, no `NEXT_PUBLIC_*` variables, no credentials in source or docs; `poweredByHeader` disabled | Source inspection and build output |
| Untrusted storage | Cart JSON parsed defensively, filtered against known product ids, de-duplicated, quantities clamped to 1..20, 40-line cap; corrupt JSON discarded. Locale values validated against `bn`/`en` | Browser check 15 |
| Untrusted URL input | `parseCatalogQuery` truncates lengths, validates the category against the taxonomy and falls back on an unknown sort value | Browser checks 4, 6, 7 |
| Untrusted quantity input | Clamped in the stepper before reaching state, and again in the store on write and read | Browser check 11 (999 to 20, -4 to 1) |
| XSS | No `dangerouslySetInnerHTML` anywhere; all product copy is plain text rendered through JSX escaping; no untrusted SVG or HTML is injected | Source inspection |
| Unsafe URLs | No user-controlled value builds a URL. The only external link is the fixture `sourceUrl`, opened with `rel="nofollow noopener noreferrer"` and `target="_blank"` | Source inspection |
| Third-party code | Zero runtime third-party scripts. Only two Google fonts, self-hosted at build time by `next/font` | Browser check 16 (external host list empty) |
| Accidental data collection | No form inputs outside the search field; checkout has no fields; no cookies are set | Browser checks 14, 16 |
| Demo confusion | Persistent demo notice on every route, inert checkout with an explicit banner, and `robots: noindex, nofollow` | Browser checks 14, 16, 23 |
| Dependency hygiene | Pinned exact versions, committed lockfile, minimal dependency set | `package.json` and lockfile |
| Console health | No console errors or uncaught exceptions across all 31 browser checks | Browser check 24 |

## Trust boundaries

```text
UNTRUSTED
  browser input, URL/searchParams, localStorage, product copy, future API payloads
        |
        v
THIS DEMO (no authority)
  local fixtures -> pure functions -> rendered output
  no outbound request, no order path, no payment path
        |
        v
TRUSTED - NOT BUILT YET
  merchant server -> inventory and orders -> payment provider
```

The frontend is never authoritative for price, discount, stock, permissions, totals, payment status or orders. Every value shown is a display projection of local fixtures.

## Threats that remain open (production phase)

| Threat | Required control before release |
| --- | --- |
| Client price, discount or total tampering | Server resolves ids and recomputes price, discount eligibility, shipping and total; browser totals never accepted |
| Cart and order item tampering | Typed allowlist, bounded integer quantities, valid SKU/option relations, parameterized persistence |
| Inventory races and oversell | Atomic supported reservation or stock check with expiry; bundle components validated individually |
| Authentication and session compromise | Supported server auth, secure session lifecycle, cookie flags, no sensitive tokens in persistent storage |
| Authorization and account data leakage | Server enforces role and object ownership on every private request; guest order access scoped securely |
| Public/private API confusion | Explicit read-only public contract; merchant credentials stay server-side; least-privilege scopes |
| CSRF | If ambient cookies authenticate mutations, use supported CSRF tokens plus origin checks; no state-changing GET |
| Injection | Parameterized queries and validated input at the trusted boundary |
| Abuse and resource exhaustion | Rate limits on login, search, order and payment operations; quotas, timeouts and input-size limits |
| PII and privacy | Data minimisation, access control, retention and deletion policy, redacted logs, protected backups |
| Forged or replayed payment notifications | Provider signature verification, replay and idempotency control, amount/currency/order matching, reconciliation |
| Duplicate orders | Server idempotency scoped to transaction and user; stable outcome retrieval; UI button disabling is only secondary |
| Error and log disclosure | Generic user-safe messages with a request id; private diagnostic logs; rollback and tested restore |

## Production release checklist (all unchecked)

- [ ] Owner-approved backend test scope, staging tenant and permitted actions.
- [ ] API route inventory and explicit authentication/authorization decisions.
- [ ] Trusted price, discount, shipping, stock and order validation proved.
- [ ] Account and guest access controls, secure sessions and CSRF/CORS defenses verified.
- [ ] Payment sandbox signature, status, amount and replay tests pass; refunds and reconciliation covered.
- [ ] XSS, content, URL and CSP boundaries reviewed.
- [ ] TLS, security headers, secret separation and bundle/log scans verified.
- [ ] Dependency advisory triage complete; material risks resolved.
- [ ] Rate limiting, resource bounds and monitored abuse response verified.
- [ ] Privacy and retention policies approved; backups restore tested.
- [ ] No customer PII, payment data or session tokens in fixtures, browser storage, docs or analytics.
- [ ] Delivery, return and payment policies approved, and imagery rights cleared.
- [ ] Bilingual, responsive and accessibility checks repeated on real devices with evidence.
- [ ] Named operational owner, alerts and rollback criteria recorded.

A passing build, HTTPS or a dependency scan alone never establishes system security.
