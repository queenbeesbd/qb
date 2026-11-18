# ADR 0043 - The support rail is two provider-coloured discs, and Messenger replaced Facebook

Status: accepted (owner direction, 2026-11-19). **Reverses the colour half of the 2026-11-05 owner
direction** ("both filled with the brand ... so the rail reads as part of the shop rather than as a third
brand colour") and **amends ADR 0026**, which recorded a Facebook button reading
`support.facebook_url`. Nothing else about the rail changes: the address, the 44px circle, the
bottom-right corner, the inert-on-empty rule and `rel="noopener noreferrer"` all stand.

## Context

The rail carried a Facebook mark and a WhatsApp mark, both drawn in the shop's own ink on the shop's own
lavender. The reasoning at the time was palette hygiene: two other companies' colours would import a
second palette into a shop that had just settled on one.

The owner photographed the result on their phone and asked for the opposite, in their words: *match both
WhatsApp and Messenger to its own brand colour, like WhatsApp's green.* Two things had changed under that
ruling:

1. **The rail is not a shop surface, it is a switchboard.** The icon's job is to answer "which app do I
   reach the shop on", and at 20px on a phone a brand colour answers it before the glyph is resolved. Two
   lavender discs made the customer read both marks to tell them apart.
2. **Facebook was the wrong destination.** A page is something to read; the owner wanted a conversation.
   Messenger is the app that replies, and Meta's `m.me` link opens exactly that.

## Decision

1. **Two discs, each in its own provider's colour.** `--whatsapp-green` (#25d366) and a new
   `--messenger-blue` (#0084ff). A provider colour is used **only for that provider's own channel** - this
   rail and the product page's "Order on WhatsApp" control - and never carries meaning: the shop's own
   green for a good outcome stays `--color-success`, and a provider colour on a badge, a status pill or a
   chart series would be a lie about what it says. The shared rule's lavender fill survives as the
   **fallback** for a channel added without its own token, so a new button can never render as a hole.
2. **The mark is ink on both discs, never white.** White on #25d366 is **1.98:1** and on #0084ff
   **3.66:1**; ink is **8.53:1** and **4.63:1**. This is the same answer the product page's WhatsApp
   order button already gives, so the shop has exactly one rule for "what colour is a provider's own
   button": the provider supplies the field, the shop keeps the legible mark. The white-glyph versions the
   providers ship were considered and refused: white glyphs would force the fields down to #128c7e and
   #006aff, which are not the colours the owner pointed at.
3. **Facebook is removed, not kept beside Messenger.** There is one setting, `support.messenger_url`, and
   the admin field asks for an `m.me` address and says why. `FacebookIcon` is deleted rather than left
   unused.
4. **A stored Facebook page address is not carried over (migration `0035`).** `https://www.facebook.com/<page>`
   opens a page; `https://m.me/<page>` opens a chat. Copying the value would put a Messenger-blue disc on a
   link that lands somewhere else, which is worse than the button the shop had, so the migration carries the
   value **only when it is already a Messenger address**, then removes the old key. The owner pastes their
   `m.me` link once at Settings -> Support links; until then the rail shows WhatsApp alone.
5. **Hover lightens, and focus is the shop's ring.** Both fields are already saturated, and a step darker
   would push the ink glyph on the blue under 4.5:1 exactly while the customer aims at it, so hover is
   `brightness(1.06)` and keyboard focus is the 2px `--color-focus` ring.

## Consequences

- The rail is two recognisable colours in the corner of a phone screen, and the shop's palette is
  untouched everywhere else - the exception is written down rather than implied.
- The Messenger button stays **off** until the owner supplies an `m.me` link, which the admin page states.
  That is an honest gap, not a silent one.
- A third channel needs its own token and its own measured ink contrast; the fallback keeps it from being
  invisible in the meantime.
- Not affected: WhatsApp ordering from a product page, the contact page's channel list (it reads the same
  two settings), the support-links audit record, and every settings permission.
