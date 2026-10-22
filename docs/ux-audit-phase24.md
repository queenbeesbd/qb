# Phase 24 - Storefront and Admin UX Audit (audit only)

Status: **audit complete, no application change made**. Date: 2026-10-20.
Scope: the locally served application (Next.js 16.4, dev server), the seeded catalog
(22 products), one customer order created in a **disposable** audit database, and the
existing verification suites.
Author: implementation agent. Everything below is evidence from that environment unless
marked **unverified** or **hypothesis**.

> **Boundaries observed:** no application code, style, test, schema, migration or
> configuration was edited. No project database was modified: the browser audit ran against
> a throwaway local PostgreSQL cluster created for this audit (`/tmp/audit/pg`, port 55433)
> and removed afterwards. The project development database (`queenbees_dev`, port 55432)
> was read only. Nothing was staged, committed or pushed. `.codegraph/` was left untouched.

---

## 1. Executive summary

The storefront is technically sound: no horizontal overflow at any width from 320px to
1920px, correct money rendering, honest availability copy, focus-visible rings, skip links,
a real add-to-cart live region and a checkout that prices delivery server-side. The admin
panel is functionally complete and its 150-check browser suite passes.

The problems are **hierarchy, density and affordance**, not correctness:

1. **Product cards are oversized** and the desktop grid stops at four columns. On the
   homepage at 1440px a card is **320 x 620px** with a **424px** image; the catalog at
   1920px is **250 x 526px**. Five columns would be ~254px on the homepage, which is
   workable; on the catalog page it would be ~144px, which is not, because the filter
   sidebar takes the space.
2. **My Account is the weakest link in the header.** On desktop it is the last text link
   in a seven-item category nav; below 1024px it exists only inside the drawer, after six
   category links and a checkout link.
3. **Add to cart gives text, not a next step.** The only feedback is a 22px inline status
   line ("কার্টে যোগ হয়েছে"); there is no *View cart* or *Continue shopping* action.
4. **The header search collapses to unusable width at the 1024px breakpoint.** In Bangla
   the search input is **15px wide** at 1024px (container 79px). It is not a hint of a
   field; it is a field that cannot be typed into.
5. **The admin panel has no single control scale.** Buttons are 34px or 40px, inputs are
   40px or 51px in the *same form*, and the approve (40px) and reject (34px) buttons in one
   decision pair do not match.
6. **A saved delivery charge is not echoed back into its input.** After saving ৳80 the
   screen prints "৳৮০" but the amount input is empty, so every edit starts by retyping.

Two of the requested changes need an owner decision rather than an implementation:
**"three most recently added products"** contradicts the approved rule that the storefront
publishes no date-added field and never implies recency, and the current data cannot
support it: all 22 seeded products share **one** `created_at` value.

Recommended first implementation phase: **Phase 25 - storefront navigation and purchase
feedback**, detailed in section 10.

---

## 2. What was actually inspected

### Routes

Storefront (all reachable, verified by request):

| Route | Inspected |
| --- | --- |
| `/` | yes, 1440/1920/1280/1024/390/360 |
| `/products` | yes, 320-1920 |
| `/products/[slug]` | yes, desktop + 390 |
| `/categories/[slug]` | via header link (not measured separately) |
| `/cart` | yes, empty + one line |
| `/checkout` | yes, anonymous refusal, signed-in, area selected, 390 |
| `/account` | yes, signed-out and signed-in |
| `/account/login`, `/account/register`, `/account/recover` | yes |
| `/account/orders`, `/account/orders/[orderNumber]` | yes, with a real sandbox order |
| `/admin/login`, `/admin/redeem` | login inspected; redeem not driven |

Admin (owner session, permission-filtered rail):

`/admin`, `/admin/orders-cod`, `/admin/orders`, `/admin/orders/[orderNumber]`,
`/admin/catalog` (+ edit form), `/admin/categories`, `/admin/customers`,
`/admin/customers/[id]`, `/admin/settings/delivery`, `/admin/owners`, `/admin/audit`.

### Viewports and locales

