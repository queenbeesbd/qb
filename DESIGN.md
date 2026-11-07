# QueenBee's design system

## The world

**The Soft Counter.** The shop seen from behind the counter: the storefront's own lavender and blush,
a paper-white card on a lavender-tinted canvas, and one soft shadow instead of a hairline around every
surface. The admin is an operations surface, not a dashboard demo - quiet structure, obvious next
actions, and density that stays calm on a phone held in one hand.

The storefront remains the expressive surface. The admin borrows the same anchors - the owner's light
lavender `#C8B6FF` as the filled field, blush `#F6B3CC` for the one thing that waits on a person,
plum ink for text - and spends them sparingly.

Direction C was chosen on 2026-11-07 from four rendered directions (counter ledger, dispatch console,
soft counter, blueprint) on the `experiment/admin-redesign-v2` branch. The owner's two adjustments
were: keep the current bottom bar, and keep the storefront's colour scheme.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--admin-canvas` | `#f7f4ff` | Workspace canvas |
| `--admin-surface` | `#ffffff` | Cards, panels, records |
| `--admin-surface-soft` | `#fbf9ff` | Hover, decided rows, quiet fills |
| `--admin-line` | `#ece6f7` | Hairlines inside and around cards |
| `--admin-line-strong` | `#d9cff0` | Input borders, disclosure outlines |
| `--admin-ink` | `#201a29` | Text |
| `--admin-muted` | `#6a6172` | Secondary text |
| `--admin-subtle` | `#79718a` | Metadata, hints |
| `--admin-lavender` | `#c8b6ff` | The active rail pill, the queue hero, avatars |
| `--admin-lavender-soft` | `#efe9ff` | Icon plates, filter tracks, quiet fills |
| `--admin-lavender-deep` | `#8155ef` | Links and the one accent on a white card |
| `--admin-pink` | `#f6b3cc` | The queue count badge only |
| `--color-button` | `#c8b6ff` | Filled primary controls, with ink on them (9.3:1) |

Contrast: ink on `#C8B6FF` is 9.3:1; white on it is 1.81:1 and is never used. Status keeps the
semantic pairs (`--color-success`, `--color-warning`, `--color-danger`) and every pill also carries
text, so colour is never the only signal.

## Type

Two families, both already loaded: **Bricolage Grotesque** for page titles, panel titles and money
figures; **Inter** for everything read as text, with Noto Sans Bengali falling through for Bengali
data. Weights 400/500/600/700 only, no tracking on Bengali. Page title 28px (24px on a phone),
section 18px, body 15px, metadata 13px, micro-labels 11px uppercase. Numerals tabular for money and
counts.

## Shape and depth

Cards are 20px, controls 12px, small chips 10px. One shadow: a 1px contact plus a wide, low-opacity
lavender ambient (`--admin-shadow-card`); popovers and dialogs take `--admin-shadow-pop`. No hard
offset shadows, no nested cards, no coloured top rules on a figure.

## Layout

- Desktop: a 256px **white** rail with a lavender active pill, a 60px top bar, content capped at 1248px.
- Below 1024px: the rail disappears; the **fixed bottom tab bar** (64px + safe-area inset) becomes the
  primary navigation. It keeps the storefront's lavender field, ink labels and the 2px active rule.
  A "More" tab opens a bottom sheet with every remaining destination, the account and sign out.
- Content on mobile gets bottom padding equal to the bar plus the safe area; nothing hides beneath it.
- Breakpoints are structural (navigation, columns), never fluid type.

## Navigation

Primary mobile tabs, in the owner's order of use: **Overview, COD orders, Products, Orders, More**.
Customers, categories, brands, promo codes, delivery, announcement, support, hero, offer popup,
integrations, other settings, owners, audit, the storefront and sign out live in More. Tabs are built
from the server-filtered permission list, so a tab can never advertise a refusal.

The More sheet is a modal surface: focus moves to its close control, Tab is trapped, Escape closes it,
the page scroll locks, and focus returns to the More tab.

## Components

One button vocabulary (`primary`, `secondary`, `ghost`, `danger`, `dangerOutline`), two control
heights (40px default, 34px dense-row secondary, growing to 40px on touch). One record list, one panel,
one notice, one empty state, one status pill, one confirmation dialog. Cards owe their place to a task;
no card inside a card.

The order-detail rule holds: the next legal action sits directly under the page header, before the
record, and a settled order shows no action band. Each section of a record page owns one card, and a
second question inside the same card starts a new band rather than running on.

## Motion

State change only: 120-220ms, `--ease-out-ui`; the More sheet uses the drawer curve. Lists never
animate in. `prefers-reduced-motion` collapses everything. No page-load choreography.

## Bans

No eyebrow/kicker above a heading, no hero-metric scaffold, no gradient text, no glass decoration, no
coloured border-left strips on cards, no hard offset shadows, no nested cards, no emoji or unicode as
icons, no invented metrics.
