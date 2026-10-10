# Design system

Status: implemented in Phase 1. Tokens live in `src/app/globals.css`; component styles are CSS Modules. Items marked *not built* are explicitly deferred.

## Direction

Product-led, calm, precise. The shopper compares brand, pack size, price and availability without hunting, and purple/pink are used deliberately rather than painted over every surface. Original placeholder imagery carries the visual weight until licensed photography replaces it.

## Colour tokens

| Token | Value | Role |
| --- | --- | --- |
| `--brand-primary` | `#A680FF` | Approved brand anchor. Accents and thin borders. |
| `--brand-secondary` | `#F6B3CC` | Approved accent anchor. Sparse supporting surfaces. |
| `--color-action` | `#56358C` | Filled actions with white labels. |
| `--color-action-hover` | `#462A75` | Action hover. |
| `--color-action-soft` | `#F3EDFF` | Tinted panels, active filter chips, icon wells. |
| `--color-accent-soft` | `#FDEEF3` | Pink tint for decorative surfaces. |
| `--color-ink` | `#201A29` | Primary text. |
| `--color-ink-muted` | `#6A6172` | Secondary text. |
| `--color-ink-subtle` | `#857E8D` | Tertiary text and captions. |
| `--color-page` | `#FAF8FC` | Page canvas. |
| `--color-surface` | `#FFFFFF` | Cards and panels. |
| `--color-surface-sunken` | `#F4F1F8` | Image wells and inset areas. |
| `--color-border` | `#E4DFEB` | Decorative dividers only. |
| `--color-border-strong` | `#877B91` | Essential control outlines (inputs, steppers, filters). |
| `--color-focus` | `#7952B3` | Focus ring, 2px with offset. |
| `--color-success` / `-soft` | `#23633E` / `#E8F3EC` | Savings and confirmations. |
| `--color-danger` / `-soft` | `#9B263E` / `#FBEAEE` | Removal and destructive actions. |
| `--color-warning` / `-soft` | `#755100` / `#FDF3E2` | Demo notices and unavailable data. |

### Measured contrast

Computed WCAG relative-luminance ratios (2026-10-11), which drove the palette:

| Pair | Ratio | Verdict |
| --- | --- | --- |
| White on `#A680FF` | 2.94:1 | **Fails** - never used for text |
| White on `#F6B3CC` | 1.72:1 | **Fails** - decorative only |
| Ink on `#A680FF` | 5.76:1 | Passes AA normal text |
| Ink on `#F6B3CC` | 9.86:1 | Passes AA |
| White on `#56358C` | 9.20:1 | Passes AAA - used for all filled actions |
| Muted on white | 5.89:1 | Passes AA |
| Focus on white | 5.72:1 | Passes AA |

The white-on-primary failure is why filled buttons use `--color-action` rather than the brand purple. That is a deliberate constraint, not an oversight.

## Typography

- English: **Inter** via `next/font/google`, self-hosted at build, `display: swap`.
- Bangla: **Noto Sans Bengali**, weights 400/500/600/700, self-hosted the same way.
- Both are wired as CSS variables (`--font-latin`, `--font-noto-bengali`). `html[lang='bn'] body` switches to the Bengali stack and raises base line-height to 1.7.
- Scale: 12 / 13 / 15 / 16 / 18 / 22 / 28 / 34 px via `--text-xs` to `--text-3xl`. Body is 15px with 1.6 leading; headings use tight leading and `-0.01em` tracking.
- Bangla rules: letter-spacing is never applied to Bengali text, no fixed-height text containers, and interactive controls receive extra line-height so conjuncts are not clipped.
- Prices use `font-variant-numeric: tabular-nums` so columns align in both digit systems.

## Spacing, shape, motion

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px (`--space-1` to `--space-8`).
- Radii: 4 / 8 / 12 px plus a pill for filter chips only. Cards are not all rounded - only containers that group content use `--radius-lg`.
- Two shadows only (`--shadow-sm`, `--shadow-md`), used for hover elevation and sticky panels.
- Motion: 120ms for state feedback, 180ms for panel transitions. `prefers-reduced-motion` collapses all durations globally and is verified in the browser suite. No parallax, marquee or auto-carousel.

## Components

- **ProductCard** - square image well, brand eyebrow, title, pack, then a price row (current bold, comparison struck through) and a derived saving. Only verified facts; no badges, ratings or urgency.
- **QuantityStepper** - bordered group with accessible minus/plus buttons and a numeric input clamped to 1..20 before it reaches the parent.
- **Header** - sticky three-column grid. Desktop shows inline category nav plus search; below 720px these collapse into a focus-trapped drawer. Language toggle and cart badge are always present.
- **Filter chips** - pill-shaped buttons with `aria-pressed`; only filters get pills.
- **Price display** - one shared presentation via the money helpers; the comparison price carries an `sr-only` previous-price label.
- **Empty/absent states** - dashed-border note blocks with an info icon, used for missing discounts, unverifiable dates, empty search and empty cart.

## Logo and favicon (implemented)

Original geometry, no stock beauty icon and no imitation of another brand: a hexagonal badge built from an abstract bee/wing form with a pink body band and a small pointed tail.

| Asset | Path | Use |
| --- | --- | --- |
| Wordmark | `public/brand/logo.svg` | Header. Mark and ink colours driven by CSS variables. |
| Mark | `public/brand/logo-mark.svg` | Square mark for compact contexts. |
| Dark variant | `public/brand/logo-dark.svg` | Light text for dark surfaces. |
| Favicon | `public/brand/favicon.svg` | Simplified badge on a `#56358C` tile - legible at 16px, not a scaled-down wordmark. |

All four are plain SVG with a `viewBox`, no scripts and no external references. The favicon is wired through `metadata.icons`.

*Not built:* category iconography beyond the five restrained line glyphs in `src/components/icons.tsx`, and a Bangla wordmark variant.

## Responsive behaviour

Breakpoints: 600px (category grid 1 to 2 columns), 720px (nav and search appear, footer to 3 columns, grid to 3), 880px (hero splits, category grid to 5, catalog sidebar, PDP and cart to two columns), 1024px (grid to 4).

Verified with no horizontal overflow at 320, 375, 768, 1024 and 1440px. Touch targets: primary mobile controls are at least 40px; inline breadcrumb links are raised to a 24px minimum (WCAG 2.5.8).

*Unverified:* real iOS Safari and Android Chrome, 200% zoom reflow, and screen-reader output on real assistive technology.