- Widths measured: **1920, 1600, 1440, 1280, 1100, 1024, 940, 900, 820, 768, 720, 600,
  430, 390, 360, 320** (storefront catalog grid); 1440/1920 and 390/360 for other surfaces.
- Languages: **Bangla (default)** throughout; **English** measured on the homepage and the
  header at 1024/1100/1280; admin measured in Bangla.
- A sandbox customer order was placed to obtain real order cards, order history and order
  detail pages.

### Tools

- Headless Chromium driven over the DevTools Protocol with a small `/tmp` script (no new
  dependency); DOM geometry, computed style and state assertions.
- `npm run verify:admin` - **150/150 checks passed** (real HTTP + Chromium, disposable
  cluster, production build) during this audit. It supplied independent evidence for the
  admin flows and produced screenshots in `/tmp`.
- SQL read queries against the project development database (product timestamps only).
- **Not used:** axe-core or any automated accessibility engine (not installed), Lighthouse,
  a screen reader, real iOS Safari / Android Chrome, 200% zoom reflow.
- Screenshots were captured as review artefacts (see section 11), but this audit's claims
  are based on **measured DOM geometry and computed styles**, not on visual inspection of
  the images.

---

## 3. Storefront findings

### 3.1 Homepage and discovery

| ID | Observation | Evidence |
| --- | --- | --- |
| S-01 | Cards are large: **320 x 620px** at 1440px, image **424px** tall, 16px body padding | homepage, 1440px |
| S-02 | Four-column grid on desktop; 24px gap; five columns would be **~254px** at 1440px | grid 1368px wide; (1368 - 4*24)/5 = 254 |
| S-03 | The page carries **three product sections** (featured 6, offers 4, collection 8) = 18 cards and a **~3,700px** tall homepage | section tops 846 / 1604 / 2374, heights 710 / 723 / 1347 |
| S-04 | No "three most recently added" section exists. Selection is curated ids plus a discount-sorted offers row | `HomeSections.tsx` |
| S-05 | No recency is possible from current data: **1 distinct `created_at` across 22 products** | `select count(distinct created_at) ...` = 1 of 22 |
| S-06 | Catalog page grid is constrained by the filter sidebar: 4 columns give **250px** cards at 1920px, **149px** at 1024px | `/products` measurements |
| S-07 | One-pixel breakpoint cliff: at 1023px cards are 186px (3 cols); at 1024px they are 149px (4 cols) | width sweep |
| S-08 | Category discovery is correct: 5 categories at 1440px, hidden below 720px as designed | computed layout |

**Assessment.** The density complaint is real but the cause is compound: card *height* is
driven by a 3:4 photo plus a padded body, and the page repeats three product rows. A
five-column grid alone would make cards narrower, not necessarily shorter, and at 1024px it
would be unusable. The defensible change is: **five columns only on sidebar-less surfaces
from ~1440px up, keep four with the filter sidebar, and reduce card height** (see 10.2).

