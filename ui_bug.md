# UI bug audit

> **Status: closed by Phase 46 (2026-10-30).** All nine defects below were fixed, and
> `npm run verify:ui` (`scripts/verify-ui-fixes.cjs`) now guards each one by name in about a minute
> against a served build. This file stays as the audit record; it is not a list of open work. The
> "Recommended next step" at the end (Phase 46) was that phase, and it is implemented.

Audit date: **2026-10-29**  
Scope: admin and storefront UI in the locally served production build  
Requested outcome: diagnosis and remediation instructions only — **no application code changed by this audit**

## Executive summary

The interface does not have a general page-wide overflow problem at 390 px or on desktop. Most screens have consistent gutters, labels, card spacing, and responsive stacking. The reported collisions come from a smaller set of shared defects:

1. Focused admin fields can remain underneath the fixed mobile navigation.
2. Promo and customer-recovery controls bypass the shared form system.
3. Promo creation relies on native validation, so an invalid submit can appear to do nothing.
4. Two narrow-screen layouts overflow at 320 px.
5. Several admin touch targets are smaller than the project's own 40 px phone rule.
6. The shared odd-card phone rule makes a single related-product card disproportionately large.

**Confirmed issue count: 9 groups** — 0 P0, 4 P1, 5 P2.

| ID | Priority | Surface | Issue |
| --- | --- | --- | --- |
| UI-01 | P1 | Admin mobile | Focused fields remain covered by fixed bottom navigation |
| UI-02 | P1 | Promo editor | Inputs/selects bypass shared control styles |
| UI-03 | P1 | Promo editor | Invalid create submission gives no useful error summary |
| UI-04 | P1 | Product editor | Money inputs overflow at 320 px |
| UI-05 | P2 | Customer recovery | Textarea and submit button touch with 0 px gap |
| UI-06 | P2 | Analytics mobile | Last period tab clips at 320 px |
| UI-07 | P2 | Admin mobile | Brand and product-name targets are too small/inconsistent |
| UI-08 | P2 | Admin mobile tables | Audit columns clip with no visible scroll cue |
| UI-09 | P2 | Product detail mobile | Odd related card spans full row and becomes oversized |

## Audit method and limits

### Rendered coverage

- **Admin:** the authenticated application routes for overview, analytics, orders, product/category/promo editors, customers, owners, audit, delivery, announcement, integrations, Telegram, and other settings; admin sign-in was inspected separately.
- **Dynamic admin samples:** product editors, category editors, customer details, and promo editor discovered from live list links.
- **Storefront:** home, product listing, category index/detail, product detail, empty and populated cart, empty and populated checkout, sign-in, registration, and recovery.
- **Viewports:** 1440, 1024, 768, 390, and targeted 320 px checks.
- **Interaction probes:** keyboard focus visibility, non-submitting empty-form validation, destructive-dialog open/Escape/focus behavior, and local cart population.
- Measured DOM rectangles, overflow, clipping, labels, and control sizes; compared measurements with full-page and viewport screenshots.
- Ran Impeccable's layout detector over `src/app/(admin)/admin`: no detector findings. Rendered probes found issues static detection cannot establish.

### Not verified

- Real iOS Safari, Android Chrome, physical touch gestures, soft keyboards, or screen readers.
- Authenticated customer account/order-history pages.
- Actual order submission, payment operations, account mutations, or production infrastructure.
- Cross-browser behavior outside headless Chromium.

The working tree was already dirty before the audit and changed further during it through unrelated local work. Findings below describe the **running build**, not an assertion that every dirty source file was produced by one change set. No unrelated change was reverted.

---

## P1 — fix first

## UI-01 — Focused admin fields remain underneath fixed mobile navigation

**Surface:** Admin, below 1024 px  
**Category:** Responsive layout / keyboard accessibility  
**Reproduced:** 390 × 844 in Chromium

### Evidence

| Route | Focused field | Result |
| --- | --- | --- |
| `/admin/settings/delivery` | Dhaka amount, `#delivery-amount-dhaka` | Field stayed at y=797.8–837.8 while navigation began at y=779; field entirely obscured |
| `/admin/catalog/new` | English description, `#descriptionEn` | Textarea stayed at y=813.3–943.3 behind navigation beginning at y=779 |

Other tested fields scrolled correctly. Bottom page padding protects the end of the document, but it does not guarantee that a browser's focus scroll clears a fixed bar.

