# Admin panel redesign — direction previews

Date: 2026-11-07
Branch: `experiment/admin-redesign-v2`
Status: **Phase 2 — waiting for a direction choice.** Nothing in `src/` has been changed.

## How to open

```bash
node ~/.dsh/skills/qiaomu-design/scripts/qiaomu-design-preview-server.mjs \
  --file design-previews/2026-11-07-admin-redesign/index.html
```

The page is self-contained (`index.html`). Click a direction (or press 1-4), confirm in the
dialog, and the choice is written to `selection.json` in this folder.

## Design reading

Single-store back office (order queue / catalog / settings) for one owner who confirms orders on a
phone during the day and edits products on a desktop at night. Tone: quiet, trustworthy,
thumb-first. Family: industrial-utilitarian with editorial typography.

Dials: variance 4 · motion 3 · density 6.

## Functional contract (must survive every direction)

1. Within three seconds: how many orders wait, what came in today, what is out of stock.
2. Must be completable: accept/reject a COD order, change availability, change a price, open an
   order, change a delivery charge.
3. Phone first: one-handed reach, rows are tappable, no action hidden behind hover.

## The four directions

| | Name | Vibe | Type | Colour | Layout |
|---|---|---|---|---|---|
| A | Counter ledger | A bound shop ledger | Instrument Serif + Inter | Paper, ink, one deep violet | Ruled rows, no cards |
| B | Dispatch console | A logistics terminal | All monospace | Near-black + phosphor green | Three panes; phone status line |
| C | Soft counter | A consumer app | Inter 700 | Lavender blocks + pink | Rounded card stack |
| D | Blueprint | An industrial drawing | Archivo Narrow + mono | Cream + blue ink + red | Boxed tables with corner ticks |

Recommended: **A — Counter ledger.** It keeps the shop's own lavender/ink identity, reads in
daylight, is dense enough to scan a queue, and gives money figures the weight they need without
turning the back office into a SaaS dashboard.

## Measured problems in the current panel (evidence)

Captured from the running app at 390px and 1440px with a seeded local database.

- `/admin` is **3,018px tall on a phone** and holds **15 cards/sections**; the first actionable
  queue row is below the fold.
- `/admin/catalog` is **4,207px tall on a phone** for 22 products (~191px per row) and renders
  **180 controls**.
- The desktop rail carries **20 destinations** and scrolls on a 900px-tall screen.
- The page title is printed twice (top-bar breadcrumb + `h1`).
- The product list prints the **slug** (`bioaqua-collagen-firming-good-night-mask`) — developer
  data in the owner's list.
- The order reference is 18 hex characters (`QB3F9A2C7D1E4B8A`) and is the primary line of every
  order row, ahead of the customer's name.
- The "Waiting on you" band is a large empty box whenever nothing waits.
- No horizontal overflow at 360px on any measured route (this part is sound).

## What Phase 3 will change (all directions)

- A phone-first shell: compact app bar, five-destination bottom bar, one settings hub instead of
  seven rail entries.
- A "today" strip of three facts instead of five KPI tiles.
- The queue first when it is non-empty; the money/catalog summary when it is not.
- Denser list rows with the customer name as the primary line and the reference as metadata.
- One global search across orders and products.
- Every existing route, permission check, form field and mutation preserved.