**On "three most recent products":** this is **not a defect** - it is a product change that
conflicts with the approved rule in AGENTS.md ("Never present curated products as recency...
The storefront publishes no date-added field") and cannot be implemented honestly with the
current seed, where every product has the same creation timestamp. It needs (a) an owner
decision, (b) a `createdAt` value in the storefront catalog contract, and (c) deterministic
seed timestamps. Recorded as **S-04 / decision D-1**.

### 3.2 Header, navigation, account discoverability

| ID | Observation | Evidence |
| --- | --- | --- |
| S-09 | Desktop: **My Account is the 7th text link** in the category nav, after six categories, visual weight identical to "Lip care" | nav rects: account x=648, width 91 among 40-90px links |
| S-10 | Mobile (<1024px): account is **only** in the drawer, 9th item, after search, five categories and "Checkout" | drawer items list; header has no account control |
| S-11 | Cart is a 40x40 icon button with a numeric badge, top-right - clearly the strongest action | header measurements |
| S-12 | **Header search is unusable at 1024px in Bangla: input width 15px, container 79px** | computed widths; placeholder present but not visible |
| S-13 | English at 1024px: search container 117px; at 1280px 360px | header sweep |
| S-14 | Header height stays 65px at every width; no wrap | 1440/1024/390 |
| S-15 | Language toggle is a 96px labelled button on mobile; the header still fits 320-390px | 390px header rects |
| S-16 | The drawer is focus-trapped, closes on Escape and returns focus (code + prior suite); links are 51px tall | `Header.tsx`; drawer measurement |

**Assessment.** The account issue is placement, not styling: an account control belongs in
the action cluster next to the cart, not at the end of a taxonomy list. The smallest fix
that does not crowd the header is one icon button (or avatar) in `.actions` on both
breakpoints, keeping the text link as a redundant desktop affordance.

### 3.3 Add-to-cart feedback

| ID | Observation | Evidence |
| --- | --- | --- |
| S-17 | Feedback is a **single inline line** under the button, 549 x 22px at y=558; role=status, aria-live=polite | PDP, after click |
| S-18 | No *View cart* / *Continue shopping* action is offered anywhere near the confirmation | after click: no new links, `location.hash` empty |
| S-19 | Cart badge updates immediately (0 -> 1 -> 2) and persists; a second click increments quantity, it does not duplicate a line | localStorage `[{"productId":"1","quantity":2}]` |
| S-20 | The confirmation is visible and immediate, but **thin**: 22px of 15px text directly beneath a 46px button | measured |
| S-21 | Repeated clicks are not debounced, but they are additive by design (quantity), not a duplication bug | store state |
| S-22 | Out-of-stock state is stated on cards, PDP, cart and checkout; the server is the gate | code + copy |
| S-23 | Keyboard: button is a real `<button>`, stepper inputs are labelled, status region announced | DOM |

**Assessment.** Confirmed. Recommended pattern: an inline confirmation panel *at the
button* (not a toast, which the codebase has no primitive for) that keeps the status text
and adds two actions - **View cart** and **Continue shopping** - while leaving the button
enabled for another add. This fits CSS Modules, server-form architecture and the existing
live region with no dependency.

### 3.4 Product detail, cart, checkout

| ID | Observation |
| --- | --- |
| S-24 | PDP: 651 x 867px hero image, brand eyebrow, H1, price, brand/size/stock definition list, 40px stepper, 46px add button. No published description - stated as a gap ("this product's detailed description is not published"). Honest and consistent. |
| S-25 | Cart: quantity steppers, remove with accessible label, subtotal, "delivery not yet determined", "possible total", checkout + continue shopping + clear cart. Empty state offers exactly one recovery path. |
| S-26 | Cart renders a polite live region on mount ("কার্ট হালনাগাদ হয়েছে: 2 টি আইটেম"), which is announced on page load as well as on change - noisy for screen-reader users. |
| S-27 | Checkout: 46px controls, every field labelled, phone has `pattern="01[3-9][0-9]{8}"` + help text, delivery area is a select with three named areas, totals show subtotal / delivery / possible total, and delivery only appears after an area is chosen. Submit is disabled until delivery is configured and while an unavailable line exists. |
| S-28 | Order confirmation states COD, that cash is collected at delivery, that the owner approves before dispatch, and shows order number, items, subtotal, delivery, total, contact and address. No claim of payment received, tracking or completion. |
| S-29 | Anonymous checkout redirects to `/account/login?next=/checkout` (cart preserved by architecture) - verified pre-login and post-login. |
| S-30 | Customer order history and detail show status, payment state, method, items, totals and delivery contact; wording never implies dispatch or tracking that does not exist. |

### 3.5 Customer account

| ID | Observation |
| --- | --- |
| S-31 | Register: optional display name, email, password (min 12), confirm; clear that no verification mail is sent. |
| S-32 | Account page after registration: email, "My orders", "Sign out", recovery limitation. The optional display name is not shown, so a customer who entered a name never sees it used. |
| S-33 | Signed-out `/account` states the account requirement and offers sign-in/register; no dead end. |
| S-34 | Recovery is owner-issued; the screen states clearly that there is no self-service path. This is honest and matches ADR 0019, but there is no "contact the store" affordance (no phone/email) on the page - the customer is told to contact the store without being told how. |
| S-35 | Session feedback is implicit (the header gives no signed-in indicator). A customer cannot tell from the header whether they are signed in or which account. |

**S-34 is a genuine usability gap:** the limitation is stated, but the remedy has no
contact route anywhere in the footer or the page. Recommend the store's contact channel be
surfaced wherever the recovery limitation is stated (owner-supplied data, not invented).

---

## 4. Admin-panel findings

### 4.1 Visual and component consistency

Measured on live pages at 1440px:

| ID | Observation | Evidence |
| --- | --- | --- |
| A-01 | Two button heights coexist: **34px** (search, archive, availability switch, reject) and **40px** (approve, primary saves). | overview/COD/catalog |
| A-02 | The decision pair is inconsistent: **Approve 40px, Reject 34px**, 87px wide, in the same row. | COD card |
| A-03 | **Inputs in one form differ: 40px vs 51px.** Fields with a hint paragraph stretch; plain fields do not. | product edit: nameEn 51, slug 40, sku 40, price 40 |
| A-04 | Search toolbar: input 40px, submit button 34px, filter tabs 32px - three control heights in one row. | catalog/orders/COD |
| A-05 | Button label sizes are 12px on small buttons and 13px on primary ones; control text is 13px. | computed styles |
| A-06 | Page anatomy is consistent: h1 28/600, h2 18/600, h3 16/600; content 1177px wide at 1440px, 32px section gap, padding 32/24/64. | measured across 8 routes |
| A-07 | Catalog list: 22 rows, **82-107px** each at desktop, **248px** each at 360px, two 34px controls per row, no pagination. | measured |
| A-08 | Status is never colour-only; pills carry text and dot; the availability switch is a real `role="switch"` with `aria-checked` and a text label. | markup |
| A-09 | Notices are one vocabulary with `role="status"` / `role="alert"`; success and refusal are distinguishable. | `Notice.tsx` + live pages |
| A-10 | Confirm dialog: 480px wide, focus starts on Cancel, Escape closes, consequence text and required reason are shown. Good. | reject dialog |
| A-11 | The desktop rail is 248px; main content begins at 248; no horizontal overflow at 360px on six routes. | measured |
| A-12 | The mobile menu trigger is **36 x 36px**, below the project's own 40px target (above WCAG 2.5.8's 24px minimum). | 360px header |