### Impact

An owner tapping or tabbing into a field can type into an invisible control. This directly affects product editing and delivery-price configuration.

### Source

- `src/app/globals.css` — `html:has([data-admin-shell])` sets only `scroll-padding-top` on phones.
- `src/app/(admin)/admin/admin.module.css` — `.content` reserves bottom document padding around lines 362–375 and 2740; `.bottomNav` is fixed around lines 2690–2710.
- `src/app/(admin)/admin/_ui/AdminShell.tsx` — fixed mobile navigation markup.

### Fix instructions

1. Add bottom scroll padding to the same admin scroll container that already has top scroll padding:
   ```css
   @media (max-width: 1023px) {
     html:has([data-admin-shell]) {
       scroll-padding-bottom: calc(
         var(--admin-bottom-nav-height) + env(safe-area-inset-bottom) + var(--space-4)
       );
     }
   }
   ```
2. Keep the existing document bottom padding; it protects end-of-page content and serves a different purpose.
3. Test actual browser focus scrolling, not only full-page screenshots. If Chromium/Safari still leaves a field covered, add a small shared `focusin` handler that checks the focused control's rectangle against `[data-admin-bottom-nav]` and scrolls it into the clear region. Do not add per-form handlers.
4. Do not hide the bottom navigation while a field is focused; that would shift the layout and remove navigation context.

### Acceptance

- At 320, 390, 768, and 1023 px, every focused input/select/textarea is wholly above the fixed bar.
- Repeat using both touch-style programmatic focus and sequential Tab navigation.
- Include Dhaka amount and English product description as regression cases.

---

## UI-02 — Promo editor fields bypass the shared admin control system

**Surface:** `/admin/promo-codes/new` and `/admin/promo-codes/[codeId]`  
**Category:** Forms / implementation integrity  
**Reproduced:** Desktop and 390 px phone

### Evidence

At 390 px, promo controls measured **19–24 px high at 13.33 px font size**, except number inputs at about 27.7 px. Shared admin controls should be **40 px high and 16 px font size** on phones. They also show browser-default thin borders rather than the shared admin control treatment.

| Before | After | Why |
| --- | --- | --- |
| Bare `<input>` / `<select>` | `className={styles.input}` / `className={styles.select}` | Restores shared height, padding, border, focus ring, and phone typography |
| 19–28 px controls | 40 px controls | Matches the two-height admin control scale |
| 13.33 px phone fields | 16 px phone fields | Prevents iOS focus magnification and matches other forms |

### Impact

The editor looks unfinished, targets are harder to hit, and its controls disagree with product/category/settings forms.

### Source

`src/app/(admin)/admin/(app)/promo-codes/PromoCodeForm.tsx`:

- `kind` select around line 149 has no shared class.
- Visible inputs around lines 162, 176/189, 205, 219, 233, 247, 261, 272, and 284 have no `styles.input`.
- Shared definitions are in `src/app/(admin)/admin/admin.module.css` around lines 1938–2040.

### Fix instructions

1. Add `className={styles.input}` to every visible text, number, and date input.
2. Add `className={styles.select}` to the Type select.
3. Keep existing names, values, validation, and server behavior unchanged.
4. Do not fix this with one-off `.promoEditor input { ... }` styling; consuming the shared classes prevents future drift.

### Acceptance

- All promo inputs/selects measure 40 px high on desktop and phone.
- Phone control font is 16 px; desktop follows `--text-control`.
- Borders and focus rings match the product editor.
- Existing preview and submit behavior still work.

---

## UI-03 — Invalid promo creation can silently do nothing

**Surface:** `/admin/promo-codes/new`  
**Category:** Validation / error recovery  
**Reproduced:** Empty form, click **Create code**, 390 px

### Evidence

The click left the URL unchanged and produced **zero `[role="alert"]` elements**. The browser focused Code, but the page did not show the form's intended problem list. The product editor's equivalent empty submission correctly displayed an explicit summary and focused the first missing field.

### Root cause

The required Code field triggers native constraint validation **before** the form's `onSubmit` executes. Therefore this branch is not reached for an empty required field:

```tsx
if (problems.length > 0) {
  event.preventDefault();
  setShowProblems(true);
}
```

The same pattern leaves later invalid values dependent on native browser bubbles rather than the designed summary.

### Impact

