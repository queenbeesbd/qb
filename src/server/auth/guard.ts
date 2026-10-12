/**
 * Server-side access control for the admin surface.
 *
 * Every protected page and every mutation goes through this module. The rules it exists to make
 * unmissable:
 *
 * - **Deny by default.** No principal, or a principal without the permission, is refused. There is no
 *   default-allow branch and no "authenticated is enough" path.
 * - **The actor is derived from the session cookie only.** A role code, a staff id, an `x-staff-id`
 *   header or a hidden form field is never consulted - none of them is even read.
 * - **Authorization is re-derived per request.** Nothing is cached between requests, so a revoked
 *   session or a withdrawn role takes effect on the next request.
 * - **The boundary is here, not in the UI.** The navigation is built from the same permission set, so
 *   hiding a link and refusing a request cannot disagree - but the refusal is what protects.
 */

import { redirect } from 'next/navigation';

import { withTransaction } from '@/db/client';

import { ADMIN_ROOT, LOGIN_PATH } from './constants';
import { recordDeniedAction } from './denial-log';
import { csrfTokenMatches, isSameOrigin, requestCorrelationId } from './request-guards';
import { deriveCsrfToken } from './tokens';
import { readSessionCookie, readSessionCookieFromRequest, resolveStaffSession, sessionContextFrom } from './session';
import { hasPermission, roleCodes, type StaffPrincipal } from '../authz/principal';

/**
 * Correlation and source facts for a denial record.
 *
 * Both are read from the request, so neither is an authority: the correlation id is only a handle for
 * a log search, and the address is already a digest. The **actor** in a denial record never comes from
 * here - it comes from the resolved session.
 */
function denialContext(request: Request): { requestId: string | null; ipHash: string | null } {
  return { requestId: requestCorrelationId(request), ipHash: sessionContextFrom(request.headers).ipHash };
}

/** Records a refused action. Deliberately fire-and-forget: the refusal does not depend on it. */
async function logDenial(
  principal: StaffPrincipal,
  input: { action: string; entityType: string; entityId: number; category: 'forbidden' | 'csrf'; reason: string; requestId: string | null; ipHash: string | null },
): Promise<void> {
  await recordDeniedAction({
    actorStaffId: principal.staffUserId,
    actorRoleCodes: roleCodes(principal),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    category: input.category,
    reason: input.reason,
    requestId: input.requestId,
    ipHash: input.ipHash,
  });
}

/** Resolves the principal for a Server Component / Server Action. `null` when unauthenticated. */
export async function currentStaffPrincipal(): Promise<StaffPrincipal | null> {
  const rawToken = await readSessionCookie();
  if (rawToken === undefined) return null;
  const resolved = await withTransaction((tx) => resolveStaffSession(tx, rawToken));
  return resolved?.principal ?? null;
}

/**
 * Resolves the principal for a route handler.
 *
 * Reads the cookie from the request rather than from the framework's cookie jar, so a route handler
 * cannot accidentally accept a principal that came from somewhere else.
 */
export async function principalFromRequest(request: Request): Promise<StaffPrincipal | null> {
  const rawToken = readSessionCookieFromRequest(request);
  if (rawToken === undefined) return null;
  const resolved = await withTransaction((tx) => resolveStaffSession(tx, rawToken));
  return resolved?.principal ?? null;
}

/**
 * Page guard: redirects an unauthenticated or unauthorized visitor.
 *
 * A visitor with no session is sent to sign-in; a visitor with a session but without the permission
 * gets the "not found" surface, not a 403 that confirms the route exists - the design's rule for
 * another principal's resource (`security.md` 13.1 rule 2).
 */
export async function requireAdminPage(permission: string): Promise<StaffPrincipal> {
  const principal = await currentStaffPrincipal();
  if (principal === null) redirect(LOGIN_PATH);
  if (!hasPermission(principal, permission)) {
    // A page guard has no `Request`, so there is no correlation id to read; the actor and the
    // attempted capability are the facts that matter, and both are present.
    await logDenial(principal, {
      action: `page.${permission}`,
      entityType: 'admin_route',
      entityId: 0,
      category: 'forbidden',
      reason: `missing permission ${permission}`,
      requestId: null,
      ipHash: null,
    });
    redirect(`${ADMIN_ROOT}/forbidden`);
  }
  return principal;
}