**Why each matters (usability impact):**

- A-01/A-02: when destructive and confirming actions in one decision pair differ in height
  and width weight, the destructive one is subtly harder to hit and the pair reads as two
  unrelated controls. On a phone the 34px target is the one the owner taps by accident.
- A-03: misaligned baselines in a two-column form make the owner re-scan rows; a field that
  is 11px taller than its neighbour also looks like a different control type.
- A-04: three control heights in one toolbar costs alignment and makes the primary action
  (search) look secondary.
- A-07: 22 rows x 248px at 360px is a ~5,400px list with no pagination. Search exists, but
  browsing the catalog on a phone requires a very long scroll.

### 4.2 Admin workflows

| ID | Observation | Impact |
| --- | --- | --- |
| A-13 | Overview leads with the COD worklist, then attention, quick access, money and catalog state. Order card shows order number, age, contact (`tel:`), address, line items, subtotal/delivery/total, note field, approve/reject. | correct priority; the owner's first question is answered |
| A-14 | Approve requires a visible note field pre-filled "ফোনে নিশ্চিত করা হয়েছে" (min 10 chars). The label says "optional" ("অডিট নোট (ঐচ্ছিক)") while the field is `required` and posts as the audit reason. | **copy contradicts behaviour**: an optional-looking field that blocks submission |
| A-15 | Reject opens a reason-requiring confirmation that states the consequence. | good |
| A-16 | **Delivery settings does not repopulate the saved amount**: after saving ৳80 the display reads ৳৮০ but the input value is empty. | owner must retype to edit; easy to submit a wrong amount |
| A-17 | After a successful save the notice appears and the URL carries `?notice=defaultSaved`; a reload re-announces the same success. | minor, but "saved" can appear when nothing was just saved |
| A-18 | No route-level loading state (documented decision). On a slow query the owner sees the old page until navigation completes; actions show pending state. | acceptable, but no progress signal for list navigation |
| A-19 | Catalog edit is a long single-column form at 360px (1666px page) with 13 controls; two-column grouping collapses to 278px. | expected; grouping is still legible |
| A-20 | Customers list is empty until a customer exists; empty state says what will appear. Detail page shows recovery action and suspension behind confirmation (suite-verified). | good |
| A-21 | Owners page: one account, forced owner role, no role picker. Matches D10. | correct |
| A-22 | Audit trail renders a table of time / actor / action / target / reason; long values wrap (no truncation observed). | fine |
| A-23 | Orders list offers **8 status filter tabs** (all, pending, confirmed, shipped, delivered, completed, cancelled, returned) for a store whose daily queue is "waiting / today". | cognitive load; the frequent path is two clicks wide |
| A-24 | Order detail exists and carries dispatch/delivery/return/inspection/cash controls only while legal (suite-verified 150/150). | functional |

