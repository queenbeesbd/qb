#!/usr/bin/env tsx
/**
 * End-to-end verification of the admin surface over real HTTP.
 *
 * The database tests prove the session, throttle and audit *behaviours*. This script proves the thing
 * that actually matters to an attacker: that a request to a protected route or mutation is refused
 * when it does not carry a permitted session - including when it bypasses the interface entirely,
 * which is what "hiding the button is not the control" means in practice.
 *
 * It runs the real production build (`next start`) against a disposable local PostgreSQL cluster, and
 * it never touches a deployed database: the cluster is created here, on loopback, and removed
 * afterwards.
 *
 * Usage:
 *   npm run build && npm run verify:admin
 *
 * Exits non-zero on the first failure and prints every check.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';

import { closeDb, withTransaction } from '../src/db/client';
import { permission, role, rolePermission, staffCredential, staffRole, staffUser } from '../src/db/schema';
import { seedReferenceData } from '../src/db/seed';
import { activeAnnouncements } from '../src/data/announcements';
import { applyMigrations } from '../src/db/migrate';
import { startLocalCluster, type LocalCluster } from './local-pg';
import { hashPassword } from '../src/server/auth/password';
import { OWNER_ROLE, PERMISSIONS } from '../src/server/authz/permissions';
import { resetServerEnvCache } from '../src/server/env';

const OWNER_EMAIL = 'owner@verify.test';
const OWNER_PASSWORD = 'verify-owner-password-1';
const LIMITED_EMAIL = 'limited@verify.test';
const LIMITED_PASSWORD = 'verify-limited-password-1';
const NEW_STAFF_EMAIL = 'newcomer@verify.test';

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail: unknown): void {
  results.push({ name, ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  const marker = ok ? '✓' : '✗';
  console.log(`  ${marker} ${name}${ok ? '' : ` — ${results[results.length - 1]?.detail ?? ''}`}`);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** A cookie jar, because the sign-in flow depends on the browser sending the session back. */
class Jar {
  private readonly cookies = new Map<string, string>();

  absorb(response: Response): void {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const entry of raw) {
      const [pair] = entry.split(';');
      if (pair === undefined) continue;
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  clear(): void {
    this.cookies.clear();
  }
}

async function freePort(): Promise<number> {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      reject(new Error('no free port'));
      return;
    }
    server.close(() => resolve(address.port));
  });
  return promise;
}

type Call = {
  status: number;
  location: string | null;
  setCookie: string[];
  body: string;
  contentType: string | null;
  cacheControl: string | null;
  headers: Headers;
};

async function call(
  base: string,
  path: string,
  options: { method?: string; jar?: Jar; form?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<Call> {
  const jar = options.jar;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (jar !== undefined && jar.header() !== '') headers.cookie = jar.header();

  let body: string | undefined;
  if (options.form !== undefined) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(options.form).toString();
    // A browser sends `Origin` on **every** POST, same-origin ones included, with `Referer` alongside
    // it. The application's same-origin guard is the CSRF control on the unauthenticated sign-in
    // route, so this client has to present the headers a real browser presents - otherwise it tests a
    // client no user has, and every legitimate mutation is refused before the code under test runs.
    // A caller that supplies its own `origin` (the cross-site cases) keeps it.
    headers.origin ??= base;
    headers.referer ??= `${base}/`;
  }

  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    redirect: 'manual',
  });

  jar?.absorb(response);
  return {
    status: response.status,
    location: response.headers.get('location'),
    setCookie: response.headers.getSetCookie?.() ?? [],
    body: await response.text(),
    contentType: response.headers.get('content-type'),
    cacheControl: response.headers.get('cache-control'),
    headers: response.headers,
  };
}

/** The CSRF token the server rendered into the page. Never invented client-side. */
function csrfFrom(html: string): string {
  const match = /name="csrf" value="([0-9a-f]{64})"/.exec(html);
  return match?.[1] ?? '';
}

/**
 * A refused mutation is either a flat `403` or the documented redirect back to the page with a
 * denial notice. Both are refusals; neither is a success.
 */
function denied(response: { status: number; location: string | null }): boolean {
  return (
    response.status === 403 ||
    (response.status === 303 && (response.location ?? '').includes('notice=denied'))
  );
}

