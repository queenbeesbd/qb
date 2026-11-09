# Changelog

All notable changes to QueenBee's. Format follows [Keep a Changelog](https://keepachangelog.com/),
with one entry per implementation phase. Versions are not semantic yet: the project has never been
released (0.1.0 in `package.json` is the scaffold version), so entries are grouped by date and phase
number. Phases 0-46 are recorded here in condensed form from `docs/implementation-plan.md`,
`docs/project-status.md` and the git history; the detailed narrative stays in those documents.

**How to update:** every phase adds a dated entry naming the phase, the ADR it implements (if any), the
behaviour that changed, and the verification actually run. Do not record a check that was not run.
An entry may describe a deployment only once it has actually happened and been observed.

---

## [Unreleased]

### Added - 2026-11-10: a product can carry its own delivery charge

Owner request: *"products can have its own delivery charges - remove the shipping component and add
delivery charge component where there will be three form for ctg then dhaka and then others ... adding
this will be optional and if we dont add they will use normal site delivery fee ... if custom orders
multiple product with custom delivery fee then the site will count the lowest one."* Recorded in
[ADR 0034](docs/decisions/0034-per-product-delivery-charges.md).

- **Three optional product columns** (`delivery_chattogram_minor`, `delivery_dhaka_minor`,
  `delivery_others_minor`, migration `0021`, additive; 52 tables unchanged). NULL is the normal case and
  means the store's configured charge applies; `0` means free delivery for that area.
- **The editor's Shipping card is now Delivery charge**: three optional BDT fields, a hint naming the
  blank/fallback and lowest-of-several rules, and the link to Delivery charges. Values are parsed as
  typed BDT and audited with the product write.
- **One resolver, shared by preview and order**: `customDeliveryMinor` takes the lowest fee any line
  states for the customer's area and `quoteOrderDelivery` answers it before every store rule, including
  for a guest. It is per order, never per unit, and never enters a subtotal or discount.
- **Checkout states the rule** when a product's charge priced the order, and a product charge can price an
  order even when no store default is configured (which still refuses otherwise).
- Stored orders keep their snapshot: a later fee change affects later orders only.

**Verified:** `typecheck`, `lint` (0 errors), `check:i18n`, unit suite **289/289** (6 new delivery
precedence cases), `db:validate` (52 tables, 199 checks), `build`, and a Chromium walk-through saving the
fees, reading the checkout charge and placing an order whose stored `shipping_minor` matched.

### Changed - 2026-11-10: search runs while typing, and matches fuzzily

Owner request: *"both storefront and admin panel search for products feature should be real time fuzzy
search - no need to click search icon; if I type `a` it will show products start with `a`."*

- **One matcher** (`src/lib/fuzzy.ts`, no dependency): a term matches a field that equals it, starts it,
  contains it as a word, contains its letters in order, or differs by one character. Terms under three
  characters match only as prefixes/substrings, so type-ahead does not fuzz into noise.
- **Storefront**: the header field commits after a 400ms pause and opens the listing (`push` from
  elsewhere, `replace` on the listing); the listing's own field commits after 300ms with `replace`, so
  refining a search adds no history entries. The default sort ("relevance") now orders matches by score.
  Scope is unchanged - name in both locales, brand and pack (ADR 0011).
- **Admin products list**: search is fuzzy and live at 300ms (`replace`). SQL `ilike` cannot express
  fuzzy matching, so a non-empty search ranks the live rows' searchable fields in memory, pages the
  ranked ids and loads the full rows for that page only; a blank search keeps the single paged query.
  Other admin lists keep the submit-only field: each live search is a server render.
- **Nothing added to the surface**: the submit button and the plain `GET` form stay for Enter and
  no-JavaScript, and no endpoint, client-side product index or search library was introduced.

**Verified:** `typecheck`, `lint` (0 errors), `check:i18n`, unit suite **283/283** (including 8 matcher
and 2 listing-search cases), `build`, and a Chromium walk-through of typing in both boxes; see
`docs/project-status.md`.

### Changed - 2026-11-09: checkout copy trimmed, and the advance instructions get their own topic

Owner request: *"Cash is paid to the courier on delivery — there is nothing to pay online" remove this
line; remove "A cash-on-delivery order needs the owner's approval before dispatch" and "Cash on delivery
is the only method in this release. Nothing is paid online."; replace the advance-payment text with
dynamic text from the backend panel ... this will go in other settings with topic name "Checkout
instructions"; change bKash to bKash Advance at the number; make the number hideable from the backend.*

- **Three statements leave the interface.** The receipt's "Order placed" block keeps its heading, the
  checkout payment card no longer repeats the approval and "only method" notes. The facts they stated
  are still recorded: the order's method line, its status, and the status explanation.
- **The payment instructions move to Settings -> Other settings -> Checkout instructions**, its own
  topic beside the guest-order switch. The values were always `store_setting` rows
  (`payment.instructions`, `payment.bkash_number`, `payment.send_money_note`,
  `payment.advance_threshold_minor`); the editor is the part that moved, and the storefront still prints
  them verbatim. The save route redirects to the Other settings page with a fixed notice code, and the
  Contact and policies page no longer carries the block.
- **The number is labelled bKash Advance** on the checkout payment card and in the panel.
- **The number block gains its own switch.** `payment.bkash_visible` (default on, value type `boolean`)
  is the owner's explicit show/hide; off hides the card without deleting the number, and the
  paragraphs are still printed. A stored blank number still renders the stated "not published" line
  rather than a guess.
- **No schema change and no migration** - `store_setting` already holds key/value rows.

**Verified:** `typecheck`, `lint` (0 errors), `check:i18n` (1,776 keys), unit suite, `build`; see the
verification section in `docs/project-status.md` for the exact evidence.

### Added - 2026-11-09: a guest order can be claimed into an account
Owner request, recorded in [ADR 0032](docs/decisions/0032-claiming-a-guest-order.md): *"suppose a guest
ordered; this is his order placed summary. Now we should ask him if he wants to open or sign in to an
account to track the order. If he then signs in or creates an account, the order becomes part of that
user, and next time he buys he counts as a repeated customer."*

- **The receipt asks.** A signed-out guest sees **Keep this order in an account** with **Sign in** and
  **Create an account**, both returning to that receipt; a signed-in customer viewing a guest order sees
  **This order is not in your account** and one button, **Add this order to my account**; a claim that
  just happened is confirmed instead of being left to be inferred.
- **The claim is explicit, never silent.** Signing in from the receipt returns the customer to it; it does
  not take ownership on their behalf. `POST /api/account/orders/claim` requires the session and its CSRF
  token, is same-origin checked, and answers with a redirect.
- **The database enforces "once".** Migration `0019` narrows `order.customer_id`'s immutability to exactly
  one transition - `null` -> a customer - and still refuses a move to another account or a cleared link
  (`23514`). The claim locks the order row, updates only while `customer_id is null`, and writes one
  `order_event` (`order_claimed`, actor `customer`, `event_key claim:<orderId>`). No audit row (D23), and
  no amount, delivery split, discount snapshot or state column changes.
- **The repeat-customer consequence is the point.** `isRepeatCustomer` reads `customer_id` and
  `status = 'completed'`, so a claimed completed order makes the account returning for the *next*
  delivery quote. The repeat rate itself is still owner-configured and off by default, and the interface
  promises history, not a discount.
- **`safeCustomerNext` gained one bounded entry** (`RECEIPT_PATH_PATTERN`, one order number), so the
  sign-in and registration forms can return to a receipt without becoming a general redirect target.
- **Schema:** one event-type value and one replaced trigger function. **52 tables unchanged**; `db:validate`
  reports 195 checks and 12 triggers.

**Verified:** `tests/db/order-claim.test.ts` **6/6** (link once; idempotent repeat; a second account
refused; unknown and malformed numbers refused; the trigger refuses a move and a clear; a claimed
completed order becomes a repeat fact; a claimed order is no longer readable by number alone),
`tests/unit/customer-auth.test.ts` **12/12** (the receipt is an allowed return target; a lookalike is
not), unit suite **272/272**, `typecheck`, `lint` (0 errors), `check:i18n` (1,738 keys), `db:migrate`,
`db:validate`, `db:check`, `build`, and an HTTP walk-through on a served build: guest order -> register
with `next` -> the receipt offers the claim -> claim -> `?claim=claimed` -> the order appears in
`/account/orders` -> a third account gets **404** -> an anonymous visit gets **404**.
`npm run verify:admin` **218/218**. `npm run verify:storefront` **91/97**, the six failures being the
same documented pre-existing ones (8, 20, 27d, 32, 36d, 40b) - the claim added none. The suite stops at
the browser step, so its HTTP customer-flow checks were run separately against the local development
database: **25/28**, with all receipt, guest-order, order-not-found, guest-checkout and repeat-submission
checks passing and the three failures explained by that database's own state - guest ordering is enabled
there (so `/checkout` correctly does not redirect), a payment-instruction row exists, and a product set
out of stock by the flow mid-run is read from the cached catalogue snapshot the flow does not
invalidate. None of the three touches the claim.

**Not verified:** a second device, a real phone, and the repeat-delivery *price* end to end (the rate is
unset in this environment, so the quote falls through rather than discounting). Nothing is deployed.

### Added - 2026-11-09: traffic on its own screen, with the divisions, and a 404 that shows the shop
Owner instruction, recorded in [ADR 0033](docs/decisions/0033-traffic-screen-and-visitor-area.md).

**Traffic left the analytics page.** `/qbpanel/traffic` now carries the visit figures and
`/qbpanel/analytics` keeps the money; the traffic block is removed from Analytics rather than duplicated,
and both sit under Overview behind `order.read`. The new screen states sessions **today, 7 days, 30 days
and all time** (all time is the retained 90-day log and says so), live now, carts left behind, a
visits-per-day chart, **where the readers are**, the phone/tablet/desktop split, the visit-to-order
funnel and the most-read pages.

**The area is derived, never asked for.** `divisionFromHeaders` maps the platform's IP country and region
(the ISO 3166-2:BD subdivisions *are* the eight divisions) to one of `dhaka`, `chattogram`, `khulna`,
`rajshahi`, `sylhet`, `barishal`, `rangpur`, `mymensingh`, `outside_bd`, or `null`. No address, city,
coordinate or fingerprint is read or stored, the storefront never prompts for location and
`navigator.geolocation` is not used at all. A missing or unknown header is `null`, never a default, so a
gap is counted as "could not be placed" rather than folded into Dhaka. **Migration `0020`** adds
`visit_session.division` with a `CHECK` over those nine values - additive, **52 tables unchanged**.

**The 404 is now a shop page.** Both 404s render one composition: the real in-stock shelf as a specimen
mosaic (the dealt direction `specimen-catalogue`, seed 492894841, palette and type kept from the brand),
the same products as a menu with their real price and pack, the category index, and a search field.
`loadNotFoundShelf` reads the catalogue through the existing cached snapshot and never throws. No
invented reviews, arrivals, counts or "popular" claims; the shelf links instead of adding to the cart,
because the root 404 has no cart provider.

**Verified:** `typecheck`, `lint` (0 errors), `check:i18n` (1,776 keys), unit **272/272** including the
new division-mapping cases (eight subdivisions, the letter-only form, `outside_bd`, and the three
"not known" cases), `db:migrate`, `db:validate`, `db:check`, `build`, `verify:admin` **218/218** with
`/qbpanel/analytics` and `/qbpanel/traffic` added to its route sweep, and the design gate on the 404:
**0 FAIL** at 1440 / 768 / 390 (`lint.mjs` 0 FAIL, 0 WARN; `inspect.mjs` 1 WARN - no video, defended).
The traffic screen was reviewed from 1440 and 390 screenshots against `references/app-screens.md`, with a
spread of sessions seeded into the local database. **Not verified:** the traffic screen has no automated
browser check (it needs a session), `verify:storefront` was not re-run for the 404, and no real request
carried a Vercel region header in this environment, so the division path is proven by unit test and by
seeded rows rather than by a live visit. Nothing is deployed.

