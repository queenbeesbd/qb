# ADR 0044 - Stored imagery is WebP only

Status: accepted (owner direction, 2026-11-20). Amends the 2026-11-05 asset rules recorded in
`AGENTS.md` and `docs/catalog.md`, which introduced WebP delivery but left legacy JPEG originals on disk
and in the bucket.

## Context

Catalog, discovery, hero and popup imagery has been **delivered** as WebP since 2026-11-05:
`src/lib/images.ts` derives only `.webp` paths, `/catalog/[...path]` accepts only `webp`/`svg`, and every
upload through `src/server/catalog/uploads.ts` is decoded with `sharp`, stripped of EXIF and re-encoded to
WebP at the surface's widths. No code renders a `.jpg` variant.

The stored tree still carried two sets of bytes. `public/catalog` held 6,048 WebP files (235.7 MB) and
4,032 JPEG files (373.5 MB); every JPEG key/width had a WebP twin. `public/hero` held the same duplication
at four keys. `scripts/optimize-catalog-assets.ts` documented the choice explicitly: it left the JPEGs
"on disk and in the bucket" because deleting bytes that were once served was a separate decision.

That decision is now made. The owner asked for the duplicates deleted and for a project rule that no
other format is ever stored. A 630 MB local asset tree becomes ~249 MB, which also lowers the bytes that
must be copied to the planned self-hosted VPS.

## Decision

1. **WebP is the only raster format stored** under `public/catalog`, `public/hero`, and any object-storage
   bucket used for catalog imagery. JPEG, PNG, HEIC and other formats are **input only**: `sharp` decodes
   them, applies EXIF orientation, strips metadata and re-encodes to WebP at 320/600/1050 (product and
   squares), 800/1600 (hero), or the popup's chosen frame. The source bytes are never written.
2. **The 4,032 catalog and 4 hero JPEGs were deleted on 2026-11-20.** Each was checked to have a WebP
   sibling at the same key and width before removal; zero orphans were found. The manifest of deleted
   paths and sizes is kept at `/tmp/opencode/webp-only-jpeg-manifest.txt` for that run only. Original JPEG
   pixels are not recoverable; the WebP variants remain and are what the site has always served.
3. **Every generator writes WebP only.** `scripts/optimize-catalog-assets.ts` and
   `scripts/trim-brand-logos.ts` source from the widest WebP, not JPEG. `scripts/build-discovery-assets.ts`
   writes one WebP per declared width and treats a key as complete when those WebPs exist. An in-memory
   PNG master used as an intermediate encode step is not a stored variant.
4. **`npm run check:catalog` enforces it.** Any `jpg`, `jpeg`, `png`, `gif`, `bmp`, `tiff` or `avif` file
   under `public/catalog` or `public/hero` fails the check. SVG placeholders remain the one other allowed
   file type.
5. **Named exceptions.** The owner's `logo.jpeg` master, `public/brand/logo-round-{96,192}.jpeg`, the
   favicon PNGs and the SVGs are brand identity assets, not catalog variants. `build-hero-assets.ts` may
   accept a JPEG/PNG file as a **source** under `hero/`; it never copies that source into `public/hero`.

## Consequences

- Local asset bytes drop from 630 MB to about 249 MB. Bucket egress and backup size fall with it once the
  bucket objects are swept.
- The Neon Object Storage bucket **still holds duplicate JPEG objects**. They are referenced by nothing;
  removing them needs the storage credentials and an explicit key list, never a wildcard. This is the one
  part of the cleanup not completed on 2026-11-20.
- Re-encoding a stored photograph now starts from its 1050 WebP rather than a lossless original. That is a
  deliberate acceptance: a fifth regeneration from an already-compressed source is not worth keeping an
  unused 374 MB of originals.
- The browser upload rule is unchanged - it was already WebP-only - and now has a check that prevents a
  future script from quietly reintroducing a second format.
