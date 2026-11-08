/**
 * POST /api/qbpanel/session/login
 *
 * The only unauthenticated state-changing endpoint. It therefore has no session to bind a CSRF token
 * to, and is protected by:
 *
 *  - a same-origin check (`Origin`/`Referer`), so a cross-site form post is refused;
 *  - throttling by account **and** by source, so neither one address nor one account can be probed;
 *  - a generic failure, so the response never reveals whether a staff account exists;
 *  - a session minted only on success, so an existing anonymous cookie is never promoted.
 */

import { withTransaction } from '@/db/client';
import { LOGIN_PATH } from '@/server/auth/constants';
import { isSameOrigin, safeReturnPath } from '@/server/auth/request-guards';
import { signIn } from '@/server/auth/service';
import { createStaffSession, sessionContextFrom, setSessionCookie } from '@/server/auth/session';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${LOGIN_PATH}?error=invalid`);
  }

  const email = form.get('email');
  const password = form.get('password');
  const next = safeReturnPath(typeof form.get('next') === 'string' ? (form.get('next') as string) : null);

  if (typeof email !== 'string' || typeof password !== 'string' || email === '' || password === '') {
    return redirectTo(`${LOGIN_PATH}?error=invalid`);
  }

  const context = sessionContextFrom(request.headers);

  const result = await withTransaction((tx) =>
    signIn(tx, {
      email,
      password,
      context,
      createSession: async (staffUserId) => {
        const session = await createStaffSession(tx, staffUserId, context);
        return { token: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
      },
    }),
  );

  if (!result.ok) {
    const code = result.failure === 'throttled' ? 'throttled' : 'invalid';
    return redirectTo(`${LOGIN_PATH}?error=${code}&next=${encodeURIComponent(next)}`);
  }

  // The raw token is placed in the cookie here and nowhere else: not in the response body, not in the
  // redirect target, not in a log.
  await setSessionCookie(result.rawToken);
  return redirectTo(next);
}
