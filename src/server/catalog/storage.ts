/**
 * Where a catalog asset's bytes are delivered from.
 *
 * The database stores **our own asset key**, never a provider URL: Neon's public URLs embed the branch
 * id, so a stored URL would be wrong on any other branch (ADR 0006). `src/lib/images.ts` derives a path
 * from the key, and this module decides whether that path is answered by a local file or by object
 * storage.
 *
 * Server-only: `CATALOG_ASSET_BASE_URL` is configuration, and nothing in the browser needs to know the
 * storage host - the rendered path is always `/catalog/...`.
 */

/**
 * The storage origin and bucket prefix, or `null` when this deployment has no object storage.
 *
 * Left unset, every asset is served from `public/catalog`, which is what development and the
 * verification suites do. Set, an asset the local tree does not contain is fetched from the bucket.
 */
export function catalogAssetBase(): string | null {
  const raw = process.env.CATALOG_ASSET_BASE_URL?.trim() ?? '';
  if (raw === '') return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    // Normalised without a trailing slash, so joining a variant cannot double one.
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** The storage URL for one `key-width.ext` variant, or `null` when no bucket is configured. */
export function catalogVariantUrl(file: string): string | null {
  const base = catalogAssetBase();
  return base === null ? null : `${base}/${file}`;
}