**Distinguishing UI from backend:** A-14 is a copy bug, not a logic bug - the server
requires the reason and the field is genuinely `required`; only the visible label says
"optional". A-16 is a presentation bug: the value is stored correctly (৳80 displayed), the
input simply is not populated. Neither needs a policy change.

---

## 5. Responsive-design findings

| ID | Finding | Widths | Evidence |
| --- | --- | --- | --- |
| R-01 | No horizontal overflow on storefront routes from 320px to 1920px | 320-1920 | `scrollWidth == clientWidth` at every measured width |
| R-02 | No horizontal overflow on admin routes at 360px, including the order detail | 360 | six routes + detail |
| R-03 | Checkout at 390px: all controls 46px, submit 308 x 46, no overflow | 390 | measured |
| R-04 | Catalog grid cliff: 3 x 186px -> 4 x 149px at 1024px | 1023/1024 | sweep |
| R-05 | Header search unusable at 1024px (15px input in Bangla) | 1024 | measured |
| R-06 | Homepage has no sidebar, so five columns would be 254px at 1440px and 251px at 1920px | 1440/1920 | computed |
| R-07 | Catalog with sidebar would give ~144px cards at five columns at 1440px | 1440 | computed from 1064px grid |
| R-08 | Drawer nav items are 51px; header icons 40px; admin mobile trigger 36px | 360/390 | measured |
| R-09 | Admin filter tabs 32px and small buttons 34px are below the project's 40px touch target guidance | all | computed |
| R-10 | Bengali and English both render without clipping or overflow at measured widths; no letter-spacing applied to Bengali headings (CSS rule) | 1024-1440 | computed styles + CSS |

---

## 6. Accessibility and localization findings

| ID | Finding | Status |
| --- | --- | --- |
| X-01 | Global `:focus-visible` ring is 2px `--color-focus` with 2px offset on all interactive elements. | verified in CSS; visible focus not screenshot-verified |
| X-02 | Both shells provide a skip link (`#main-content`, `#admin-main`); storefront skip link text is localised. | verified in DOM |
| X-03 | Add-to-cart and cart updates use `role="status"`/`aria-live="polite"`; checkout and admin refusals use `role="alert"`. | verified |
| X-04 | Money is `tabular-nums` and `nowrap`; the struck-through comparison price only appears when a real saving exists. | verified in CSS/code |
| X-05 | The language toggle exposes "current language" via `sr-only` text plus a visible target-language label; accessible name concatenates to "Current language: Englishবাংলা" with no separator. | **likely confusing to screen readers - needs a separator or a single `aria-label`** |
| X-06 | The homepage/cart place product names in `h3`/`h2` correctly under section headings; heading order is h1 -> h2 -> h3. | verified |
| X-07 | Form inputs are programmatically labelled (`label for`), including checkout and product edit; select prompt is an option, not a placeholder. | verified |
| X-08 | Bengali text never receives tracking (explicit `html[lang='bn']` resets). Weights stay 400-700. | verified in CSS |
| X-09 | Dialog focus trap, Escape and focus restoration are implemented and asserted by `verify:admin`. | verified by suite |
| X-10 | Colour is never the only signal for status or availability (text + dot / text + switch). | verified |
| X-11 | Contrast: documented measured pairs pass (white on `#56358C` 9.2:1; muted 5.89:1; ink on pastel 5.76:1). Not re-measured in the browser. | design-system evidence |
| X-12 | **Unverified:** screen-reader output, 200% zoom reflow, real iOS/Android, dynamic-type scaling. | not tested |
| X-13 | The account page never surfaces the optional display name, so the only identity shown is the email. | minor |

