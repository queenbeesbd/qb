# ADR 0026 - Phone chrome, one card frame and the homepage order

- **Status:** accepted (owner direction, 2026-11-05)
- **Supersedes:** the "no drawer on a phone" ruling of
  [ADR 0020](./0020-storefront-launch-presentation.md), and the 5:4 homepage card frame recorded there
- **Scope:** storefront presentation, two owner settings keys, and one narrow read endpoint. No schema
  change, no migration, no change to any order, payment, stock or audit rule

## Context

The owner reviewed the storefront against a reference shop and asked for six changes in one pass: the
phone header's shape, a floating cart, two support buttons, one card measurement, a new homepage order
with centred headings, and an add-to-cart control on homepage cards. Two of them reversed earlier
decisions, so they are recorded here rather than as a silent edit.

## Decisions

1. **The phone header is three zones, and the drawer returns.** Menu control on the left, **logo
   centred**, cart on the right, with the search row beneath. The drawer is a modal over the page and
   carries every destination - home, the catalog, the category index, each department, brands, cart and
   the account page. The fixed bottom tab bar **stays** and remains the primary navigation; the drawer is
   the long tail (a specific department, the account page). From 1024px the desktop header is unchanged
   and neither the drawer nor the tab bar renders.

   *Why the earlier ruling is reversed:* ADR 0020 removed the drawer to leave one navigation model per
   size. The owner's reference puts the logo in the middle and a menu on the left, and that composition
   has no room for a nav row; the bar still answers "where do I go next" and the drawer answers "where is
   this specific thing". Two surfaces are acceptable because they are not two copies of the same list.

2. **One card frame: 4:5 everywhere.** `CARD_FRAME` and `LISTING_CARD_FRAME` are now the same value.
   *Why:* the 5:4 homepage crop cut the top and bottom off portrait product photography, and a product's
   homepage card no longer matched its listing card. A single measurement is what makes a card read as
   the same object wherever a shopper meets it.

3. **A floating cart box and a support rail, both server-driven.** The cart box sits at the right edge
   and states the item count and - when every line can be priced - the subtotal. The support rail sits
   above the tab bar with a Facebook and a WhatsApp button whose addresses are the owner's
   `store_setting` values (`support.facebook_url`, `support.whatsapp_url`, edited at Settings →
   Support links). **A link that is not set renders no button**, both are validated as absolute `https`
   addresses, and both open in a new tab with `rel="noopener noreferrer"`.

4. **Homepage order and headings.** Hero, Shop By Category, Shop By Brand, On Offer, Most Selling,
   Recently Added, More To Explore. Every section heading is centred and title-cased with at most one link
   into its full listing beneath it. The **featured row is removed** by that order; its curation still
   seeds, so restoring it is a view change rather than a migration.

5. **"Most Selling" is a derived fact, never a curation.** It ranks products by real `order_item` units,
   excludes cancelled orders, yields to Recently Added (recency cannot be filtered without becoming a
   false claim), breaks ties by product id, and states its gap in words when the shop has sold nothing.
   This is the only wording on the page that implies trade, so it may never be fed by a list the owner
   curated or by a fixture.

6. **Homepage cards carry an Add to cart control.** Outlined, 40px, full width. Out of stock and unknown
   availability are **disabled and labelled**, never hidden - availability is the only ordering gate
   (ADR 0010/0013), and a customer must be able to see that a product exists and cannot be bought.

7. **One new read endpoint: `GET /api/cart/prices`.** The floating box needs a price per line, and the
   layout deliberately does not carry the catalog (2026-10-29). The endpoint reads the ids in the
   `qb_cart` cookie and answers with a unit price per id: **no quantity, no discount, no shipping, no
   total**, `cache-control: no-store`, and nothing authoritative - the order transaction re-reads every
   price. A forged cookie can only ask about products the shop already publishes at prices it already
   shows.

## Consequences

- Two new settings keys and their admin screen; audit action `settings.support_links_updated`.
- The first screen no longer carries a product: two discovery rows (departments, brands) sit above the
  merchandise by the owner's order. That is stated in `verify:browser` rather than papered over.
- The featured row is gone from the homepage until the owner asks for it back.
- The storefront makes one extra request per page load **when the cart is not empty**, to price the
  floating box.

## Not decided here

No browser upload, no object storage, no courier or payment change, and nothing about deployment. A
support link is a URL the owner types; it is not a chat widget, a tracking script or a third-party embed.