### Changed - 2026-11-09: the order page drops the cash-on-delivery process note
Owner direction: *"hide this - Cash on delivery: the owner approves the order before dispatch, and
courier cash is reconciled separately - from the order placed page."*

The sentence is gone. It described the shop's internal process on a page the customer reads, and the
two facts they need were already there: the method and its payment state ("Cash on delivery" /
"Awaiting approval"), and what happens next read from the stored order. `orders.codNote` is deleted
from the dictionary rather than left unreferenced, and the legacy note for a historical non-COD order
is untouched - it states that order's own payment method, not our process.

Verified on a served build: a real guest COD order placed through `POST /api/checkout/order` renders
`/orders/<number>?placed=1` with **0** occurrences of "reconciled separately" and still shows "Order
placed", "Cash on delivery" and "Awaiting approval" (check the same order on the previous build: the
sentence was present). `typecheck`, `lint` (0 errors), `check:i18n` (1,730 keys) pass.

### Verified - 2026-11-09: the full admin and storefront suites against the renamed routes
Both suites that hard-code the panel paths were run against the deployed code, and two harness
defects they exposed were fixed rather than tolerated.

| Suite | Result |
| --- | --- |
| `npm run verify:admin` | **218/218**, including every `/qbpanel` route, the permission sweep, the drawer, the order decisions and the control heights |
| `npm run verify:storefront` | **91/97**, the six failures being the documented pre-existing ones: **8** and **32** (product-page image/price rules), **20** (gallery dots at 24px), **27d** (one section link), **36d** (this seed's five departments, the check wants ten) and **40b** (favicon ink) |

**Two harness fixes, both corrections rather than relaxations.**

- `verify:admin` asserted *"no CSP is claimed, because none is implemented"* - it passed only while a
  control was missing, and `src/proxy.ts` has emitted a nonce-based policy for some time. The check now
  asserts the policy is present with `script-src 'self' 'nonce-…'`, `'strict-dynamic'` and
  `frame-ancestors 'none'`. `docs/security.md` had the same stale claim in three places and now states
  the policy's real limit: `style-src` keeps `'unsafe-inline'` for React's style attributes.
- **The catalogue snapshot survived a rebuild.** `unstable_cache` stores it under `.next/cache`, which
  `next build` does not clear, so `verify:storefront` served the previous **`verify:admin`** cluster's
  one-product catalogue while its own 22-product seed sat unused - the homepage rendered "Verify
  Product" and the run failed at checks 1, 8 and 9. Both runners now clear `.next/cache` before they
  serve and again when they finish, so no run can read another database's rows. With that fixed the
  suite reached **91/97** instead of aborting at check 9.

**Not run:** `verify:browser` directly (it was driven by `verify:storefront`), `verify:ui`, the db
suite, and any real device.

### Changed - 2026-11-09: the panel moves to `/qbpanel`, its session lasts, and it ships as an app
Owner instruction, recorded in [ADR 0031](docs/decisions/0031-panel-path-persistent-session-and-app.md).

**The path.** The administrative tree is now `/qbpanel/...` and its mutations `/api/qbpanel/...`;
`/admin` and `/api/admin` are not aliased and answer 404. `ADMIN_ROOT`, `LOGIN_PATH`, `REDEEM_PATH`,
`ADMIN_PATH_PATTERN` and every navigation constant in `src/server/auth/constants.ts` carry the new
path, so the post-sign-in return-path allowlist moved with it. Nothing else about authorization
changed: every page still checks its own permission, every mutation its own session, origin and CSRF
token.

**Nothing may index it.** `next.config.ts` sets `X-Robots-Tag: noindex, nofollow, noarchive,
nosnippet` on `/qbpanel/:path*` and `/api/qbpanel/:path*`, and `src/app/robots.ts` answers
`Disallow: /` for every user agent. The path is deliberately **not** named in `robots.txt` - a
`Disallow` line would publish it - and page metadata already carried `robots: { index: false }`.

**The session.** `SESSION_ABSOLUTE_MS` is a year and `SESSION_IDLE_MS` 30 days (Phase 12 had 8 hours
and 30 minutes). The row still carries both limits, still clamps the idle limit inside the ceiling,
and sign-out, a password change and owner revocation still end a session immediately. This is the
change that stops the panel asking for a password every time it is opened.

**The app.** `android-app/` is a Capacitor project (`bd.queenbees.panel`) whose WebView loads
`<deployment>/qbpanel`; it holds no business logic, credential or copy of the store. Launcher icons
and every splash density/orientation are generated from the owner's `logo.jpeg` by
`android-app/scripts/build-icons.mjs`. A built debug APK is committed at `app/dist/queenbees-panel-debug.apk`
so the owner can install it; release signing needs the owner's own keystore, which is gitignored.

**Verification actually run:** `typecheck`, `lint` (0 errors, 18 warnings), unit suite **271/271**,
`build`, and a served production build probed over HTTP - `/qbpanel` 307 to `/qbpanel/login`,
`/admin` 404, `/qbpanel/login` 200 with the `X-Robots-Tag` header, `robots.txt` `Disallow: /`, and a
cross-origin `POST /api/qbpanel/session/login` refused with 403. The APK was built with JDK 21 and
Android SDK 35 (`BUILD SUCCESSFUL`) and inspected with `aapt2 dump badging` (package
`bd.queenbees.panel`, minSdk 23, targetSdk 35, INTERNET only, the owner's icon in every density).
**Not verified:** installation on a real Android device, a real WebView's cookie persistence across
restarts, `verify:admin`, `verify:storefront`, `verify:browser` and the db suite.

**Deployed to production, 2026-11-09** (`dpl_4B5pc2fMzGF7BRPXZxJfRyfHb3L5`, aliased to
`https://queenbees.vercel.app`). No migration was applied because none was added - the schema is
unchanged at 52 tables / 19 migrations. Observed on the alias afterwards: `/` and `/products` **200**,
`/admin` and `/api/admin/...` **404**, `/qbpanel` **307** to `/qbpanel/login`, `/qbpanel/login` **200**
with `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` and `cache-control: private, no-store`,
`robots.txt` `Disallow: /`, and a cross-origin `POST /api/qbpanel/session/login` **403**. The panel URL
in any existing bookmark is now dead, and a session minted before this change keeps its old 8-hour
absolute expiry - the owner signs in once more on each device, then stays signed in.

### Removed - 2026-11-08: the owner-issued one-time code recovery
The account page's quiet "Password" card (the sign-out note, the code link and the contact line) is
gone, and the Phase 23 owner-issued one-time code is removed entirely: `/account/recover`, its
`/api/account/recover` route, the admin **Issue a code** panel and its two routes, the flash-token
display, `src/server/customer-auth/recovery.ts`, the `customer.credential_reset` permission and its
catalogue entry, and the code links on sign-in and on the forgot-password page. Recovery is the mailed
single-use link only (ADR 0030, amended).

`account_recovery_token` remains - the self-service reset stores its digest there - and historical
`customer.credential_reset_*` audit rows keep their action codes. The customer-flow and admin
verification scripts no longer drive the removed routes.

A failed send was also silent: the delivery helper now writes one warning line with the **reason only**
(`not_configured`, `rejected`, `unreachable`), never the address, the token or the body.

### Changed - 2026-11-08: customer passwords may be 8 characters, with one character rule
The customer minimum drops from 12 to **8**, and a password must now contain **at least one letter or
special character** - a digits-only password such as a phone number is refused. The rule lives in
`customerPasswordPolicyError` (`src/server/auth/password.ts`) and is used by registration, the mailed
recovery reset, the owner-issued one-time code and the account-page change; the forms set `minlength=8`
and state the character rule. **Owner and staff credentials keep the 12-character, length-only floor**,
so the administrative surface is unchanged. Seven characters, or eight digits alone, are refused on
every customer path (verified over HTTP alongside the form markup), and the shipped accounts keep their
existing hashes - the rule applies at the next password set, never retroactively.

### Fixed - 2026-11-08: two misaligned rows
The checkout bKash block was a wrapping flex row, so the copy button floated against the label line
while the number sat below it and the caution line started with a gap. It is now a two-column grid: the
label and number stack in the first column, the copy control is centred against both in the second, and
the caution spans the card.

The three new delivery-pricing rows put a helper sentence inside one column, which made that column
taller and pushed its input out of line with the others. Every field in those rows is now label plus
money input only, with one explanation under the row, and the rows use the start-aligned grid. Measured
in Chromium: the four conditional inputs share a top edge (`857` each) and width (`210` each), the
discount pair matches (`528` each), the copy button's centre equals the label+number block centre
(`1389`), and the card has no overflow at 390px.

### Fixed - 2026-11-08: production was three migrations behind the deployed code
`/admin/settings/delivery` failed with `column "conditional_enabled" does not exist` because the Neon
production branch had 16 applied migrations while the deployed build expects 19. `0016_steadfast_consignments`,
`0017_pricing_rules` and `0018_customer_email_change` were applied to production in order and recorded in
`drizzle.__drizzle_migrations` with their real content hashes, so `db:migrate` will not replay them.
Verified against the live database: 52 tables, 19 applied migrations, 15 `delivery_setting` columns, the
new tables/indexes/checks present, the failing select and the district-override select both return, and
anonymous admin routes answer 307 to sign-in instead of the error boundary. No code changed. Two owner
actions remain: **production has no delivery configuration** (checkout refuses until Settings -> Delivery
charges is filled in), and the database credential was serialised into Vercel runtime logs, so that role's
password should be rotated.

### Added - 2026-11-08: customer email account security through Resend (ADR 0030)
Customers can now recover a forgotten password by email, change their password from the account page,
and change their registered address - without any email-verification step.

- **Recovery**: `/account/forgot-password` mails a single-use link through Resend (256-bit token, stored
  only as a SHA-256 digest, one hour); `/account/reset` sets the new password and signs the customer out
  everywhere. The request answers **identically** for a registered address, an unknown one, a suspended
  account, a malformed one, a throttled caller and a provider failure, and is throttled by address and
  source (five an hour). The owner-issued one-time code remains for a customer who cannot reach the inbox.
- **Password change**: the account page asks for the current password, then the new one; the change
  revokes every customer session and mints one replacement for the current browser, and a
  password-changed notice is mailed.
- **Email change**: a two-step flow. The account page asks for the new address **and the current
  password**; a confirmation is mailed to the new address and nothing changes until that link is used
  (a button on a page, so a link prefetch cannot consume it). On confirmation the address moves, every
  session is revoked (`email_changed`), and the previous address receives a notice.
- **No verification, ever**: registration and sign-in are unchanged and no verification screen, banner,
  mail or gate exists. Administration is untouched: the owner still signs in with email and password.

Migration `0018_customer_email_change` adds `customer_email_change` (one pending change per customer,
partial unique) and one `customer_session.revoked_reason` value (`email_change`). Schema **52 tables**;
purely additive. Four branded HTML templates (primary `#A680FF`, pink `#F6B3CC`, deep purple `#56358C`,
600px, inline styles, plain-text alternative, every request value escaped) live in
`src/server/integrations/email-templates.ts`; the client is `src/server/integrations/email.ts` and reads
`RESEND_API_KEY`, `EMAIL_FROM` and `APP_BASE_URL` from the environment only.

Verified locally: typecheck, lint (0 errors, 2 pre-existing warnings), `check:i18n` (1,759 keys),
`build`, unit **264/264** (13 new email cases), `db:migrate`/`db:validate` (52 tables, 194 checks), a
stub-Resend HTTP walk-through of 59 checks (registration with no mail and no verification, recovery
delivery and token contents, reset plus reuse and expiry, unknown-address parity, password change with
wrong/mismatched/weak refusals and CSRF refusal, session revocation and replacement, address change
refused for a taken and for the same address, confirmation not applied on open, previous-address
notice, used and expired links refused, rate limiting, owner sign-in unaffected, and a customer cookie
refused by `/admin`), and Chromium at 390px checking the three new pages and the two account forms with
no horizontal overflow. `verify:admin`, `verify:browser`, `verify:storefront`, the db suite, real
inboxes, real devices and screen readers were not exercised. Nothing is deployed.

### Added - 2026-11-08: conditional delivery, repeat-customer pricing and checkout payment instructions (ADR 0029)
Settings -> Delivery charges now owns three optional pricing rules beside the existing default and
per-district charges, and checkout publishes the owner's advance-payment instructions.

- **Conditional delivery**: a lower charge for a signed-in customer whose goods subtotal reaches a
  configured minimum, priced for Dhaka, Chattogram and the rest of the country.
- **Repeat-customer delivery**: a returning customer (at least one **completed** order) pays the repeat
  rates - Chattogram has its own; Dhaka and every other district share the second - and it takes
  priority over conditional pricing.
- **Repeat-customer discount**: an automatic whole-percentage discount above a configured subtotal,
  added to any promotion code and capped at the goods subtotal.
- **Payment instructions**: the owner's Bangla copy, the bKash number with a copy button, the
  "Payment, not Send Money" caution and the subtotal below which the delivery charge is expected in
  advance, edited at Settings -> Contact and policies.

Migration `0017_pricing_rules` adds eleven additive columns to `delivery_setting` (three switches,
their amounts, the discount percent and minimum) with range `CHECK`s. **No new table; schema stays 51.**
Every rule defaults to **off** and every value is nullable, so an upgraded database keeps its previous
pricing exactly. One pure resolver (`quoteOrderDelivery`, plus `repeatDiscountMinor`) is shared by the
cart, the checkout preview and `createOrder`, so the shown number and the stored snapshot cannot
diverge: repeat delivery -> conditional -> district override -> default -> refusal, with a guest
stopping at the override. Eligibility is read inside the order transaction from `order.status =
'completed'`; a guest is never eligible and a cancelled or unpaid order never counts.

**Cash on Delivery remains the only method an order records.** The payment block is an instruction the
owner confirms on the phone: nothing writes a payment method, claim, screenshot or verification, and
ADR 0015 is untouched. The Bangla defaults live in `src/data/payment-instructions.ts` as owner data and
are rendered as plain paragraphs (markup refused), which `check:i18n` treats as data rather than
interface copy.

Verified locally: typecheck, lint (0 errors, 2 pre-existing warnings), `check:i18n` (1,714 keys),
`build`, unit **251/251** (19 new pricing cases), `db:migrate`/`db:validate` (51 tables, 191 checks),
an HTTP settings walk-through that saved all four rule groups, proved the audit rows and refused a
half-configured rule without changing anything, ten real `createOrder` scenarios matching the brief's
matrix (guest/new/repeat x 810/1500/2510 BDT, Chattogram, and a cancelled-order customer that stays new),
and a Chromium walk-through at 1440px and 390px: the owner instructions, number, copy control and
caution render; guest delivery is the default, a new customer gets the conditional rate, a repeat
customer gets the repeat rate plus the 5% row, a cancelled-order customer does not; the advance line
appears below 500 BDT; and with both repeat rules switched off the same customer falls back to the
conditional rate with no discount, in the checkout and in the cart, with no horizontal overflow at
390px. `verify:admin`, `verify:browser`, `verify:storefront` and the db suite were not re-run; real
devices and screen readers were not used. Nothing is deployed.

### Added - 2026-11-08: SteadFast courier booking (ADR 0028)
Confirming a COD order on the phone is now also the moment its parcel is booked. Approving an order in
`/admin/orders-cod` sends it to **SteadFast Courier** (`POST /create_order`) immediately after the
approval commits, and the consignment id, tracking code and courier status are stored in a new
**`steadfast_consignment`** table (migration `0016`, schema 50 -> **51 tables**), one row per order.

The owner enters the courier account at **Settings -> Integrations -> SteadFast** (`settings.write`):
the `Api-Key` and `Secret-Key`, and a switch that is **off by default**. The keys are stored in
`store_setting`, are never sent to the browser, logged, redirected or audited as values - the screen and
the audit record carry only `••••` plus the last four characters - and **Test connection** asks SteadFast
for the account balance using the **saved** keys. Removing the account is a confirmed action that deletes
both keys and switches booking off; an empty field keeps the stored value so one key can be rotated
without retyping the other.

Booking is **separate from the approval transaction**, so a courier outage cannot undo a decision made on
the phone: the order stays `cod_approved` / `confirmed`, `order.steadfast_booking_failed` is written in
its own transaction, the queue says the booking failed, and the order screen offers **Send to SteadFast**
as the retry. A booking, a failure and a **Refresh status** all leave `order.status`, `order.cod_state`,
payment, refund and stock untouched - SteadFast's `delivered` status is a stored mirror with the time it
was read, never an order transition. One consignment per order is enforced three times: a unique
`order_id`, a unique `invoice`, and a transaction-scoped advisory lock, so a second send answers "already
booked" instead of creating a second parcel.

The amount to collect is the order's frozen `total_minor` in BDT; the invoice is the order number; the
address is the stored line plus area, city and postcode with repeats dropped; a phone that is not an
11-digit Bangladeshi mobile is refused before the call. Two provider field limits (name 100, address 250)
are clipped, because a confirmed parcel must not be blocked over whitespace and the order keeps the full
value. **No new permission**: sending is re-authorized as `cod.approve`, refreshing as `order.read`.

Verified locally against a disposable dev cluster and a **stub courier**: `npm run typecheck`, lint
(0 errors, 2 pre-existing warnings), `check:i18n` (1,666 keys), `build`, unit **238/238** (20 new), and an
end-to-end HTTP smoke through the real routes - keys saved and masked (the page never contains either
value), a stub balance read, an approval that created the consignment and sent the exact payload
(`cod_amount: 620`, address composed, note), an order page showing the id and tracking code, a status
refresh that stored `delivered` without moving the order, a second send answering "already booked" with
exactly one row, a non-bookable order refused with no row and an audit entry, and the account removed with
both keys deleted. A second smoke with the stub **down** proved the approval still succeeds, no row is
written, the failure is audited and the retry is offered. `verify:admin`, `verify:browser`,
`verify:storefront`, the db suite, real devices and the live SteadFast API were **not** run; nothing is
deployed and no live courier account was contacted.

### Added - 2026-11-07: contact and policy surfaces (Phase 51)
The shop told customers to contact it and published no way to do so. `/contact` and four policy pages
(`/policies/delivery`, `/policies/returns`, `/policies/privacy`, `/policies/terms`) now render the
owner's own facts and words from `store_setting` (`contact.phone`, `contact.hours`, `contact.address`,
`policy.delivery`, `policy.returns`, `policy.privacy`, `policy.terms`), edited at **Settings -> Contact
and policies** behind `settings.write`, audited as `settings.contact_updated`. No schema change.

Nothing is invented: a blank field is not published, the contact page states which facts are missing, a
policy page whose text is blank says so, and the footer's Help column links contact always and each
policy page only once the owner has written it. Text is plain - `<` and `>` are refused rather than
stored - and the phone is validated as a dialable number so `tel:` never carries a sentence. The copy
that said "contact the store" now links `/contact` from checkout, the account recovery copy and the order
receipt, so the promise resolves.

Verified: typecheck, lint (0 errors), `check:i18n`, unit **218/218**, `build`, and `verify:admin`
**224/225** (the remaining check is the documented "no CSP is claimed" assertion), including the write and
its refusal over HTTP, the audit record, the rendered pages, the footer's population rule, and Chromium at
1440/390 with no overflow. The owner has not supplied any contact fact yet, so production publishes the
gap states until they do. Nothing is deployed.

### Added - 2026-11-07: dispatch slip (Phase 52)
A COD dispatch had nothing to hand to the courier. `/admin/orders/[orderNumber]/slip`, behind
`order.read`, prints the reference, recipient, phone, composed address, the customer's note, the frozen
line items with quantities, and **Amount to collect** - with subtotal, discount (only when the frozen
amounts imply one) and delivery above it. It is presentation only: no state change, event or audit row,
and no internal id, customer email, account state, payment state or courier cost. The address lives
outside the admin `(app)` group, so the rail and tab bar are not part of the document.

The order detail's **Print slip** control opens it in a new tab; the slip prints only when its own button
is clicked. One stylesheet serves A4 and an 80mm roll: at `max-width: 30rem` in print the unit-price
column is dropped and the headers shrink, so quantity and amount fit the roll. There is no shop contact
block because no shop phone or address is stored; the screen states that gap.

Verified: typecheck, lint (0 errors), `check:i18n` (1,557 keys), `check:catalog`, unit **218/218**,
`build`, and `verify:admin` **214/215** (the remaining check is the documented "no CSP is claimed"
assertion). The new checks cover the slip over HTTP (owner 200 with recipient/address/amount, limited
`order.read` principal 200, anonymous 307 to `/admin/login`, missing order 404, no customer email, no
payment or cost state), `window.print` never called on load and called once on click, the screen wrapper
hidden and the price column dropped at 80mm but not A4, no horizontal overflow at either width, and
Chromium rendering **one A4 page** and a **1-3 page 80mm roll**. Real printers, real iOS/Android and
screen readers were not used; nothing is deployed.

### Added - 2026-11-07: visit rows are deleted after 90 days
The Traffic block reads at most 90 days, so the owner chose that window as the retention period. A
session whose last request is older than 90 days is deleted and its events cascade with it, so the
counter and the log are always the same age. There is no scheduler: the sweep runs in `POST /api/track`
after the response, at most once an hour per instance, and `npm run visits:prune` is the explicit run.
A failed sweep never fails a page view. `tests/db/visits.test.ts` proves the delete, the cascade and
the survival of a session inside the window.

### Changed - 2026-11-07: the admin rail carries the real logo
The rail drew a hand-drawn crown - the last surface still showing the retired mark - while the
storefront and the account pages already used the owner's own `logo-round-192.jpeg`. The rail now draws
the same circular mark at 40px, centre-cropped with `object-fit: cover`, so the two surfaces cannot
drift apart.

### Changed - 2026-11-07: Most Selling is omitted until the shop has sold something
The section used to draw a heading and a "Nothing sold yet" note. A heading over an empty shelf is a
promise the shop cannot keep, so the section is now absent until `order_item` units exist; the two
dictionary keys that only the empty note used were removed.

### Fixed - 2026-11-07: every card's Add to cart sits on the card floor
A card with a saving pill is one line taller than a card without one, so a button that followed the
content sat higher on the undiscounted card and a mixed row read as misaligned. The control is now
anchored to the card's floor with an auto margin, which absorbs whatever the card's own content does
not use; the 8px gap is kept as padding.

### Changed - 2026-11-07: the analytics figures read as two rows of three
Six KPI cards in one row were ~150px wide on a 1440px screen: labels wrapped to two lines, notes to
three, and the icon plate took a third of the reading column. The band is now three columns above
720px and two on a phone, so the six figures read as two rows of three with room for their sentences.

### Added - 2026-11-07: first-party visit tracking and a Traffic block on analytics
The owner asked for visits, live readers, carts left behind and a visualisation of the visit path. That
is an explicit approval for a tracker, which is the condition the old "no traffic figure" rule set, so
**ADR 0027** records the decision and narrows ADR 0021 D1.

The tracker is the shop's own. `POST /api/track` writes `visit_session` and `visit_event` (migration
`0015`, schema **48 -> 50 tables**) from a small storefront beacon: a random 128-bit session id in an
`HttpOnly` `qb_visit` cookie, the path **without its query string**, a coarse device class and the
step (`page_view`, `cart_add`, `checkout_start`, `order_placed`). There is **no IP address, no
user-agent string, no fingerprint, no referrer, no cross-site identifier and no third-party script**.
Crawlers and link previews are answered `204` and write nothing. A session is **never linked to a
customer or an order**: `placed_order` is a boolean, not a foreign key.

