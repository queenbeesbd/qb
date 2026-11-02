# ADR 0025 - storefront discovery surfaces and their imagery

Status: implemented (2026-11-02). Supersedes nothing; extends ADR 0006 (object storage), ADR 0011
(catalog authority) and ADR 0020 (storefront presentation).

## Context

The storefront's discovery surfaces were text-first. The homepage opened on a headline and three
product photographs that a phone hid below 720px; the category index was a list of names with an icon
and a sentence; there was no way to browse by brand at all; and the product page gave a 3:4 photograph
a full screen before the price. The owner asked for a mobile-first, picture-led redesign - 80% of the
effort on the phone - with category imagery the owner can manage, brand discovery, and a product page
whose imagery does not crowd out the information.

## Decisions

1. **A category has a photograph of its own (`category.image_key`).** The index is a picture grid and
   the homepage has a category rail, so a category needs an image for the same reason a product does.
   The column holds an **asset key**, never a URL: the admin resolves it against the server's own
   inventory and `src/lib/images.ts` derives every path. `NULL` means "no photograph chosen", and the
   tile draws the category's icon - a stated gap, never a substitute picture.

2. **A brand has a logo (`brand.logo_key`), and a logo must be verifiable.** A brand with no verified
   mark keeps `NULL` and draws its initials. The alternative - guessing a domain and taking whatever
   favicon answers - produced five unrelated brands sharing one generic icon in the first pass, which
   is exactly the failure this rule exists to prevent. The build command therefore requires the brand's
   own page to name it in `<title>` **and** the icon to be at least 96px; both are checked, and a brand
   that fails either is reported rather than papered over.

3. **Discovery imagery is an ordinary catalog asset.** Category photographs and brand logos are
   generated at the same two widths product photography uses (600 and 1050, JPEG + WebP), live in
   `public/catalog`, are uploaded to the same bucket and are served by the same
   `/catalog/<key>-<width>.<ext>` route. A separate width family would need a second route predicate, a
   second completeness check and a second path builder - three places to drift - and would make an
   image the owner chose for a category unusable anywhere else.

4. **Category photographs come from a recorded licence list; the shop's own pictures win.** The images
   shipped with this change are Unsplash photographs, chosen by eye against the category they
   illustrate and recorded with their source and credit in
   `src/server/catalog/discovery-imagery.ts`. That list exists so the redesign is not a wall of icon
   glyphs on day one - not to stop the owner replacing any of them from the category editor.

5. **Curation is written from stated rules, not hand-picked to look good.** `npm run seed:discovery`
   writes the two collections the homepage reads: `featured` is one product per busiest department,
   `collection` is four from each of the three busiest. Both are ordered by a reproducible rule over
   the catalog (longest customer-facing description, then larger saving, then id), so the owner can see
   what "Featured" means today and change it from the catalog. The command is idempotent and never
   overwrites a selection that already exists.

6. **The admin picks an image; it does not upload one through the category form.** Associating a
   validated asset is one database write. An upload is file processing - validate, re-encode twice,
   write to storage, then record - and belongs in the asset pipeline (`npm run assets:discovery`,
   `npm run assets:upload`), not in a form handler. The editor lists the shop's own inventory and the
   owner picks; `docs/catalog.md` records the gap rather than implying an upload that does not exist.

## Consequences

- Two additive columns and one additive column: `category.image_key`, `category.tagline`,
  `brand.logo_key`. Migration `0012`, no backfill, no rewrite, no new table (`docs/data-model.md`'s
  count is unchanged) and no grant change.
- A brand without a verified logo renders initials. That is a visible limitation, and the brand index
  states it in words rather than hiding it.
- The category photographs are third-party licensed images. Replacing them needs no code - the owner
  picks a different asset in the editor.
- The homepage's 3-photograph hero no longer appears on a phone. The phone gets a spotlight row
  instead, and `verify-browser`'s phone check was updated to assert the new composition rather than
  the removed one.
