import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * Only headers that are true of this application are set. A Content-Security-Policy is deliberately
 * **not** set: Next's client runtime and the CSS Modules build need a nonce or a hash inventory, and a
 * policy that silently breaks the storefront would be worse than none. Phase 12 does not claim CSP,
 * and `docs/security.md` records it as an open requirement for Phase 19.
 */
const securityHeaders = [
  // The application is never framed. Nothing here is embeddable, and clickjacking an admin form is
  // the classic reason this matters.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Never sniff a content type: a JSON or text response must not be interpreted as script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send the origin only, and never the path or query, to other sites.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // No camera, microphone or geolocation is used by any surface.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/webp'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