`/admin/analytics` gains a **Traffic** block: visits today, page views today, live now (a request in
the last five minutes), carts left behind (a cart and no order), a page-view chart on the same
`Asia/Dhaka` calendar as the money figures, a visit-to-order funnel and the most viewed pages. Every
figure names what it counts - a visit is a session, not a person - and the block closes with the
privacy position. **No automatic retention job exists**; that is a recorded gap, not an oversight.

### Changed - 2026-11-07: the hero screen has one way to add a banner
Settings -> Homepage hero offered two: an upload and a picker over the server's generated asset
inventory. The picker was the placeholder from before the upload worked, so it was removed along with
its `assets` prop and the page's asset read. The upload is the only path now.

### Fixed - 2026-11-07: the rail highlights the destination you are actually on
`/admin/catalog/brands` starts with `/admin/catalog/`, so the shell's first-prefix match lit
**Products** for every brand route. The current destination is now an exact match first, then the
longest prefix, so a nested destination beats its parent.

### Changed - 2026-11-07: the admin panel is redesigned around the phone
The owner panel was rebuilt on a new visual system, **direction C "soft counter"**, chosen by the owner
from four rendered directions (counter ledger, dispatch console, soft counter, blueprint) on the
`experiment/admin-redesign-v2` branch. The owner's two adjustments were kept: the phone bottom bar is
unchanged, and the palette stays the storefront's.

