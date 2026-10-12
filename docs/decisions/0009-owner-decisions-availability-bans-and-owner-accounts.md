# ADR 0009 - Owner decisions: availability, customer bans, owner accounts and log separation

- Status: accepted (owner-decided, 2026-10-12)
- Supersedes: nothing. Extends ADR 0008 (single-store product model) and settles **D10** and **D13** from the register in `docs/platform-architecture.md`.
- Scope: launch product policy and the launch administrative model. It changes no approved payment, refund, cancellation or order-policy rule.

## Context

Phase 12 implemented owner authentication and the admin shell locally, and the audit of that work
reported the open owner decisions it had been waiting on (D10, D13) plus two product questions that
the documentation could not answer on its own: how product availability is expressed, and what a
customer ban actually prevents.

The owner has now decided. This ADR records the decisions and, just as importantly, records what each
of them does **not** settle - a decision recorded loosely becomes an invented policy later.

The single-store product model is unchanged and is not restated here: see **ADR 0008**.

## Decisions

### 1. Product availability is a simple owner-controlled state

Product availability is an **owner-controlled `In Stock` / `Out of Stock` state**. An out-of-stock
product **cannot be ordered**.

- The owner sets the state. It is not derived from a countdown, not inferred from order history, and
  not presented as a quantity.
- The storefront presents availability as a state, and the checkout path refuses an out-of-stock
  product rather than accepting an order it cannot fulfil.
- The state is **displayed honestly**: no "only 2 left" urgency, no restock date, and no arrival
  promise. There is no verified restock data, so none is published (honesty rules, `AGENTS.md`).

**What this does not decide.** It settles the *availability signal and the ordering gate*. It does
**not** by itself settle what happens when two customers order the **last unit** at the same moment,
and it does not retire the approved quantity model in D11 (the balance, the append-only movement
ledger and the reservation). Those are two different questions, and the second one has a real cost:
the approved schema enforces `reserved <= on_hand`, and dropping quantity accounting would mean
dropping tables, which is a migration and a business-rule change.

**Open, and required before Phase 15 (order creation).** The owner must confirm one of:

- **(a) Binary availability only** - the owner's toggle is the sole gate, the first accepted order
  takes the product, and the quantity ledger and its reservation/expiry machinery are removed or
  reduced to a non-authoritative count. Simplest to explain and to operate; it requires a migration
  and gives up the database-enforced oversell backstop.
- **(b) Availability gate over the existing quantity model** - the toggle is the primary gate the
  owner operates, and the quantity ledger stays as the allocation backstop underneath it, so a
  concurrent order for the last unit still cannot oversell. No schema change; the owner sees a state,
  the database still holds the invariant.

Until the owner answers, **nothing is removed and no availability behaviour is implemented**.
Recommending (b) as the smaller change is an engineering opinion, not a decision: it is the owner's
call, and this ADR deliberately does not make it.

### 2. A customer may be banned after a confirmed fake order

The owner may **ban a customer** whose fake order has been **confirmed**. The existing rule that
**a delayed transaction or a mistyped reference is not fraud** is unchanged: a ban requires a
confirmed finding, an audited reason and an actor, exactly like the existing customer review flag.

**A ban and the review flag are different things, and must not be collapsed.**

| | Customer review flag | Ban |
| --- | --- | --- |
| Purpose | Record a concern for review | Withdraw the customer's ability to transact |
| Blocks the customer? | **No** - explicitly does not, by itself, block or close the account (`docs/payment-workflow.md` 13.3) | **Yes**, within the boundary below |
| Set by | Owner/admin, audited | Owner/admin, audited, after a **confirmed** fake order |
| Reversible? | Yes, with an audited reason | Yes, by the owner, with an audited reason |

**The enforcement boundary - what a ban must actually prevent.** A ban that only changes a label is
not a ban. Enforced server-side, a banned customer cannot:

1. **Authenticate** - no new session is issued, and existing sessions are revoked at the moment of the
   ban, so access ends on the next request rather than at the next expiry.
2. **Place a new order** - order creation refuses a banned account, and this is enforced in the order
   transaction, not only in the interface.
3. **Proceed to checkout** - the checkout path refuses, rather than collecting details it will not use.

**What a ban deliberately does not do.** It does **not** cancel, refund or alter an existing order,
and it does **not** delete the account or its history. Orders and their financial facts survive, for
the same reason a suspension never silently cancels one (`docs/data-model.md` 4.1). The fate of an
in-flight order for a banned customer is a business decision and remains open - it is **not** implied
by the ban.