On a long phone form, an owner receives no persistent explanation and may not understand why Create code did nothing.

### Source

- `src/app/(admin)/admin/(app)/promo-codes/PromoCodeForm.tsx` — form and submit handler around lines 128–145; alert around lines 291–301.
- Correct reference pattern: `src/app/(admin)/admin/_ui/ProductForm.tsx` — `noValidate`, explicit invalid-field handling, named summary, first-field focus.

### Fix instructions

1. Add `noValidate` to the promo form and make the submit handler the single client-side validation reporter.
2. When `problems.length > 0`, prevent submission, show the existing `role="alert"` summary, mark affected controls with `aria-invalid="true"`, and focus the first invalid control.
3. Associate each problem with its field; preserve the existing server-side validation as authoritative.
4. Reuse the product editor's behavior rather than introducing a toast or a second error framework.
5. Ensure a successful, valid submission still follows the existing route unchanged.

### Acceptance

- Empty Create code displays the Code and Percentage problems in a visible summary.
- Invalid percent, negative minimum, invalid cap/limit, and reversed date window each produce the corresponding summary item.
- First invalid field receives focus and remains visible above mobile navigation.
- No promo record is created for invalid submissions.

---

## UI-04 — Product money inputs overflow at 320 px

**Surface:** `/admin/catalog/new` and product edit routes  
**Category:** Responsive layout  
**Reproduced:** 320 × 800

### Evidence

- Viewport: 320 px.
- Document width: **325 px**; horizontal scrollbar visible.
- Pricing card right edge: x=289.
- Money wrapper right edge: **x=325.14**.
- Both Price and Comparison price inputs extend past the viewport.
- `.moneyInput` measured 292.14 px wide inside a card with 271 px client width.

### Root cause

The money wrapper is a flex item with `min-width: auto`. Its intrinsic minimum includes the currency prefix and input content, so it does not shrink to its parent. The child input has `min-width: 0`, but the wrapper itself still refuses to shrink.

### Source

- `src/app/(admin)/admin/admin.module.css` — `.moneyInput` around lines 3203–3210 and `.moneyInput .input` around lines 3231–3241.
- `src/app/(admin)/admin/_ui/ProductForm.tsx` — price fields around lines 380–440.

### Fix instructions

1. Add `min-width: 0; max-width: 100%;` to `.moneyInput`.
2. Keep `.moneyInput .input` shrinkable with `flex: 1 1 auto; min-width: 0;`.
3. Ensure the field/container holding the wrapper also has `min-width: 0`; do not use `overflow-x: hidden` to conceal the defect.
4. Re-check delivery-charge money fields because they use the same wrapper.

### Acceptance

- At 320 px, `document.documentElement.scrollWidth <= window.innerWidth`.
- Price, comparison price, and delivery amount borders remain fully visible.
- Currency prefix and typed decimal value never overlap.
- No horizontal page scroll at 320, 360, or 390 px.

---

## P2 — fix in same UI pass

## UI-05 — Customer recovery textarea and button have zero spacing

**Surface:** `/admin/customers/[id]`, Password recovery panel  
**Category:** Form spacing  
**Reproduced:** 390 px phone; same structure on desktop

### Evidence

The recovery textarea ended at y=1056.015625 and **Issue a code** began at exactly y=1056.015625: **0 px gap**. The form computes as `display: block`; the textarea has no shared class and renders at 13.33 px on phone.

### Impact

Controls visually collide, the recovery flow looks unfinished, and the field misses the admin phone typography rule.

### Source

`src/app/(admin)/admin/(app)/customers/[id]/CustomerDetailView.tsx` around lines 289–307:

- Form has no `styles.form`.
- Textarea has no `styles.textarea`.
- Submit follows immediately after the label wrapper.

### Fix instructions

1. Put `className={styles.form}` on the recovery form so children receive the shared vertical gap.
2. Put `className={styles.textarea}` on the reason textarea.
3. Keep the existing `styles.field` label wrapper and button classes.
4. Preserve required/min/max validation and all recovery behavior; this is presentation only.

### Acceptance

- At least 16 px visual separation exists between the reason field group and Issue a code.
- Textarea uses shared border, padding, focus ring, and 16 px phone font.
- No adjacent controls touch at 320 or 390 px.

---

## UI-06 — Analytics period selector clips “Last 90 days” at 320 px