What changed is the surface, not the product. The rail is white with a lavender active pill instead of
a lavender wash; the workspace canvas is `#F7F4FF`; every card is a 20px paper-white surface with one
soft lavender shadow instead of a hairline; controls are 12px; the queue is a lavender hero card with a
blush count badge; the KPI band is five white cards with tinted icon plates and no coloured top rule;
record pages give each section its own card, with a second question inside a card starting a new band.
The phone bottom bar keeps its lavender field, ink labels and 2px active rule.

`admin.module.css` was rewritten against the same class names, so every component kept working, and
`charts.module.css` chrome moved onto the new tokens. **No route, permission, form field, mutation,
state machine, query or stored value changed.** The two control heights (40px / 34px, 40px on a phone)
are unchanged, and no left border strip marks a selection.

**Verification:** `typecheck`, `lint` (0 errors, 2 pre-existing warnings), `build`,
`check:i18n`, `check:catalog`, and `verify:admin` at **207/208**. The one failure is pre-existing and
unrelated: the suite still asserts that no `Content-Security-Policy` header is sent, while
`src/proxy.ts` has sent a nonce-based one since commit `839ca05` (2026-11-01); the check predates the
policy and was not updated with it.

The Telegram row-operation checks were racing hydration after a form post - the URL changes before
React is interactive, so `requestSubmit()` posted natively and the confirmation dialog never opened.
The suite now waits for React's own marker on the form before submitting; the assertions are unchanged.

**Not verified:** `verify:browser` did not complete in this environment. Its first run reported 7/10
against a `storefront-catalog` cache entry left behind by `verify:admin`'s disposable cluster (the
cache was cleared afterwards); the second run stalled after check 28b and was stopped. No storefront
file is touched by this change, and `verify:admin`'s own "storefront is unaffected" checks pass.

### Fixed - 2026-11-07: admin KPI cards no longer overlap and carry their tone
The analytics tiles put the label, value and note directly into the card's two-column grid, so at
narrow widths they printed over one another. Both dashboards now use one `MetricCard` with a single
reading column beside a tinted icon, a tone rule and tone-coloured value, and a two-line label reserve
that keeps values aligned. The dashboard uses five/three/two columns and analytics six/three/two,
replacing `auto-fit` widths that stranded a lone fifth tile or crushed six figures. Counts are
formatted with the active locale.

### Changed - 2026-11-07: catalog reads cached and images served through the edge
The storefront catalog snapshot is cached across production requests under the `storefront-catalog`
tag and invalidated by every catalog write after commit. Catalog images are proxied with immutable
browser/CDN cache headers instead of redirecting every visitor to Neon object storage. This removes
the two largest sources of Neon public-transfer usage.

### Fixed - 2026-11-06: production storage origin moved and its asset URLs versioned
The production site was restored on a new Neon project and object-storage bucket. `CATALOG_ASSET_VERSION`
is bumped from 3 to 4 so browsers that cached the old `/catalog/...` redirect do not keep following it to
the exhausted bucket. No data or API shape changed.

