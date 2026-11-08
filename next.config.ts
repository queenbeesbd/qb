import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * The **Content-Security-Policy is not set here**: it needs a fresh nonce per request, which a static
 * header list cannot produce, so it is emitted by `src/proxy.ts` instead. Everything below is a fixed
 * policy that is true of every response.
 */
const securityHeaders = [
  // The application is never framed. Nothing here is embeddable, and clickjacking an admin form is
  // the classic reason this matters. `frame-ancestors` in the CSP is the modern control; this header
  // remains for browsers that do not implement it.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Never sniff a content type: a JSON or text response must not be interpreted as script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send the origin only, and never the path or query, to other sites.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deny every capability this application never uses, so a compromised dependency cannot request
  // one. Nothing here uses a camera, microphone, location, payment API, USB, motion sensor or
  // screen capture.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=()',
  },
  // Ask the browser to keep this origin isolated from cross-origin documents it embeds or is
  // embedded by, which closes the Spectre-class cross-origin read side channel.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Vercel terminates TLS and sets HSTS itself, but the value is asserted here too so a different
  // host cannot silently serve the application without it.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * `next build` refuses to finish while the installed version is affected by a published advisory,
   * and recommends the upgrade. Setting the policy to `security` states that an advisory-driven
   * upgrade is the intended response, so the reminder does not have to be re-interpreted each time.
   */
  experimental: { agentUpgrade: 'security' },
  // Production builds stay on Turbopack. The empty block states that deliberately: without it,
  // Turbopack refuses to build because a webpack config exists (used only by `dev`).
  turbopack: {},
  images: {
    formats: ['image/webp'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      /**
       * The owner's panel is never indexed, and this header travels with the response itself.
       *
       * It covers the panel pages, the print view and the panel's API routes, so even a redirect or
       * a JSON error cannot be crawled into a search result. The path is not listed in `robots.txt`
       * on purpose: a `Disallow` line there would advertise the path to anyone who reads it, and a
       * crawler cannot index what it is never told exists and cannot authenticate to reach.
       */
      {
        source: '/qbpanel/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' }],
      },
      {
        source: '/api/qbpanel/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' }],
      },
    ];
  },
  /**
   * The harness rewrites `.pi/fabric/mesh/state.json` continuously. Turbopack watches every file
   * under the project root and offers no ignore option, so those writes triggered an endless Fast
   * Refresh loop in development. The dev script therefore runs webpack, whose watcher can ignore
   * `.pi`; Turbopack remains the build bundler.
   */
  webpack(config) {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '**/.git/**', '**/.pi/**'],
    };
    return config;
  },
};

export default nextConfig;