**Surface:** `/admin/analytics`  
**Category:** Responsive navigation  
**Reproduced:** 320 × 800

### Evidence

“Last 90 days” extended to x=323.7 in a 320 px viewport; its text is visibly cut at the right edge. The analytics period selector reuses `.filterTabs`, but unlike list filter rails it sits inside `.pageActions`, so the phone width/overflow rules do not reliably give it a shrinkable full-width track.

### Source

- `src/app/(admin)/admin/(app)/analytics/AnalyticsView.tsx` around lines 73–90 — period nav in `PageHeader` actions.
- `src/app/(admin)/admin/admin.module.css` — `.pageHeader`, `.pageActions`, `.filterTabs`, and phone rules around lines 575–614, 1657–1680, and 2750–2785.

### Fix instructions

1. At phone width, make `.pageActions` and the analytics period nav `width: 100%; min-width: 0;`.
2. Give the period nav the same single-row `overflow-x: auto` behavior as list filters, with each tab `flex: 0 0 auto`.
3. Alternatively wrap all three period tabs onto two deliberate rows, but do not clip the third.
4. Keep `aria-label` and `aria-current` intact.

### Acceptance

- Every period label is reachable and fully readable at 320 px.
- The rail scrolls within its own box or wraps; the document never gains horizontal scroll.
- Keyboard focus on Last 90 days scrolls it into view.

---

## UI-07 — Mobile admin brand and product-name targets are undersized or inconsistent

**Surface:** All admin mobile pages; `/admin/catalog`  
**Category:** Touch accessibility  
**Reproduced:** 390 px

### Evidence

- Mobile brand/Overview link: **32 × 32 px**.
- Several product title links: **16 px high** while neighboring Edit controls are 40 px.
- A long product title measured 40 px only because its text wrapped; target size therefore changes with name length.

The project requires visible phone controls to use 40 px targets; WCAG 2.2's minimum is 24 × 24 CSS px, with 44 px recommended for primary touch actions.

### Source

- `src/app/(admin)/admin/_ui/AdminShell.tsx` around lines 179–185 — mobile brand link.
- `src/app/(admin)/admin/admin.module.css` — `.brand`, `.mobileBrand`, `.recordLink`, `.recordTitle`.
- `src/app/(admin)/admin/(app)/catalog/CatalogView.tsx` around lines 211–219 — product-name link.

### Fix instructions

1. Give the mobile brand link a minimum 40 × 40 px inline-flex target while preserving the existing visual mark size.
2. Give the product-name link `display: inline-flex; align-items: center; min-height: var(--admin-control);` and allow multi-line text to grow naturally.
3. Apply title-target styling only to the record title link; do not enlarge metadata or alter the availability switch.
4. Keep adequate separation from the metadata and the next interactive row.

### Acceptance

- Brand target is at least 40 × 40 px below 1024 px.
- Every product title target is at least 40 px high regardless of name length.
- No title/link overlap with metadata or adjacent actions.

---

## UI-08 — Audit table clips columns without a visible horizontal-scroll cue

**Surface:** `/admin/audit`, below desktop width  
**Category:** Data-table responsiveness  
**Reproduced:** 390 and 768 px

### Evidence

The table intentionally has `min-width: 46rem` inside `.tableWrap { overflow-x: auto; contain: paint; }`. That prevents page overflow, but on phone the visible frame shows only part of When/Actor/Action and hides Detail and remaining content with no persistent visual cue that the region scrolls horizontally.

### Impact

An owner can mistake the partial row for the complete audit record and miss the event detail needed to understand it.

### Source

- `src/app/(admin)/admin/admin.module.css` — `.tableWrap` and `.table` around lines 2270–2315.
- `src/app/(admin)/admin/(app)/audit/AuditView.tsx` — audit table.

### Fix instructions

1. Keep horizontal scrolling for this genuinely tabular dataset; do not compress timestamps into multi-line fragments.
2. Add a visible right-edge fade when more content exists to the right, plus a short “Scroll for event details” hint associated with the table region.
3. Make `.tableWrap` keyboard focusable with an informative accessible label so keyboard users can scroll it.
4. Optional: implement a scroll-state mask that disappears at the far right. Do not show a permanent fade when no overflow remains.

### Acceptance

- A first-time phone user can tell more columns exist before attempting a gesture.
- The wrapper, not the page, scrolls horizontally.
- All columns remain reachable by touch and keyboard.

---

