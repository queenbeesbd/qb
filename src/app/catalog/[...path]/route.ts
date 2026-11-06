/**
 * `/catalog/<key>-<width>.<ext>` - the one place a rendered catalog image path is resolved.
 *
 * The database stores **our own asset key**, never a provider URL (ADR 0006): Neon's public URLs embed
 * the branch id, so a stored URL would be wrong on any other branch. `src/lib/images.ts` therefore
 * derives a path from the key, and this route turns that path into bytes.
 *
 * Resolution order, deliberately:
 *
 * 1. **A local file wins.** In development and in the verification suites the assets sit in
 *    `public/catalog`, and Next serves `public/` before it reaches a route handler, so this module is
 *    never consulted there. Development therefore works with no storage credential at all.
 * 2. **Otherwise the bytes are proxied from the configured object-storage bucket**
 *    (`CATALOG_ASSET_BASE_URL`) and cached at Vercel's edge. The response is immutable: an asset key
 *    names bytes that never change, because a new image is a new key. Proxying keeps the first fetch
 *    of each image on Neon and every repeat view on Vercel's CDN, instead of sending every visitor
 *    straight to the bucket.
 *
 * The path is validated before it is used. Only a shape `src/lib/images.ts` can produce is accepted -
 * a lowercase key, a declared width and a known extension - so this route cannot be turned into an open
 * redirect or a way to address another object in the bucket.
 */

import { IMAGE_FALLBACK_WIDTH, IMAGE_WIDTHS } from '@/lib/images';
import { catalogAssetBase } from '@/server/catalog/storage';

export const dynamic = 'force-dynamic';

/** `<key>-<width>.<ext>`, where every width is one `src/lib/images.ts` actually emits. */
const WIDTHS: Record<string, true> = { 320: true, 600: true, 1050: true };
const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EXTENSIONS: Record<string, true> = { webp: true, svg: true };

// The declared widths and this table must not drift: a width the renderer emits but this route
// refuses would 404 a real image, so the mismatch fails the build instead.
if (IMAGE_WIDTHS.some((width) => WIDTHS[String(width)] !== true)) {
  throw new Error('catalog asset route: WIDTHS is out of step with IMAGE_WIDTHS');
}

/** Splits `key-width.ext`, refusing anything that is not a path this application emits. */
function parseAssetPath(path: readonly string[]): { key: string; file: string } | null {
  if (path.length !== 1) return null;
  const file = path[0] ?? '';
  const match = /^(.+)-(\d+)\.(jpg|webp|svg)$/.exec(file);
  if (match === null) return null;

  const [, key = '', width = '', extension = ''] = match;
  if (!KEY_PATTERN.test(key)) return null;
  if (WIDTHS[width] !== true) return null;
  if (EXTENSIONS[extension] !== true) return null;
  // A placeholder is a single `.svg`; a photographed asset is a generated raster variant.
  if (extension === 'svg' && width !== String(IMAGE_FALLBACK_WIDTH)) return null;

  return { key, file };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const asset = parseAssetPath(path);
  if (asset === null) return new Response('Not found', { status: 404 });

  const base = catalogAssetBase();
  if (base === null) {
    // A stated gap, never an invented path: the deployment has no storage configured, so the asset
    // cannot be delivered. The 404 is what the browser shows for a missing image.
    return new Response('Not found', { status: 404 });
  }

  const upstreamUrl = `${base}/${asset.key}-${asset.file.slice(asset.key.length + 1)}`;

  let upstream: Response;
  try {
    // `no-store` hides the upstream fetch from Next's data cache; the immutable response below is
    // cached by Vercel's CDN under the public asset URL instead.
    upstream = await fetch(upstreamUrl, { cache: 'no-store' });
  } catch {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!upstream.ok || upstream.body === null) {
    // Never cache a storage failure: a transient 5xx must not become a year-long missing image.
    return new Response('Not found', {
      status: upstream.status === 404 ? 404 : 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const headers = new Headers();
  const contentType =
    upstream.headers.get('content-type') ?? (asset.file.endsWith('.svg') ? 'image/svg+xml' : 'image/webp');
  headers.set('Content-Type', contentType);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength !== null) headers.set('Content-Length', contentLength);
  const etag = upstream.headers.get('etag');
  if (etag !== null) headers.set('ETag', etag);

  /*
   * The bytes behind a key never change, so every cache layer may keep them for a year. `Cache-Control`
   * covers the browser, `CDN-Cache-Control` covers other CDNs, and `Vercel-CDN-Cache-Control` is the
   * header Vercel's own edge reads for a function response.
   */
  for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) {
    headers.set(name, 'public, max-age=31536000, immutable');
  }

  return new Response(upstream.body, { status: 200, headers });
}