/**
 * The checks below assert **effects**, read from the database, rather than only status codes.
 *
 * A status code says what the handler replied; it does not say whether the action happened. Reading
 * the row is what makes "the limited principal gained nothing" a fact instead of an inference.
 */
async function holdsRole(staffUserId: number, roleCode: string): Promise<boolean> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ id: staffRole.staffUserId })
      .from(staffRole)
      .innerJoin(role, sql`${role.id} = ${staffRole.roleId}`)
      .where(sql`${staffRole.staffUserId} = ${staffUserId} and ${role.code} = ${roleCode}`);
    return rows.length > 0;
  });
}

async function staffAccountExists(email: string): Promise<boolean> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ id: staffUser.id })
      .from(staffUser)
      .where(sql`lower(${staffUser.email}) = ${email}`);
    return rows.length > 0;
  });
}

async function staffStatus(staffUserId: number): Promise<string | null> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ status: staffUser.status })
      .from(staffUser)
      .where(sql`${staffUser.id} = ${staffUserId}`);
    return rows[0]?.status ?? null;
  });
}

const SESSION_COOKIE = 'qb_staff_session';

async function main(): Promise<void> {
  if (!existsSync('.next/BUILD_ID')) {
    fail('no production build found. Run "npm run build" first (this script serves the real build).');
  }

  console.log('starting a disposable local PostgreSQL cluster');
  const cluster: LocalCluster = await startLocalCluster('queenbees_verify_admin');
  process.env.DATABASE_URL = cluster.url;
  process.env.QUEENBEES_ENV = 'test';
  process.env.DATABASE_DRIVER = 'pg';
  resetServerEnvCache();
  await applyMigrations(cluster.url);
  await seedReferenceData();

  // The limited principal. D10 is owner-only at launch, so the application seeds no non-owner role -
  // and the whole point of this script is to prove that a session *without* a permission is refused
  // even when it calls the endpoint directly. The role is created here, by the verification, so the
  // shipped seed stays exactly what the owner approved.
  const limited = await withTransaction(async (tx) => {
    const insertedRole = await tx
      .insert(role)
      .values({ code: 'verify_limited', name: 'Verification limited', isOwnerLevel: false })
      .returning({ id: role.id });
    const roleId = insertedRole[0]?.id;
    if (roleId === undefined) throw new Error('limited role insert returned no id');

    await tx.insert(rolePermission).values(
      await tx
        .select({ roleId: sql<number>`${roleId}::bigint`, permissionId: permission.id })
        .from(permission)
        .where(sql`${permission.code} in (${PERMISSIONS.staffRead}, ${PERMISSIONS.orderRead})`),
    );

    const ownerRow = await tx.select({ id: role.id }).from(role).where(sql`${role.code} = ${OWNER_ROLE.code}`);
    const ownerRoleId = ownerRow[0]?.id;
    if (ownerRoleId === undefined) throw new Error('owner role missing after seed');

    const owner = await tx
      .insert(staffUser)
      .values({ email: OWNER_EMAIL, displayName: 'Verify Owner' })
      .returning({ id: staffUser.id });
    const ownerId = owner[0]?.id;
    if (ownerId === undefined) throw new Error('owner insert returned no id');
    await tx.insert(staffCredential).values({
      staffUserId: ownerId,
      kind: 'password',
      secretHash: await hashPassword(OWNER_PASSWORD),
      hashAlgorithm: 'scrypt',
    });
    await tx.insert(staffRole).values({ staffUserId: ownerId, roleId: ownerRoleId, grantedBy: ownerId });

    const limitedUser = await tx
      .insert(staffUser)
      .values({ email: LIMITED_EMAIL, displayName: 'Verify Limited' })
      .returning({ id: staffUser.id });
    const limitedId = limitedUser[0]?.id;
    if (limitedId === undefined) throw new Error('limited insert returned no id');
    await tx.insert(staffCredential).values({
      staffUserId: limitedId,
      kind: 'password',
      secretHash: await hashPassword(LIMITED_PASSWORD),
      hashAlgorithm: 'scrypt',
    });
    await tx.insert(staffRole).values({ staffUserId: limitedId, roleId, grantedBy: ownerId });

    return { ownerId, limitedId };
  });

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  console.log(`starting the production server on ${base}`);

  const server: ChildProcess = spawn('npx', ['next', 'start', '-p', String(port)], {
    env: { ...process.env, DATABASE_URL: cluster.url, QUEENBEES_ENV: 'test', DATABASE_DRIVER: 'pg' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  server.stderr?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString();
  });

  const stop = async (): Promise<void> => {
    server.kill('SIGTERM');
    const settled = Promise.withResolvers<void>();
    setTimeout(settled.resolve, 300);
    await settled.promise;
    if (server.exitCode === null) server.kill('SIGKILL');
    await closeDb();
    await cluster.stop();
  };

  try {
    // Wait for readiness without polling a log line.
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const probe = await fetch(`${base}/`);
        if (probe.status < 500) {
          ready = true;
          break;
        }
      } catch {
        // Not listening yet.
      }
      const tick = Promise.withResolvers<void>();
      setTimeout(tick.resolve, 250);
      await tick.promise;
    }
    if (!ready) fail(`the server did not become ready:\n${serverLog.slice(-2000)}`);

    console.log('\nunauthenticated access');
    {
      for (const path of ['/admin', '/admin/staff', '/admin/audit', '/admin/forbidden']) {
        const response = await call(base, path);
        record(
          `GET ${path} without a session redirects to sign-in`,
          response.status === 307 || response.status === 302,
          `status ${response.status} → ${response.location ?? ''}`,
        );
        record(
          `GET ${path} without a session leaks nothing`,
          !response.body.includes('Verify Owner') && !response.body.includes('owner@verify.test'),
          'no staff identity in the refusal',
        );
      }

      for (const [path, form] of [
        ['/api/admin/staff', { email: 'x@y.test', displayName: 'X', roleCode: 'owner' }],
        ['/api/admin/staff/role', { staffUserId: '1', roleCode: 'owner', operation: 'grant' }],
        ['/api/admin/staff/status', { staffUserId: '1', operation: 'disable' }],
        ['/api/admin/staff/credential', { staffUserId: '1' }],
      ] as [string, Record<string, string>][]) {
        const response = await call(base, path, { method: 'POST', form });
        record(`POST ${path} without a session is refused`, response.status === 401, `status ${response.status}`);
      }

      // Signing out without a session is deliberately **not** an error and not a 401: there is no
      // session to revoke, so the route clears any stale cookie and returns the visitor to sign-in.
      // The security property is that it performs no state change and discloses nothing - which the
      // authenticated sign-out below proves is what actually requires a session and a CSRF token.
      const anonymousLogout = await call(base, '/api/admin/session/logout', { method: 'POST', form: {} });
      record(
        'POST /api/admin/session/logout without a session revokes nothing and returns to sign-in',
        anonymousLogout.status === 303 && (anonymousLogout.location ?? '').startsWith('/admin/login'),
        `status ${anonymousLogout.status} → ${anonymousLogout.location ?? ''}`,
      );
    }

    console.log('\nsign-in');
    {
      const ownerJar = new Jar();

      const crossSite = await call(base, '/api/admin/session/login', {
        method: 'POST',
        jar: ownerJar,
        form: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
        headers: { origin: 'https://evil.example.test' },
      });
      record('a cross-origin sign-in is refused', crossSite.status === 403, `status ${crossSite.status}`);

      const wrongPassword = await call(base, '/api/admin/session/login', {
        method: 'POST',
        jar: ownerJar,
        form: { email: OWNER_EMAIL, password: 'wrong-password' },
      });
      const unknownAccount = await call(base, '/api/admin/session/login', {
        method: 'POST',
        jar: ownerJar,
        form: { email: 'nobody@verify.test', password: 'wrong-password' },
      });
      record(
        'a wrong password and an unknown account are indistinguishable',
        wrongPassword.status === unknownAccount.status &&
          wrongPassword.location === unknownAccount.location,
        `${wrongPassword.status} ${wrongPassword.location} / ${unknownAccount.status} ${unknownAccount.location}`,
      );
      record(
        'the failure is a generic code, not a message about the account',
        (wrongPassword.location ?? '').includes('error=invalid') &&
          !(wrongPassword.location ?? '').includes('unknown'),
        wrongPassword.location ?? '',
      );

      const success = await call(base, '/api/admin/session/login', {
        method: 'POST',
        jar: ownerJar,
        form: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      });
      record('a correct sign-in redirects to the admin root', success.status === 303, `status ${success.status} → ${success.location}`);

      const cookie = success.setCookie.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`)) ?? '';
      record('the session cookie is HttpOnly', /HttpOnly/i.test(cookie), cookie.replace(/=[^;]+/, '=<redacted>'));
      record('the session cookie is SameSite=Lax', /SameSite=Lax/i.test(cookie), cookie.replace(/=[^;]+/, '=<redacted>'));
      record('the session cookie is scoped to the whole site', /Path=\//i.test(cookie), cookie.replace(/=[^;]+/, '=<redacted>'));
      record(
        'the session cookie is not Secure on a plain-HTTP development target',
        !/;\s*Secure/i.test(cookie),
        'local development over http must still work',
      );
      record(
        'the raw token is not exposed in the redirect',
        !(success.location ?? '').includes(ownerJar.get(SESSION_COOKIE) ?? 'zzz'),
        success.location ?? '',
      );

      const overview = await call(base, '/admin', { jar: ownerJar });
      record('GET /admin with a session renders the shell', overview.status === 200 && overview.body.includes('Verify Owner'), `status ${overview.status}`);
      record('the admin response is never cached', (overview.cacheControl ?? '').includes('no-store'), overview.cacheControl ?? '');
      record(
        'the raw session token never appears in the page',
        !overview.body.includes(ownerJar.get(SESSION_COOKIE) ?? 'zzz'),
        'no token in the HTML',
      );
      record('the admin page is marked noindex', /noindex/i.test(overview.body), 'robots directive present');

      const audit = await call(base, '/admin/audit', { jar: ownerJar });
      record('the owner can read the audit trail', audit.status === 200, `status ${audit.status}`);
      record(
        'the audit trail records the sign-in without a password or a token',
        audit.body.includes('staff.login_succeeded') &&
          !audit.body.includes(OWNER_PASSWORD) &&
          !audit.body.includes(ownerJar.get(SESSION_COOKIE) ?? 'zzz'),
        'login recorded, no secret present',
      );

      console.log('\nCSRF and per-permission enforcement');
      const csrf = csrfFrom(overview.body);
      record('the page carries a session-bound CSRF token', /^[0-9a-f]{64}$/.test(csrf), 'token rendered');

      const noCsrf = await call(base, '/api/admin/staff', {
        method: 'POST',
        jar: ownerJar,
        form: { email: NEW_STAFF_EMAIL, displayName: 'Newcomer', roleCode: OWNER_ROLE.code },
      });
      record('a state-changing request without a CSRF token is refused', noCsrf.status === 403, `status ${noCsrf.status}`);

      const wrongCsrf = await call(base, '/api/admin/staff', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf: 'f'.repeat(64), email: NEW_STAFF_EMAIL, displayName: 'Newcomer', roleCode: OWNER_ROLE.code },
      });
      record('a state-changing request with a wrong CSRF token is refused', wrongCsrf.status === 403, `status ${wrongCsrf.status}`);

      const crossSiteMutation = await call(base, '/api/admin/staff', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, email: NEW_STAFF_EMAIL, displayName: 'Newcomer', roleCode: OWNER_ROLE.code },
        headers: { origin: 'https://evil.example.test' },
      });
      record('a valid CSRF token from a cross-site origin is still refused', crossSiteMutation.status === 403, `status ${crossSiteMutation.status}`);

      const created = await call(base, '/api/admin/staff', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, email: NEW_STAFF_EMAIL, displayName: 'Newcomer', roleCode: OWNER_ROLE.code },
      });
      record('the owner can create a staff account', created.status === 303, `status ${created.status} → ${created.location}`);

      const staffPage = await call(base, '/admin/staff', { jar: ownerJar });
      const issuedToken = /[A-Za-z0-9_-]{43}/.exec(staffPage.body.replace(/[\s\S]*qb_admin_flash/, ''))?.[0] ?? '';
      record('the one-time token is shown once on the staff screen', staffPage.status === 200 && issuedToken.length === 43, `token length ${issuedToken.length}`);
      record(
        'the one-time token is not in the URL',
        !(created.location ?? '').includes(issuedToken) && issuedToken !== '',
        created.location ?? '',
      );

      const limitedJar = new Jar();
      const limitedSignIn = await call(base, '/api/admin/session/login', {
        method: 'POST',
        jar: limitedJar,
        form: { email: LIMITED_EMAIL, password: LIMITED_PASSWORD },
      });
      record('the limited principal can sign in', limitedSignIn.status === 303, `status ${limitedSignIn.status}`);

      const limitedOverview = await call(base, '/admin', { jar: limitedJar });
      const limitedCsrf = csrfFrom(limitedOverview.body);
      // The navigation is built from the same permission set the pages check, so it must match what
      // this principal actually holds: `staff.read` shows the staff link, `audit.read` (not held)
      // hides the audit link. Asserting an absolute "no staff link" would contradict the fixture.
      record(
        'the navigation reflects the limited principal’s own permissions',
        limitedOverview.body.includes('href="/admin/staff"') &&
          !limitedOverview.body.includes('href="/admin/audit"'),
        'staff link shown (staff.read held), audit link hidden (audit.read not held)',
      );

      const limitedAudit = await call(base, '/admin/audit', { jar: limitedJar });
      record(
        'the limited principal is refused the audit page, by direct request',
        limitedAudit.status === 307 || limitedAudit.location === '/admin/forbidden',
        `status ${limitedAudit.status} → ${limitedAudit.location ?? ''}`,
      );

      const limitedCreate = await call(base, '/api/admin/staff', {
        method: 'POST',
        jar: limitedJar,
        form: { csrf: limitedCsrf, email: 'sneaky@verify.test', displayName: 'Sneaky', roleCode: OWNER_ROLE.code },
      });
      const sneakyExists = await staffAccountExists('sneaky@verify.test');
      record(
        'the limited principal is refused a staff-management mutation, and no account is created',
        denied(limitedCreate) && !sneakyExists,
        `status ${limitedCreate.status} → ${limitedCreate.location ?? ''}, account created: ${sneakyExists}`,
      );

      const limitedSelfPromotion = await call(base, '/api/admin/staff/role', {
        method: 'POST',
        jar: limitedJar,
        form: { csrf: limitedCsrf, staffUserId: String(limited.ownerId), roleCode: OWNER_ROLE.code, operation: 'grant' },
      });
      const limitedIsOwner = await holdsRole(limited.limitedId, OWNER_ROLE.code);
      record(
        'the limited principal cannot grant a role to anyone (IDOR attempt), and gains nothing',
        denied(limitedSelfPromotion) && !limitedIsOwner,
        `status ${limitedSelfPromotion.status} → ${limitedSelfPromotion.location ?? ''}, owner role held: ${limitedIsOwner}`,
      );

      const limitedDisableOwner = await call(base, '/api/admin/staff/status', {
        method: 'POST',
        jar: limitedJar,
        form: { csrf: limitedCsrf, staffUserId: String(limited.ownerId), operation: 'disable' },
      });
      const ownerStatusAfter = await staffStatus(limited.ownerId);
      record(
        'the limited principal cannot disable the owner account, and the owner stays active',
        denied(limitedDisableOwner) && ownerStatusAfter === 'active',
        `status ${limitedDisableOwner.status} → ${limitedDisableOwner.location ?? ''}, owner status: ${ownerStatusAfter}`,
      );

      // The owner acts on **another** account here. The earlier version targeted the owner's own id,
      // so it was refused by the self-change guard and the check passed for the wrong reason.
      const grantToOther = await call(base, '/api/admin/staff/role', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, staffUserId: String(limited.limitedId), roleCode: OWNER_ROLE.code, operation: 'grant' },
      });
      const otherIsOwner = await holdsRole(limited.limitedId, OWNER_ROLE.code);
      record(
        'the owner can grant a role to another account',
        grantToOther.status === 303 &&
          (grantToOther.location ?? '').includes('notice=roleGranted') &&
          otherIsOwner,
        `status ${grantToOther.status} → ${grantToOther.location ?? ''}, role held: ${otherIsOwner}`,
      );

      // A staff user may never change their own roles (data-model 4.6), which is also what stops the
      // last owner from demoting themselves out of their own administration.
      const selfDemote = await call(base, '/api/admin/staff/role', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, staffUserId: String(limited.ownerId), roleCode: OWNER_ROLE.code, operation: 'revoke' },
      });
      const ownerStillOwner = await holdsRole(limited.ownerId, OWNER_ROLE.code);
      record(
        'the owner cannot change their own roles, so the last owner cannot demote themselves',
        denied(selfDemote) && ownerStillOwner,
        `status ${selfDemote.status} → ${selfDemote.location ?? ''}, role retained: ${ownerStillOwner}`,
      );

      const ownRoles = await call(base, '/api/admin/staff/role', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, staffUserId: String(limited.limitedId), roleCode: 'verify_limited', operation: 'revoke' },
      });
      record('an owner-issued role change is accepted', ownRoles.status === 303, `status ${ownRoles.status}`);

      console.log('\nsession revocation and replay');
      const logout = await call(base, '/api/admin/session/logout', { method: 'POST', jar: ownerJar, form: { csrf } });
      record('sign-out succeeds', logout.status === 303, `status ${logout.status} → ${logout.location}`);

      const replayed = await call(base, '/admin', { jar: ownerJar });
      record(
        'the revoked session cannot be replayed',
        replayed.status === 307 || (replayed.location ?? '').includes('/admin/login'),
        `status ${replayed.status} → ${replayed.location ?? ''}`,
      );

      const replayMutation = await call(base, '/api/admin/staff', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, email: 'replay@verify.test', displayName: 'Replay', roleCode: OWNER_ROLE.code },
      });
      record('a revoked session cannot perform a mutation', replayMutation.status === 401, `status ${replayMutation.status}`);

      console.log('\nstorefront is unaffected');
      {
        const home = await call(base, '/');
        record('the storefront home page still renders', home.status === 200, `status ${home.status}`);
        // Matched against the configured copy rather than against English words: the storefront
        // renders the default locale on the server, so an English-only assertion would fail on a
        // correct page. Either locale satisfies it, and the locked entry is what must be present.
        const lockedAnnouncements = activeAnnouncements().filter((announcement) => announcement.locked);
        record(
          'the locked demo announcement is still present on the storefront',
          lockedAnnouncements.length > 0 &&
            lockedAnnouncements.some(
              (announcement) =>
                home.body.includes(announcement.message.en) || home.body.includes(announcement.message.bn),
            ),
          `${lockedAnnouncements.length} locked announcement(s) configured`,
        );
        const products = await call(base, '/products');
        record('the catalog page still renders', products.status === 200, `status ${products.status}`);
        const cart = await call(base, '/cart');
        record('the cart page still renders', cart.status === 200, `status ${cart.status}`);
        const checkout = await call(base, '/checkout');
        record('the inert checkout preview still renders', checkout.status === 200, `status ${checkout.status}`);
        record(
          'the admin tree does not leak into the storefront',
          !home.body.includes('/admin/staff'),
          'no admin links in public HTML',
        );
      }

      console.log('\nsecurity headers');
      {
        const response = await call(base, '/');
        record('X-Frame-Options is DENY', response.headers.get('x-frame-options') === 'DENY', response.headers.get('x-frame-options') ?? '');
        record('X-Content-Type-Options is nosniff', response.headers.get('x-content-type-options') === 'nosniff', response.headers.get('x-content-type-options') ?? '');
        record(
          'Referrer-Policy is strict-origin-when-cross-origin',
          response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
          response.headers.get('referrer-policy') ?? '',
        );
        record(
          'no CSP is claimed, because none is implemented',
          response.headers.get('content-security-policy') === null,
          'absent, and documented as an open requirement',
        );
      }
    }
  } finally {
    await stop();
  }

  const failures = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure.name}: ${failure.detail}`);
    process.exit(1);
  }
  console.log('✓ admin verification passed');
}

main().catch(async (error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