## UI-09 — Odd related-product card becomes disproportionately large on phone

**Surface:** Product detail, Related products  
**Category:** Responsive grid composition  
**Reproduced:** `/products/lady-speed-stick-teen-spirit-sweet-strawberry-65gm` at 390 px

### Evidence

Five related products produce a 2 + 2 + 1 layout. The shared odd-count rule makes the last item span both columns:

- Normal sibling card: **165.5 × 309.2 px**, image area about 130.8 px high.
- Last spanning card: **343 × 451.2 px**, image area **272.8 px** high.

The last card's photograph and price therefore occupy a much larger visual block than equivalent products. On products with no image, this reads as a very large blank well.

### Source

- `src/components/ProductGrid.tsx` — marks odd counts.
- `src/components/ProductGrid.module.css` — phone `.grid[data-count-odd='true'] > li:last-child { grid-column: 1 / -1; }`.
- `src/components/ProductCard.module.css` — card/image sizing.
- `src/features/catalog/ProductDetailView.tsx` — related products use the standard grid.

### Fix instructions

1. Preserve the approved odd-card spanning rule; do not change the related-product count or invent a sixth product.
2. Add a wide-variant layout for the spanning card: image and body in two columns, with the image column capped near the normal phone card width and the body beside it.
3. If a horizontal card is undesirable for photography, cap the spanning card's image width while centering the card; do not stretch a portrait image across the entire row.
4. Implement in the shared card/grid variant only after checking homepage odd-count rows; avoid an unrelated redesign.

### Acceptance

- Last related card stays within a height comparable to its siblings.
- Its image is not stretched into a full-width oversized well.
- Five real products remain visible; no padding/repeated card is introduced.
- Existing homepage odd-card behavior remains intentional and verified.

---

## Cross-cutting fix order

1. **Shared form/control contract:** UI-02 and UI-05; restores consistent heights, typography, and gaps.
2. **Focus and validation recovery:** UI-01 and UI-03; fixes invisible fields and silent submission failure.
3. **Narrow-screen geometry:** UI-04 and UI-06; removes actual 320 px clipping/overflow.
4. **Touch and data discovery:** UI-07 and UI-08.
5. **Grid composition:** UI-09.

## Regression checklist

Run these after implementing the report, not as a substitute for the project's full checkpoint:

- 320 / 360 / 390 / 768 / 1023 / 1024 / 1440 px on every changed shared component.
- `document.documentElement.scrollWidth <= window.innerWidth` on all affected routes.
- Tab through every changed form and verify focused controls clear both sticky headers and fixed bottom navigation.
- Empty and invalid promo submissions produce persistent, specific errors and no record.
- All visible admin phone controls follow the 40 px rule; desktop stays at 34/40 px as designed.
- Product/category/promo create and edit routes retain their existing submit, cancel, notice, and return behavior.
- Dialog focus trap, initial Cancel focus, Escape close, and focus restoration remain intact.
- Run `npm run typecheck`, `npm run lint`, `npm run check:i18n`, `npm run check:catalog`, `npm run build`, and the relevant served-browser suites.

## Patterns to protect

- Shared admin `.input`, `.select`, `.textarea`, `.field`, and `.form` primitives already solve most spacing problems; use them rather than adding local patches.
- Most admin and storefront pages had no page-level horizontal overflow at 390 px.
- Populated cart and checkout rendered labeled fields, usable quantity controls, and intact totals at phone and desktop widths.
- Product editor empty-submit validation names missing fields and focuses the first one.
- Destructive confirmation was centered after its transition, initially focused Cancel, and closed on Escape.
- Fixed bottom bars crossing a **full-page screenshot** are not themselves bugs; UI-01 was retained only after direct focus probes proved real obstruction.

## Recommended next step

**Phase 46 — put the rendered-behaviour suites back on the real catalogue**, from `docs/implementation-plan.md`. This UI audit again relied on task-specific probes; durable regression checks are what would keep these defects from returning. **Prerequisites:** local database and served build; no new dependency, deployment, provisioning, or business-policy change. **Owner approval required before implementation**, especially because this report did not authorize Phase 46 or any fixes. **Acceptance:** `verify:browser` runs green against the real 1,000+ product catalog, order fixtures are self-seeded and cleaned up, settings/guest coverage gaps are addressed, and the verified cases from UI-01 through UI-09 are added without weakening existing assertions.
