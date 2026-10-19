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
import { existsSync, writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';

import { closeDb, withTransaction } from '../src/db/client';
import {
  auditEvent,
  brand,
  category,
  customer,
  order,
  orderContact,
  orderItem,
  permission,
  product,
  productImage,
  productVariant,
  role,
  rolePermission,
  staffCredential,
  staffRole,
  staffUser,
} from '../src/db/schema';
import { seedReferenceData } from '../src/db/seed';
import { activeAnnouncements } from '../src/data/announcements';
import { applyMigrations } from '../src/db/migrate';
import { startLocalCluster, type LocalCluster } from './local-pg';
import { hashPassword } from '../src/server/auth/password';
import { OWNER_ROLE, PERMISSIONS } from '../src/server/authz/permissions';
import { listAssetKeys } from '../src/server/catalog/assets';
import { checkOrderability } from '../src/server/catalog/orderability';
import { resetServerEnvCache } from '../src/server/env';

const OWNER_EMAIL = 'owner@verify.test';
const OWNER_PASSWORD = 'verify-owner-password-1';
const LIMITED_EMAIL = 'limited@verify.test';
const LIMITED_PASSWORD = 'verify-limited-password-1';
const NEW_OWNER_EMAIL = 'newcomer@verify.test';
const VERIFY_CATEGORY_SLUG = 'verify-skincare';
const VERIFY_BRAND_SLUG = 'verify-brand';
const VERIFY_PRODUCT_NAME = 'Verify Product';

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

/** True when the account has a live password credential, i.e. it has redeemed its token. */
async function hasCredential(staffUserId: number): Promise<boolean> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ id: staffCredential.id })
      .from(staffCredential)
      .where(
        sql`${staffCredential.staffUserId} = ${staffUserId}
            and ${staffCredential.revokedAt} is null
            and ${staffCredential.kind} = 'password'`,
      );
    return rows.length > 0;
  });
}

/**
 * Reads a catalog row by its English name.
 *
 * A status code says what the handler replied; it does not say whether the row exists. Reading the row is
 * what turns "the refusal worked" into a fact, which is the same standard the staff checks already use.
 */
async function productByName(nameEn: string): Promise<{ id: number; availability: string } | null> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ id: product.id, availability: product.availability })
      .from(product)
      .where(sql`${product.nameEn} = ${nameEn} and ${product.deletedAt} is null`);
    const row = rows[0];
    return row === undefined ? null : { id: row.id, availability: row.availability };
  });
}

/** The price on a product's default variant, in poisha. */
async function productPriceMinor(productId: number): Promise<number | null> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ priceMinor: productVariant.priceMinor })
      .from(productVariant)
      .where(sql`${productVariant.productId} = ${productId} and ${productVariant.isDefault}`);
    return rows[0]?.priceMinor ?? null;
  });
}

async function productImageRows(
  productId: number,
): Promise<{ total: number; width: number | null; contentType: string | null }> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({
        width: productImage.width,
        contentType: productImage.contentType,
      })
      .from(productImage)
      .where(sql`${productImage.productId} = ${productId} and ${productImage.deletedAt} is null`);
    return {
      total: rows.length,
      width: rows[0]?.width ?? null,
      contentType: rows[0]?.contentType ?? null,
    };
  });
}

async function categoryIdBySlug(slug: string): Promise<number | null> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ id: category.id })
      .from(category)
      .where(sql`${category.slug} = ${slug}`);
    return rows[0]?.id ?? null;
  });
}

async function categoryIsLive(slug: string): Promise<boolean> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ deletedAt: category.deletedAt })
      .from(category)
      .where(sql`${category.slug} = ${slug}`);
    return rows[0] !== undefined && rows[0].deletedAt === null;
  });
}

async function brandIdBySlug(slug: string): Promise<number | null> {
  return withTransaction(async (tx) => {
    const rows = await tx.select({ id: brand.id }).from(brand).where(sql`${brand.slug} = ${slug}`);
    return rows[0]?.id ?? null;
  });
}

/** The authoritative server-side orderability answer, read from the database. */
async function orderability(productId: number): Promise<{ orderable: boolean; reason?: string }> {
  return withTransaction(async (tx) => checkOrderability(tx, productId));
}

/** The availability state of one product, or `null` when it does not exist. */
async function availabilityOfProduct(productId: number): Promise<string | null> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select({ availability: product.availability })
      .from(product)
      .where(sql`${product.id} = ${productId}`);
    return rows[0]?.availability ?? null;
  });
}

/**
 * A minimal Chromium driver over the DevTools Protocol.
 *
 * Node's built-in WebSocket and fetch are enough here, so the project gains no browser-test
 * dependency. It exposes only what the interface checks use: cookie injection, viewport emulation,
 * navigation, evaluation, a real click/keystroke, screenshots and clean teardown.
 */
type AdminBrowser = {
  cookie(name: string, value: string): Promise<void>;
  viewport(width: number, height: number): Promise<void>;
  navigate(path: string): Promise<void>;
  evaluate<T = unknown>(expression: string): Promise<T>;
  click(selector: string): Promise<void>;
  key(key: string): Promise<void>;
  waitFor(expression: string, timeoutMs?: number): Promise<boolean>;
  screenshot(path: string): Promise<void>;
  close(): Promise<void>;
};

