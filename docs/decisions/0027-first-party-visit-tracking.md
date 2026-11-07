# 0027 - First-party visit tracking

- **Status:** accepted (implemented locally, not deployed)
- **Date:** 2026-11-07
- **Phase:** post-51 (owner request)
- **Supersedes:** the "no traffic figure" half of ADR 0021 D1. **Narrows:** nothing.

## Context

ADR 0021 D1 settled that every figure on the analytics screen is derived from order rows, and that
**no traffic, visit or page-view figure exists** because the storefront shipped no tracker. The rule
was written to stop an estimate being printed where nothing had been measured, not to forbid measuring.

On 2026-11-07 the owner asked for four things the sales figures cannot answer: how many people visited
today, how many are on the site right now, how many put something in a cart and left without ordering,
and a visualisation of the visit path. That is an explicit owner approval for a tracker, which is the
condition the old rule set.

The constraint that survives is the reason the rule existed: **a number must be measured, not guessed**,
and the shop must not hand its readers to a third party.

## Decisions

### D1 - The tracker is first-party, and there is no analytics vendor

The storefront posts one small same-origin request per step to `/api/track`. Nothing is sent to a
third party, no script is loaded from another origin, and no cookie is shared across sites. This keeps
the ADR 0021 principle - the shop's own database is the only source - and keeps customer data on the
shop's own infrastructure.

### D2 - A session is a random id in an httpOnly cookie, and nothing else identifies a reader

`qb_visit` holds a 128-bit random UUID, is `HttpOnly`, `SameSite=Lax`, `Path=/`, and lasts a year.
There is **no stored IP address, no user-agent string, no fingerprint, no referrer and no cross-site
identifier**. The only derived fact is a coarse device class (`phone` / `tablet` / `desktop`) computed
from the user agent and then discarded.

A path is stored **without its query string**, so a search term a customer typed is never written to
the database.

### D3 - Two tables: a session counter and a step log

- `visit_session` - one row per browsing session: first and last seen, page views, whether it ever
  carried a cart, whether it ever placed an order, the device class and the entry path.
- `visit_event` - one row per step: `page_view`, `cart_add`, `checkout_start`, `order_placed`.

The counters answer "how many" without scanning events; the log answers "which pages" and "when", and
is the only place a funnel can be derived from.

### D4 - A session is never linked to a customer or an order

`placed_order` is a **boolean on the session**, not a foreign key. The analytics surface must not
become a second customer record, and an order must not become attributable to a browsing history. The
checkout route marks the session inside the order transaction; it writes no order id.

### D5 - The figures name what they count

- A **visit** is a browsing session, not a person. One person on two devices is two visits.
- **Live now** is a session that made a request in the last **five minutes**. It is not a socket and
  not a presence system.
- **Carts left behind** is a session that carried a non-empty cart and never placed an order. It is
  **not a lost sale**: the shop cannot know why someone left, and the screen says so.
- **Page views** count every load, including a reload.

The screen states each of these beside the number, and states the privacy position once at the bottom.

### D6 - Crawlers and link previews are not recorded

A request whose user agent matches a bot, crawler, link-preview or headless pattern is answered `204`
and writes nothing. The figures are the shop's own readers. This is a heuristic, and the screen does
not claim otherwise.

### D7 - A visit row is kept for 90 days, and the sweep rides on traffic

The screen reads at most the 90-day window it offers, so 90 days is the longest period any figure can
read. On 2026-11-07 the owner chose that window as the retention period: a session whose last request
is older than 90 days is deleted, and its events cascade with it, so the counter and the log are always
the same age.

There is no scheduler. The sweep runs in `POST /api/track` **after the response has been sent**, at most
once an hour per server instance, and `npm run visits:prune` is the explicit run. A shop with no traffic
has no new rows to prune, so the sweep does not need a timer of its own. A failed sweep is swallowed: a
page view that was accepted must not fail because a delete did.

The window is a business choice, not a legal opinion: it is the owner's answer to "how much history do
I want", and changing it is a new owner decision.

## Consequences

- The analytics screen gains a **Traffic** block: four figures, a page-view chart, a visit-to-order
  funnel and the most viewed pages.
- The storefront gains one client component that renders nothing and one small POST per navigation.
  A failure is swallowed: a shop that cannot record a page view must still sell the product on it.
- `AGENTS.md` no longer forbids traffic figures; it requires them to come from this tracker.
- The dashboard's "no traffic" note is replaced by the traffic block on the analytics screen.
- **Not built:** per-customer journeys, referrers, campaigns, geography, session recordings, heatmaps,
  A/B tests and any third-party integration. None is authorized by this decision.
