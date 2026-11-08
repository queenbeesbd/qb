import type { MetadataRoute } from 'next';

/**
 * `robots.txt` (owner decision, 2026-11-09).
 *
 * Every surface of this deployment is already marked `noindex, nofollow` in its own metadata - the
 * root layout does it for the storefront and the panel layouts do it again - so this file is not the
 * control; it is the second, independent one. A crawler that never asks for anything has nothing to
 * index even if a noindex tag is ever dropped by a mistake.
 *
 * **The panel's path is deliberately not named here.** A `Disallow: /qbpanel` line would publish the
 * path in a file served to anyone who asks, which is the opposite of keeping it out of sight. The
 * blanket rule covers it without mentioning it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