---

## 7. Functional UX bugs

Confirmed defects, ordered by impact:

1. **F-01 (High) Header search is not typeable at 1024px in Bangla.** Input computed width
   15px. Repro: Bangla -> viewport 1024px -> inspect the header search input. The 1024px
   breakpoint admits the desktop header but leaves no minimum for the field.
2. **F-02 (High) My Account has no visible entry point below 1024px.** Repro: 390px ->
   header -> account link has width 0; only path is menu -> 9th item.
3. **F-03 (High) Add-to-cart offers no next step.** Repro: any PDP -> Add to cart -> only a
   22px status line changes; no cart/continue action.
4. **F-04 (Medium) Delivery charge input is blank after a successful save.** Repro: Settings
   -> Delivery charges -> save default 80 -> screen shows ৳৮০, input `value=""`.
5. **F-05 (Medium) Admin approve note is labelled optional but is required.** Repro: COD
   card -> clear the note -> submit -> browser/server refusal; label reads "audit note
   (optional)".
6. **F-06 (Medium) Inconsistent control heights in one admin form (40 vs 51px).** Repro:
   product edit -> compare Name (English) to Slug.
7. **F-07 (Low) Cart live region announces the current count on page load.** Repro:
   navigate to `/cart` with items in a screen reader; the count is announced although
   nothing changed.
8. **F-08 (Low) Language toggle accessible name runs two strings together without a
   separator** ("Englishবাংলা").

Everything else found is a usability or consistency improvement, not a defect.

---

## 8. Your reported issues - verification status

| Reported issue | Status | Evidence |
| --- | --- | --- |
| Product cards are too large | **Confirmed** | 320 x 620 at 1440 (home), 250 x 526 at 1920 (catalog), 424px images |
| Four per row on desktop; evaluate five | **Confirmed as-is** (4 columns from 1024px). Five is viable only on sidebar-less pages and only at wide widths | 254px at 1440; 144px with sidebar; curated rows are 4 and 8 items, so 5 columns leaves holes |
| Homepage must show exactly three most recent products by creation time | **Not implemented; cannot be implemented as specified today.** Conflicts with the approved "no recency claim" rule, the catalog contract has no date, and all 22 products share one `created_at` | code + SQL |
| Product card proportions/spacing waste space | **Confirmed**: 424px image, 16px padding, ~620px card height, three stacked product sections | measured |
| My Account is hard to find | **Confirmed** | desktop: 7th text link; mobile: drawer-only, 9th item |
| Add to cart should offer Go to Cart / Continue Shopping | **Confirmed absent** | only a status line; no actions |
| Admin spacing inconsistent | **Partly confirmed**: page rhythm is consistent (32px), but control heights (34/40/51) and toolbar alignment are not | measured |
| Admin buttons inconsistently sized/positioned | **Confirmed** | approve 40 vs reject 34; search 34 vs input 40 |
| Admin not visually pleasing enough | **Not objectively verifiable in this audit.** No visual judgement is claimed; the measurable causes above are the actionable part | screenshots exist but were not interpreted |
| Some admin areas cluttered/awkward | **Partly confirmed**: 8 status tabs + toolbar; 22 rows x 248px at 360px; approve note copy mismatch | measured |

---

## 9. Independently discovered issues

Beyond the reported list:

1. **Header search collapse at 1024px** (F-01) - the most severe responsive defect found.
2. **Delivery amount not repopulated** (F-04) - a real money-entry risk.
3. **Approve note copy says optional, field is required** (F-05) - the owner will hit a
   refusal they were told could not happen.
4. **Input height inconsistency inside one form** (F-06).
5. **Catalog browse at 360px is a 5,400px scroll** with no pagination (A-07).
6. **8 status tabs for a two-state daily workflow** (A-23).
7. **Cart live region announces on load** (F-07).
8. **Recovery limitation without a contact route** on the customer recovery screen (S-34).
9. **Signed-in state is invisible in the header** - a customer cannot tell which account
   is active without opening the account page (S-35).