**Mechanism.** The ban uses the existing account-status concept rather than a new table: status
becomes `suspended` with an audited reason and actor, and the review flag records the finding. This
keeps one enforcement path, so "can this account transact?" has one answer. The detailed transitions
are in `docs/data-model.md` 4.1 and the enforcement rules in `docs/security.md`.

### 3. Multiple owners; no staff or support roles at launch

**Multiple owner accounts may exist, and every owner has full access.** There are **no staff or
support roles at launch**, and **no general permission-management system** is part of the launch
surface.

This **settles D10**: the roles permitted to verify payments, approve COD, complete refunds and
manage the store are the **owner role only**. It also settles the practical shape of D13: because
every administrator is an owner, the launch system does not need role assignment, delegation or a
permission matrix to operate.

**Consequences, stated plainly:**

- The seeded role set stays **owner-only**, which is what Phase 12 already writes.
- The permission catalogue remains **data**, not a code constant, because D10 was open when the
  schema was designed and a role change must stay a row change. Keeping the rows costs nothing; the
  launch decision is about what the *interface* exposes, not about deleting the model.
- **The Phase 12 staff screen and its role-grant/revoke endpoints are outside the approved launch
  surface.** They are implemented, tested and permission-guarded, but the owner has decided that
  launch administration does not include role management. Bringing the surface in line with this
  decision is a **follow-up change, not part of this ADR**, and it is not authorized here. It is
  recorded as a Phase 13 prerequisite because leaving a capability the owner has ruled out of launch
  reachable is a real inconsistency, not a cosmetic one.
- Any future staff role is a **new owner decision** with its own recorded rationale. It must not
  reappear as an implementation convenience.

### 4. Owner authentication: email and password

Owner authentication is **email and password**, first-party, with hashed credentials and server-side
sessions - which is what Phase 12 implemented.

**Explicitly deferred until the client confirms them:**

- **Resend email verification** (email address verification and any mail-delivered flow), and
- **Google sign-in** (OAuth).

Neither is authorized, designed or provisioned. This is consistent with the existing position that
**no mail provider is authorized**: Phase 12's credential recovery is therefore **owner-issued and
out of band**, not emailed. Adding either mechanism later is a new decision with a new provider, and
provider selection is an owner decision (ADR 0005 pattern), not an implementation detail.

### 5. Customer authentication and ordering remain separate

Customer authentication and the order path remain **separate from owner authentication** and follow
the documented roadmap. Phase 12 is the **administrative** interface only. Customer registration,
login, recovery, checkout and payment remain governed by **D17** and D12, and are not part of, nor
implied by, the Phase 12 work or by this ADR.

### 6. Customer/business activity logs are kept separate from internal security logs

Customer and business activity records are kept **separate from internal administrative and security
records, wherever practical**.

- **Business activity** is the record of what happened to commerce objects: orders, payment claims,
  refunds, reservations, returns, catalog changes. It is what a reconciliation or a dispute is
  reconstructed from.
- **Internal administrative and security records** are who attempted what, whether it was permitted,
  and what was refused: sign-in outcomes, session revocation, role changes, and **denied actions**.

They share the append-only `audit_event` store, because one append-only table with one actor model
and one retention rule is safer than two stores that can disagree - but they are **distinguishable by
construction**: a denial always carries the action code `admin.action_denied` and a category, and a
customer is never an audit actor type. That boundary is what "separate wherever practical" means
here, and it is asserted by test rather than by convention. Details: `docs/security.md`.

## Consequences

- **D10 is settled** (owner role only, multiple owners permitted) and **D13 is settled in shape**
  (first-party email and password, no external provider).
- **Product availability has a defined presentation and ordering gate**, with its interaction with the
  approved quantity model explicitly left open and gated to before Phase 15.
- **A ban now has a defined enforcement boundary**, so it prevents the actions it is meant to prevent.
- **One inconsistency is created deliberately and recorded**: the Phase 12 role-management surface is
  outside the approved launch surface and needs a follow-up change.
- **No payment, refund, cancellation, order-policy, reservation or expiry rule changes.** The
  quantity model, the five-way state separation, the 24-hour unpaid-order expiry and the D11
  allocation rule are untouched.

## What this does not authorize

No infrastructure provisioning, no deployment, no DNS change, no credential creation, no mail or
OAuth provider, no new dependency, no schema removal, and no customer-facing authentication. Every
one of those remains a separate owner decision.