async function openChromium(base: string): Promise<AdminBrowser | null> {
  const port = await freePort();
  const chrome = spawn(
    'chromium',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      `--remote-debugging-port=${port}`,
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const exited = Promise.withResolvers<void>();
  chrome.once('error', () => exited.resolve());
  chrome.once('exit', () => exited.resolve());
  if (chrome.exitCode !== null) return null;

  let target: { webSocketDebuggerUrl: string } | null = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (chrome.exitCode !== null) return null;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = (await response.json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((entry) => entry.type === 'page');
      if (page !== undefined) {
        target = page;
        break;
      }
    } catch {
      // Not listening yet.
    }
    const tick = Promise.withResolvers<void>();
    setTimeout(tick.resolve, 150);
    await tick.promise;
  }
  if (target === null) {
    chrome.kill('SIGKILL');
    return null;
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('DevTools websocket failed'));
  });

  type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
  const pending = new Map<number, Pending>();
  let nextId = 1;
  ws.onmessage = (event: MessageEvent) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    if (message.id === undefined) return;
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) entry.reject(new Error(message.error.message ?? 'CDP error'));
    else entry.resolve(message.result);
  };

  const send = <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    const id = nextId;
    nextId += 1;
    ws.send(JSON.stringify({ id, method, params }));
    const result = Promise.withResolvers<T>();
    pending.set(id, {
      resolve: (value) => result.resolve(value as T),
      reject: result.reject,
    });
    return result.promise;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const response = await send<{
      result?: { value?: unknown };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails !== undefined) {
      throw new Error(
        response.exceptionDetails.text ?? response.exceptionDetails.exception?.description ?? 'evaluate failed',
      );
    }
    return response.result?.value as T;
  };

  const waitFor = async (expression: string, timeoutMs = 8000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if ((await evaluate(expression)) === true) return true;
      } catch {
        // Navigation in flight.
      }
      const tick = Promise.withResolvers<void>();
      setTimeout(tick.resolve, 100);
      await tick.promise;
    }
    return false;
  };

  const navigate = async (path: string): Promise<void> => {
    await send('Page.navigate', { url: new URL(path, base).toString() });
    await waitFor("document.readyState === 'complete' && document.querySelector('main') !== null");
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
  };

  return {
    async cookie(name, value) {
      await send('Network.setCookie', { name, value, path: '/', url: base });
    },
    async viewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 720,
      });
    },
    navigate,
    evaluate,
    async click(selector) {
      const clicked = await evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el === null) return false; el.click(); return true; })()`,
      );
      if (clicked !== true) throw new Error(`no element matched ${selector}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 120));
    },
    async key(key) {
      if (key === 'Escape') {
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: 27 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: 27 });
      } else {
        throw new Error(`unsupported key ${key}`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 120));
    },
    waitFor,
    async screenshot(path) {
      const result = await send<{ data?: string }>('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      if (result.data === undefined) return;
      writeFileSync(path, Buffer.from(result.data, 'base64'));
    },
    async close() {
      ws.close();
      chrome.kill('SIGTERM');
      await Promise.race([exited.promise, new Promise<void>((resolve) => setTimeout(resolve, 400))]);
      if (chrome.exitCode === null) chrome.kill('SIGKILL');
    },
  };
}

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
      for (const path of ['/admin', '/admin/catalog', '/admin/categories', '/admin/owners', '/admin/audit', '/admin/forbidden']) {
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
        ['/api/admin/owners', { email: 'x@y.test', displayName: 'X' }],
        ['/api/admin/owners/status', { staffUserId: '1', operation: 'disable' }],
        ['/api/admin/owners/credential', { staffUserId: '1' }],
        ['/api/admin/catalog/product', { operation: 'create', nameEn: 'X' }],
        ['/api/admin/catalog/availability', { productId: '1', availability: 'in_stock' }],
        ['/api/admin/catalog/category', { operation: 'create', nameEn: 'X' }],
        ['/api/admin/catalog/image', { operation: 'attach', productId: '1', key: 'x' }],
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

      const noCsrf = await call(base, '/api/admin/owners', {
        method: 'POST',
        jar: ownerJar,
        form: { email: NEW_OWNER_EMAIL, displayName: 'Newcomer' },
      });
      record('a state-changing request without a CSRF token is refused', noCsrf.status === 403, `status ${noCsrf.status}`);

      const wrongCsrf = await call(base, '/api/admin/owners', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf: 'f'.repeat(64), email: NEW_OWNER_EMAIL, displayName: 'Newcomer' },
      });
      record('a state-changing request with a wrong CSRF token is refused', wrongCsrf.status === 403, `status ${wrongCsrf.status}`);

      const crossSiteMutation = await call(base, '/api/admin/owners', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, email: NEW_OWNER_EMAIL, displayName: 'Newcomer' },
        headers: { origin: 'https://evil.example.test' },
      });
      record('a valid CSRF token from a cross-site origin is still refused', crossSiteMutation.status === 403, `status ${crossSiteMutation.status}`);

      const created = await call(base, '/api/admin/owners', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, email: NEW_OWNER_EMAIL, displayName: 'Newcomer' },
      });
      record(
        'the owner can create another owner account',
        created.status === 303 && (created.location ?? '').includes('notice=tokenIssued'),
        `status ${created.status} → ${created.location ?? ''}`,
      );

      const newOwnerId = await withTransaction(async (tx) => {
        const rows = await tx
          .select({ id: staffUser.id })
          .from(staffUser)
          .where(sql`lower(${staffUser.email}) = ${NEW_OWNER_EMAIL}`);
        return rows[0]?.id ?? null;
      });
      if (newOwnerId === null) fail('the new owner account was not created by the mutation');

      record(
        'the new account holds the owner role without a role ever being submitted',
        await holdsRole(newOwnerId, OWNER_ROLE.code),
        `account ${newOwnerId}`,
      );
      record(
        'the new account cannot sign in until it redeems its token',
        !(await hasCredential(newOwnerId)),
        'no credential exists for the new account',
      );

      // Signing in with the new account's address must fail while it has no credential, so account
      // creation alone cannot grant access.
      const unredeemed = await call(base, '/api/admin/session/login', {
        method: 'POST',
        jar: new Jar(),
        form: { email: NEW_OWNER_EMAIL, password: 'any-password-1' },
      });
      record(
        'an account that has not redeemed its token cannot sign in',
        (unredeemed.location ?? '').includes('error=invalid'),
        `status ${unredeemed.status} → ${unredeemed.location ?? ''}`,
      );

      const ownersPage = await call(base, '/admin/owners', { jar: ownerJar });
      const issuedToken = /[A-Za-z0-9_-]{43}/.exec(ownersPage.body.replace(/[\s\S]*qb_admin_flash/, ''))?.[0] ?? '';
      record('the one-time token is shown once on the owners screen', ownersPage.status === 200 && issuedToken.length === 43, `token length ${issuedToken.length}`);
      record(
        'the one-time token is not in the URL',
        !(created.location ?? '').includes(issuedToken) && issuedToken !== '',
        created.location ?? '',
      );

      // The staff and role surface the owner ruled out of launch (D10, ADR 0009) must be gone, not merely
      // unlinked: a retired route that still answers would still be an administrative surface.
      const retiredPage = await call(base, '/admin/staff', { jar: ownerJar });
      record('the retired staff page no longer exists', retiredPage.status === 404, `status ${retiredPage.status}`);
      for (const retiredApi of ['/api/admin/staff', '/api/admin/staff/role', '/api/admin/staff/status', '/api/admin/staff/credential']) {
        const response = await call(base, retiredApi, { method: 'POST', jar: ownerJar, form: { csrf } });
        record(`the retired endpoint ${retiredApi} no longer exists`, response.status === 404, `status ${response.status}`);
      }

      const limitedJar = new Jar();
      const limitedSignIn = await call(base, '/api/admin/session/login', {
        method: 'POST',
        jar: limitedJar,
        form: { email: LIMITED_EMAIL, password: LIMITED_PASSWORD },
      });
      record('the limited principal can sign in', limitedSignIn.status === 303, `status ${limitedSignIn.status}`);

      const limitedOverview = await call(base, '/admin', { jar: limitedJar });
      const limitedCsrf = csrfFrom(limitedOverview.body);
      record(
        'the navigation reflects the limited principal’s own permissions',
        limitedOverview.body.includes('href="/admin/owners"') &&
          !limitedOverview.body.includes('href="/admin/catalog"') &&
          !limitedOverview.body.includes('href="/admin/audit"'),
        'owners link shown (staff.read held); catalog and audit links hidden',
      );
      record(
        'the retired staff and role screen is absent from the launch navigation',
        !overview.body.includes('/admin/staff') && !limitedOverview.body.includes('/admin/staff'),
        'no staff link in either principal’s navigation',
      );

      const limitedAudit = await call(base, '/admin/audit', { jar: limitedJar });
      record(
        'the limited principal is refused the audit page, by direct request',
        limitedAudit.status === 307 || limitedAudit.location === '/admin/forbidden',
        `status ${limitedAudit.status} → ${limitedAudit.location ?? ''}`,
      );

      const limitedCreate = await call(base, '/api/admin/owners', {
        method: 'POST',
        jar: limitedJar,
        form: { csrf: limitedCsrf, email: 'sneaky@verify.test', displayName: 'Sneaky' },
      });
      const sneakyExists = await staffAccountExists('sneaky@verify.test');
      record(
        'the limited principal is refused an owner-management mutation, and no account is created',
        denied(limitedCreate) && !sneakyExists,
        `status ${limitedCreate.status} → ${limitedCreate.location ?? ''}, account created: ${sneakyExists}`,
      );

      const limitedDisableOwner = await call(base, '/api/admin/owners/status', {
        method: 'POST',
        jar: limitedJar,
        form: { csrf: limitedCsrf, staffUserId: String(limited.ownerId), operation: 'disable' },
      });
      const ownerStatusAfter = await staffStatus(limited.ownerId);
      record(
        'the limited principal cannot disable an owner account, and the owner stays active',
        denied(limitedDisableOwner) && ownerStatusAfter === 'active',
        `status ${limitedDisableOwner.status} → ${limitedDisableOwner.location ?? ''}, owner status: ${ownerStatusAfter}`,
      );

      const limitedCatalogWrite = await call(base, '/api/admin/catalog/product', {
        method: 'POST',
        jar: limitedJar,
        form: {
          csrf: limitedCsrf,
          operation: 'create',
          nameBn: 'লুকানো',
          nameEn: 'Sneaky Product',
          categoryId: '1',
          brandId: '1',
          price: '1',
          availability: 'in_stock',
        },
      });
      record(
        'the limited principal is refused a catalog mutation, and no product is created',
        denied(limitedCatalogWrite) && (await productByName('Sneaky Product')) === null,
        `status ${limitedCatalogWrite.status} → ${limitedCatalogWrite.location ?? ''}`,
      );

      const limitedCatalogRead = await call(base, '/api/admin/catalog', { jar: limitedJar });
      record(
        'the limited principal is refused the catalog read API',
        limitedCatalogRead.status === 403,
        `status ${limitedCatalogRead.status}`,
      );

      // ---- Phase 17: the manual prepaid subsystem is gone ----
      //
      // Cash on Delivery is the only payment method this release accepts, so the prepaid verification
      // queue, the payment-recipient configuration screen and their API routes were removed rather
      // than hidden. A retired route must 404: an unlinked page that still answered would still be an
      // administrative surface.
      for (const retired of ['/admin/payments', '/admin/payments/recipients']) {
        const page = await call(base, retired, { jar: ownerJar });
        record(`the retired prepaid page ${retired} no longer exists`, page.status === 404, `status ${page.status}`);
      }
      for (const retiredApi of ['/api/admin/payments', '/api/admin/payment-recipients']) {
        const response = await call(base, retiredApi, { method: 'POST', jar: ownerJar, form: { csrf } });
        record(
          `the retired prepaid endpoint ${retiredApi} no longer exists`,
          response.status === 404,
          `status ${response.status}`,
        );
      }
      record(
        'the owner navigation links the COD worklist and no prepaid verification screen',
        overview.body.includes('href="/admin/orders-cod"') && !overview.body.includes('/admin/payments'),
        'COD link shown; no payment-verification link',
      );
      record(
        'no admin page offers a prepaid recipient form',
        !limitedOverview.body.includes('payment-recipient') && !overview.body.includes('payment-recipient'),
        'no recipient control in the shell',
      );      // ---- Phase 17: the COD worklist end to end over HTTP ----
      //
      // The queue read, the route guard, the decision and its effect are separate things, and only a
      // served request exercises all four. A COD order is seeded directly (the customer flow that
      // creates one is verified by verify:storefront); the owner then decides it through the route.
      const codSeed = await withTransaction(async (tx) => {
        const customerRow = await tx
          .insert(customer)
          .values({ email: 'cod-' + Date.now() + '@verify.test', displayName: 'COD Buyer' })
          .returning({ id: customer.id });
        const customerId = customerRow[0]?.id;
        if (customerId === undefined) fail('could not create the COD verification customer');
        const orderNumber = 'QBCOD' + Date.now().toString(36).toUpperCase();
        const orderRow = await tx
          .insert(order)
          .values({
            orderNumber,
            customerId,
            paymentMethod: 'cod',
            status: 'pending',
            paymentState: 'not_applicable',
            codState: 'cod_pending_approval',
            itemsSubtotalMinor: 10000,
            shippingMinor: 0,
            totalMinor: 10000,
          })
          .returning({ id: order.id });
        const orderId = orderRow[0]?.id;
        if (orderId === undefined) fail('could not create the COD verification order');
        await tx.insert(orderContact).values({
          orderId,
          recipientName: 'COD Buyer',
          recipientPhone: '01712345678',
          addressLine: 'House 1, Road 2',
          area: 'Dhanmondi',
          city: 'Dhaka',
        });
        return { customerId, orderId, orderNumber };
      });

      const codPage = await call(base, '/admin/orders-cod', { jar: ownerJar });
      record(
        'the owner sees a pending COD order in the COD worklist with a decision form',
        codPage.status === 200 &&
          codPage.body.includes(codSeed.orderNumber) &&
          codPage.body.includes('/api/admin/orders-cod'),
        `status ${codPage.status}, order shown: ${codPage.body.includes(codSeed.orderNumber)}`,
      );

      const limitedCod = await call(base, '/api/admin/orders-cod', {
        method: 'POST',
        jar: limitedJar,
        form: {
          csrf: limitedCsrf,
          orderId: String(codSeed.orderId),
          decision: 'approve',
          reason: 'a limited principal should never reach this decision',
        },
      });
      const codAfterLimited = await withTransaction((tx) =>
        tx
          .select({ codState: order.codState, status: order.status })
          .from(order)
          .where(sql`${order.id} = ${codSeed.orderId}`),
      );
      record(
        'a principal without the cod.approve permission is refused the decision, and the order stays pending',
        denied(limitedCod) &&
          codAfterLimited[0]?.codState === 'cod_pending_approval' &&
          codAfterLimited[0]?.status === 'pending',
        `status ${limitedCod.status} → ${limitedCod.location ?? ''}, cod_state ${codAfterLimited[0]?.codState}`,
      );

      const approvedCod = await call(base, '/api/admin/orders-cod', {
        method: 'POST',
        jar: ownerJar,
        form: {
          csrf,
          orderId: String(codSeed.orderId),
          decision: 'approve',
          reason: 'confirmed by phone with the COD buyer',
        },
      });
      const codAfterApproval = await withTransaction((tx) =>
        tx
          .select({ codState: order.codState, status: order.status })
          .from(order)
          .where(sql`${order.id} = ${codSeed.orderId}`),
      );
      // The refusal above wrote a durable denial against this order entity too, so the decision is
      // selected by its own action rather than by entity alone - which is also what makes the count a
      // statement about decisions instead of about every record that mentions the order.
      const codAuditWhere = sql`${auditEvent.entityType} = 'order' and ${auditEvent.entityId} = ${codSeed.orderId}`;
      const codAudit = await withTransaction((tx) =>
        tx
          .select({ action: auditEvent.action, actor: auditEvent.actorStaffId, after: auditEvent.after })
          .from(auditEvent)
          .where(sql`${codAuditWhere} and ${auditEvent.action} = 'cod.approved'`),
      );
      const codDenials = await withTransaction((tx) =>
        tx
          .select({ actor: auditEvent.actorStaffId, after: auditEvent.after })
          .from(auditEvent)
          .where(sql`${codAuditWhere} and ${auditEvent.action} = 'admin.action_denied'`),
      );
      record(
        'the owner approves the COD order: cod_approved and confirmed, audited against the acting owner',
        approvedCod.status === 303 &&
          (approvedCod.location ?? '').includes('notice=approved') &&
          codAfterApproval[0]?.codState === 'cod_approved' &&
          codAfterApproval[0]?.status === 'confirmed' &&
          codAudit.length === 1 &&
          codAudit[0]?.actor === limited.ownerId,
        `status ${approvedCod.status} → ${approvedCod.location ?? ''}, cod_state ${codAfterApproval[0]?.codState}, ${codAudit.length} approval record(s)`,
      );
      record(
        'the refused COD decision left a durable denial naming the acting principal',
        codDenials.length >= 1 && codDenials.every((row) => row.actor === limited.limitedId),
        `${codDenials.length} denial record(s)`,
      );

      const codRepeat = await call(base, '/api/admin/orders-cod', {
        method: 'POST',
        jar: ownerJar,
        form: {
          csrf,
          orderId: String(codSeed.orderId),
          decision: 'approve',
          reason: 'a repeated approval must not decide the order twice',
        },
      });
      const codAuditAfterRepeat = await withTransaction((tx) =>
        tx
          .select({ action: auditEvent.action })
          .from(auditEvent)
          .where(sql`${codAuditWhere} and ${auditEvent.action} = 'cod.approved'`),
      );
      record(
        'a repeated COD decision is a conflict and writes no second approval record',
        codRepeat.status === 303 &&
          (codRepeat.location ?? '').includes('notice=conflict') &&
          codAuditAfterRepeat.length === 1,
        `status ${codRepeat.status} → ${codRepeat.location ?? ''}, ${codAuditAfterRepeat.length} approval record(s)`,
      );

      // The refusals above happened over real HTTP, through the real guards, inside real transactions
      // that threw. This is the end-to-end regression assertion for the defect where a denial written
      // in the failing transaction was rolled back by the refusal itself.
      const denials = await withTransaction((tx) =>
        tx
          .select({ actorStaffId: auditEvent.actorStaffId, after: auditEvent.after })
          .from(auditEvent)
          .where(sql`${auditEvent.action} = 'admin.action_denied'`),
      );
      const attempted = (row: { after: unknown }): string =>
        (row.after as { denied?: string } | null)?.denied ?? '';

      // Every staff-management refusal must name the principal that actually made the request. The
      // submitted form carried the OWNER's id as the target, so an implementation that trusted a
      // request-supplied actor would attribute these to the owner instead - which is the specific
      // failure this asserts against.
      const managementDenials = denials.filter((row) => attempted(row).includes('staff.manage'));
      record(
        'a refused owner-management mutation leaves a durable denial record naming the acting session',
        managementDenials.length >= 2 &&
          managementDenials.every((row) => row.actorStaffId === limited.limitedId),
        `${managementDenials.length} owner-management denial record(s), all attributed to the acting session`,
      );

      // A refused catalog mutation is recorded the same way. The submitted form carried a category and a
      // price the actor is not permitted to write; the record names the session, never the payload.
      const catalogDenials = denials.filter((row) => attempted(row).includes('catalog.write'));
      record(
        'a refused catalog mutation is recorded against the acting session',
        catalogDenials.length >= 1 && catalogDenials.every((row) => row.actorStaffId === limited.limitedId),
        `${catalogDenials.length} catalog denial record(s)`,
      );

      // The owner's own requests that failed a CSRF control are recorded too, under a different
      // category - which is what keeps a forgery attempt distinguishable from a missing permission.
      record(
        'a request that fails a CSRF control is recorded under the csrf category',
        denials.some(
          (row) =>
            row.actorStaffId === limited.ownerId &&
            (row.after as { category?: string } | null)?.category === 'csrf',
        ),
        `${denials.length} denial record(s) in total`,
      );

      // The owner cannot disable their own account: otherwise the actor locks themselves out, and the
      // only recovery is the host shell.
      const selfDisable = await call(base, '/api/admin/owners/status', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, staffUserId: String(limited.ownerId), operation: 'disable' },
      });
      // The refusal is a service-level invariant, so it surfaces as a conflict notice rather than a 403 -
      // the request was permitted, the change was not. Asserting the notice *and* the unchanged state is
      // what makes this a refusal rather than a redirect that happened to look like one.
      record(
        'an owner cannot disable their own account, and stays active',
        selfDisable.status === 303 &&
          (selfDisable.location ?? '').includes('notice=conflict') &&
          (await staffStatus(limited.ownerId)) === 'active',
        `status ${selfDisable.status} → ${selfDisable.location ?? ''}, owner active`,
      );

      const disableOther = await call(base, '/api/admin/owners/status', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, staffUserId: String(newOwnerId), operation: 'disable' },
      });
      record(
        'an owner can disable another owner account, and it takes effect',
        disableOther.status === 303 && (await staffStatus(newOwnerId)) === 'disabled',
        `status ${disableOther.status} → ${disableOther.location ?? ''}`,
      );

      const reEnable = await call(base, '/api/admin/owners/status', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, staffUserId: String(newOwnerId), operation: 'enable' },
      });
      record(
        'an owner can re-enable an account',
        reEnable.status === 303 && (await staffStatus(newOwnerId)) === 'active',
        `status ${reEnable.status} → ${reEnable.location ?? ''}`,
      );

      console.log('\ncatalog management');

      const categoryCreated = await call(base, '/api/admin/catalog/category', {
        method: 'POST',
        jar: ownerJar,
        form: {
          csrf,
          operation: 'create',
          nameBn: 'যাচাই ক্যাটাগরি',
          nameEn: 'Verify Category',
          slug: VERIFY_CATEGORY_SLUG,
          sortOrder: '1',
        },
      });
      const categoryId = await categoryIdBySlug(VERIFY_CATEGORY_SLUG);
      record(
        'the owner can create a category',
        categoryCreated.status === 303 && categoryId !== null,
        `status ${categoryCreated.status} → ${categoryCreated.location ?? ''}, id ${categoryId ?? 'missing'}`,
      );

      const brandCreated = await call(base, '/api/admin/catalog/brand', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, nameBn: 'যাচাই ব্র্যান্ড', nameEn: 'Verify Brand', slug: VERIFY_BRAND_SLUG },
      });
      const brandId = await brandIdBySlug(VERIFY_BRAND_SLUG);
      record(
        'the owner can create a brand',
        brandCreated.status === 303 && brandId !== null,
        `status ${brandCreated.status} → ${brandCreated.location ?? ''}, id ${brandId ?? 'missing'}`,
      );

      const productCreated = await call(base, '/api/admin/catalog/product', {
        method: 'POST',
        jar: ownerJar,
        form: {
          csrf,
          operation: 'create',
          nameBn: 'যাচাই পণ্য',
          nameEn: VERIFY_PRODUCT_NAME,
          categoryId: String(categoryId),
          brandId: String(brandId),
          // A fractional BDT price, to prove the conversion is integer arithmetic on the server.
          price: '750.1',
          availability: 'in_stock',
          isPublished: 'on',
        },
      });
      const createdProduct = await productByName(VERIFY_PRODUCT_NAME);
      const productId = createdProduct?.id ?? 0;
      record(
        'the owner can create a product',
        productCreated.status === 303 && productId > 0,
        `status ${productCreated.status} → ${productCreated.location ?? ''}, id ${productId}`,
      );
      record(
        'the price is stored as integer poisha, converted on the server',
        (await productPriceMinor(productId)) === 75_010,
        `stored ${await productPriceMinor(productId)} poisha from 750.1 BDT`,
      );
      record(
        'a published, in-stock product is orderable',
        (await orderability(productId)).orderable === true,
        'the authoritative check accepts it',
      );

      const toggled = await call(base, '/api/admin/catalog/availability', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, productId: String(productId), availability: 'out_of_stock' },
      });
      record(
        'the availability toggle persists the Out of Stock state',
        toggled.status === 303 && (await availabilityOfProduct(productId)) === 'out_of_stock',
        `status ${toggled.status} → ${toggled.location ?? ''}`,
      );
      const afterToggle = await orderability(productId);
      record(
        'an out-of-stock product fails the authoritative orderability check',
        afterToggle.orderable === false && afterToggle.reason === 'out_of_stock',
        JSON.stringify(afterToggle),
      );

      const availabilityAudit = await withTransaction((tx) =>
        tx
          .select({ actor: auditEvent.actorStaffId, after: auditEvent.after })
          .from(auditEvent)
          .where(sql`${auditEvent.action} = 'catalog.availability_changed' and ${auditEvent.entityId} = ${productId}`),
      );
      record(
        'the availability change is audited with the authenticated owner as actor',
        availabilityAudit.length === 1 && availabilityAudit[0]?.actor === limited.ownerId,
        `${availabilityAudit.length} audit record(s), actor ${availabilityAudit[0]?.actor ?? 'none'}`,
      );

      const badAvailability = await call(base, '/api/admin/catalog/availability', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, productId: String(productId), availability: 'unknown' },
      });
      record(
        'an unsupported availability value is refused and changes nothing',
        badAvailability.status === 303 &&
          (badAvailability.location ?? '').includes('notice=invalid') &&
          (await availabilityOfProduct(productId)) === 'out_of_stock',
        `status ${badAvailability.status} → ${badAvailability.location ?? ''}`,
      );

      // A price submitted to the availability endpoint has nowhere to go: the update object is built from
      // the validated availability value alone.
      const priceAttack = await call(base, '/api/admin/catalog/availability', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, productId: String(productId), availability: 'in_stock', price: '1', priceMinor: '1' },
      });
      record(
        'a price submitted to the availability endpoint has no effect',
        priceAttack.status === 303 && (await productPriceMinor(productId)) === 75_010,
        `price still ${await productPriceMinor(productId)} poisha`,
      );

      const assetKeys = await listAssetKeys();
      const assetKey = assetKeys[0] ?? '';
      const imageAttached = await call(base, '/api/admin/catalog/image', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, operation: 'attach', productId: String(productId), key: assetKey, altEn: 'A verified image' },
      });
      const imageRows = await productImageRows(productId);
      record(
        'the owner can attach an existing local asset',
        imageAttached.status === 303 && imageRows.total === 1,
        `status ${imageAttached.status} → ${imageAttached.location ?? ''}, ${imageRows.total} image(s)`,
      );
      record(
        'the attached image metadata was read from the file, not submitted',
        imageRows.width === 600 && imageRows.contentType === 'image/jpeg',
        `${imageRows.width}px ${imageRows.contentType ?? ''}`,
      );

      for (const badKey of ['../public/catalog/x', '/etc/passwd', 'http://example.test/x', 'no-such-asset']) {
        const traversal = await call(base, '/api/admin/catalog/image', {
          method: 'POST',
          jar: ownerJar,
          form: { csrf, operation: 'attach', productId: String(productId), key: badKey, altEn: 'x' },
        });
        record(
          `the image key ${JSON.stringify(badKey)} is refused and nothing is attached`,
          (traversal.location ?? '').includes('notice=invalid') &&
            (await productImageRows(productId)).total === 1,
          `status ${traversal.status} → ${traversal.location ?? ''}`,
        );
      }

      const archiveInUse = await call(base, '/api/admin/catalog/category', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, operation: 'archive', categoryId: String(categoryId) },
      });
      record(
        'a category that still has products is refused, and stays live',
        (archiveInUse.location ?? '').includes('notice=conflict') && (await categoryIsLive(VERIFY_CATEGORY_SLUG)),
        `status ${archiveInUse.status} → ${archiveInUse.location ?? ''}`,
      );

      const readApi = await call(base, '/api/admin/catalog', { jar: ownerJar });
      record(
        'the catalog read API returns the database catalog with integer-poisha pricing',
        readApi.status === 200 &&
          readApi.body.includes('"source":"database"') &&
          readApi.body.includes('"priceMinor":75010'),
        `status ${readApi.status}`,
      );
      record(
        'the catalog read API exposes availability as a state and no quantity',
        readApi.body.includes('"availability":"in_stock"') &&
          !readApi.body.includes('onHand') &&
          !readApi.body.includes('on_hand'),
        'no inventory quantity in the projection',
      );
      record(
        'the storefront serves its own catalog source and leaks no fixture record',
        (await call(base, '/')).body.includes('"isDemo":true') === false &&
          (await call(base, '/products')).status === 200,
        'the storefront reads the database catalog server-side, so no fixture demo marker is ever served',
      );

      // ---- Phase 18: the redesigned shell, exercised in a real browser ----
      //
      // The HTTP checks above prove authorization and persistence. These prove the things only a
      // rendered page can show: the rail exists at desktop width, the drawer opens and closes with
      // focus handled, nothing overflows horizontally at 360/390px, a destructive confirmation
      // traps focus and closes on Escape, and the inline decision actually submits.
      console.log('\nadmin interface in Chromium');
      {
        const secondCod = await withTransaction(async (tx) => {
          const customerRow = await tx
            .insert(customer)
            .values({ email: 'cod-ui-' + Date.now() + '@verify.test', displayName: 'UI COD Buyer' })
            .returning({ id: customer.id });
          const customerId = customerRow[0]?.id;
          if (customerId === undefined) fail('could not create the UI COD customer');
          const orderNumber = 'QBUI' + Date.now().toString(36).toUpperCase();
          const orderRow = await tx
            .insert(order)
            .values({
              orderNumber,
              customerId,
              paymentMethod: 'cod',
              status: 'pending',
              paymentState: 'not_applicable',
              codState: 'cod_pending_approval',
              itemsSubtotalMinor: 50000,
              shippingMinor: 0,
              totalMinor: 50000,
            })
            .returning({ id: order.id });
          const orderId = orderRow[0]?.id;
          if (orderId === undefined) fail('could not create the UI COD order');
          await tx.insert(orderContact).values({
            orderId,
            recipientName: 'UI COD Buyer',
            recipientPhone: '01712345678',
            addressLine: 'House 9, Road 4',
            area: 'Dhanmondi',
            city: 'Dhaka',
          });
          const variant = await tx
            .select({ id: productVariant.id })
            .from(productVariant)
            .where(sql`${productVariant.productId} = ${productId} and ${productVariant.isDefault}`)
            .limit(1);
          if (variant[0] !== undefined) {
            await tx.insert(orderItem).values({
              orderId,
              variantId: variant[0].id,
              productNameBn: 'যাচাই পণ্য',
              productNameEn: VERIFY_PRODUCT_NAME,
              sku: 'VERIFY-SKU',
              unitPriceMinor: 50000,
              quantity: 1,
              lineTotalMinor: 50000,
            });
          }
          return { customerId, orderId, orderNumber };
        });

        const browser = await openChromium(base);
        if (browser === null) {
          record('Chromium is available for the interface checks', false, 'no chromium binary was found');
        } else {
          try {
            await browser.cookie(SESSION_COOKIE, ownerJar.get(SESSION_COOKIE) ?? '');
            await browser.viewport(1440, 900);
            await browser.navigate('/admin');
            await browser.evaluate("localStorage.setItem('queenbees.locale.v1','en')");
            await browser.navigate('/admin');

            const desktop = await browser.evaluate<{ nav: boolean; groups: string[]; h1: string | null; card: boolean; tel: boolean; overflow: number }>(`(() => {
              const nav = document.querySelector('nav[aria-label]');
              const groupLabels = [...document.querySelectorAll('nav p')].map((p) => p.textContent?.trim()).filter(Boolean);
              const h1 = document.querySelector('h1')?.textContent?.trim();
              const card = document.querySelector('article');
              return {
                nav: nav !== null,
                groups: groupLabels,
                h1,
                card: card?.textContent?.includes(${JSON.stringify(secondCod.orderNumber)}) ?? false,
                tel: document.querySelector('a[href^="tel:"]') !== null,
                overflow: document.documentElement.scrollWidth - window.innerWidth,
              };
            })()`);
            record(
              'the desktop shell renders the rail, grouped navigation and the COD worklist card',
              desktop.nav === true && desktop.groups.length >= 3 && typeof desktop.h1 === 'string' && desktop.card === true && desktop.tel === true,
              JSON.stringify(desktop),
            );
            record(
              'the dashboard does not overflow horizontally at 1440px',
              desktop.overflow <= 1,
              `${desktop.overflow}px`,
            );
            await browser.screenshot('/tmp/qb-admin-dashboard-desktop.png');

            await browser.viewport(390, 844);
            await browser.navigate('/admin');
            const mobileClosed = await browser.evaluate<{ toggleVisible: boolean; railHidden: boolean; overflow: number }>(`(() => {
              const toggle = document.querySelector('header button[aria-controls="admin-navigation"]');
              const rail = document.getElementById('admin-navigation');
              return {
                toggleVisible: toggle !== null && getComputedStyle(toggle).display !== 'none',
                railHidden: rail !== null && getComputedStyle(rail).visibility === 'hidden',
                overflow: document.documentElement.scrollWidth - window.innerWidth,
              };
            })()`);
            record(
              'at 390px the rail is a drawer behind a visible menu control',
              mobileClosed.toggleVisible === true && mobileClosed.railHidden === true && mobileClosed.overflow <= 1,
              JSON.stringify(mobileClosed),
            );

            await browser.click('header button[aria-controls="admin-navigation"]');
            const opened = await browser.evaluate<{ open: boolean; focus: string | null; bodyLocked: boolean }>(`(() => {
              const rail = document.getElementById('admin-navigation');
              return {
                open: rail?.getAttribute('aria-modal') === 'true',
                focus: document.activeElement?.getAttribute('aria-label'),
                bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
              };
            })()`);
            record(
              'the drawer opens modally, locks the page and moves focus to its close control',
              opened.open === true && opened.focus === 'Close menu' && opened.bodyLocked === true,
              JSON.stringify(opened),
            );
            await browser.screenshot('/tmp/qb-admin-dashboard-mobile-drawer.png');

            await browser.key('Escape');
            const closed = await browser.evaluate<{ modal: string | null; focus: string | null; bodyLocked: boolean }>(`(() => ({
              modal: document.getElementById('admin-navigation')?.getAttribute('aria-modal'),
              focus: document.activeElement?.getAttribute('aria-controls'),
              bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
            }))()`);
            record(
              'Escape closes the drawer and returns focus to the menu control',
              closed.modal === null && closed.focus === 'admin-navigation' && closed.bodyLocked === false,
              JSON.stringify(closed),
            );

            const overflowAt360: string[] = [];
            await browser.viewport(360, 800);
            for (const route of ['/admin', '/admin/orders-cod', '/admin/catalog', '/admin/customers', '/admin/audit', '/admin/owners']) {
              await browser.navigate(route);
              const overflow = await browser.evaluate('document.documentElement.scrollWidth - window.innerWidth');
              if (typeof overflow === 'number' && overflow > 1) overflowAt360.push(`${route}: ${overflow}px`);
            }
            record(
              'no admin route overflows horizontally at 360px',
              overflowAt360.length === 0,
              overflowAt360.length === 0 ? 'all six routes within the viewport' : overflowAt360.join(', '),
            );

            await browser.viewport(390, 844);
            await browser.navigate('/admin/orders-cod');
            await browser.screenshot('/tmp/qb-admin-cod-mobile.png');

            await browser.viewport(1440, 900);
            await browser.navigate('/admin/orders-cod');
            await browser.click('article form + form button[type="submit"]');
            const dialog = await browser.evaluate<{ open: boolean; required: boolean; focus: string | null; order: boolean }>(`(() => {
              const d = document.querySelector('[role="dialog"][aria-modal="true"]');
              const reason = d?.querySelector('textarea[name="reason"]');
              return {
                open: d !== null,
                required: reason instanceof HTMLTextAreaElement ? reason.required : false,
                focus: document.activeElement?.textContent?.trim(),
                order: document.querySelector('article')?.textContent?.includes(${JSON.stringify(secondCod.orderNumber)}) ?? false,
              };
            })()`);
            record(
              'the destructive COD confirmation opens with a required reason and focus on cancel',
              dialog.open === true && dialog.required === true && dialog.focus === 'Cancel',
              JSON.stringify(dialog),
            );
            await browser.screenshot('/tmp/qb-admin-cod-confirm.png');
            await browser.key('Escape');
            const dialogClosed = await browser.evaluate(`document.querySelector('[role="dialog"][aria-modal="true"]') === null`);
            record('Escape dismisses the confirmation without submitting', dialogClosed === true, 'dialog removed');

            const beforeApprove = await withTransaction((tx) =>
              tx.select({ codState: order.codState, status: order.status }).from(order).where(sql`${order.id} = ${secondCod.orderId}`),
            );
            await browser.click('article form button[type="submit"]');
            await browser.waitFor("document.querySelector('[role=status]') !== null || location.search.includes('notice=')");
            const afterApprove = await withTransaction((tx) =>
              tx.select({ codState: order.codState, status: order.status }).from(order).where(sql`${order.id} = ${secondCod.orderId}`),
            );
            record(
              'the inline approve control decides the order through the real route',
              beforeApprove[0]?.codState === 'cod_pending_approval' &&
                afterApprove[0]?.codState === 'cod_approved' &&
                afterApprove[0]?.status === 'confirmed',
              `${beforeApprove[0]?.codState} → ${afterApprove[0]?.codState}`,
            );

            await browser.navigate('/admin/catalog');
            const catalogUi = await browser.evaluate<{ switches: number; search: boolean; create: boolean }>(`(() => ({
              switches: document.querySelectorAll('button[role="switch"][aria-checked]').length,
              search: document.querySelector('form[role="search"] input[name="q"]') !== null,
              create: document.body.textContent?.includes('New product') ?? false,
            }))()`);
            record(
              'the catalog page exposes availability as a switch and a real search',
              catalogUi.switches > 0 && catalogUi.search === true && catalogUi.create === true,
              JSON.stringify(catalogUi),
            );
            await browser.screenshot('/tmp/qb-admin-catalog.png');

            await browser.navigate(`/admin/customers/${secondCod.customerId}`);
            const detailUi = await browser.evaluate<{ heading: string | null; order: boolean; suspend: boolean }>(`(() => ({
              heading: document.querySelector('h1')?.textContent?.trim(),
              order: document.body.textContent?.includes(${JSON.stringify(secondCod.orderNumber)}),
              suspend: document.body.textContent?.includes('Suspend this customer?'),
            }))()`);
            record(
              'the customer detail page shows the customer, their order and the guarded suspension',
              detailUi.heading === 'UI COD Buyer' && detailUi.order === true && detailUi.suspend === true,
              JSON.stringify(detailUi),
            );
            await browser.screenshot('/tmp/qb-admin-customer.png');
          } finally {
            await browser.close();
          }
        }
      }

      console.log('\nsession revocation and replay');
      const logout = await call(base, '/api/admin/session/logout', { method: 'POST', jar: ownerJar, form: { csrf } });
      record('sign-out succeeds', logout.status === 303, `status ${logout.status} → ${logout.location}`);

      const replayed = await call(base, '/admin', { jar: ownerJar });
      record(
        'the revoked session cannot be replayed',
        replayed.status === 307 || (replayed.location ?? '').includes('/admin/login'),
        `status ${replayed.status} → ${replayed.location ?? ''}`,
      );

      const replayMutation = await call(base, '/api/admin/owners', {
        method: 'POST',
        jar: ownerJar,
        form: { csrf, email: 'replay@verify.test', displayName: 'Replay' },
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
        // Phase 15 replaced the inert preview with a real checkout that requires an account (D12), so
        // the storefront-level assertion is now that the route refuses an anonymous visitor and sends
        // them to sign in - not that it renders an inert page.
        const checkout = await call(base, '/checkout');
        record(
          'checkout refuses an anonymous visitor and redirects to customer sign-in',
          checkout.status >= 300 &&
            checkout.status < 400 &&
            /\/account\/login/.test(checkout.headers.get('location') ?? ''),
          `status ${checkout.status}, location ${checkout.headers.get('location') ?? 'none'}`,
        );
        record(
          'the admin tree does not leak into the storefront',
          !home.body.includes('/admin/catalog') &&
            !home.body.includes('/admin/owners') &&
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