### Changed - 2026-11-06: admin figures stop explaining themselves
The overview's long revenue essay, the analytics screen's status/money essays and the order money
essay were removed. A panel now states its labels and numbers; where a figure would otherwise mislead,
a single short line remains ("Excludes 2 order(s) without a recorded delivery split.", "No traffic or
page-view data is collected.", "Delivery split not recorded; net estimate unavailable."). The old
"Read at {time}. These figures count rows that exist." catalog note was already retired with the catalog
state panel. No figure, derivation, permission or state machine changed.

**Verification:** typecheck, lint (0 errors), `check:i18n`, `build`; `verify:admin` and the existing
dashboard checks still pass.

### Added - 2026-11-06: the site-open offer popup
The storefront now shows one owner-uploaded offer image when a visitor opens it, once per browsing
session. Settings -> Offer popup is a singleton editor: upload the image, write its accessible
description, and switch it on. A `square` or `16:9` frame is chosen from the uploaded file's own ratio
by `saveOfferPopupUpload`, so there is no shape selector that can disagree with the bytes; the preview
shows the frame that will be stored. An inactive popup keeps its image and is not rendered.

The modal is accessible and deliberate: `role="dialog" aria-modal`, labelled close button, Escape,
backdrop click, locked page, focus moved to Close and restored on close. It opens on the first
storefront page of a session and stays dismissed for that session; a new save changes the campaign
token and appears again. There is no scheduler, exit-intent, countdown, discount claim or invented
link - the image is the whole offer.

**Schema:** `offer_popup` (singleton, `id = 1`, image key, aspect, alt text, active) in migration
`0014_offer_popup`; schema **47 -> 48 tables**, purely additive. Uploaded through the existing
`saveUpload` pipeline (square or hero frames) with `settings.write` and audit action
`settings.offer_popup_saved`.

**Verified.** typecheck, lint (0 errors), `check:i18n`, `check:catalog`, unit **212/212**,
`tests/db/catalog.test.ts` **38/38** (save, read active, switch off, alt refusal, audit), `build`,
`db:validate` (48 tables), `verify:admin` **206/208** with the two pre-existing failures (the Telegram
removal-dialog check and the documented absent-CSP assertion). A dev-server walk-through saved a square popup and a wide popup, saw each
open on a fresh storefront session with the right frame and path, closed one with Escape, confirmed it
stayed dismissed across navigation, and switched the popup off to confirm no modal rendered. Test
uploads were removed from `public/`.

### Changed - 2026-11-06: category and brand editors, with the photo uploaded in the form
The category create screen now follows the reference's form hierarchy as a page, not a popup: the
**Category photo** card comes first with a real drop zone, a large preview and an optional inventory
choice, then the name/short description/address/placement cards. The photo is chosen **with** the
category: the form is multipart, the server encodes the file to the square set and writes the category
and its image in one transaction. The old edit-only image section and its image-only route were
removed.

Brands got the same treatment: `/admin/catalog/brands/new` and `/admin/catalog/brands/[brandId]` are a
full **BrandForm** (name En/Bn, slug, mark) with the same shared `CatalogImageField`, a circular mark
preview and a product count. `updateBrand` and audit action `catalog.brand_updated` were added; the
inline "New brand" disclosure on the product list became a link to the new route. The brand list has a
**New brand** action. The old `/api/admin/catalog/category-image` and
`/api/admin/catalog/brand-image` routes were removed rather than kept as a second write path.

**No schema change and no migration.** The image contract is unchanged: `saveUpload` decodes with
`sharp`, strips metadata and re-encodes to WebP at 320/600/1050 squares; the key and metadata come from
the bytes.

**Verification.** typecheck, lint (0 errors), `check:i18n`, unit **212/212**,
`tests/db/catalog.test.ts` **37/37** (new brand rename/slug-conflict audit test), `build`. A
dev-server walk-through created a category with an uploaded photo and a brand with an uploaded logo,
renamed the brand and removed both images, observing the stored keys and the audit rows.
`verify:admin` **204/207** - the three failures are the two pre-existing Telegram removal-dialog checks
and the documented absent-CSP assertion. The suite now asserts both create editors expose the local
upload and existing-image choice.

### Changed - 2026-11-06: the overview is a shop back office, not a SaaS dashboard
The owner compared the overview with Zatiq Easy and asked for its better visualisations and quick
actions, without the SaaS product around it. The page now opens on a greeting, a plain-language
subtitle, **View storefront** and **Add product**; the COD worklist still comes first.

The KPI band is five icon tiles: **Revenue today**, **Orders today**, **Active products**, **Total
customers** and **Waiting on a call**. Each states the day's fact and the 30-day context in its note;
the revenue tile carries the sparkline and only the waiting tile uses the warning surface. The revenue
panel gained **average per day**, **peak day** and **items sold** above the chart. Recent orders now
include guest orders (the read used an inner join and hid them) and draw an initials avatar. A new
closing row holds **Out of stock** (published products marked unavailable - a state, never a stock
number), **Top selling** (real units on completed, paid orders) and **Quick actions** (Add product,
COD orders, Categories, Promo codes, Delivery charges, Analytics), each gated by the permission that
protects its destination.

**Deliberately not copied:** subscription/plan/renewal/upgrade prompts, the marketing hero and the
"visit website / copy link" card, website visits, low stock, themes/builder/app/vendor tools, and a
"new order" button. The rule is now recorded in `AGENTS.md`.

**Verification.** typecheck, lint (0 errors), `check:i18n`, unit **212/212**,
`tests/db/admin-orders.test.ts` **12/12** (new guest recent-order check), `build`, `verify:admin`
**203/206** with the three pre-existing failures, and Chromium at 1280 and 390: five tiles, three
closing panels, six quick actions, no horizontal overflow, and the fifth tile spanning the row on the
phone.

### Added - 2026-11-06: Phase 31 - one level of subcategory management
The category editor now offers a **Parent category** picker over live top-level categories. The rule
is **one level**: a parent must itself be a root, a category cannot be its own parent, a child cannot
become a parent (no grandchildren), and a category with live children is locked to the top level.
The service enforces every condition; the picker only lists eligible roots. `parentId` is audited on
create and update, and a refusal returns to the editor that produced it.

The admin list groups a child beside its parent and labels it **In &lt;parent&gt;**; the edit usage
card continues to show the derived subcategory count, and archiving a parent is still refused while a
live child exists (archive the child first - both directions are tested).

The storefront now distinguishes roots from children: the category index, homepage department rail,
header drawer and filter rail show roots only; a parent page lists its live children and includes
their products, a child page's breadcrumb reads **Categories / Parent / Child**, and department
counts include child products. A child whose parent is hidden is shown at the root rather than
becoming unreachable.

**No schema change and no migration** - `category.parent_id` already existed.

**Verification.** typecheck, lint (0 errors), `check:i18n`, `check:catalog`, unit **212/212**,
`tests/db/catalog.test.ts` **36/36** (create child, refuse grandchild/self/parent-with-children,
archive refusal and recovery, move back to top level) and `build`. Through the dev server: created
"Face Masks" under "Skincare", saw the parent's count and lock, moved the child to top level and back,
and verified the storefront index excludes the child, the parent page links it and lists its product,
and the child breadcrumb names the parent. `verify:admin` **202/205** - the three failures are the
pre-existing category-visibility hydration race, the Telegram removal-dialog flake and the documented
absent-CSP assertion; the new subcategory checks pass. `scripts/verify-browser.cjs` had an
over-escaped WebP test (`\\.webp(?:?|$)`) that aborted the storefront suite with an invalid regular
expression; the escape is corrected, so the suite now reaches its later checks instead of exiting early.
`verify:storefront` completed **91/97**; the six failures are on surfaces this phase does not touch -
checks 8 and 32 (product-page image/price), 20 (24px gallery dots), 27d (section link), 36d (the seed's
five departments) and 40b (favicon ink) - and were previously unreachable because the suite aborted at
check 26.

### Changed - 2026-11-06: the add-product page is a real editor with a media picker
The create screen was structurally complete but its Media section only said "images come after the
product exists", so adding a product meant save, navigate back, then upload - the dead end the owner
reported. The product editor now follows the reference's information architecture: the wide column
carries **General information, Media, Pricing, Inventory and Shipping**, and the narrow column carries
the **live preview, Category/Brand, pack size, slug and Publication**.

The Media section is a dashed **drop zone plus Add images** picker. Chosen files preview immediately,
the first is marked **Cover**, and each can be moved or removed. The form posts them under one
`images` field (`multipart/form-data`); the server decodes and re-encodes each file to WebP
(320/600/1050), creates the product, and attaches the photographs in the chosen order in one
transaction. An unreadable file refuses the whole save and returns to the create page with an
explanation; a product is never created without the photographs the owner selected. The same control
on the edit screen appends to the gallery, and new images now append after the existing order instead
of defaulting to position 0.

**Not copied from the reference, deliberately:** stock quantity (availability is a state, ADR 0013),
digital products, rich text, SEO description, buying price, per-product delivery charge, serial /
warranty fields, variant matrix and custom detail fields. The form states the store-wide delivery rule
and links to Settings instead of showing an inert per-product toggle.

**Verification.** Local dev cluster and dev server: created a product with two photographs in one
request - page landed on `/admin/catalog/23?notice=created` with two gallery rows, `sort_order` 0 and 1,
the first `is_primary`, both files written at 320/600/1050; added a third photograph through the edit
form and it appended at `sort_order` 2; posted a non-image file and the save was refused with
`?notice=imageInvalid` and no product row created. typecheck, lint (0 errors), `check:i18n` (1,455
keys) and unit **210/210**. `verify:admin` **197/200**; its three failures are pre-existing and
unrelated to this change - a category-visibility timing race, the Telegram removal-dialog flake, and
the documented "no CSP" assertion. The suite now also asserts the media picker and multipart form on
the create screen. At 390px the picker has no horizontal overflow and its move/remove buttons resolve
to the 40px phone control height.

### Changed - 2026-11-05: a designed file picker, and hero cards stack on a phone
The upload forms rendered the browser's own "Choose File / No file chosen" widget, which read as a
different application beside every 40px admin control. `AdminImageInput` now draws the control: a
40px **Choose image** button (upload glyph, quiet border, hover and visible focus) plus the selected
file's name and size, or "No file selected". The native input is still the real form field, visually
hidden and focused by the label; the browser's compression step, names and validation are unchanged.
This benefits the hero, product, category and brand upload forms because they share the component.

On `/admin/settings/hero`, each carousel row now **stacks on a phone**: the 16:9 banner takes the full
card width and the description field gets the whole column instead of 208px beside a thumbnail.

**Verification.** At 1280 the picker button measures 40×148 and reports `hero-pick.jpg · 6 KB` after a
selection; at 390 the hero card stacks with a 332px input, no page overflow, and the required-file check
still blocks an empty submit. typecheck, lint (0 errors), `check:i18n`, `build`.

### Fixed - 2026-11-05: a guest order opens in the owner panel, and the COD actions share one edge
`adminOrderDetail` inner-joined `customer`, so a guest order (`customer_id = null`) resolved to nothing:
it appeared in the waiting queue and 404'd at `/admin/orders/<reference>`. The join is now a **left
join**, and the customer panel states "Guest order" with the reason instead of inventing a profile. A
database test seeds the guest shape and asserts the detail resolves.

The COD card's Accept/Reject pair could sit two pixels apart at some zooms: the reject form was a block,
so its button rested on a line box with a descender gap while the approve button sat flush. Both action
forms are now flex containers, measured identical (top/bottom equal to two decimals) at 1280/1440/1568.
On the order detail, the destructive partner (`Cancel the order`, `Failed delivery`) now carries
`actionConfirmEnd`, so it ends on the same line as `Mark dispatched` / `Mark delivered` instead of
sitting at the top of the grid beside the note field. Measured identical boxes (459×40, same
top/bottom) on a confirmed order.

### Changed - 2026-11-05: the Telegram alert is a receipt, not a one-liner
A new order now sends the owner a phone-readable receipt: reference and total, the placement time in
`Asia/Dhaka`, every recorded line with quantity, variant and line total, subtotal / discount when one
applies / delivery / total, the delivery area, name, phone, address, the customer's note, and the COD
state. Totals and lines come from the order transaction (`CreatedOrder` now returns them), never
recomputed in the notifier. Section labels are **bold** (owner direction, 2026-11-05): the message is
sent with Telegram's HTML parse mode and every order-supplied value is escaped, so a customer note
cannot become markup. No delivery promise and no reply channel. Verified against a rendered sample and
19/19 Telegram unit tests.

### Changed - 2026-11-05: one letter mark for every category and brand without a picture
A category with no photograph used to draw a category icon, and a brand with no logo drew two initials
on a slug-tinted plate - two placeholder vocabularies for the same gap. Both now use `LetterMark`
(`src/components/LetterMark.tsx`): the **first letter** of the name, uppercase, in the display face
(Bricolage Grotesque 800) at 46% of a circle, on one of four pale plates chosen by the **letter** - so
every "A" in the shop wears the same mark whether it is a category or a brand. The letter is drawn in
an SVG viewBox, so one drawing is correct at a 62px rail circle and a 125px index tile. The old
`brandInitial`/`brandInitials` helpers and the slug-based tone function are deleted.

**Verification.** On a served local build at 1568px and 390px: brand fallbacks render D/D on the same
plate, A on the same plate as any other A, logos still render unfilled and circular; homepage brand rail
and category rail use the same component. typecheck, lint (0 errors), `build`.

### Changed - 2026-11-05: the brand index uses the category circle, and logos fill it
The brand index was a grid of padded squares: a favicon with its own whitespace rendered as a small mark
floating in a large plate, which read as an empty grid next to the category index. Every brand tile is
now a **circle**, exactly like a category, and the logo is contained at 92% of an 8%-inset circle.
`npm run assets:logos` (new) trims each logo's uniform empty border, places it in a square at 92%, and
rebuilds 320/600/1050 WebP; all 60 logo keys were rebuilt and re-uploaded. Initials keep a pale tinted
circle; a real mark gets a white one so its own colours read true.

**Verification.** On a served local build at 1568px the first ten tiles are 125px circles; a logo image
is 103px with `object-fit: contain` and the trimmed 320 WebP is what the browser fetches. Screenshot
reviewed before deploy; production was checked after it.

### Changed - 2026-11-05: the active phone tab is a deep-lavender capsule, not a white one
On the lavender tab bar, the current destination used a white capsule behind its icon, which read as a
hole punched in the bar. It is now `--brand-primary-deep` (#8155ef) with a white glyph (4.7:1); labels
stay ink on the lavender (9.3:1). The capsule's geometry is unchanged (icon padding plus an equal
negative margin, 40x30), so nothing shifts when the destination changes and the active state never fills
the tab cell.

**Verification.** Computed styles in Chromium at 390px: capsule `rgb(129,85,239)`, glyph
`rgb(255,255,255)`, label ink; screenshot of the Home tab reviewed.

### Changed - 2026-11-05: editorial cleanup of index pages and the admin shell
Filler copy is gone from the surfaces a shopper and the owner read first. `/categories` and `/brands`
lost their intro sentences, duplicate section headings and trailing nav footnote, and the category tiles
no longer print a tagline under the name (the tagline remains owner data and still describes the
category on its own listing). `/products`, search results and brand listings keep only the category's
own owner-written blurb as a sub-heading; the generic "every product…" lines were removed.

In the admin, twelve pages lost their one-line descriptions, and the duplicate "Product list", "Category
list", "Brand list" and "Owner accounts" section headings were replaced by section labels (so screen
readers still name the region) along with the notes that explained the obvious. Security and policy
notes remain: audit immutability, COD call-then-decide, delivery areas, guest checkout, storage and
support behaviour.

**Verification.** 22 dictionary keys and the now-dead stylesheet rules were removed (`check:i18n`
1437 keys). typecheck, lint (0 errors), `build`; `/categories`, `/brands` at 390px and the admin
catalog/categories lists at 1280px were inspected in Chromium.

### Changed - 2026-11-05: five circles on a phone row for Shop By Category and Shop By Brand
Both homepage rails showed four circles on a phone, leaving the fifth department behind a swipe with no
reading reason. The shared `Carousel` circle scale is now `(100% - 4*gap) / 5`, so five circles fit at
every phone width; `CIRCLE_RAIL_SIZES` and `BRAND_RAIL_SIZES` moved to `20vw` so the browser asks for the
right thumbnail. At 390px a circle is 62px (48px at 320px), and nothing overflows the page.

**Verification.** Headless Chromium at 320/360/390px: 5 fully visible in both rails at each width, page
overflow 0, circle 48/56/62px; no `<picture>` regressions.

### Changed - 2026-11-05: support links move to the bottom-right corner
The Facebook/WhatsApp rail moved from the bottom-left corner to the **bottom-right** (owner direction),
mirroring the cart box that owns the right edge halfway up: the two floating surfaces no longer sit on
opposite thumbs and cannot overlap. On a phone the rail keeps a 12px inset above the tab bar; from
1024px it uses the page's own 16px margin.

**Verification.** In headless Chromium with temporary local links, the rail measured right 378/390 and
bottom 768/844 at 390px, clear of the cart box (308-390 × 395-449), and 16px from both edges at 1280px.
The temporary links were then cleared.

### Changed - 2026-11-05: phone-sized photographs are compressed before upload, and stale auth rows are gone
A 5 MB photo used to be refused: the request cap is 4 MB and a phone JPEG is routinely larger. Every
admin upload input is now `AdminImageInput`, which decodes the chosen file **in the browser**, scales the
long edge to 1600px and re-encodes it as WebP before the form posts. A 15 MB test JPEG arrived at the
server as **1.2 MB** and was stored as 320/600/1050 WebP. A file the browser cannot decode (HEIC) falls
back to the original and the server's cap still states the refusal.

**Database cleanup (production).** The database was already small (15 MB); the removable data was
stale auth state only. Deleted **97 revoked/expired `staff_session` rows**, **4 used/expired
`staff_recovery_token` rows**, and the soft-deleted upload-probe image row, then `VACUUM FULL`ed those
tables: **15 MB → 14 MB**. No customer, product, order, audit or movement row was touched, and none of
the append-only tables was written.

**Verification.** In headless Chromium against the local admin, a 15 MB JPEG was compressed to 1.2 MB in
the input and uploaded successfully (`imageAttached`), then the probe association and files were removed.
Production cleanup was read back after the statements. typecheck, lint (0 errors), `check:i18n`,
`build`.

