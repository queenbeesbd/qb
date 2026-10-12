/**
 * Response helpers for the admin route handlers.
 *
 * All of them are `no-store`: every admin response is session-scoped, and a cached one would be a
 * cross-account leak. The redirects use `303 See Other` so the browser follows with `GET`, which
 * makes a refresh safe after a form post.
 */

const NO_STORE = {
  'cache-control': 'no-store, no-cache, must-revalidate',
  pragma: 'no-cache',
} as const;

/** A redirect back to an admin page with a fixed notice code. Never carries a value from the body. */
export function redirectTo(path: string, status = 303): Response {
  return new Response(null, { status, headers: { location: path, ...NO_STORE } });
}

/**
 * A refusal.
 *
 * The body is deliberately empty. A handler must not describe why it refused: distinguishing
 * "unauthenticated" from "forbidden" from "bad CSRF token" in the response would hand an attacker a
 * probe. The status code is enough for the client to redirect, and the audit trail records the real
 * reason server-side.
 */
export function deny(status: number): Response {
  return new Response(null, { status, headers: NO_STORE });
}

/** A JSON response, used only by the read endpoint. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...NO_STORE },
  });
}
