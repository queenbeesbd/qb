# QueenBee's design system

## The world

**The Beehive Desk.** A warm paper desk in a bright shop: soft lavender chrome, plum ink, white
records, and the brand's purple and blush used where they carry meaning. The admin is an operations
surface, not a dashboard demo: quiet structure, obvious next actions, and density that stays calm.

The storefront remains the expressive surface. The admin borrows the same anchors - plum `#56358C`
for filled actions, lavender `#A680FF` and blush `#F6B3CC` as accents - and spends them sparingly.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--color-page` | `#faf8fc` | Workspace canvas |
| `--color-surface` | `#ffffff` | Records and panels |
| `--color-admin-sidebar` | `#f3edff` | Desktop rail, a lavender wash |
| `--color-admin-sidebar-ink` | `#2a2136` | Rail text |
| `--color-admin-sidebar-muted` | `#6f6480` | Rail labels and inactive links |
| `--color-action` | `#56358c` | Primary action, active tab, selection |
| `--color-action-soft` | `#f3edff` | Soft selection and badge fills |
| `--brand-secondary` | `#f6b3cc` | Small emphasis only, always with dark text |
| `--color-border` | `#e4dfeb` | Hairlines and record outlines |

Contrast: white on `#56358C` passes; white on `#A680FF` does not (2.94:1), so lavender is never a
filled action behind white text. Secondary text is tinted from the surface hue, never generic gray.

## Type

One family: the storefront's Inter (Latin) with Noto Sans Bengali for Bengali data. Fixed rem scale,
weights 400/500/600/700 only, no tracking on Bengali. Page title 28px, section 18px, body 15px,
metadata 13px, labels 12px. Numerals tabular for money and counts.

## Layout

- Desktop: a 248px lavender rail, a 60px top bar, content capped at 1200px.
- Below 1024px: the rail disappears; a **fixed bottom tab bar** (64px + safe-area inset) becomes the
  primary navigation. A "More" tab opens a bottom sheet with every remaining destination, the account
  and sign out.
- Content on mobile gets bottom padding equal to the bar plus the safe area; nothing hides beneath it.
- Breakpoints are structural (navigation, columns), never fluid type.

## Navigation

Primary mobile tabs, in the owner's order of use: **Overview, COD orders, Products, Orders, More**.
Customers, categories, delivery, announcement, owners, audit, the storefront and sign out live in
More. Tabs are built from the server-filtered permission list, so a tab can never advertise a refusal.

The More sheet is a modal surface: focus moves to its close control, Tab is trapped, Escape closes it,
the page scroll locks, and focus returns to the More tab.

## Components

One button vocabulary (`primary`, `secondary`, `ghost`, `danger`, `dangerOutline`), two control
heights (40px default, 34px dense-row secondary, growing to 40px on touch). One record list, one panel,
one notice, one empty state, one status pill, one confirmation dialog. Cards owe their place to a task;
no card inside a card.

The order-detail rule holds: the next legal action sits directly under the page header, before the
record, and a settled order shows no action band.

## Motion

State change only: 120-220ms, `--ease-out-ui`; the More sheet uses the drawer curve. Lists never
animate in. `prefers-reduced-motion` collapses everything. No page-load choreography.

## Bans

No eyebrow/kicker above a heading, no hero-metric scaffold, no gradient text, no glass decoration, no
colored border-left strips on cards, no hard offset shadows, no nested cards, no emoji or unicode as
icons, no invented metrics.