### Changed - 2026-11-05: every catalog image is WebP, and a card gets a thumbnail
The owner asked for one pipeline: whatever image is uploaded is compressed once and stored as WebP, and
a card should not download the detail master. `src/server/catalog/uploads.ts` now encodes **WebP only**
at **320 / 600 / 1050** for product, category and brand images (800 / 1600 for hero banners) and records
the 600 frame as the primary. Rendering follows: `ProductPhoto`, `DiscoveryPhoto` and `HeroCarousel` emit
one WebP `srcSet` instead of a `<picture>` with a JPEG fallback, so a 116px circle downloads the 320
thumbnail, a product card downloads 600 and only the detail view asks for 1050. `CATALOG_ASSET_VERSION`
is **3**, because the bytes behind the versioned paths changed.

`npm run assets:optimize` re-encoded the entire stored tree: **2016 keys, 180.3 MB → 40.7 MB** of WebP
(heroes 438 KB → 311 KB). The 5,757 product WebP files and 222 discovery WebP files were uploaded to the
production bucket, and 1,919 `product_image` rows now record `image/webp` with their new byte size. The
old JPEGs and superseded files remain in the bucket as dead bytes; nothing references them.

**Operational finding.** Uploads had been failing with **403** because the configured storage credential
was read-only. A scoped `storage:read,storage:write` credential was created for the production branch and
installed in Vercel (production and preview), so both the deploy-time uploader and the admin upload route
can write.

**Verification.** `check:catalog`, typecheck, unit **207/207**, lint (0 errors), `check:i18n`, `build`;
after deploy the production page was loaded in Chromium and its images resolved as `.webp` at the chosen
widths.

### Fixed - 2026-11-05: the requested owner account exists on the deployment
Production had two placeholder accounts (`admin@`/`demo@queenbees.test`) and no account for
`sdfrnsweety@gmail.com`, which is why the given credentials could not work. The active owner account was
renamed to that address, its password hash was replaced, its live sessions were revoked and the change
was audited as `staff.credential_set`. The credentials were supplied by the owner; no password or hash is
recorded here.

**Verification.** Signed in through `https://queenbees.vercel.app/admin/login` in headless Chromium and
reached the dashboard ("Welcome back, Sweety").

### Fixed - 2026-11-05: catalog images were blocked in browsers that had cached the old storage redirect
The deployed storefront rendered empty category circles, brand logos and product frames while every
image URL answered **200** to an uncached request - the database was fine. `/catalog/<key>-<width>.<ext>`
redirects to Neon Object Storage, and the route had marked that redirect
`public, max-age=31536000, immutable`. When production moved to a different Neon branch, browsers that
had already cached the redirect kept following it to the old bucket, which the CSP no longer allows
(`img-src` names the configured origin), so the image was refused before any byte was read. The
redirect now carries `max-age=300, stale-while-revalidate=86400` - the bytes are immutable, the
**target is configuration** and must be allowed to change. Because a cached entry cannot be recalled,
every rendered catalog path also carries `?v=2` (`CATALOG_ASSET_VERSION` in `src/lib/images.ts`), which
makes this deployment's URLs new while the storage origin stays configuration. The query reaches
neither the bucket nor the local file.

**Verification.** Reproduced in headless Chromium against `queenbees.vercel.app`: the console reported
a CSP violation for `br-lingering-frost-…storage.c-1…`, while the uncached redirect resolved to the
configured `br-polished-wind-…storage.c-2…`; an image loaded with a cache-busting query succeeded.
After the change, the same browser loads every homepage image with `?v=2` and no failures. typecheck,
unit **207/207**, `check:catalog`.

### Changed - 2026-11-05: the favicon is the owner's logo
The browser tab now carries the same mark as the header. `npm run assets:brand` writes
`public/brand/favicon-32.png` and `favicon-192.png` as **round PNGs with a transparent outside** (the
same crop the header applies with CSS), plus an opaque square `apple-touch-icon.png` because iOS masks
the icon itself and flattens transparency. `src/app/layout.tsx` links them through the metadata `icons`
field; the retired `public/brand/favicon.svg` (the reversed crown tile) was deleted rather than left
unreferenced.

**Verification.** The generated files measure 32x32, 192x192 and 180x180; at 16px the outer corners are
transparent and the ink survives. In headless Chromium the metadata links resolve to the PNGs and
`verify:browser` checks 40/40b assert the round icon, the Apple link and the absent SVG. typecheck,
lint (0 errors), `check:i18n`, `build`.

