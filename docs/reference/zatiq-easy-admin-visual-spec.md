# Zatiq Easy merchant dashboard - measured visual specification (Phase 29)

Companion to `docs/reference/zatiq-easy-admin-audit.md` (what exists and what we do) and
`docs/reference/zatiq-easy-admin-parity.md` (field mapping and roadmap).

**Every value here is measured**, taken from `getBoundingClientRect()` and `getComputedStyle()` in a
1440 x 900 Chromium viewport. Nothing is estimated from a picture. Where the browser reported a colour
as `lab()`/`oklab()`, the raw value is quoted rather than a guessed hex.

Screenshots were captured but **not visually interpreted** by this audit (the auditing model reads text
and geometry, not images). They are indexed in section 8 for the owner's own review and are deliberately
**not committed** - they contain third-party customer data.

## 1. Shell geometry

| Element | Measured value |
| --- | --- |
| Viewport | 1440 x 900, document scroll width 1440 (no page-level horizontal overflow) |
| Sidebar column | 240 px wide, full height |
| Sidebar inset panel | 224 x 884 at (8, 8); white; radius **10 px**; border 1 px `lab(91.2 -0.32 -0.12)` (≈ `#e4e4e6`) |
| Sidebar header | 222 x 47 at (9, 9) - logo row |
| Sidebar footer | 222 x 117 at (9, 775) - plan card |
| Nav item | **206 x 32** at x = 17; radius 8 px; padding 8 px; **14 px / 500** |
| Nav item, active | background `lab(91.69 -0.74 -14.88)` (pale violet), text `lab(39.02 33.18 -85.59)` (violet) |
| Nav item, idle | transparent background, text `lab(16.14 -1.18 -10.37)` (near-black) |
| Group label | **12 px / 500**, 32 px tall, colour = ink at 70 % opacity |
| Group spacing | groups begin at y = 56, 292, 704, 864, 988 (a 36 px gap between groups) |
| Top bar | **1200 x 57** at (240, 0); white; shadow `0 1px 3px rgba(0,0,0,.1), 0 1px 2px -1px` |
| Top bar toggle | 28 x 28, radius 8 px |
| Top bar icon buttons | 38 x 38, radius 10 px |
| Account control | 56 x 56 hit area at the far right |
| Main region | x = 240, width 1200; content padding **24 px** (cards start at x = 264, width 1152) |

## 2. Type scale

| Role | Size / weight | Notes |
| --- | --- | --- |
| Page title (list screens) | **20 px / 600** | "Orders", "All Products", "Categories", "Customers" |
| Report title | **30 px / 600** | "Order Report" - the analytics screen breaks the 20 px rule |
| Dashboard greeting | **24 px / 700** | "Good afternoon, {store}!" |
| Section heading in card | 18 px / 500 | e.g. "Create Category" dialog title |
| Body / table / input text | **14 px / 400** | the whole panel is 14 px |
| Table header cell | 14 px / 500 | no uppercase transform, normal letter-spacing |
| Group label / caption | 12 px / 500 | |
| Status pill | **12 px / 500** | |
| Pagination page-size select | 12 px | |

Font stack resolves to the system sans (no custom webfont observed in the computed `font-family`).

## 3. Controls

| Control | Measured |
| --- | --- |
| Primary button | height **36 px** (Orders, Products) or **40 px** (Categories, Users) - **inconsistent**; radius **8 px** or **10 px** - also inconsistent; filled `lab(19.52 85.09 -94.30)` (≈ `#6d28d9`); label 14 px / 400-500; padding 0-6 px 10-12 px |
| Secondary / outline button | 32 px tall on list toolbars ("Export" 91 x 32, "Columns" 96 x 32), radius 8 px |
| Search field | **36 px** tall; radius 8 px (orders) or 10 px (products); 14 px text |
| Text input | **44 px** tall, radius 8 px, border `rgb(224,225,230)`, padding 8 px 16 px, 14 px text |
| Textarea | 228 px tall in the category dialog |
| Select | 36-44 px, radius 8 px |
| Upload slot (square image) | **351 x 379** target area; "Add Image" chip **113 x 40**, radius 10 px, background `rgb(237,242,247)` |
| Icon-only row action | 16 x 16 glyph inside a 24-28 px hit area, radius 6 px; destructive variant turns red on hover |
| Table row height | **48 px** (dashboard recent orders), **53 px** (customers), **57 px** (orders, products, categories) - three densities in one product |
| Table header row | 40 px |
| Table cell padding | 8 px (orders uses 8 px left only) |
| Status pill | radius **26 px** (fully rounded); padding 2 px 8 px; tinted background `lab(96.49 -1.15 -5.11)` with violet text `lab(36.91 35.10 -85.69)` |

**Contrast note.** The reference uses a saturated violet fill with white text for primary actions. It
passes at this size, but QueenBee's deliberately does not copy it: `#DCCFFF` with white fails at
1.46:1, which is why QueenBee's filled actions use the lavender field with ink (`--color-button`).

## 4. Surfaces

| Surface | Measured |
| --- | --- |
| Card | radius **14 px** (quick-action tiles), 1 px border, white; dashboard banner card 1152 x 106 |
| Modal card (Create Category) | **750 x 778**, radius **10 px**, white, padding 16 px, shadow `0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1)` |
| Modal backdrop | full-viewport `rgb(0,0,0)` at 40 % opacity (`opacity-40` on a full-screen div) |
| Modal footer | two equal columns: Cancel **348 x 46** (outline, radius 10 px) and Create **346 x 44** (filled, radius 10 px) |
| Modal section label | 14 px / 500 |
| Page background | white; cards sit on white with a 1 px border - the reference has almost no background layering |

