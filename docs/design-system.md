# Design system

Status: Phase 2 refinement complete (2026-10-11). Tokens live in `src/app/globals.css`; component styles are CSS Modules. Items marked *not built* are explicitly deferred.

## Direction

Product-led, calm, precise. The shopper compares brand, pack size, price and availability without hunting, and purple/pink are used deliberately rather than painted over every surface. Authentic product photography now carries the visual weight.

## Colour tokens

| Token | Value | Role |
| --- | --- | --- |
| `--brand-primary` | `#A680FF` | Approved brand anchor. Accents and thin borders. |
| `--brand-secondary` | `#F6B3CC` | Approved accent anchor. Sparse supporting surfaces. |
| `--color-action` | `#56358C` | Filled actions with white labels. |
| `--color-action-hover` | `#462A75` | Action hover. |
| `--color-action-soft` | `#F3EDFF` | Announcement strip, tinted panels, active chips, icon wells. |
| `--color-accent-soft` | `#FDEEF3` | Pink tint for decorative surfaces. |
| `--color-ink` | `#201A29` | Primary text. |
| `--color-ink-muted` | `#6A6172` | Secondary text. |
| `--color-ink-subtle` | `#857E8D` | Tertiary text and captions. |
| `--color-page` | `#FAF8FC` | Page canvas. |
| `--color-surface` | `#FFFFFF` | Cards and panels. |
| `--color-surface-sunken` | `#F4F1F8` | Image wells and inset areas. |
| `--color-border` | `#E4DFEB` | Decorative dividers only. |
| `--color-border-strong` | `#877B91` | Essential control outlines. |
| `--color-focus` | `#7952B3` | Focus ring, 2px with offset. |
| `--color-success` / `-soft` | `#23633E` / `#E8F3EC` | Savings and confirmations. |
| `--color-danger` / `-soft` | `#9B263E` / `#FBEAEE` | Removal and destructive actions. |
| `--color-warning` / `-soft` | `#755100` / `#FDF3E2` | Demo notices and unavailable data. |

### Measured contrast

Computed WCAG relative-luminance ratios, which drove the palette:

| Pair | Ratio | Verdict |
| --- | --- | --- |
| White on `#A680FF` | 2.94:1 | **Fails** - never used for text |
| White on `#F6B3CC` | 1.72:1 | **Fails** - decorative only |
| Ink on `#A680FF` | 5.76:1 | Passes AA |
| Ink on `#F6B3CC` | 9.86:1 | Passes AA |
| White on `#56358C` | 9.20:1 | Passes AAA - all filled actions |
| Muted on white | 5.89:1 | Passes AA |
| Focus on white | 5.72:1 | Passes AA |
| Ink on `#F3EDFF` (announcement strip) | 14.2:1 | Passes AAA |

White-on-primary fails, which is why filled buttons use `--color-action`. Deliberate, not an oversight.

## Typography

### Families

- **English: Inter** (`next/font/google`, self-hosted at build, `display: swap`). Variable, weight axis 100-900.
- **Bangla: Noto Sans Bengali**, weights 400/500/600/700, self-hosted the same way.
- Wired as `--font-latin` / `--font-noto-bengali`; `html[lang='bn'] body` switches to the Bengali stack and raises base line-height to 1.7.

### Phase 2 decision: retain both families, fix the weight scale

The English typeface was reviewed against the brief's criteria - letterform character, small-size readability, heading personality, navigation density, product-name wrapping, numerical clarity, consistency with the Bangla face, and cross-device rendering - and **retained**. Inter is a neutral, high-x-height grotesque with excellent small-size legibility and a full variable weight axis, and it pairs cleanly with Noto Sans Bengali. There was no demonstrated weakness that justified a change, and changing for novelty is explicitly out of scope.

A real inconsistency was found and fixed instead. The CSS requested **550** and **650**, which Inter (variable) renders exactly but Noto Sans Bengali (discrete 400/500/600/700) cannot - so Bangla silently substituted to 700/600 while English rendered 650/550. The two scripts disagreed at the same nominal value.

All weights are now constrained to the **intersection both families actually ship**:

| Weight | Use |
| --- | --- |
| 400 | Body copy, descriptions |
| 500 | Navigation, secondary labels, muted values |
| 600 | Headings h1-h4, card titles, buttons, emphasis |
| 700 | Prices, totals, badges, numeric emphasis |

Verified in the browser: Bangla and English headings both resolve to 600 and report identical weights.

### Scale and rules

- Scale: 12 / 13 / 15 / 16 / 18 / 22 / 28 / 34 px via `--text-xs` to `--text-3xl`. Body 15px with 1.6 leading; headings tight leading.
- **No letter-spacing on Bengali text.** Negative tracking is a Latin device; applied to Bengali it distorts conjunct clusters. `html[lang='bn']` resets tracking to `normal` for h1-h4 and `.ui-label`, overriding the global `-0.01em`. Verified in the browser.
- No fixed-height text containers, so Bangla conjuncts and long product names never clip.
- Prices use `font-variant-numeric: tabular-nums` so columns align in both digit systems.

## Spacing, shape, motion

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px (`--space-1` to `--space-8`).
- Radii: 4 / 8 / 12 px plus a pill for filter chips only. Cards are not all rounded.
- Two shadows only, used for hover elevation and sticky panels.
- Motion: 120ms state feedback, 180ms panel transitions. `prefers-reduced-motion` collapses all durations globally; the featured shelf also switches its scroll to instant rather than smooth. No parallax, marquee or autoplay.

## Components

- **AnnouncementBar** - slim strip above the header, driven by `src/data/announcements.ts`. Tinted `--color-action-soft`, 13px text, wraps rather than overflowing. Visually subordinate to navigation by size and weight.
- **ProductPhoto** - one `<picture>` for all catalog imagery: WebP source, JPEG fallback, explicit dimensions, `sizes` hints, lazy by default and eager for the detail hero. Owns the 3:4 aspect ratio.
- **ProductCard** - 3:4 photo, brand eyebrow, title, pack, price row (current bold, comparison struck through) and a derived saving. No badges, ratings or urgency.
- **FeaturedShelf** - two-row horizontally navigable shelf. Column-wise grid flow with horizontal overflow; controls appear only when scrolling is possible and disable at each end.
- **QuantityStepper** - accessible minus/plus with a numeric input clamped to 1..20 before reaching the parent.
- **Header** - sticky, three-column grid. Desktop shows inline nav plus search; below 720px both collapse into a focus-trapped drawer.
- **Filter chips** - pill-shaped buttons with `aria-pressed`; only filters get pills.
- **Empty/absent states** - dashed-border note blocks with an info icon, used for missing discounts, unverifiable dates, empty search and empty cart.

## Logo and favicon

Original geometry, no stock beauty icon and no imitation of another brand: a hexagonal badge built from an abstract bee/wing form with a pink body band and a small pointed tail.

| Asset | Path | Use |
| --- | --- | --- |
| Wordmark | `public/brand/logo.svg` | Header. Colours driven by CSS variables. |
| Mark | `public/brand/logo-mark.svg` | Square mark for compact contexts. |
| Dark variant | `public/brand/logo-dark.svg` | Light text for dark surfaces. |
| Favicon | `public/brand/favicon.svg` | Simplified badge on a `#56358C` tile - legible at 16px. |

*Not built:* category iconography beyond the five restrained line glyphs in `src/components/icons.tsx`, and a Bangla wordmark variant.

## Responsive behaviour

Breakpoints: 600px (category grid 1 to 2 columns), 720px (nav and search appear, footer to 3 columns, grid to 3), 880px (hero splits into copy plus product composition, category grid to 5, catalog sidebar, PDP and cart to two columns), 1024px (grid to 4, shelf to 4 columns).

Featured shelf visible columns: 2 on mobile, 3 on tablet, 4 on desktop, always in exactly two rows.

Verified with no horizontal overflow at 320, 375, 768, 1024 and 1440px, including with the announcement strip present. Touch targets: primary controls at least 40px; breadcrumb links raised to a 24px minimum (WCAG 2.5.8).

*Unverified:* real iOS Safari and Android Chrome, 200% zoom reflow, and screen-reader output on real assistive technology.
