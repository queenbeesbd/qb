# Ghorer Bazar reference analysis

Date: 2026-10-11. Functional inspiration only; no identity, text, logo, product images, category art, or grocery taxonomy may be copied.

## Evidence and limits

- R1: https://ghorerbazar.com/ — extracted homepage text (18,000-character bound), header/footer selectors; raw prefix limited to 20,000 characters, largely head/CSS.
- R2: https://ghorerbazar.com/collections/honey-2 — extracted category listing.
- R3: https://ghorerbazar.com/products/gawa-ghee-1kg — extracted product detail.

No configured browser. Actual desktop/mobile layout, sticky behavior, search execution, filter/sort controls, drawer focus handling, quantity actions, checkout and payments remain unverified. No account/cart/order mutations. Static markup may include hidden UI; presence does not prove visibility or operation.

## Observed composition

R1: Featured Categories (10 image-linked entries), Top Selling Products, Our Brands with See all, several category shelves with View all items (honey, dates, cooking essentials, organic-certified), Just For You link, mixed English/Bangla testimonials. Product snippets contain linked name/image, current price, occasional previous price, savings, Best Selling/New Arrival/Offered Items badges. Many extracted image URLs are loading GIFs, so do not conclude photography is missing.

Header extraction: Track Order, Sign In, Wishlist, Cart count; shopping-cart fragment with Close and `No items in your cart!`; More menu with FAQ/support; Offer Zone, deep category submenus, Flash Sale. Footer: policies, shipping/payment/how-to-order/support links and app download links. Search controls were not recovered; search/mobile navigation quality cannot be assessed.

R2: named product listing with current/previous prices and savings/new/bestselling badges. R3: several gallery URLs, title, prices, short description, Quantity label, WhatsApp/call affordances, brand link, Frequently bought together total, Product Details, usage/storage, video link, related products. Purchase/cart control execution unverified.

## Pattern evaluation

| Pattern and evidence | What it accomplishes / why it can work | QueenBee's adaptation | Worth implementing? |
| --- | --- | --- | --- |
| Image-linked categories (R1) | Recognizable entrances reduce scanning cost; labels anchor image meaning | Four or five reviewed cosmetics groups; original restrained bottle/tube/tool icon family, always text-labeled | Yes after taxonomy validation; custom artwork conditional on budget |
| Category shelves + View all (R1) | Samples catalog without presenting every item; preserves route to full listing | One compact featured product grid plus New arrivals and Deals only when data supports them | Yes, fewer shelves; avoid repeated product duplication |
| Current/previous price and savings (R1–R3) | Purchase comparison becomes immediate | Shared price component, BDT formatting, derived savings, explicit old-price label for assistive tech | Yes; no fabricated discounts or percentage exaggeration |
| New Arrival / Best Selling badges (R1/R2) | Helps scanning curated inventory | Use approved `addedAt` for recency; do not infer bestseller from page order or invent sales | New arrivals yes with evidence; bestseller conditional |
| Brand links (R1/R3) | Useful route for brand-led shopping | Brand filter in listing first; dedicated brand pages only if catalog warrants | Filter yes; homepage logo wall optional and permission-dependent |
| Product gallery + details (R3) | Supports inspection and purchase confidence | Consistent primary image, pack/variant clarity, ingredients/usage only if verified | Yes; no empty galleries or invented product claims |
| Quantity near purchase action (R3) | Keeps purchase configuration local to decision | Variant selection before adding; accessible quantity input and per-option availability | Yes; sampled behavior not yet proven |
| Empty-cart fragment (R1 header) | Gives recovery path instead of dead end | Cart page is canonical; optional drawer shares same logic, returns focus, links back to catalog | Yes for cart state; drawer conditional |
| Support and policy access (R1/R3) | Reduces uncertainty before order | Verified support, delivery/return information near purchase and in footer | Yes; never imply policies are already approved |
| Deep submenus / many shelves (R1) | Segments grocery-scale catalog | Shallow navigation and listing filters; only add subcategories when usable | Do not copy scale; conditional later |
| WhatsApp/call purchase (R3) | Assisted route for uncertain shoppers | Verified QueenBee support link, not uncontrolled second order/payment pipeline | Conditional on owner workflow |
| Frequently bought together (R3) | Shows complementary products | Simple approved combo products first; no recommendation engine | Defer; budget/backend dependency |
| Testimonials/apps/wishlist/account shortcuts (R1) | Return-customer and trust paths | Verified reviews only; accounts require backend; no native app clone | Defer/conditional; not demo essentials |

## Consistency lessons and unknowns

R3 visible Gawa Ghee price is BDT1890 (comparison 1990), while extracted WhatsApp link embeds price 1990. Observed text mismatch, not tested order behavior. QueenBee's must derive assisted-support display from same current product record and reprice server-side at checkout. R1 savings sometimes use amounts and sometimes percentages; choose a consistent presentation. R3 `Save 5%` is rounded from 100/1990; document rounding rather than overstating.

Use conceptual IA lessons, not unverified claims that reference spacing, typography, grid, search, mobile navigation, or shopping flow work well. Open browser gate must inspect those dimensions before borrowing any interaction model. Proposed QueenBee's homepage: concise identity/value statement, reviewed category entries, one product-led collection, limited arrivals/deals, factual support/footer. No giant mega-menu, endless category rows, forced carousel, duplicate promotional blocks, or copied testimonials.