10. **Optional display name is collected but never shown** (S-32).
11. **Admin mobile menu target is 36px** against the project's own 40px rule (A-12).
12. **Three product sections on the homepage** create repetition and length; the offers row
    is discount-driven, while the collection is curated - a shopper cannot tell the
    difference from the headings alone (S-03).

---

## 10. Prioritized issue register

Priority is impact x frequency x dependency, not novelty.

| Rank | ID | Issue | Severity | Priority | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | F-01 | Search unusable at 1024px | High | P0 | Confirmed |
| 2 | F-02 | Account invisible on mobile / weak on desktop | High | P0 | Confirmed |
| 3 | F-03 | Add to cart has no next step | High | P0 | Confirmed |
| 4 | S-01/S-02/S-06 | Card size and grid density | High | P1 | Confirmed (fix scope needs decision) |
| 5 | F-04 | Delivery amount not repopulated | Medium | P1 | Confirmed |
| 6 | F-05 | "Optional" note is required | Medium | P1 | Confirmed |
| 7 | F-06 | 40 vs 51px inputs | Medium | P1 | Confirmed |
| 8 | A-01/A-02/A-04 | Button scale inconsistency | Medium | P1 | Confirmed |
| 9 | S-04 | Three-most-recent homepage request | High (blocked) | P2 | Needs owner decision + data |
| 10 | S-03 | Three stacked product sections / page length | Medium | P2 | Confirmed |
| 11 | A-07 | 22 unscrolled rows at mobile | Medium | P2 | Confirmed |
| 12 | A-23 | Eight filter tabs | Medium | P2 | Confirmed |
| 13 | S-34 | Recovery without contact route | Medium | P2 | Confirmed (needs owner data) |
| 14 | S-35 | Signed-in state invisible | Medium | P2 | Confirmed |
| 15 | F-07/F-08 | Live-region noise, toggle name | Low | P3 | Confirmed |
| 16 | A-12 | 36px admin trigger | Low | P3 | Confirmed |
| 17 | S-32/X-13 | Display name unused | Low | P3 | Confirmed |

**Separate buckets**

- **Confirmed defects:** F-01 to F-08, S-01/S-02, A-01/A-02/A-03/A-04/A-12.
- **Usability improvements:** S-03, S-09/S-10, A-07, A-23, S-34, S-35.
- **Design inconsistencies:** A-01 to A-06.
- **Hypotheses needing verification:** visual quality ("not pleasing enough"), perceived
  density beyond measured heights, screen-reader experience, 200% zoom, real-device
  behaviour, and whether the owner actually uses 8 status filters.
- **Outside UI redesign scope:** recency requires a product decision and a data-contract
  change; owner contact details do not exist in the interface; no automated accessibility
  tooling is installed.

---

## 11. Recommended redesign phases and dependencies

### Phase 25 - Storefront navigation and purchase feedback (P0)

1. Give the header search a usable minimum and raise the inline-header breakpoint (or move
   search into a trigger below ~1200px). Acceptance: at 1024px in both locales the input is
   at least 180px wide and the header remains one 65px row with no overlap.
2. Add an account control (icon or avatar) to the header action cluster on all breakpoints,
   keeping the existing text link as a redundant desktop path. Acceptance: at 390px the
   account is one tap from the header; focus order and accessible names are correct.
3. Replace the bare add-to-cart status with an inline confirmation offering **View cart**
   and **Continue shopping**; keep the polite live region and the enabled button.
   Acceptance: after adding, both actions are visible next to the button at 390px and
   1440px; keyboard focus reaches them; no duplicated announcement; repeated add still
   increments quantity.

Dependencies: none. No schema, policy or dependency change. Acceptance test: extend
`verify:storefront` with viewport checks at 1024 (both locales), drawer/account reachability
at 390, and the add-to-cart action pair.

### Phase 26 - Catalog density and card proportions (P1)

