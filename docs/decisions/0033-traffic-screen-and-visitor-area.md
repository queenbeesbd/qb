# ADR 0033 - Traffic is its own screen, and a visitor's division is derived without asking

- **Status:** accepted, 2026-11-09 (owner instruction)
- **Amends:** ADR 0027 (first-party visit log) - the log now also stores a coarse area, and its figures
  have their own page
- **Touches:** `docs/data-model.md` (`visit_session`), `docs/security.md` (T19), `AGENTS.md`,
  migration `0020_puzzling_slipstream`

## Context

The owner asked for two things about the shop's own traffic: **more of it** - total readers, today,
7 days, 30 days, and **where in Bangladesh they are** - and for it to **stop sharing a page with the
money figures**. The brief also carried a constraint that decides the second half: *"if possible to get
without asking location in storefront as that's a turnoff for customers."*

ADR 0027 fixed what the log may hold: no address, no user-agent string, no fingerprint, no referrer, no
cross-site identifier, and a session is never linked to a customer or an order. Any answer to "where is
this reader" has to live inside that boundary.

## Decision

### 1. Traffic gets its own page

`/qbpanel/traffic` holds the visit figures; `/qbpanel/analytics` keeps the money figures. They are
adjacent in the rail under **Overview**, behind the same permission (`order.read`), and the traffic
block is **removed** from the analytics page rather than duplicated.

*Why separate:* a visit is not an order. On one page the two columns invite the reader to add them
together, and "0 orders / 46 visits" reads as a conversion rate nobody computed. Two screens, two
questions, and each states what it counts.

The traffic page adds, beside the figures ADR 0027 already had (live now, carts left behind, the visit
to order funnel, most-read paths):

| Figure | What it is |
| --- | --- |
| **Today / Last 7 days / Last 30 days / All time** | sessions by `first_seen_at`, bucketed on the Dhaka calendar |
| **Visits per day** | one series, the window's sessions per day |
| **Where the readers are** | the eight divisions plus "outside Bangladesh", from the network's region |
| **What they read on** | phone / tablet / desktop, the coarse class the log already stored |

"All time" is the **retained** log, and the screen says so ("Kept 90 days") rather than implying a
lifetime count.

### 2. The area is derived from the request, never asked for

The hosting platform resolves an address to a country and an ISO subdivision **before** our code runs
and passes only `x-vercel-ip-country` and `x-vercel-ip-country-region`. `divisionFromHeaders` maps them
to **one of eight words** - `dhaka`, `chattogram`, `khulna`, `rajshahi`, `sylhet`, `barishal`, `rangpur`,
`mymensingh` - or `outside_bd`, or `null`. Nothing else is read or stored: no address, no city, no
coordinate, no fingerprint, and the visitor is never prompted for location.

The Bangladeshi ISO 3166-2 subdivisions are exactly the divisions (`BD-C` Dhaka, `BD-B` Chattogram,
`BD-D` Khulna, `BD-E` Rajshahi, `BD-G` Sylhet, `BD-A` Barishal, `BD-F` Rangpur, `BD-H` Mymensingh), which
is why a division is a real answer from a region header rather than a guess.

Three properties are deliberate:

- **Total, not clever.** A missing country, an unknown subdivision, or no headers at all yields `null`
  ("not known"), never a default. A map that fills its gaps with Dhaka would put a lie in a chart.
- **Bounded.** The only thing a spoofed header can produce is one of nine values - it cannot carry data,
  identify anyone or widen the row.
- **Filled once, never overwritten.** The session row takes the value on insert and `coalesce` on later
  steps, so a session that changes network mid-visit keeps the area it started in, and a request that
  arrives without headers cannot erase a known one.

`visit-session.division` is a nullable text column with a `CHECK` over those nine values; the local
development machine and any network the platform cannot place store `NULL` and are counted in a separate
"could not be placed" line rather than in a division.

*What this costs, stated:* an IP-derived region is approximate (a reader on a mobile network may be
placed where the carrier's gateway is, not where they are), and it is an inference about a person from
their network. The mitigation is that it never leaves the coarse bucket: the platform's resolution is
read once, turned into one word, and the input is discarded - the same shape as `ip_hash` already used
for session correlation.

### 3. The 404 stops apologising and shows the shelf

Owner direction: *"the current 404 page is very ugly, redesign it with the marketing prospect - the page
you searched doesn't exist, here is our top products."*

`/anything` (root) and a vanished product or category (storefront) now render one page:
the shop's real in-stock shelf as a specimen mosaic, the same products as a menu with their real price
and pack size, the category index, and a search field. No invented reviews, arrivals, "popular" claims
or counts - every figure is read from the catalogue (`loadNotFoundShelf`) and the heading says what the
list is. A failed catalogue read renders the page without a shelf and says so, never an error.

## What was deliberately not built

- **No client-side geolocation.** `navigator.geolocation` prompts, needs permission and is exactly the
  turn-off the owner named. It is not used anywhere.
- **No third-party analytics.** ADR 0027 stands: the numbers are the shop's own rows.
- **No city, district or thana level.** The region header could be pushed further; the divisions are the
  coarsest useful unit and the least identifying one that still answers "where".
- **No new permission.** Traffic is another reading of the owner's own activity, and administration is
  owner-only (D10, ADR 0009) - `order.read` is the capability the analytics screen already required.
- **No per-visitor identity.** Two visits are two rows even when they are one person on two devices, and
  the screen says so.

## Verification

- `tests/unit/visits.test.ts` - the eight-division mapping, the letter-only form, `outside_bd`, and the
  three "not known" cases (no country, unknown subdivision, no headers).
- `npm run verify:admin` - the sweep now includes `/qbpanel/analytics` and `/qbpanel/traffic`, so both
  are fetched, measured and permission-checked like every other panel route.
- Migration `0020` applied locally; `db:validate` passes with the new check.
- The 404 was built against the dealt direction (specimen catalogue, seed 492894841) and measured with
  the design gate: **0 FAIL** at 1440 / 768 / 390. The one remaining warning is "no video": this shop has
  no footage of its own, and a stock clip of somebody else's hands would be a picture of a shop that does
  not exist.
- The traffic screen has no automated browser check yet: it needs a session, so it was reviewed from
  screenshots at 1440 and 390 against `references/app-screens.md` and seeded with a spread of sessions.