## 5. Table composition (measured column widths)

Customers table, total **985 px** inside a 1200 px main region:

| Column | Width |
| --- | --- |
| selection | 26 |
| Customer | 278 |
| Phone | 169 |
| Orders | 123 |
| District | 72 |
| Address | 334 |
| Joined | 123 |

The table is **fixed-width (985 px) and scrolls horizontally inside its container**. At a 768 px
viewport the main region is 528 px and the table stays 985 px while `document.scrollWidth` stays 768 -
the containment rule QueenBee's already enforces on its storefront shelves.

## 6. Responsive behaviour (measured)

| Viewport | Sidebar | Main width | Table | Document overflow |
| --- | --- | --- | --- | --- |
| 1440 x 900 | 240 px | 1200 | 985 | none |
| 1280 x 800 | 240 px | 1040 | 985 | none |
| 1024 x 768 | 240 px | 784 | 985 | none (table scrolls inside) |
| 768 x 1024 | 240 px | 528 | 985 | none (table scrolls inside) |
| 390 x 844 | **hidden**, hamburger present | 390 | 985 | none (table scrolls inside) |

The breakpoint is **768 px**, not 1024 px. QueenBee's collapses its rail at 1024 px, which is the
stricter and more usable choice for dense admin tables - keep QueenBee's value.

## 7. Interaction states observed

| State | Observation |
| --- | --- |
| Hover | nav rows tint; icon-only actions reveal a background; row action icons appear on hover |
| Focus | a visible focus ring exists on buttons and inputs (browser default plus a ring utility) |
| Active nav | pale violet pill + violet label (see section 1) |
| Disabled | `disabled:opacity-50` on the destructive row action |
| Loading | lists render an empty table body until data arrives; no skeleton observed |
| Empty | subcategories: "Your sub categories list is currently empty" + "Lets get started by adding your first sub category now" + an "Add Sub Category" button; devices/IP: "No devices or IP addresses yet" + an explanation line |
| Error | native browser validation bubbles only (see below) |
| Success | no toast observed; the modal closes and the list refreshes |

### 7.1 Validation and accessibility gaps (recorded, not adopted)

1. Empty **Category Name** + Create produces the browser bubble *"Please fill out this field."* - no
   inline message, no `aria-invalid`, no summary.
2. Empty **Item Name** + Save produces both a native bubble and a custom *"Item Name is required"*; the
   Sell/Current Price field produces only the native bubble. Two error mechanisms in one form.
3. The category overlay has **no `role="dialog"`** and no `aria-modal`; it is a `div` with
   `position: fixed`.
4. Table header cells have no `scope`; status is conveyed by a coloured pill **and** text (good).
5. Icon-only row actions rely on `title` attributes (`Edit`, `Delete`, `View subcategories`) rather than
   `aria-label`.

QueenBee's already does better on all five (inline field errors, labelled controls, a focus-trapped
drawer). **Do not regress these in the name of parity.**

## 8. Screenshot index (not committed)

Directory: `/tmp/zq/shots/` - outside the repository, on purpose (third-party customer data).

| File | Screen / state |
| --- | --- |
| `01-after-login.png` | first authenticated landing |
| `02-dashboard.png`, `02b-dashboard.png` | dashboard, full page |
| `10-orders.png` | orders list |
| `11-products.png` | products list |
| `12-categories.png` | categories list |
| `13-customers.png` | customers list |
| `20-analytics.png` | order report |
| `21-users.png` | users & permissions |
| `22-promo.png` | promo codes |
| `30-settings-menu.png` | sidebar after attempting the Settings group |
| `40-order-detail.png` | order detail |
| `50-customer-detail.png` | customer detail |
| `51-customer-drawer.png` | customer row interaction |
| `52-category-dialog.png`, `53-category-dialog.png` | Create Category modal |
| `54-category-validation.png` | Create Category, empty submit |
| `60-product-create.png`, `61-product-create-full.png` | product create, all sections |
| `62-product-validation.png` | product save with required fields empty |
| `63-product-extras.png` | variants / details / category assignment |
| `64-assign-category.png` | category assignment overlay |
| `65-product-edit.png` | product edit |
| `80-products-{1440,1280,1024,768,390}.png` | responsive shell |
| `85-misc` (data only) | subcategory page, promo modal |

Raw measurements are in `/tmp/zq/data/*.json` (one file per probe) and are reproducible with the probe
scripts in `/tmp/zq/p-*.mjs`. Those scripts are throwaway audit tooling, not repository code.

## 9. What to copy, what to refuse

**Copy (the ideas, not the pixels):**

1. A dense table with an avatar/initial cell, a secondary line under the primary value, and a status
   pill - the reference packs far more signal per row than a plain table.
2. The toolbar pattern: title left, primary action right, then a row of filters/tabs under it.
3. Sectioned product form (General / Media / Pricing / Inventory / Category / Shipping) with collapsible
   groups.
4. Modal composition: title + close, labelled upload slots with explicit size rules, two-column footer.
5. Specific empty states that name the next action.

**Refuse:**

1. Three table row heights (48/53/57) and two button heights (36/40) - QueenBee's has one control scale
   (`--admin-control` 40 px, `--admin-control-sm` 34 px) and must keep it.
2. Native-only validation, unlabelled modals, `title`-only icon buttons.
3. A saturated violet primary button (contrast), 26 px pill radius everywhere, and the near-flat white
   surface stack that gives the reference almost no visual hierarchy.
4. Anything that hides a required field or a consequence behind a collapsed disclosure.