- Decide the homepage product model first (**D-1** below). Then: five columns on
  sidebar-less surfaces only at >= 1400px; keep four (or reduce to a 3-column max at
  1024-1279) with the filter sidebar; shorten card height by reducing the body's vertical
  padding and the photo's share of the card, not by shrinking type below 15px.
  Acceptance: 5 columns at 1440/1920 with no trailing holes for the chosen curation sizes;
  card height reduced without text wrapping to more than three lines; no overflow 320-1920.

Dependency: D-1 (owner decision) and a redesign of the two curated lists so their lengths
divide evenly by the chosen column count.

### Phase 27 - Admin control-scale and feedback consistency (P1)

- One button scale (34/40/48 with one primary height), same for every action pair; one
  input height; fix the stretch bug; align the toolbar to that scale; correct the
  "optional" note label; repopulate saved delivery amounts; reconsider 8 status tabs.
  Acceptance: a computed-style sweep shows exactly two control heights across admin pages;
  approve/reject render identically; the delivery input echoes the saved amount; note copy
  matches the requirement.

Dependencies: none.

### Phase 28 - Homepage content model (P2, owner decision)

- Choose curated vs recency; if recency is approved, add `createdAt` to the storefront
  catalog contract, make seed timestamps deterministic and distinct, and update the honesty
  rules in AGENTS.md. Acceptance: the homepage section is explainable from recorded data
  and passes `check:catalog`.

### Phase 29 - Customer account clarity (P2)

- Surface the contact route next to the recovery limitation, show signed-in identity in
  the header, and surface the display name where it was collected. Acceptance: a signed-in
  customer can identify their account without opening `/account`; a locked-out customer has
  a documented way to reach the store.

---

## 12. Limitations of this audit

- Most interaction ran against a **development server** (Turbopack). Production behaviour is
  covered only by `verify:admin` (150/150) and the repository's prior suites.
- **No visual judgement is claimed.** Screenshots were captured, but findings are measured
  geometry and computed styles. "Not pleasing enough" is recorded as unverified.
- No automated accessibility engine, no screen reader, no real devices, no 200% zoom.
- Admin empty states were inspected before the sandbox order; populated order cards, order
  detail and customer detail were inspected after it. Categories/brands were inspected with
  seeded data only.
- One sandbox order, one sandbox customer, one delivery configuration were created in a
  disposable cluster and discarded. No production or project data was touched.
- `/admin/redeem`, `/admin/forbidden` as a restricted principal, permission-refusal UX and
  the customer suspension dialog were not driven in this audit (covered by the 150/150
  suite instead).
- Screenshots (not interpreted here, retained for the owner): `/tmp/audit/*.png` -
  homepage 1440/1920/1280/1024/390, drawer 390, PDP 1440/390, cart 1440, checkout
  1440/390, account, register, order confirmation/detail, admin routes at 1440 and 360,
  COD card + dialog, product edit 1440/360, customer detail, delivery settings.

---

## 13. Git and artefacts

- Branch `master`, HEAD `b4d5f44`, working tree clean at start apart from the pre-existing
  untracked `.codegraph/`.
- Only file created by this audit: `docs/ux-audit-phase24.md` (this report).
- No code, style, test, schema, migration, environment or database artefact changed.
- Disposable audit infrastructure (`/tmp/audit`) is outside the repository.

## 14. Recommended single next step

**Phase 25 - Storefront navigation and purchase feedback.** It addresses the three
highest-impact confirmed problems (untypeable search at 1024px, unreachable account on
mobile, no next step after adding to cart) in one small, dependency-free slice that touches
only the header and the product-detail confirmation.

- **Prerequisites:** none technical. Owner approval of raising/relocating the search
  breakpoint and of adding an account icon to the header action cluster.
- **Acceptance:** at 1024px in Bangla and English the search input is at least 180px wide
  and the header stays one row; at 390px My Account is reachable in one tap from the
  header; after Add to cart, View cart and Continue shopping are visible beside the button,
  keyboard reachable, and a repeated add still increments one line; `verify:storefront`
  extended with those checks and passing, plus `typecheck`, `lint`, `check:i18n`,
  `check:catalog` and `build`.
- **Not included:** card density (Phase 26), admin control scale (Phase 27), any recency
  change (needs decision D-1).