export type DenialReason = 'unauthenticated' | 'forbidden' | 'csrf';

export type GuardedMutation =
  | { ok: true; principal: StaffPrincipal; csrfToken: string; form: FormData }
  | { ok: false; reason: DenialReason; status: number };

/**
 * Route-handler guard for a state-changing request that needs a session but **no specific
 * permission**.
 *
 * Used by sign-out, which every authenticated staff member may perform. It still requires the CSRF
 * token: a forced cross-site sign-out is a denial of service, not a harmless no-op.
 */
export async function guardSessionMutation(request: Request): Promise<GuardedMutation> {
  const rawToken = readSessionCookieFromRequest(request);
  if (rawToken === undefined) return { ok: false, reason: 'unauthenticated', status: 401 };

  const principal = await principalFromRequest(request);
  if (principal === null) return { ok: false, reason: 'unauthenticated', status: 401 };

  // A CSRF refusal is recorded, because the session is known at this point: this is an authenticated
  // actor whose request failed a control, which is exactly the shape of a cross-site forgery attempt.
  if (!isSameOrigin(request)) {
    await logDenial(principal, {
      action: 'mutation.cross_origin',
      entityType: 'admin_route',
      entityId: 0,
      category: 'csrf',
      reason: 'request origin did not match the host',
      ...denialContext(request),
    });
    return { ok: false, reason: 'csrf', status: 403 };
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, reason: 'csrf', status: 400 };
  }

  const expected = deriveCsrfToken(rawToken);
  if (!csrfTokenMatches(expected, form.get('csrf'))) {
    await logDenial(principal, {
      action: 'mutation.csrf_token',
      entityType: 'admin_route',
      entityId: 0,
      category: 'csrf',
      reason: 'session-bound CSRF token missing or wrong',
      ...denialContext(request),
    });
    return { ok: false, reason: 'csrf', status: 403 };
  }

  return { ok: true, principal, csrfToken: expected, form };
}

/**
 * Route-handler guard for a **state-changing** request.
 *
 * Three independent checks, in order: an authenticated principal, the permission, and the CSRF token
 * bound to that session. The body is parsed exactly once, here, so a handler cannot act on form data
 * that was never checked.
 *
 * A failure returns a status and a machine-readable reason, never a message that distinguishes "no
 * such account" from "wrong password" from "not your role".
 */
export async function guardMutation(request: Request, requiredPermission: string): Promise<GuardedMutation> {
  const guarded = await guardSessionMutation(request);
  if (!guarded.ok) return guarded;

  if (!hasPermission(guarded.principal, requiredPermission)) {
    await logDenial(guarded.principal, {
      action: `mutation.${requiredPermission}`,
      entityType: 'admin_route',
      entityId: 0,
      category: 'forbidden',
      reason: `missing permission ${requiredPermission}`,
      ...denialContext(request),
    });
    return { ok: false, reason: 'forbidden', status: 403 };
  }

  return guarded;
}

export type GuardedRead =
  | { ok: true; principal: StaffPrincipal; csrfToken: string }
  | { ok: false; reason: DenialReason; status: number };

/**
 * Route-handler guard for a **read** that still requires a permission.
 *
 * A read needs no CSRF token: it changes nothing, and requiring one would push a token into a URL. It
 * still requires an authenticated principal and the permission, because "is authenticated" is not
 * "is allowed" (`security.md` 13.1 rule 8).
 */
export async function guardRead(request: Request, requiredPermission: string): Promise<GuardedRead> {
  const rawToken = readSessionCookieFromRequest(request);
  if (rawToken === undefined) return { ok: false, reason: 'unauthenticated', status: 401 };

  const principal = await principalFromRequest(request);
  if (principal === null) return { ok: false, reason: 'unauthenticated', status: 401 };
  if (!hasPermission(principal, requiredPermission)) {
    await logDenial(principal, {
      action: `read.${requiredPermission}`,
      entityType: 'admin_route',
      entityId: 0,
      category: 'forbidden',
      reason: `missing permission ${requiredPermission}`,
      ...denialContext(request),
    });
    return { ok: false, reason: 'forbidden', status: 403 };
  }

  return { ok: true, principal, csrfToken: deriveCsrfToken(rawToken) };
}