### Changed - 2026-11-05: primary lavender is #C8B6FF
The owner asked for one more shift of the brand lavender: `--brand-primary` is now **#C8B6FF** (was
`#DCCFFF`), and the filled-control field follows it through `--color-button`. Hover deepens to
`#B9A4FF`. Ink `#201A29` measures **9.34:1** on the new field and white measures **1.81:1**, so filled
controls keep ink labels and glyphs; white-on-lavender stays unused. `--brand-primary-deep` (#8155EF)
is unchanged for the two surfaces that do carry white marks. The admin shell's brand mark uses the new
hex, and the docs' hex references and contrast rows were updated.

**Verification.** typecheck, lint (0 errors), `check:i18n`, `build`; computed styles in Chromium.

### Changed - 2026-11-05: single-letter brand monograms

A brand with no logo in the homepage Shop By Brand rail no longer shows two initials in a bare white
circle. It shows **one letter** from the stored name, set in the display face at about 34% of the
circle, on one of the four pale plates the square brand tile already uses (lavender, pink, mint,
warm), chosen deterministically from the brand's slug. The plate is a tone step with no ring or
shadow, so a run of letter tiles reads as a deliberate set. Category circles and logo tiles are
unchanged.

### Changed - 2026-11-05: filled storefront controls take the light lavender

Every filled storefront control - primary actions, add to cart, checkout, campaign CTA, support discs,
the floating cart box and the account/auth primary button - now uses the owner's `#dccfff` field with
ink (`--color-button` / `--color-button-ink`) instead of the deep plum. Hover is `#cdbcff`. Badges,
checkbox marks, range fills and current-page indicators keep `--color-action` because they are not
buttons and need a saturated mark. Admin primary buttons take the same field; admin danger buttons
and navigation states keep their own colours.

The account hub rebuild was reverted at the same time; the docs' primary hex and contrast notes were
corrected to the measured values (ink 11.61:1, white 1.46:1 on `#dccfff`).

**Verification.** typecheck, lint (0 errors), `check:i18n`; browser checks confirm the add-to-cart
button computes `rgb(220, 207, 255)` and the cart's primary action does too, and `/account` renders the
previous card grid.

### Changed - 2026-11-05: in-stock shelves, listing cart controls, a sliding hero and a new account hub

**Homepage availability.** `selectHomepage` filters the catalogue to In Stock once, before every
product row is selected, so the homepage can never advertise a product that cannot be ordered. The
catalogue-empty state still describes the catalogue, not the filtered list.

**Listing.** `/products` and category listings pass `addToCart`, so every card in the grid carries the
same Add to cart control as a homepage card. Related products on a product page still omit it.

**Hero.** The homepage carousel advances every 9 seconds and wraps from the last banner to the first;
the arrows wrap too instead of disabling. Hover and keyboard focus pause the timer, and
`prefers-reduced-motion` stops autoplay. No play/pause control was added (owner direction).

**Account.** A `framed-sheet` rebuild was tried and then **reverted on owner feedback**; `/account` is
the previous card-grid hub again (orders, details, password help, session). The floating cart stays
hidden on account routes.

**Verification.** typecheck, `check:i18n` (1,476 keys); browser checks at 1280 and 390px for the hub
(one real order placed through checkout), the listing cards' Add to cart, zero out-of-stock cards on
the homepage, and hero auto-advance measured as 0 → 1216px → 0 (loop) at 9-second intervals.

### Changed - 2026-11-05: brand lavender, circular imagery, browser uploads and a working production target

**Storefront.** The brand anchor changed to the owner's light lavender `#dccfff`; the phone tab bar is
that field with ink labels and a white capsule behind the current icon. The floating cart box is centred
on the right edge at every width and the support rail moved to the bottom-left corner. Category and
brand rails no longer print taglines or product counts under their names, and neither rail carries a
"view all" line beneath it. A brand mark now **fills** its circle with `object-fit: cover`, the same
frame a category photograph uses.

**Browser uploads.** The owner can upload from their computer for product photographs, category
photographs, brand logos and hero banners. `src/server/catalog/uploads.ts` decodes with `sharp`,
applies EXIF orientation, re-encodes each surface to its declared frames, strips metadata and refuses
anything that is not a readable image (4 MB cap). Bytes go to `public/catalog` when writable and to the
configured object-storage bucket; a deployment with neither refuses instead of reporting success. New
route `/hero/[...path]` resolves an uploaded banner from storage. `npm run assets:upload:catalog`
uploads the imported product tree that a deployment does not carry.

**Admin.** The image editors gained their upload forms, previews are circles, and the phone bottom
navigation uses the same lavender field as the storefront.

**Production wiring (not deployed).** The dedicated `queenbees` Neon project now holds the migrated schema
and the restored catalog, with a public `catalog` storage bucket whose imported product tree was uploaded.
Vercel's project environment was pointed at it, including new storage credentials. **No deployment
succeeded:** every new Vercel deployment (CLI and git) is returned as `Blocked` by the account before it
builds, and the MCP connection's OAuth token expired mid-session. The existing production alias therefore
still serves the old 500, and the deployment step remains open.

**Verification.** `typecheck`, `lint` (0 errors), `check:catalog`, `check:i18n` (1465 keys) and `build`
pass. Browser checks were run against the local dev cluster for the tab bar, rails, floating chrome,
sign-in, and one upload through each of the four real admin routes. The full `verify:*` suites and real
devices were not re-run.

### Changed - 2026-11-02: storefront discovery redesign (mobile-first)

The storefront's homepage, category index and product page were rebuilt as a **picture-led, mobile-first
shopping surface**. Everything a customer can buy is still read from the same catalog snapshot; nothing is
mocked, no claim was added, and no checkout, cart, order or admin path changed behaviour.

**Homepage.** New order, chosen for a phone: hero, **offers**, **category rail**, the owner's featured row,
**brand rail**, new arrivals, and the browse row. The hero is a compact band on a phone - headline, two
actions, and a **spotlight row** of the two newest products with their prices - and the three-frame
composition from 1024px up. Offers are a CSS scroll-snap shelf (1.6 cards visible on a phone, four on a
desktop) with previous/next controls and slide jumps above 1024px; there is no autoplay, no timer and no
JavaScript-driven scrolling. The category rail is a strip of **square photographs** on a phone and a
wrapping grid from 720px. The brand rail shows each brand's verified mark, or its initials. Sections never
repeat a product between them.

**Category index.** A grid of **square photographs** (2 across on a phone, 5 from 1024px) with the name, a
one-line label and the real product count, followed by a twelve-brand teaser into `/brands`. Every tile
links to its category page.

**Product page.** The gallery is a **square** on a phone and 4:5 above 480px, and the media column is capped
at 480px on a desktop with the price and facts beside it rather than below a full-height photograph. Title
size is 22px on a phone. A **purchase bar** appears once the gallery and the in-page purchase block have
scrolled away, so the price and the add button stay reachable without covering the first screen. The
breadcrumb now includes the brand and stays on one line.

**Brands.** New `/brands` index and `/brands/<slug>` listing. Every brand tile shows the brand's own logo
where one was verified, and its **initials** otherwise. The listing reuses `CatalogView`, so department,
price, availability, search, sort and paging all work on a brand page exactly as on `/products`.

**Category imagery is owner-managed.** `category` gained `image_key`, `tagline`; `brand` gained `logo_key`
(migration `0012`, additive). The category editor can associate any image from the shop's own asset
inventory, clear it, and edit the one-line label; the storefront then renders that photograph, and falls
back to the category's icon when none is set. `npm run assets:discovery` builds the square category
photographs from a recorded licence list and fetches brand logos from each brand's **own site** (verified by
the domain's `<title>`), writing them into `public/catalog` in the same two-width form product photography
uses. A brand whose logo cannot be verified keeps `logo_key = null`.

**Curation.** `npm run seed:discovery` writes the two curated collections from stated rules over the live
catalog (`featured`: one product per busiest department; `collection`: four from each of the three busiest),
records the shipped category photos and labels, and syncs brand logo keys both ways.

**Honesty.** No rating, review, countdown, "best seller", invented discount or delivery promise was added.
Every price, count and discount on the new surfaces is derived from stored rows.

---
### Fixed - 2026-10-30: the mobile status filter on /admin/orders

Owner report: the sliding **All / Pending / Confirmed / …** filter was hard to use on a phone. Measured first:
at 390px the rail held **659px of tabs in a 358px box**, so four of the eight statuses (Completed, Cancelled,
Returned and part of Delivered) sat behind an edge fade, an active filter past the fold never scrolled into
view, and the fade dimmed the last reachable tab until it looked disabled.

- **Above 720px nothing changes** - the segmented row still shows every option at once.
- **At and below 720px the filter is a 40px disclosure** whose closed summary names the filter in force
  ("Filter by status · Returned"), opening into a list where every status is a **40px row** with its count and
  the chosen one is filled and checked. No swipe, no clipping, no invisible state, and one row of screen
  instead of three.
- The **date-range filter shares that column**, so a phone toolbar reads as stacked 40px rows instead of one
  full-width control beside a 163px pill.
- Both renderings come from the same `FilterTabs` component and the same URLs; only one is ever displayed,
  so the server-side filtering, `aria-current`, bookmarkability and no-JavaScript behaviour are unchanged.
- Analytics' three-period switch is untouched and still visible as chips on a phone.

**Verified 2026-10-30** (headless Chromium against the running app, owner session): at 320/390px the
disclosure is shown and the segmented row hidden, the closed control is **40px** and names the filter, no
sideways scroll (320 = 320, 390 = 390); opening it reveals **8 options, every one 40px**, the accessibility
tree reports `role: DisclosureTriangle, expanded: false -> true`, choosing "Returned" filters the list and the
closed control then reads "Filter by status · Returned"; at 1280px the segmented row is back and the
disclosure is not rendered; analytics keeps its 3 visible period chips; the height sweep on
`/admin/orders`, `/admin/categories` and `/admin/analytics` at 390px finds **40px** for every toolbar control
(48px and 64px belong to the app shell's navigation, not the page). Plus `typecheck`, `lint` (0 errors,
3 pre-existing warnings), `check:i18n`, unit **208/208**, `build` green, and the design detector on the two
changed files returns **no findings**. Docs updated: `docs/design-system.md` (the filter rule, and what may
never be collapsed with it) and `AGENTS.md`.

### Added - Phase 50 (2026-10-30): the product page shows every photograph it has

- **A thumbnail strip under the main frame** on `/products/[slug]`, one button per stored image, in the
  owner's order. Selecting one swaps the main photograph; the chosen thumbnail is marked with shape and
  colour and carries `aria-pressed`, and the strip only exists when there is more than one image, so a
  single-photo product renders exactly as it did.
- The strip is a **scroller inside its own box** (`overflow-x: auto`, `contain: layout paint`), so a
  product with seventeen photographs cannot widen the page. Thumbnails are 72px at the catalog's own 3:4
  ratio (above the phone's 40px touch floor), are real buttons (keyboard operable), and their inner image
  is decorative because the button's label names the photograph.
- Two strings added (`product.gallery`, `product.galleryThumb`); i18n is 1277 keys.

### Verification recorded - Phase 50

- `typecheck`, `lint` (0 errors, 3 pre-existing warnings), `check:i18n` 1277 keys, unit **208/208**,
  `build` green.
- Against the **real imported catalogue** (1,605 products, 1,919 photographs): `/products/facial-sheet-mask`
  server-renders **17 thumbnails**; a single-photograph product renders **0**.
- Headless Chromium at 390px on that page: **6/6** - 17 thumbnails, exactly one pressed initially, no
  horizontal overflow (`scrollWidth === innerWidth === 390`), choosing the fifth thumbnail moves
  `aria-pressed` and swaps the main frame to that photograph, and the main image keeps a product
  description as its alt text.
- The admin list's new row photographs were re-checked against the same catalogue: 25 rows, 25 images on
  the first page.
- **Not run:** `verify:browser`, `verify:admin`, `verify:ui`, real devices, screen readers.

### Demo session (local only)

The project was left running on `http://localhost:3000` against the persistent development cluster
(`.dev-pg`, 1,605 products). `demo@queenbees.test` had no recorded password, so a **single-use
credential token** was issued for it through the application's own issuer and redeemed at `/admin/redeem`;
its password is now `queenbees-demo-2026` **in this local database only** (the reset revoked the account's
other sessions). Use `localhost`, not `127.0.0.1`: Next 16's dev server blocks its own dev resources on a
foreign host, and without them no page hydrates.

### Added - 2026-10-30 (owner request): a product photograph on every admin list row

- **`/admin/catalog` shows each product's photograph beside its row**, so the owner can recognise a
  product by sight instead of reading a 40-character vendor name. A 48×64 frame (3:4, the catalog's own
  aspect), lazy-loaded, decorative (`alt=""` - the row's title already names the product), with an empty
  frame rather than a broken icon when a product has no image.
- The image is **derived from the record's key** through a new `imageVariantPath()` in
  `src/lib/images.ts`, which the media panel now uses too instead of hardcoding its path. No stored URL,
  no new asset variant: the 600px JPEG is the only small width the generated set has.
- The list's primary image now falls back to the **first ordered image** when no image is flagged primary
  (`order by is_primary desc, sort_order asc, id asc`), so a row cannot show an empty frame while the
  product's own page shows a photograph.

### Verification recorded

- `typecheck`, `lint` (0 errors, 3 pre-existing warnings), unit **208/208**, `build` green.
- Served build with a real owner session: `/admin/catalog` renders **22 rows and 22 frames**, the first
  image path (`/catalog/<key>-600.jpg`) answers **200**; headless Chromium at **320 / 390 / 1440px**
  shows every frame at exactly 48×64 with at least one image decoded (the rest are lazy), and
  `document.scrollWidth <= innerWidth` at each width.
- Not run: `verify:admin`, real devices. No schema change, no migration, no new dependency.

### Changed - Phase 49 (2026-10-30): one receipt route for every order

- **The receipt moved to `/orders/<number>`.** It used to live at `/account/orders/<number>`, which was
  wrong for a guest (no account) and wrong in its access decision: the page branched on the *presence*
  of a session cookie, so a guest whose browser still held an expired or revoked session was treated as
  a customer, redirected to sign in, and could not see the order they had just placed. Anonymous is now
  "no **resolved** session", the same rule the checkout page already uses.
- **One canonical URL, one redirect.** `/account/orders/<number>` now permanently redirects (307, with
  the `placed` marker preserved) instead of rendering a second copy of the same receipt. The order list
  and the post-order redirect both use the canonical path through `src/lib/order-paths.ts`.
- **Guest copy stops pretending there is an account.** A guest sees "Your order" rather than "My
  orders", gets no link to an order list they cannot open, and is told plainly that this address is the
  only way back (the shop publishes no self-service lookup - OD-2 is still unanswered).
- The database still decides what a guest may read: `getGuestOrderDetail` matches `customer_id is null`,
  so a customer's order number is a 404 without that customer's session.

### Fixed - Phase 49

- **AUD-04** - a guest receipt no longer depends on the cookie jar being empty, and no longer lives in
  the account tree.
- **AUD-07** - the header's compact search control (1024-1199px) now links to `/products#catalog-search`
  and the catalog focuses the field on arrival, instead of dropping the shopper at the top of the listing.
- **AUD-10** - the asset inventory is cached in-process against the directory's modification time and a
  copy is handed out, so the admin media panel stops rescanning ~15.5 thousand entries per render.
- **AUD-27 to AUD-31 (documentation drift)** - README route table, `ui_bug.md` closure, the stale
  "noindex demo" wording in `docs/project-status.md`, a pointer from the old plan to this one, and a
  schema-count authority note in `AGENTS.md`.

### Verification recorded - Phase 49

- `typecheck`, `lint` (0 errors, 3 pre-existing warnings), `check:i18n` 1275 keys, unit **208/208**
  (the cache-contract test added), `tests/db/orders.test.ts` **14/14** with guest/customer read scoping,
  `build` green with `/orders/[orderNumber]` and the legacy redirect both present.
- The **HTTP customer flow** (`scripts/customer-flow.ts`) against the served build: **34/34**, including
  the updated receipt URLs, the dead-cookie receipt, the legacy redirect, and the pre-existing
  registration, order, replay, foreign-order and banned-customer checks.
- Served build over HTTP: a guest order redirects to `/orders/<number>?placed=1`; that receipt returns
  200 with the "Order placed" heading, the keep-this-link sentence, no "My orders" wording and **no**
  `/account/orders` link; the same receipt returns 200 with a dead `qb_customer_session` cookie; the
  legacy `/account/orders/<number>?placed=1` answers **307** to the canonical URL; an unknown number is
  404.
- Headless Chromium at 1100px: `/products#catalog-search` focuses `#catalog-search` (the compact control
  is visible and the field is rendered).
- **Not run:** `verify:browser`, `verify:admin`, `verify:ui`, real devices, screen readers. The
  flow's first two attempts were contaminated by leftovers from the aborted runs (a replayed idempotency
  key and a recovery-token hash); the tables were cleared and the third run is the recorded one.

### Changed - Phase 48 (2026-10-30): cart safety

- **Clearing the cart takes two deliberate steps.** The single-tap `Clear cart` control is now a
  question in place - "Clear all N items from your cart?" with **Yes, clear cart** and **Keep items** -
  that states the count, names the consequence, has no timer, and cannot be dismissed by scrolling
  away. Focus moves to **Keep items** when it opens, Escape closes it, and both closing paths return
  focus to the trigger. Five interface strings (i18n now 1273 keys).
- No dialog was added and no dependency; the question replaces the trigger inside the cart summary, so
  the answer sits beside the total it would remove.

### Verification recorded - Phase 48

- `typecheck`, `lint` (0 errors, 3 pre-existing warnings), `check:i18n` 1273 keys, unit **207/207**,
  `build` green.
- Served build, headless Chromium (390px): **12/12** - three lines render with the trigger; opening the
  question clears nothing; the prompt states the item count; both answers are offered; focus lands on
  "Keep items"; Escape closes it, keeps every line and returns focus to the trigger; "Keep items" does
  the same; "Yes, clear cart" renders the empty cart and empties the stored cart.
- At **320px** with the question open: `scrollWidth === innerWidth === 320`, block within the viewport.
- **Not run:** full browser/admin/db suites, real devices, screen readers.

### Still open after Phase 49

- The address model question (OD-1) and the guest order lookup question (OD-2) are still unanswered.
- The product gallery (AUD-05), dispatch paperwork (AUD-11), delivery/security work and the policy
  decisions remain scheduled in `docs/implementation-plan-2026-10-30.md`.

### Added - Phase 47 (2026-10-30): checkout integrity, guest promo parity, explicit validation

- **Guest checkout can use a promotion code.** The preview endpoint
  (`POST /api/checkout/promo`) now admits exactly the callers the order route admits, through one
  shared resolver (`src/server/checkout/submission.ts`): a signed-in customer with a session-bound
  CSRF token, or a guest while the owner's switch is on, from this origin. Previously the preview kept
  the session-only guard after guest ordering shipped, so every code failed for a guest with no
  explanation.
- **The checkout form reports what is wrong in its own words.** `CheckoutForm` is `noValidate`, computes
  the invalid fields on submit, renders a named summary in a role="alert", marks each control with
  aria-invalid and focuses the first one. The rules live in `src/lib/checkout-fields.ts` and are shared
  with `parseContact`, so the form and the server cannot disagree about bounds or the phone shape.
- Ten interface strings (summary, one per field, and a sign-in notice for the promo control): i18n is
  now 1268 keys.

### Fixed - Phase 47

- **A repeated guest submission returned a conflict instead of the order it had just created.**
  `loadCreatedOrder` matched `customer_id = 0` as the guest sentinel, and a guest order is written with
  `customer_id is null`, so the replay found nothing and the customer saw "that submission was already
  processed" on a screen with no order list to send them to. The match is now `is not distinct from`,
  with a database test for the guest replay and for a customer who tries to claim a guest's key.
- **Cross-origin and bad-CSRF requests are still refused**, and the guest switch still gates both
  endpoints: with it off, the preview answers 401 and the order route redirects to sign-in.

### Verification recorded - Phase 47

- `typecheck` pass; `lint` 0 errors (3 pre-existing unused-var warnings); `check:i18n` 1268 keys;
  unit **207/207** (7 new in `tests/unit/checkout-fields.test.ts`); `tests/db/orders.test.ts` **14/14**
  against real PostgreSQL (1 new); `build` green.
- Served production build, driven over HTTP: guest preview of an unknown code → 200
  `{"ok":false,"reason":"unknown"}`; cross-origin → 403; invalid lines → 400; guest order → 303 with
  total 87000 (75000 + 12000 delivery); replaying the same key → 303 to the same order with no second
  row; a real 10% code previewed 7500 off and the created order snapshotted 75000/7500/12000/79500 with
  one redemption row; guest switch off → preview 401 and order 303 to sign-in.
- Headless Chromium on the same build: 9/9 checks — the form is `noValidate`, no summary before the
  first submit, an empty submit lists all six problems, focus moves to the recipient name, invalid
  controls carry `aria-invalid="true"`, the page stays on `/checkout`, and correcting the fields
  clears the summary and the marks.
- **Not run:** the full `verify:browser`, `verify:admin`, `verify:ui` and `test:db` suites; real
  devices; screen readers. The probe cluster and its data directory were removed afterwards, and no
  repository state depends on them.

### Still open after Phase 47

- The **address model** question (district + area + city, or a derived city) remains unanswered, so the
  fields were left exactly as they were. It is OD-1 in the plan.

---

## 2026-10-30
## 2026-10-30

### Changed - Phase 46: verification that can fail, and a cadence that respects the clock

- `verify-browser` is catalogue-derived: pagination total, card prices, filter links, a discounted
  sample and the card frame are read from the catalogue under test instead of pinning fixture values.
- A fact a browser cannot establish is now a stated **SKIP** with its reason; a skip is never counted as
  a pass. `verify-storefront` passes `QUEENBEES_EXPECTED_RECENT` so the recency assertion still runs.
- Verification cadence (owner decision): `npm run verify:ui` (nine checks, ~1 minute) per change; full
  suites at a checkpoint or on request; never a suite quoted as evidence for a change it did not cover.
- Guest checkout coverage added to `scripts/customer-flow.ts`: refused while the switch row is absent,
  cross-origin post refused, one guest order with `customer_id = null` and an `order_placed` event with
  `actor_type = 'guest'`, receipt access rules, and cleanup that leaves no order rows.

### Verification recorded

`verify-browser` 91/91 with 7 stated skips on the imported catalogue; `verify:storefront` 95/95 browser
plus 32/32 HTTP; `verify:admin` 200/200; `verify:ui` 9/9.

---

## 2026-10-29

### Changed - Phase 45b: the cart page loads the cart, not the catalogue

- Cart line ids are mirrored into a first-party cookie `qb_cart` (ids only, `path=/`,
  `SameSite=Lax`, 30 days, removed rather than emptied). `/cart` and `/checkout` project only those
  products, taking them from ~81 KB to ~9 KB gzipped.
- A cart/cookie mismatch triggers one bounded refresh, then states that a line could not be loaded;
  `/checkout` refuses to submit in that state.
- New unit tests for the cookie parser (id shape, duplicates, 40-id cap, truncation).

### Added - Phase 45: the storefront stops shipping the catalogue

- Homepage selections resolve on the server; the layout passes the cart only ids; `/cart` and
  `/checkout` receive the compact projection they draw.

### Verification recorded

Headless Chromium cart clicks (cookie written, one and five lines rendered), deleted-cookie recovery,
refused-cookie state, tampered-cookie rejection; `typecheck`, `lint`, `check:i18n` (1249 keys), unit
200/200, database 258/258, `build`.

---

## 2026-10-23

### Added / Changed

- **Phase 44:** the storefront survives the real catalogue - header shows four busiest departments plus
  "All categories" (was fifteen, which made every page scroll sideways), `/products` paginates at 48
  (1,508 DOM nodes instead of 22,752), homepage strip is four tiles, footer lists five plus the index,
  the 245-brand facet scrolls in its own panel. 0 of 44 route × width combinations overflow.
- **Phase 43:** one-off import of the owner's previous store - 1,605 products (128 archived), 245 brands,
  15 categories, 1,919 image derivatives, 528 customers, 559 orders with 1,648 line items and one
  `order_placed` event each, via `npm run import:zatiq -- --reset`.
- **Phase 38 (ADR 0021):** dashboard figures, `/admin/analytics` (7/30/90-day windows, hand-drawn SVG
  charts, no chart library), promotion codes as a rule plus an append-only redemption and an immutable
  `order.discount_minor`; migration `0008`, schema 43 → 45 tables.
- **Phase 37 (ADR 0020):** storefront presentation leaves "demonstration" - demo notice removed, homepage
  order settled as featured, offers, recently added, more to explore.

### Verification recorded

Phase 44: 0/44 overflow combinations, unit 194/194, `typecheck`, `lint`, `check:i18n` (1245 keys).
Phase 38: unit 178/178, database 255/256 (one pre-existing failure the uncommitted migration invalidated),
plus a Chromium walk-through from creating a code to reading a completed order's figures; `verify:browser`
and `verify:admin` were not run against the new screens.

---

## 2026-10-21

### Added

- **Phase 35:** the product editor becomes its own route (`/admin/catalog/new`, `/admin/catalog/[id]`);
  `?new=1` and `?edit=` removed. Explicit validation summary and first-invalid-field focus.
- **Phase 30:** one list vocabulary across the admin lists (toolbar, active-filter chips, empty states,
  pagination).
- **Phase 29 (research):** Zatiq Easy admin reference audit and feature-parity specification.

### Changed

- **Phase 28:** the interface becomes English-only (one dictionary, one `html lang`, no locale store);
  the owner edits the announcement bar at Settings → Announcement.
- **Phase 27:** one admin control scale (`--admin-control` 40px, `--admin-control-sm` 34px growing to 40px
  below 720px), and honest decision feedback.

### Verification recorded

`verify:admin` 97/97 at Phase 35; control-scale sweep added in Phase 27.

---

## 2026-10-20

### Added

- **Phase 23 (ADR 0019):** owner-operated customer credential reset - 256-bit one-time code, stored only
  as a SHA-256 digest, 30-minute expiry, single use, supersedes any earlier code, revokes live sessions on
  issue and on redemption; suspended/deleted accounts refused with one indistinguishable outcome.
- **Phase 22 (ADR 0018):** per-order additional courier costs - immutable amount/description/actor,
  `DELETE` refused, mistakes voided with a required reason; committed in the same transaction as payment
  receipt; dashboard reports four separate amounts and never collapses them. Migration `0005`, 43 tables.
- **Phase 21 (ADR 0017):** COD workflow corrected - payment received and completion are one owner action
  from `shipped` or `delivered`; revenue is derived `sum(order.total_minor)` over completed and paid orders.
- **Phase 20:** order history, order detail and the transition endpoint; customer moderation.
- **Phase 19 (ADR 0016):** three-area delivery charges (Dhaka / Chattogram / Other districts), owner-
  configured, priced server-side, snapshotted on the order; an unconfigured default refuses checkout.
  Migration `0004`, 42 tables.
- **Phase 26:** three recently added products on the homepage by stored `created_at`.

### Verification recorded

Phase 23: unit 140/140, database 234/234, `verify:admin` 150/150, `verify:storefront` 65/65 + 27/27 HTTP.
Phase 22: database 221/221, `verify:admin` 143/143 including recording a cost through the real route.

---

## 2026-10-15

### Added

- **Phase 15:** first-party customer authentication (scrypt, hashed session tokens, idle + absolute
  expiry, account- and source-keyed throttling, customer-scoped CSRF) and atomic, server-authoritative
  order creation with an idempotency key claimed inside the transaction; no reservation, deduction or
  movement is written (ADR 0013).
- **Phase 14 (ADR 0011):** storefront catalog cutover - the storefront reads the database through a
  server-only typed accessor; the fixture survives only as the deterministic local/test seed and a
  development-only opt-in, never as a fallback. No public catalog endpoint.

### Removed / Changed

- Phase 14 removed the storefront's dependency on `src/data/catalog.ts` as the served source.

### Verification recorded

Phase 15: unit 109/109, database 165/165, `verify:admin` 97/97, `verify:storefront` 65/65 + 16/16 HTTP.
Phase 14: database 144/144, `verify:admin` 97/97, `verify:storefront` 65/65.

---

## 2026-10-11 through 2026-10-12 (design and foundation)

### Added

- **Phase 11:** local database foundation - 39-table schema (**40** after `staff_recovery_token`), reviewed
  migrations, server-only typed data access, strict environment validation, least-privilege grants,
  append-only enforcement by revoked grants **and** triggers.
- **Phase 10:** the design of record - `docs/data-model.md` (schema, eight state machines, transactions,
  retention, authorization) and `docs/security.md` (authorization matrix, 16-part threat model).
- **Phase 9:** provider decisions - D1 Neon PostgreSQL, D2 Vercel, D3 Neon Object Storage, D7 manual
  bKash/Nagad/COD (later narrowed), D8 claim fields (later withdrawn), D9 policy, D12 account-required
  checkout.
- **Phase 8 (ADR 0004):** strategic reset to an independent platform; Zatiq Easy becomes a UX reference
  only.
- **Phases 0-7:** audit, working storefront, mobile-first UX, brand mark, layout widths, roadmap reset, and
  the merchant-backend capability audit (authorization spent; do not repeat).

---

## 2026-10-12 onward - owner decisions implemented since

- **ADR 0009:** owner-only administration; availability as an owner state; ban after a confirmed fake
  order, enforced server-side.
- **ADR 0010 / 0013:** availability is the only ordering gate; no reservation; overselling accepted.
- **ADR 0012:** first-party customer identity; no self-service recovery; no external provider.
- **ADR 0015:** Cash on Delivery only; manual prepaid flow removed (routes 404, schema retained unused).
- **ADR 0022:** advisory Telegram order alerts, env-only token, failures swallowed.
- **ADR 0023:** a ban is reversible with a reason and touches no order or session.
- **ADR 0024:** guest checkout behind an owner switch; otherwise sign in with the cart preserved.

---

## Contract for future entries

- One entry per phase, dated, naming the phase number and any ADR.
- Sections: Added / Changed / Fixed / Removed / Security / Verification recorded.
- Every behaviour change names where it is verified. A documentation-only entry says so.
- Nothing is ever recorded as deployed, released or paid for. Provisioning, deployment and DNS changes
  are separate owner authorizations and get their own entries when they happen.
