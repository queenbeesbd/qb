/**
 * `/hero/<key>-<width>.<ext>` - the homepage banner path, resolved to object storage.
 *
 * `public/hero` is served by Next before this handler is reached, so development and a build that
 * carries the generated banners never call it. A deployment does not carry uploaded bytes: a banner
 * the owner adds in the admin panel is written to the bucket instead, and `src/lib/images.ts` still
 * derives the same path from the key. This route is the bridge between those two facts, exactly as
 * `/catalog/[...path]` already is for product photography.
 *
 * Only a shape `heroImagePath` can produce is accepted, so the route cannot become an open redirect.
 */

import { HERO_IMAGE_WIDTHS } from '@/lib/images';
import { catalogAssetBase } from '@/server/catalog/storage';

export const dynamic = 'force-dynamic';

const WIDTHS: Record<string, true> = Object.fromEntries(
  HERO_IMAGE_WIDTHS.map((width) => [String(width), true]),
);
const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function parsePath(path: readonly string[]): string | null {
  if (path.length !== 1) return null;
  const file = path[0] ?? '';
  const match = /^(.+)-(\d+)\.(jpg|webp)$/.exec(file);
  if (match === null) return null;
  const [, key = '', width = ''] = match;
  if (!KEY_PATTERN.test(key)) return null;
  if (WIDTHS[width] !== true) return null;
  return file;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const file = parsePath(path);
  if (file === null) return new Response('Not found', { status: 404 });

  const base = catalogAssetBase();
  if (base === null) return new Response('Not found', { status: 404 });

  return new Response(null, {
    status: 308,
    headers: {
      Location: `${base}/${file}`,
      /*
       * Same rule as `/catalog`: the banner bytes are immutable, this redirect is not. Its target is
       * `CATALOG_ASSET_BASE_URL`, so a year-long `immutable` entry would outlive a storage move and
       * point at a bucket the CSP does not allow.
       */
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
