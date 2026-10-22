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
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync, writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';

import { closeDb, withTransaction } from '../src/db/client';
import {
  accountRecoveryToken,
  auditEvent,
  brand,
  category,
  customer,
  customerSession,
  deliveryDistrictCharge,
  deliverySetting,
  order,
  orderAdditionalCost,
  orderContact,
  orderEvent,
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
  storeSetting,
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
import { revenueSummary } from '../src/server/orders/admin-read';

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
  /**
   * Sets a controlled input's value the way a person typing does: through the native value setter and
   * a dispatched `input` event. `el.value = x` alone does not reach a React-controlled field, which
   * would make a live-preview assertion pass against a preview that never updated.
   */
  type(selector: string, value: string): Promise<void>;
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
    async type(selector, value) {
      const typed = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el === null) return false;
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : el instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (typed !== true) throw new Error(`no element matched ${selector}`);
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

      // ---- Phase 20: the order detail and the order history over HTTP ----
      //
      // The queue is a worklist; the order detail is the record. Both are served pages, so the checks
      // below are about what a permitted and an unpermitted session actually receive.
      const orderDetail = await call(base, '/admin/orders/' + codSeed.orderNumber, { jar: ownerJar });
      record(
        'the owner opens one order and sees its reference, items, totals and contact',
        orderDetail.status === 200 &&
          orderDetail.body.includes(codSeed.orderNumber) &&
          orderDetail.body.includes('COD Buyer') &&
          orderDetail.body.includes('01712345678') &&
          orderDetail.body.includes('Dhanmondi'),
        `status ${orderDetail.status}`,
      );
      record(
        'the decided order detail shows its decision rather than a second decision form',
        orderDetail.status === 200 &&
          !orderDetail.body.includes('name="decision" value="approve"') &&
          orderDetail.body.includes('cod_approved'),
        `status ${orderDetail.status}, decision form present: ${orderDetail.body.includes('name="decision" value="approve"')}`,
      );

      const missingOrder = await call(base, '/admin/orders/QBDEC0FFEE0000000', { jar: ownerJar });
      record(
        'an order reference that names no order is a 404, not a forbidden page',
        missingOrder.status === 404,
        `status ${missingOrder.status}`,
      );

      const orderList = await call(base, '/admin/orders', { jar: ownerJar });
      record(
        'the order history lists the order and links to its detail',
        orderList.status === 200 &&
          orderList.body.includes(codSeed.orderNumber) &&
          orderList.body.includes('/admin/orders/' + codSeed.orderNumber),
        `status ${orderList.status}`,
      );

      const orderSearch = await call(base, '/admin/orders?q=' + encodeURIComponent(codSeed.orderNumber), {
        jar: ownerJar,
      });
      const noMatch = await call(base, '/admin/orders?q=QBNOSUCHORDER00000', { jar: ownerJar });
      record(
        'order search narrows to the matching order, and a non-matching search says so',
        orderSearch.status === 200 &&
          orderSearch.body.includes(codSeed.orderNumber) &&
          noMatch.status === 200 &&
          !noMatch.body.includes(codSeed.orderNumber),
        `search ${orderSearch.status}, no-match ${noMatch.status}`,
      );

      // The limited principal holds `order.read` but not `customer.read` or `audit.read`. Reading an order
      // and reading a customer are different permissions, so the order detail must serve the first and
      // withhold the second: the delivery contact on the order is fulfilment data, the account email is
      // customer-profile data, and the audit trail is its own permission again.
      const buyerRow = await withTransaction((tx) =>
        tx.select({ email: customer.email }).from(customer).where(sql`${customer.id} = ${codSeed.customerId}`),
      );
      const buyerEmail = buyerRow[0]?.email ?? '';
      const limitedOrderDetail = await call(base, '/admin/orders/' + codSeed.orderNumber, { jar: limitedJar });
      const limitedOrderList = await call(base, '/admin/orders', { jar: limitedJar });
      record(
        'a principal with order.read but without customer.read sees the order and not the customer email',
        limitedOrderDetail.status === 200 &&
          limitedOrderList.status === 200 &&
          buyerEmail !== '' &&
          !limitedOrderDetail.body.includes(buyerEmail) &&
          orderDetail.body.includes(buyerEmail),
        `detail ${limitedOrderDetail.status}, list ${limitedOrderList.status}, email withheld: ${!limitedOrderDetail.body.includes(buyerEmail)}`,
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
      // rendered page can show: the rail exists at desktop width, the phone uses a bottom tab bar
      // whose More sheet handles focus, nothing overflows horizontally at 360/390px, a destructive
      // confirmation traps focus and closes on Escape, and the inline decision actually submits.
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

            /*
             * Phase 27 - one admin control scale, and a required field that looks required.
             *
             * The Phase 24 audit measured controls at 32/34/36/40/51px, an approve/reject pair that
             * disagreed by 6px, and an audit note labelled "optional" that the server refuses without.
             * These assertions pin the scale at its two approved heights and pin the decision pair and
             * the note affordance, so neither regression can come back quietly.
             */
            const heightSweep: Array<{ route: string; heights: number[] }> = [];
            for (const route of ['/admin', '/admin/orders-cod', '/admin/catalog', '/admin/settings/delivery']) {
              await browser.navigate(route);
              const heights = await browser.evaluate<number[]>(`(() => [...document.querySelectorAll(
                'main button, main input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), main select',
              )].map((el) => Math.round(el.getBoundingClientRect().height)).filter((h) => h > 0))()`);
              heightSweep.push({ route, heights });
            }
            const offScale = heightSweep.filter((page) => page.heights.some((h) => h !== 34 && h !== 40));
            record(
              'every admin control resolves to one of two heights (34 or 40)',
              heightSweep.every((page) => page.heights.length > 0) && offScale.length === 0,
              JSON.stringify(
                offScale.length > 0
                  ? offScale
                  : heightSweep.map((page) => ({ route: page.route, heights: [...new Set(page.heights)] })),
              ),
            );

            await browser.navigate('/admin');
            const decision = await browser.evaluate<{
              approve: number | null;
              reject: number | null;
              noteOpen: boolean;
              noteLabel: string;
            }>(`(() => {
              const card = document.querySelector('main article');
              if (!card) return { approve: null, reject: null, noteOpen: false, noteLabel: '' };
              const buttons = [...card.querySelectorAll('button')];
              // The COD decision pair is labelled Accept / Reject in this interface.
              const approve = buttons.find((b) => /accept|approve/i.test(b.textContent || ''));
              const reject = buttons.find((b) => /reject|reject order/i.test(b.textContent || ''));
              const note = card.querySelector('details');
              return {
                approve: approve ? Math.round(approve.getBoundingClientRect().height) : null,
                reject: reject ? Math.round(reject.getBoundingClientRect().height) : null,
                noteOpen: note ? note.hasAttribute('open') : false,
                noteLabel: note?.querySelector('summary')?.textContent?.trim() || '',
              };
            })()`);
            record(
              'the approve/reject pair renders at one height and the required audit note is visible and labelled required',
              decision.approve === 40 && decision.reject === 40 && decision.noteOpen === true &&
                /required/i.test(decision.noteLabel),
              JSON.stringify(decision),
            );
            await browser.screenshot('/tmp/qb-admin-dashboard-desktop.png');

            await browser.viewport(390, 844);
            await browser.navigate('/admin');
            const mobileNav = await browser.evaluate<{
              railHidden: boolean;
              barVisible: boolean;
              tabs: number;
              active: string | null;
              overflow: number;
            }>(`(() => {
              const rail = document.getElementById('admin-rail');
              const bar = document.querySelector('[data-admin-bottom-nav]');
              const current = bar?.querySelector('[aria-current="page"]');
              return {
                railHidden: rail !== null && getComputedStyle(rail).display === 'none',
                barVisible: bar !== null && getComputedStyle(bar).display !== 'none',
                tabs: bar?.querySelectorAll('a[href], button').length ?? 0,
                active: current?.textContent?.trim() ?? null,
                overflow: document.documentElement.scrollWidth - window.innerWidth,
              };
            })()`);
            record(
              'at 390px the rail is gone, a five-tab bottom bar navigates, and Overview is current',
              mobileNav.railHidden === true &&
                mobileNav.barVisible === true &&
                mobileNav.tabs === 5 &&
                mobileNav.active === 'Overview' &&
                mobileNav.overflow <= 1,
              JSON.stringify(mobileNav),
            );
            await browser.screenshot('/tmp/qb-admin-dashboard-mobile.png');

            await browser.click('[data-admin-bottom-nav] button[aria-controls="admin-more-sheet"]');
            const sheet = await browser.evaluate<{
              open: boolean;
              focus: string | null;
              bodyLocked: boolean;
              links: number;
            }>(`(() => {
              const sheet = document.getElementById('admin-more-sheet');
              return {
                open: sheet?.getAttribute('aria-modal') === 'true',
                focus: document.activeElement?.getAttribute('aria-label'),
                bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
                links: sheet?.querySelectorAll('a[href]').length ?? 0,
              };
            })()`);
            record(
              'the More tab opens a modal sheet with every section, locks the page and focuses its close control',
              sheet.open === true && sheet.focus === 'Close menu' && sheet.bodyLocked === true && sheet.links >= 6,
              JSON.stringify(sheet),
            );
            await browser.screenshot('/tmp/qb-admin-dashboard-mobile-more.png');

            await browser.key('Escape');
            const sheetClosed = await browser.evaluate<{
              sheet: boolean;
              focus: string | null;
              bodyLocked: boolean;
            }>(`(() => ({
              sheet: document.getElementById('admin-more-sheet') !== null,
              focus: document.activeElement?.getAttribute('aria-controls'),
              bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
            }))()`);
            record(
              'Escape closes the More sheet and returns focus to the More tab',
              sheetClosed.sheet === false && sheetClosed.focus === 'admin-more-sheet' && sheetClosed.bodyLocked === false,
              JSON.stringify(sheetClosed),
            );

            const overflowAt360: string[] = [];
            await browser.viewport(360, 800);
            const overflowRoutes = [
              '/admin',
              '/admin/orders-cod',
              '/admin/orders',
              '/admin/orders/' + codSeed.orderNumber,
              '/admin/catalog',
              '/admin/customers',
              '/admin/audit',
              '/admin/owners',
            ];
            for (const route of overflowRoutes) {
              await browser.navigate(route);
              const overflow = await browser.evaluate('document.documentElement.scrollWidth - window.innerWidth');
              if (typeof overflow === 'number' && overflow > 1) overflowAt360.push(`${route}: ${overflow}px`);
            }
            record(
              'no admin route overflows horizontally at 360px, including the order history and an order detail',
              overflowAt360.length === 0,
              overflowAt360.length === 0
                ? `all ${overflowRoutes.length} routes within the viewport`
                : overflowAt360.join(', '),
            );

            await browser.viewport(390, 844);
            await browser.navigate('/admin/orders-cod');
            await browser.screenshot('/tmp/qb-admin-cod-mobile.png');

            // ---- Phase 20: the order detail and history in a real browser ----
            await browser.viewport(1440, 900);
            await browser.navigate('/admin/orders/' + secondCod.orderNumber);
            const orderDetailUi = await browser.evaluate<{
              heading: string | null;
              tel: string | null;
              items: boolean;
              totals: boolean;
              events: boolean;
              overflow: number;
            }>(`(() => {
              const text = document.body.textContent ?? '';
              return {
                heading: document.querySelector('h1')?.textContent?.trim(),
                tel: document.querySelector('a[href^="tel:"]')?.getAttribute('href') ?? null,
                items: text.includes('Verify Product'),
                totals: text.includes('Total'),
                // This order is seeded directly, so its history is the honest empty state rather than an
                // event row; what the check asserts is that the history section is present at all.
                events: text.includes('Order history'),
                overflow: document.documentElement.scrollWidth - window.innerWidth,
              };
            })()`);
            record(
              'the order detail renders its reference, a tap-to-call number, the items and the order history',
              orderDetailUi.heading === secondCod.orderNumber &&
                orderDetailUi.tel !== null &&
                orderDetailUi.items === true &&
                orderDetailUi.totals === true &&
                orderDetailUi.events === true &&
                orderDetailUi.overflow <= 1,
              JSON.stringify(orderDetailUi),
            );
            const actionPlacement = await browser.evaluate<{
              band: string | null;
              beforeMoney: boolean;
              total: boolean;
            }>(`(() => {
              const band = document.querySelector('section[aria-labelledby="order-action-title"]');
              const money = [...document.querySelectorAll('h2')].find((heading) =>
                (heading.textContent ?? '').includes('Money'),
              ) ?? null;
              return {
                band: band?.querySelector('h2')?.textContent?.trim() ?? null,
                // Document order, not just visibility: the action has to come before the record.
                beforeMoney:
                  band !== null &&
                  money !== null &&
                  (band.compareDocumentPosition(money) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
                total: band?.textContent?.includes('Total') ?? false,
              };
            })()`);
            record(
              'the pending order puts its decision above the money facts, with the total it is deciding on',
              actionPlacement.band === 'Needs your decision' &&
                actionPlacement.beforeMoney === true &&
                actionPlacement.total === true,
              JSON.stringify(actionPlacement),
            );
            await browser.screenshot('/tmp/qb-admin-order-detail-desktop.png');

            await browser.viewport(390, 844);
            await browser.navigate('/admin/orders/' + secondCod.orderNumber);
            await browser.screenshot('/tmp/qb-admin-order-detail-mobile.png');
            const detailMobile = await browser.evaluate<{ overflow: number }>(
              '({ overflow: document.documentElement.scrollWidth - window.innerWidth })',
            );
            record(
              'the order detail does not overflow horizontally at 390px',
              detailMobile.overflow <= 1,
              `${detailMobile.overflow}px`,
            );

            // ---- Phase 20: the post-approval operations, driven in a real browser ----
            //
            // The data-layer tests prove the service refuses the wrong state. This proves the interface the
            // owner actually uses reaches that service: the control exists only while it is legal, one click
            // records the dispatch, and the page that comes back offers the next legal step instead of the
            // one just taken.
            await browser.viewport(1440, 900);
            await browser.navigate('/admin/orders');
            const historyUi = await browser.evaluate<{ link: boolean; search: boolean; filters: boolean }>(`(() => ({
              link: document.querySelector('a[href*="/admin/orders/' + ${JSON.stringify(secondCod.orderNumber)} + '"]') !== null,
              search: document.querySelector('form[role="search"] input[name="q"]') !== null,
              filters: [...document.querySelectorAll('[role="group"] a')].length >= 4,
            }))()`);
            record(
              'the order history lists the order with a real link, server search and status filters',
              historyUi.link === true && historyUi.search === true && historyUi.filters === true,
              JSON.stringify(historyUi),
            );
            await browser.screenshot('/tmp/qb-admin-orders-history.png');

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

            // ---- Phase 20: the post-approval operations, driven in a real browser ----
            //
            // The data-layer tests prove the service refuses the wrong state. This proves the interface the
            // owner actually uses reaches that service: dispatch appears only now that the order is approved,
            // one click records it, and the page that comes back offers the next legal step instead of the
            // one just taken.
            await browser.navigate('/admin/orders/' + secondCod.orderNumber);
            const dispatchForm = 'form:has(input[name="action"][value="dispatch"])';
            const deliverForm = 'form:has(input[name="action"][value="delivered"])';
            const paidForm = 'form:has(input[name="action"][value="paid"])';
            const failedForm = 'form:has(input[name="action"][value="failed"])';
            const approvedUi = await browser.evaluate<{ dispatch: boolean; deliver: boolean }>(`(() => ({
              dispatch: document.querySelector(${JSON.stringify(dispatchForm)}) !== null,
              deliver: document.querySelector(${JSON.stringify(deliverForm)}) !== null,
            }))()`);
            record(
              'an approved COD order offers dispatch, and not the steps that need a dispatched order',
              approvedUi.dispatch === true && approvedUi.deliver === false,
              JSON.stringify(approvedUi),
            );
            await browser.click(dispatchForm + ' button[type="submit"]');
            const dispatched = await browser.waitFor(
              'document.body.textContent.includes(' + JSON.stringify('Recorded as dispatched.') + ')',
            );
            const afterDispatch = await withTransaction((tx) =>
              tx
                .select({ status: order.status, codState: order.codState })
                .from(order)
                .where(sql`${order.id} = ${secondCod.orderId}`),
            );
            record(
              'clicking dispatch records it, and the order reads back as shipped with its cash still uncollected',
              dispatched === true &&
                afterDispatch[0]?.status === 'shipped' &&
                afterDispatch[0]?.codState === 'cod_approved',
              `notice ${dispatched}, status ${afterDispatch[0]?.status}, cod_state ${afterDispatch[0]?.codState}`,
            );
            const afterDispatchUi = await browser.evaluate<{ dispatch: boolean; deliver: boolean; paid: boolean; failed: boolean }>(`(() => ({
              dispatch: document.querySelector(${JSON.stringify(dispatchForm)}) !== null,
              deliver: document.querySelector(${JSON.stringify(deliverForm)}) !== null,
              paid: document.querySelector(${JSON.stringify(paidForm)}) !== null,
              failed: document.querySelector(${JSON.stringify(failedForm)}) !== null,
            }))()`);
            record(
              'once dispatched, the page offers delivery, failed delivery and payment received instead of dispatch again',
              afterDispatchUi.dispatch === false &&
                afterDispatchUi.deliver === true &&
                afterDispatchUi.paid === true &&
                afterDispatchUi.failed === true,
              JSON.stringify(afterDispatchUi),
            );
            await browser.screenshot('/tmp/qb-admin-order-operations.png');

            // ---- Phase 21: payment received is one act that also completes the order ----
            //
            // Dispatched, not delivered: cash usually reaches the owner while the parcel is still with the
            // courier, so the button must be available here. Clicking it records the receipt AND completes
            // the order, and the revenue figure moves by exactly that order's total - once.
            const revenueBefore = await withTransaction((tx) => revenueSummary(tx));
            await browser.click(paidForm + ' button[type="submit"]');
            const paidNotice = await browser.waitFor(
              'document.body.textContent.includes(' + JSON.stringify('Payment receipt recorded and the order completed.') + ')',
            );
            const paidRow = await withTransaction((tx) =>
              tx
                .select({ status: order.status, codState: order.codState, completedAt: order.completedAt, total: order.totalMinor })
                .from(order)
                .where(sql`${order.id} = ${secondCod.orderId}`),
            );
            record(
              'clicking payment received records the receipt and completes the order',
              paidNotice === true &&
                paidRow[0]?.codState === 'cod_collected' &&
                paidRow[0]?.status === 'completed' &&
                paidRow[0]?.completedAt !== null,
              `notice ${paidNotice}, ${paidRow[0]?.status}/${paidRow[0]?.codState}`,
            );

            const revenueAfter = await withTransaction((tx) => revenueSummary(tx));
            record(
              'the dashboard customer-payment figure moves by exactly that order total, once',
              revenueAfter.customerPaymentMinor === revenueBefore.customerPaymentMinor + (paidRow[0]?.total ?? 0) &&
                revenueAfter.orderCount === revenueBefore.orderCount + 1,
              `${revenueBefore.customerPaymentMinor} -> ${revenueAfter.customerPaymentMinor} (${revenueBefore.orderCount} -> ${revenueAfter.orderCount} orders)`,
            );

            // Re-submitting the same form cannot record a second receipt or count the order twice.
            await browser.evaluate(`(() => {
              const form = document.querySelector('form[action="/api/admin/orders/transition"]');
              if (form === null) return false;
              form.requestSubmit();
              return true;
            })()`);
            await new Promise((resolve) => setTimeout(resolve, 750));
            const revenueRepeated = await withTransaction((tx) => revenueSummary(tx));
            const eventsAfterRepeat = await withTransaction((tx) =>
              tx
                .select({ eventType: orderEvent.eventType })
                .from(orderEvent)
                .where(sql`${orderEvent.orderId} = ${secondCod.orderId} and ${orderEvent.eventType} in ('cod_collected', 'order_completed')`),
            );
            record(
              'a repeated submission cannot record a second receipt or double the payment total',
              revenueRepeated.customerPaymentMinor === revenueAfter.customerPaymentMinor &&
                revenueRepeated.orderCount === revenueAfter.orderCount &&
                eventsAfterRepeat.length === 2,
              `payment ${revenueAfter.customerPaymentMinor} -> ${revenueRepeated.customerPaymentMinor}, ${eventsAfterRepeat.length} money events`,
            );

            await browser.navigate('/admin');
            const revenueUi = await browser.evaluate<{ shown: string | null; note: boolean }>(`(() => {
              const text = document.body.textContent ?? '';
              return {
                shown: text.includes('Recorded revenue'),
                note: text.includes('cannot be counted twice') || text.includes('whose payment was never recorded'),
              };
            })()`);
            record(
              'the dashboard shows recorded revenue and states what it counts',
              revenueUi.shown !== null && revenueUi.note === true,
              JSON.stringify(revenueUi),
            );
            await browser.screenshot('/tmp/qb-admin-revenue.png');


            // ---- Phase 22: recording an additional courier cost in a real browser ----
            //
            // The order is already completed, so a cost is recorded directly through the cost route -
            // the same form the order detail posts. What matters is that it lands, is auditable, and
            // leaves the customer's charged total exactly as it was.
            await browser.navigate('/admin/orders/' + secondCod.orderNumber);
            const settledBand = await browser.evaluate<{ band: boolean; transitions: number }>(`(() => ({
              band: document.querySelector('section[aria-labelledby="order-action-title"]') !== null,
              transitions: document.querySelectorAll('form[action="/api/admin/orders/transition"]').length,
            }))()`);
            record(
              'a settled order shows no action band and no transition form',
              settledBand.band === false && settledBand.transitions === 0,
              JSON.stringify(settledBand),
            );
            const costFormUi = await browser.evaluate<{ money: boolean; costs: boolean }>(`(() => {
              const text = document.body.textContent ?? '';
              return {
                money: text.includes('Estimated net proceeds'),
                costs: text.includes('Additional courier costs'),
              };
            })()`);
            record(
              'the order detail shows the four money facts and the additional-costs section',
              costFormUi.money === true && costFormUi.costs === true,
              JSON.stringify(costFormUi),
            );

            // The CSRF token is read from the page the server rendered, never invented.
            const costCsrf = csrfFrom(
              await browser.evaluate<string>('document.documentElement.outerHTML'),
            );
            const chargedBefore = await withTransaction((tx) =>
              tx
                .select({ total: order.totalMinor, subtotal: order.itemsSubtotalMinor, shipping: order.shippingMinor })
                .from(order)
                .where(sql`${order.id} = ${secondCod.orderId}`),
            );
            await browser.evaluate(`(() => {
              const form = document.createElement('form');
              form.method = 'post';
              form.action = '/api/admin/orders/cost';
              const fields = {
                csrf: ${JSON.stringify(costCsrf)},
                operation: 'record',
                orderId: ${JSON.stringify(String(secondCod.orderId))},
                amount: '35',
                description: 'Extra weight charge from the courier',
              };
              for (const [name, value] of Object.entries(fields)) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = name;
                input.value = String(value);
                form.appendChild(input);
              }
              document.body.appendChild(form);
              form.submit();
              return true;
            })()`);
            await browser.waitFor("location.search.includes('notice=costRecorded')");
            const costRows = await withTransaction((tx) =>
              tx
                .select({ amount: orderAdditionalCost.amountMinor, description: orderAdditionalCost.description })
                .from(orderAdditionalCost)
                .where(sql`${orderAdditionalCost.orderId} = ${secondCod.orderId}`),
            );
            const costAudit = await withTransaction((tx) =>
              tx
                .select({ action: auditEvent.action })
                .from(auditEvent)
                .where(sql`${auditEvent.entityId} = ${secondCod.orderId} and ${auditEvent.action} = 'order.cost_recorded'`),
            );
            record(
              'an additional cost is recorded and audited through the real route',
              costRows.length === 1 &&
                costRows[0]?.amount === 3500 &&
                costRows[0]?.description === 'Extra weight charge from the courier' &&
                costAudit.length === 1,
              `${costRows.length} cost row(s), ${costAudit.length} audit row(s)`,
            );

            const chargedAfter = await withTransaction((tx) =>
              tx
                .select({ total: order.totalMinor, subtotal: order.itemsSubtotalMinor, shipping: order.shippingMinor })
                .from(order)
                .where(sql`${order.id} = ${secondCod.orderId}`),
            );
            record(
              'recording a cost leaves the customer charged total untouched',
              chargedAfter[0]?.total === chargedBefore[0]?.total &&
                chargedAfter[0]?.subtotal === chargedBefore[0]?.subtotal &&
                chargedAfter[0]?.shipping === chargedBefore[0]?.shipping,
              `total ${chargedBefore[0]?.total} -> ${chargedAfter[0]?.total}`,
            );

            // The cost figure moves by exactly the recorded amount, the gross payment does not move at
            // all, and the net figure either falls by the same amount or stays unavailable because this
            // seeded order carries no delivery-area snapshot - never a number built on a guess.
            const revenueWithCost = await withTransaction((tx) => revenueSummary(tx));
            const netMoved =
              revenueAfter.estimatedNetProceedsMinor === null ||
              revenueWithCost.estimatedNetProceedsMinor === null
                ? revenueWithCost.estimatedNetProceedsMinor === null &&
                  revenueAfter.estimatedNetProceedsMinor === null
                : revenueWithCost.estimatedNetProceedsMinor ===
                  revenueAfter.estimatedNetProceedsMinor - 3500;
            record(
              'the dashboard costs figure includes the recorded cost, and the fee is not taken twice',
              revenueWithCost.additionalCostsMinor === revenueAfter.additionalCostsMinor + 3500 &&
                revenueWithCost.customerPaymentMinor === revenueAfter.customerPaymentMinor &&
                netMoved,
              `costs ${revenueAfter.additionalCostsMinor} -> ${revenueWithCost.additionalCostsMinor}, payment unchanged ${revenueWithCost.customerPaymentMinor}, net ${revenueWithCost.estimatedNetProceedsMinor}`,
            );

            await browser.navigate('/admin/orders/' + secondCod.orderNumber);
            const costUi = await browser.evaluate<{ listed: boolean; voidable: boolean }>(`(() => {
              const text = document.body.textContent ?? '';
              return {
                listed: text.includes('Extra weight charge from the courier'),
                voidable: text.includes('Void this cost'),
              };
            })()`);
            record(
              'the recorded cost is listed with a void control',
              costUi.listed === true && costUi.voidable === true,
              JSON.stringify(costUi),
            );
            await browser.screenshot('/tmp/qb-admin-order-costs.png');

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

            /*
             * ---- Phase 35: the product editor ----
             *
             * The create and edit forms are their own routes now. These checks drive the real form:
             * the live preview must track what is typed (through the native setter, so a React-
             * controlled field actually updates), the saving must be derived from the two typed
             * amounts, a comparison price that is not higher must be called out, and the required
             * summary must be specific rather than generic.
             */
            console.log('\nproduct editor (Phase 35)');

            await browser.navigate('/admin/catalog/new');
            const editorShell = await browser.evaluate<{
              heading: string;
              sections: string[];
              required: number;
              sticky: string;
              preview: boolean;
              columns: number;
              overflow: number;
              h1Count: number;
            }>(`(() => {
              const sections = [...document.querySelectorAll('main section h2')].map((h) => h.textContent?.trim() ?? '');
              const header = document.querySelector('main form > header');
              const cols = document.querySelector('main form > div');
              return {
                heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
                h1Count: document.querySelectorAll('main h1').length,
                sections,
                required: [...document.querySelectorAll('main [required]')].length,
                sticky: header ? getComputedStyle(header).position : 'none',
                preview: document.body.textContent?.includes('Storefront preview') ?? false,
                columns: cols ? getComputedStyle(cols).gridTemplateColumns.split(' ').length : 0,
                overflow: document.documentElement.scrollWidth - window.innerWidth,
              };
            })()`);
            record(
              'the product editor is its own route with the reference section set, a sticky action bar and a preview',
              editorShell.heading === 'New product' &&
                editorShell.h1Count === 1 &&
                editorShell.sections.includes('General information') &&
                editorShell.sections.includes('Media') &&
                editorShell.sections.includes('Pricing') &&
                editorShell.sections.includes('Organisation') &&
                editorShell.sections.includes('Publication') &&
                editorShell.sections.includes('Storefront preview') &&
                editorShell.sticky === 'sticky' &&
                editorShell.preview === true &&
                editorShell.columns === 2 &&
                editorShell.overflow <= 1,
              JSON.stringify(editorShell),
            );

            // The required summary names the empty fields rather than saying "check the form".
            const missingSummary = await browser.evaluate<string>(
              `(() => document.querySelector('main form > header p')?.textContent?.trim() ?? '')()`,
            );
            /*
             * The Bangla name became optional (owner decision, 2026-10-23), so it must be absent from the
             * required summary - and its field must not carry the required marker. Asserting the absence
             * is what stops the old rule creeping back in through a stray `required` attribute.
             */
            const banglaField = await browser.evaluate<{ required: boolean; label: string }>(
              `(() => {
                const input = document.querySelector('#nameBn');
                const label = document.querySelector('label[for="nameBn"]');
                return {
                  required: input !== null && input.hasAttribute('required'),
                  label: label ? label.textContent.trim() : '',
                };
              })()`,
            );
            record(
              'the required summary names every empty required field and never the optional Bangla name',
              /required/i.test(missingSummary) &&
                missingSummary.includes('Name (English)') &&
                !missingSummary.includes('Name (Bangla)') &&
                missingSummary.includes('Category') &&
                missingSummary.includes('Price') &&
                banglaField.required === false &&
                /optional/i.test(banglaField.label),
              `${missingSummary} | ${JSON.stringify(banglaField)}`,
            );

            /*
             * The live preview. Typing goes through the native value setter because a React-controlled
             * input ignores a direct assignment; without that, this check would pass against a preview
             * that never updates.
             */
            await browser.type('#nameEn', 'Rose Water Toner');
            await browser.type('#price', '750');
            await browser.type('#compareAtPrice', '900');
            await browser.type('#shortDescription', 'One line under the price.');
            const previewUi = await browser.evaluate<{
              name: string;
              price: string;
              compare: string;
              saving: string;
              short: string;
              noPriceGone: boolean;
            }>(`(() => {
              const preview = [...document.querySelectorAll('main section')].find((s) =>
                s.textContent?.includes('Storefront preview'),
              );
              const text = preview?.textContent ?? '';
              return {
                // The preview body, not the section: the section also carries its own heading.
                name: preview?.querySelector('[class*="previewBody"]')?.textContent ?? '',
                price: /Tk 750/.test(text) ? 'Tk 750' : '',
                compare: /Tk 900/.test(text) ? 'Tk 900' : '',
                saving: /Save Tk/i.test(text) ? text : '',
                short: text.includes('One line under the price.') ? 'yes' : 'no',
                noPriceGone: !text.includes('No price yet'),
              };
            })()`);
            record(
              'the live preview tracks the typed name, price, comparison price, derived saving and short description',
              previewUi.name.includes('Rose Water Toner') &&
                previewUi.price === 'Tk 750' &&
                previewUi.compare === 'Tk 900' &&
                previewUi.saving !== '' &&
                previewUi.short === 'yes' &&
                previewUi.noPriceGone === true,
              JSON.stringify(previewUi),
            );

            // A comparison price that is not genuinely higher is refused by the server, so it is
            // called out in the form rather than discovered on save.
            await browser.type('#compareAtPrice', '700');
            const lowerCompare = await browser.evaluate<{ warned: boolean; saving: boolean }>(`(() => {
              const text = document.body.textContent ?? '';
              const preview = [...document.querySelectorAll('main section')].find((s) =>
                s.textContent?.includes('Storefront preview'),
              );
              return {
                warned: /no saving will be shown/i.test(text),
                saving: /save/i.test(preview?.textContent ?? ''),
              };
            })()`);
            record(
              'a comparison price below the price is called out and shows no saving',
              lowerCompare.warned === true && lowerCompare.saving === false,
              JSON.stringify(lowerCompare),
            );

            // The slug previews the storefront path it will produce.
            const slugHint = await browser.evaluate<string>(`(() => {
              const hint = [...document.querySelectorAll('main p')].map((p) => p.textContent ?? '');
              return hint.find((text) => text.startsWith('/products/')) ?? '';
            })()`);
            record(
              'the slug field previews the storefront path derived from the English name',
              slugHint === '/products/rose-water-toner',
              slugHint,
            );

            // The publication outcome states what the two states actually mean together.
            const outcomeHidden = await browser.evaluate<string>(
              `(() => document.querySelector('main [data-tone]')?.textContent?.trim() ?? '')()`,
            );
            await browser.click('#isPublished');
            const outcomeLive = await browser.evaluate<string>(
              `(() => document.querySelector('main [data-tone]')?.textContent?.trim() ?? '')()`,
            );
            record(
              'the publication outcome changes with the two states instead of leaving the owner to infer it',
              /not on the storefront/i.test(outcomeHidden) && /orderable/i.test(outcomeLive) && outcomeHidden !== outcomeLive,
              JSON.stringify({ hidden: outcomeHidden, live: outcomeLive }),
            );

            await browser.screenshot('/tmp/qb-admin-product-new-desktop.png');

            // Creating through the real form lands on the new product's edit screen, where images live.
            await browser.type('#nameBn', 'গোলাপ জল টোনার');
            await browser.type('#compareAtPrice', '900');
            /*
             * A submit with required fields still empty must SAY so. Native bubbles leave a keyboard
             * user with no announcement and no list, so the form states the set in text and focuses the
             * first offender - this drives that path before filling the fields in.
             */
            await browser.click('main form > header button[type="submit"]');
            const blockedUi = await browser.evaluate<{ alerted: string; focused: string; stillHere: boolean }>(`(() => ({
              alerted: document.querySelector('[role="alert"]')?.textContent ?? '',
              focused: document.activeElement?.getAttribute('name') ?? '',
              stillHere: location.pathname === '/admin/catalog/new',
            }))()`);
            record(
              'submitting an incomplete form states which fields are missing and focuses the first one',
              /check these fields/i.test(blockedUi.alerted) && blockedUi.focused !== '' && blockedUi.stillHere === true,
              JSON.stringify(blockedUi),
            );

            const chooseRequired = await browser.evaluate<boolean>(`(() => {
              for (const name of ['categoryId', 'brandId']) {
                const select = document.querySelector('select[name="' + name + '"]');
                if (!(select instanceof HTMLSelectElement) || select.options.length < 2) return false;
                select.value = select.options[1].value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
              return true;
            })()`);
            record(
              'the form offers real category and brand options to choose',
              chooseRequired === true,
              String(chooseRequired),
            );

            await browser.click('main form > header button[type="submit"]');
            await browser.waitFor("location.pathname.startsWith('/admin/catalog/') && location.pathname !== '/admin/catalog/new'");
            const afterCreate = await browser.evaluate<{ path: string; notice: string; gallery: boolean; media: boolean }>(`(() => ({
              path: location.pathname,
              notice: document.body.textContent?.includes('Product created') ? 'created' : 'none',
              gallery: document.querySelector('[data-admin-gallery]') !== null,
              media: document.body.textContent?.includes('Media') ?? false,
            }))()`);
            record(
              'saving the new product opens its edit screen, where images can be attached',
              /^\/admin\/catalog\/\d+$/.test(afterCreate.path) &&
                afterCreate.notice === 'created' &&
                afterCreate.media === true,
              JSON.stringify(afterCreate),
            );
            await browser.screenshot('/tmp/qb-admin-product-edit-desktop.png');

            // The short description reached the database and is rendered on the storefront page.
            const createdShort = await withTransaction(async (tx) => {
              const rows = await tx
                .select({ id: product.id, slug: product.slug, shortDescription: product.shortDescription })
                .from(product)
                .where(sql`${product.nameEn} = 'Rose Water Toner' and ${product.deletedAt} is null`);
              return rows[0] ?? null;
            });
            record(
              'the short description is stored, not merely previewed',
              createdShort?.shortDescription === 'One line under the price.',
              JSON.stringify(createdShort),
            );

            /*
             * Narrow widths: the columns stack in **source order** - fields first, preview after - with no
             * overflow. The preview used to be moved above the fields, which put ~500px of preview and
             * commercial facts before the first name input on a phone; the form is the task and the preview
             * is feedback on it, so the reorder was removed (2026-10-23).
            const editorWidths = [320, 360, 390, 768, 1024, 1280, 1440, 1920];
            const editorFindings: string[] = [];
            for (const width of editorWidths) {
              await browser.viewport(width, 900);
              for (const route of ['/admin/catalog/new', afterCreate.path]) {
                await browser.navigate(route);
                const measured = await browser.evaluate<{ overflow: number; columns: number; previewFirst: boolean }>(`(() => {
                  const cols = document.querySelector('main form > div');
                  const side = document.querySelector('main form > div > aside');
                  const main = document.querySelector('main form > div > div');
                  const sideBox = side?.getBoundingClientRect();
                  const mainBox = main?.getBoundingClientRect();
                  return {
                    overflow: document.documentElement.scrollWidth - window.innerWidth,
                    columns: cols ? getComputedStyle(cols).gridTemplateColumns.split(' ').length : 0,
                    previewFirst: sideBox !== undefined && mainBox !== undefined ? sideBox.top <= mainBox.top : false,
                  };
                })()`);
                if (measured.overflow > 1) editorFindings.push(`${route} @${width}px: ${measured.overflow}px`);
                if (width < 1100 && measured.columns !== 1) {
                  editorFindings.push(`${route} @${width}px: expected one column, got ${measured.columns}`);
                }
                if (width < 1100 && measured.previewFirst !== false) {
                  editorFindings.push(`${route} @${width}px: the preview is not below the fields`);
                }
              }
            }
            record(
              'the product editor stacks to one column below 1100px in source order, and never widens the document',
              editorFindings.length === 0,
              editorFindings.length === 0 ? `${editorWidths.length} widths x 2 routes` : editorFindings.join(', '),
            );

            await browser.viewport(390, 844);
            await browser.navigate('/admin/catalog/new');
            await browser.screenshot('/tmp/qb-admin-product-new-mobile.png');
            await browser.viewport(1440, 900);

            /*
             * ---- Phase 30: one list vocabulary across every admin list ----
             *
             * The reference audit found three row heights, two button heights, pagination missing on
             * half the lists and no date filter anywhere. These checks pin the corrected contract:
             *
             *   - one toolbar (filter, then search, then dates) and one control scale on every list;
             *   - search, filters and a date range are server-side and visible in the URL;
             *   - pagination and page size are real, and a filter change returns to page 1;
             *   - no route widens the document at any supported width;
             *   - a wide table scrolls inside its own container.
             *
             * The data is seeded here, in this disposable cluster, so pagination has more than one
             * page to page through.
             */
            console.log('\nadmin list surfaces (Phase 30)');
            const listSeed = await withTransaction(async (tx) => {
              const rows = await tx
                .select({ id: customer.id })
                .from(customer)
                .where(sql`${customer.id} = ${secondCod.customerId}`);
              const customerId = rows[0]?.id;
              if (customerId === undefined) fail('the list-surface customer is missing');

              const variant = await tx
                .select({ id: productVariant.id })
                .from(productVariant)
                .where(sql`${productVariant.productId} = ${productId} and ${productVariant.isDefault}`)
                .limit(1);
              const variantId = variant[0]?.id;

              const made: string[] = [];
              // 32 orders spread over the last 32 days: enough for two pages at 25, and enough for a
              // date window to exclude a known subset.
              for (let index = 0; index < 32; index += 1) {
                const orderNumber = 'QBLST' + String(index).padStart(2, '0') + Date.now().toString(36).toUpperCase();
                const placedAt = new Date(Date.now() - index * 24 * 3_600_000);
                const inserted = await tx
                  .insert(order)
                  .values({
                    orderNumber,
                    customerId,
                    paymentMethod: 'cod',
                    status: 'pending',
                    paymentState: 'not_applicable',
                    codState: 'cod_pending_approval',
                    itemsSubtotalMinor: 40000 + index,
                    shippingMinor: 6000,
                    totalMinor: 46000 + index,
                    placedAt,
                  })
                  .returning({ id: order.id });
                const orderId = inserted[0]?.id;
                if (orderId === undefined) fail('could not seed a list-surface order');
                await tx.insert(orderContact).values({
                  orderId,
                  recipientName: 'List Buyer ' + index,
                  recipientPhone: '0171234' + String(1000 + index),
                  addressLine: 'House 3, Road 5',
                  area: 'Dhanmondi',
                  city: 'Dhaka',
                });
                if (variantId !== undefined) {
                  await tx.insert(orderItem).values({
                    orderId,
                    variantId,
                    productNameBn: 'যাচাই পণ্য',
                    productNameEn: VERIFY_PRODUCT_NAME,
                    sku: 'VERIFY-SKU-' + index,
                    unitPriceMinor: 40000 + index,
                    quantity: 1,
                    lineTotalMinor: 40000 + index,
                  });
                }
                made.push(orderNumber);
              }

              // Enough products to page the catalog, all in the verification category.
              for (let index = 0; index < 28; index += 1) {
                const name = 'Paged Product ' + String(index).padStart(2, '0');
                const slug = 'paged-product-' + String(index).padStart(2, '0');
                const existing = await tx
                  .select({ id: product.id })
                  .from(product)
                  .where(sql`${product.slug} = ${slug}`);
                if (existing.length > 0) continue;
                await tx.insert(product).values({
                  slug,
                  nameBn: 'পেজ পণ্য ' + index,
                  nameEn: name,
                  categoryId: categoryId ?? 1,
                  brandId: brandId ?? 1,
                  isPublished: true,
                  // A published product must carry the timestamp it was published at - the schema
                  // CHECK is what stops a row claiming publication it never had.
                  publishedAt: new Date(),
                  availability: 'in_stock',
                });
              }

              return { made, newest: made[0], oldest: made[made.length - 1] };
            });

            /*
             * One toolbar shape, one control scale. The selector list is what the contract is: every
             * button, value control and date input on these five routes resolves to 40px or 34px, and
             * every page exposes exactly one list toolbar.
             */
            const listRoutes = ['/admin/orders', '/admin/orders-cod', '/admin/catalog', '/admin/categories', '/admin/customers'];
            const toolbarSweep: Array<{ route: string; toolbars: number; heights: number[] }> = [];
            for (const route of listRoutes) {
              await browser.navigate(route);
              const measured = await browser.evaluate<{ toolbars: number; heights: number[] }>(`(() => ({
                toolbars: document.querySelectorAll('[data-admin-toolbar]').length,
                heights: [...document.querySelectorAll(
                  'main button, main input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), main select',
                )].map((el) => Math.round(el.getBoundingClientRect().height)).filter((h) => h > 0),
              }))()`);
              toolbarSweep.push({ route, ...measured });
            }
            record(
              'every admin list renders exactly one toolbar and keeps the 34/40 control scale',
              toolbarSweep.every((page) => page.toolbars === 1) &&
                toolbarSweep.every((page) => page.heights.length > 0) &&
                toolbarSweep.every((page) => page.heights.every((h) => h === 34 || h === 40)),
              JSON.stringify(
                toolbarSweep.map((page) => ({
                  route: page.route,
                  toolbars: page.toolbars,
                  heights: [...new Set(page.heights)],
                })),
              ),
            );

            /*
             * Server-side search: the term travels in the URL, the server narrows the list, and a
             * term that matches nothing states the gap and offers the way back rather than an empty
             * table. This is the case a client-only filter gets wrong, because it filters one page.
             */
            await browser.navigate('/admin/orders?q=' + encodeURIComponent('List Buyer 7'));
            const searchUi = await browser.evaluate<{
              url: string;
              rows: number;
              hit: boolean;
              others: boolean;
              clear: boolean;
            }>(`(() => {
              const list = document.querySelector('[data-admin-list]');
              const text = list?.textContent ?? '';
              return {
                url: location.search,
                rows: list?.querySelectorAll(':scope > li').length ?? 0,
                hit: text.includes('List Buyer 7'),
                others: text.includes('List Buyer 6') || text.includes('List Buyer 8'),
                clear: [...document.querySelectorAll('main a')].some((a) => /clear/i.test(a.textContent || '')),
              };
            })()`);
            record(
              'order search is applied by the server and reflected in the URL',
              searchUi.rows === 1 && searchUi.hit === true && searchUi.others === false && searchUi.clear === true,
              JSON.stringify(searchUi),
            );

            await browser.navigate('/admin/orders?q=' + encodeURIComponent('no-such-order-zzz'));
            const noResults = await browser.evaluate<{ empty: boolean; clear: boolean; url: string }>(`(() => ({
              empty: /No orders match/i.test(document.body.textContent || ''),
              clear: [...document.querySelectorAll('main a')].some((a) => /clear/i.test(a.textContent || '')),
              url: location.search,
            }))()`);
            record(
              'a search with no match states the gap and offers a way back',
              noResults.empty === true && noResults.clear === true && noResults.url.includes('no-such-order-zzz'),
              JSON.stringify(noResults),
            );

            /*
             * Filters combine. A status tab and a search narrow together, the URL carries both, and
             * the filter chip row names what is in force - so a narrowed list can never be mistaken
             * for the whole list.
             */
            await browser.navigate('/admin/orders?filter=pending&q=' + encodeURIComponent('List Buyer 7'));
            const combined = await browser.evaluate<{ rows: number; chips: number; url: string; q: string }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              chips: document.querySelectorAll('[data-admin-filter-chip]').length,
              // Decoded, because a browser serialises a space as %20 in the search string and the
              // encoded form is not what the assertion is about.
              url: decodeURIComponent(location.search),
              q: new URLSearchParams(location.search).get('q') ?? '',
            }))()`);
            record(
              'a status filter and a search combine on the server, both stay in the URL, and both are named as chips',
              combined.rows === 1 &&
                combined.chips >= 2 &&
                combined.url.includes('filter=pending') &&
                combined.q === 'List Buyer 7',
              JSON.stringify(combined),
            );

            // Clearing the chips restores the whole list: the count goes back up and no chip remains.
            await browser.navigate('/admin/orders');
            const cleared = await browser.evaluate<{ rows: number; chips: number; url: string }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              chips: document.querySelectorAll('[data-admin-filter-chip]').length,
              url: location.search,
            }))()`);
            record(
              'clearing every filter restores the full list and removes the chips',
              cleared.chips === 0 && cleared.rows === 25 && cleared.url === '',
              JSON.stringify(cleared),
            );

            /*
             * The date range is server-side and half-open: a window that ends today must exclude an
             * order placed yesterday. The assertion is about a record that exists, so a broken
             * predicate cannot pass by returning nothing.
             */
            const today = new Date();
            const isoDay = (date: Date): string =>
              `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            await browser.navigate(`/admin/orders?from=${isoDay(today)}&to=${isoDay(today)}&size=100`);
            const ranged = await browser.evaluate<{ text: string; rows: number; url: string; from: string }>(`(() => ({
              text: document.querySelector('[data-admin-list]')?.textContent ?? '',
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              url: location.search,
              from: document.querySelector('input[name="from"]')?.value ?? '',
            }))()`);
            record(
              'a date range is applied by the server, excludes older rows and survives in the URL and the inputs',
              ranged.rows >= 1 &&
                ranged.text.includes(listSeed.newest ?? '') &&
                !ranged.text.includes(listSeed.oldest ?? '') &&
                ranged.url.includes('from=' + isoDay(today)) &&
                ranged.from === isoDay(today),
              JSON.stringify({ rows: ranged.rows, url: ranged.url, from: ranged.from }),
            );
            await browser.screenshot('/tmp/qb-admin-orders-date-range.png');

            /*
             * Pagination: a page size change is a link, so it survives reload, and it returns to
             * page 1 rather than leaving the owner on a page that may no longer exist.
             */
            await browser.navigate('/admin/orders?size=10');
            const pageOne = await browser.evaluate<{ rows: number; url: string; hasNext: boolean }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              url: location.search,
              hasNext: [...document.querySelectorAll('main a')].some((a) => /next page/i.test(a.textContent || '')),
            }))()`);
            record(
              'the page-size control returns exactly the requested number of rows',
              pageOne.rows === 10 && pageOne.url.includes('size=10') && pageOne.hasNext === true,
              JSON.stringify(pageOne),
            );

            const firstRowOnPageOne = await browser.evaluate<string>(`(() => {
              const list = document.querySelector('[data-admin-list]');
              return list?.querySelector(':scope > li')?.textContent ?? '';
            })()`);

            await browser.navigate('/admin/orders?size=10&page=2');
            const pageTwo = await browser.evaluate<{ rows: number; first: string; pageLabel: string }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              first: document.querySelector('[data-admin-list] > li')?.textContent ?? '',
              pageLabel: [...document.querySelectorAll('main p, main span')]
                .map((el) => el.textContent || '')
                .find((text) => /page \\d+ of/i.test(text)) ?? '',
            }))()`);
            record(
              'page 2 returns a different set of rows than page 1',
              pageTwo.rows === 10 &&
                pageTwo.pageLabel.toLowerCase().includes('page 2') &&
                pageTwo.first !== firstRowOnPageOne,
              JSON.stringify({ rows: pageTwo.rows, label: pageTwo.pageLabel, differs: pageTwo.first !== firstRowOnPageOne }),
            );

            await browser.navigate('/admin/orders?page=9999&size=10');
            const outOfRange = await browser.evaluate<{ rows: number; text: string }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              text: document.body.textContent ?? '',
            }))()`);
            record(
              'a page number beyond the end resolves to a real page instead of an empty screen',
              outOfRange.rows > 0 && !/could not be loaded/i.test(outOfRange.text),
              JSON.stringify({ rows: outOfRange.rows }),
            );

            await browser.navigate('/admin/orders?q=&filter=all&from=2026-02-31&size=7');
            const invalidParams = await browser.evaluate<{ status: string; rows: number; from: string }>(`(() => ({
              status: document.querySelector('h1')?.textContent ?? '',
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              from: document.querySelector('input[name="from"]')?.value ?? 'x',
            }))()`);
            record(
              'an impossible date and an undocumented page size are ignored rather than refused',
              invalidParams.rows > 0 && invalidParams.from === '' && invalidParams.status !== '',
              JSON.stringify(invalidParams),
            );

            /*
             * Pagination on the lists that had none: catalog, categories and audit. Each must state a
             * real total and offer the page-size control, and the catalog page must contain exactly
             * the requested number of product rows.
             */
            await browser.navigate('/admin/catalog?size=10');
            const catalogPage = await browser.evaluate<{ rows: number; sizeLinks: number; total: boolean }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              sizeLinks: document.querySelectorAll('main [role="group"] a[aria-current="true"]').length,
              total: /showing \\d+ of \\d+/i.test(document.body.textContent || ''),
            }))()`);
            record(
              'the catalog list is paginated with a page-size control and an exact total',
              catalogPage.rows === 10 && catalogPage.sizeLinks >= 1 && catalogPage.total === true,
              JSON.stringify(catalogPage),
            );
            await browser.screenshot('/tmp/qb-admin-catalog-paged.png');

            await browser.navigate('/admin/categories?size=10');
            const categoriesPage = await browser.evaluate<{ search: boolean; total: boolean; filter: boolean }>(`(() => ({
              search: document.querySelector('form[role="search"] input[name="q"]') !== null,
              total: /showing \\d+ of \\d+/i.test(document.body.textContent || ''),
              filter: document.querySelectorAll('[role="group"] a').length >= 3,
            }))()`);
            record(
              'the category list has search, a visibility filter and a stated total',
              categoriesPage.search === true && categoriesPage.total === true && categoriesPage.filter === true,
              JSON.stringify(categoriesPage),
            );

            // Search and the visibility filter are applied together by the server, not in the browser.
            await browser.navigate('/admin/categories?q=' + encodeURIComponent('Verify Category'));
            const categorySearch = await browser.evaluate<{ rows: number; text: string; url: string }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              text: document.querySelector('[data-admin-list]')?.textContent ?? '',
              url: location.search,
            }))()`);
            await browser.navigate('/admin/categories?q=' + encodeURIComponent('Verify Category') + '&visibility=hidden');
            const categoryHidden = await browser.evaluate<{ rows: number; empty: boolean }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-list] > li').length,
              empty: /No categories match/i.test(document.body.textContent || ''),
            }))()`);
            record(
              'category search narrows on the server and combines with the visibility filter',
              categorySearch.rows === 1 &&
                categorySearch.text.includes('Verify Category') &&
                categoryHidden.rows === 0 &&
                categoryHidden.empty === true,
              JSON.stringify({ search: categorySearch.rows, hidden: categoryHidden.rows }),
            );
            await browser.screenshot('/tmp/qb-admin-categories.png');

            await browser.navigate('/admin/audit?size=10');
            const auditPage = await browser.evaluate<{ rows: number; total: boolean; size: boolean }>(`(() => ({
              rows: document.querySelectorAll('[data-admin-table] tbody tr').length,
              total: /showing \\d+ of \\d+/i.test(document.body.textContent || ''),
              size: document.querySelectorAll('main [role="group"] a').length > 1,
            }))()`);
            record(
              'the audit trail is paginated with an exact total',
              auditPage.rows > 0 && auditPage.rows <= 10 && auditPage.total === true && auditPage.size === true,
              JSON.stringify(auditPage),
            );
            await browser.screenshot('/tmp/qb-admin-audit.png');

            /*
             * Row actions still work. The row links to the order detail, which is the only place an
             * action is offered; the permission boundary itself is proven over HTTP above.
             */
            await browser.navigate('/admin/orders?size=10');
            const rowLink = await browser.evaluate<string | null>(
              `(() => document.querySelector('[data-admin-list] > li a[href^="/admin/orders/"]')?.getAttribute('href') ?? null)()`,
            );
            if (rowLink === null) fail('the order list has no row link');
            await browser.navigate(rowLink);
            const openedOrder = await browser.evaluate<{ heading: string; reason: boolean }>(`(() => ({
              heading: document.querySelector('h1')?.textContent?.trim() ?? '',
              reason: document.querySelector('form[action="/api/admin/orders-cod"] [name="reason"]') !== null,
            }))()`);
            record(
              'a list row opens its order, which still carries the guarded decision control',
              openedOrder.heading.startsWith('QBLST') && openedOrder.reason === true,
              JSON.stringify(openedOrder),
            );

            /*
             * Responsive containment at every supported width. A dense table may scroll inside its
             * own container; the document must never widen, because a widened document is a page an
             * owner cannot read on a phone.
             */
            const widths = [320, 360, 390, 768, 1024, 1280, 1440, 1920];
            const overflowFindings: string[] = [];
            for (const width of widths) {
              await browser.viewport(width, 900);
              for (const route of [...listRoutes, '/admin/audit']) {
                await browser.navigate(route);
                const measured = await browser.evaluate<{ overflow: number; scrolls: boolean }>(`(() => {
                  const wrap = document.querySelector('main div');
                  const table = document.querySelector('[data-admin-table]');
                  const scroller = table?.parentElement ?? null;
                  return {
                    overflow: document.documentElement.scrollWidth - window.innerWidth,
                    scrolls: scroller !== null
                      ? scroller.scrollWidth > scroller.clientWidth && getComputedStyle(scroller).overflowX !== 'visible'
                      : false,
                  };
                })()`);
                if (measured.overflow > 1) overflowFindings.push(`${route} @${width}px: ${measured.overflow}px`);
                if (route === '/admin/audit' && width <= 390 && measured.scrolls !== true) {
                  overflowFindings.push(`${route} @${width}px: the table does not scroll inside its container`);
                }
              }
            }
            record(
              'no admin list widens the document at 320-1920px, and the audit table scrolls inside its container',
              overflowFindings.length === 0,
              overflowFindings.length === 0 ? `${widths.length} widths x ${listRoutes.length + 1} routes` : overflowFindings.join(', '),
            );

            await browser.viewport(390, 844);
            await browser.navigate('/admin/orders');
            await browser.screenshot('/tmp/qb-admin-orders-mobile.png');
            await browser.navigate('/admin/customers');
            await browser.screenshot('/tmp/qb-admin-customers-mobile.png');
            await browser.viewport(1440, 900);
            await browser.navigate('/admin/orders');
            await browser.screenshot('/tmp/qb-admin-orders-desktop.png');

            /*
             * The footer is the only place a list states its size, so it gets its own capture scrolled
             * into view: a footer below the fold is a footer nobody read while approving this change.
             */
            await browser.navigate('/admin/orders?size=10');
            const footer = await browser.evaluate<{
              countLeft: number;
              groupLeft: number;
              groupRight: number;
              mainRight: number;
              sameRow: boolean;
            }>(`(() => {
              const footer = [...document.querySelectorAll('main div')].find(
                (el) => /Showing \\d+ of \\d+/.test(el.textContent || '') && el.querySelector('[role="group"]'),
              );
              if (!footer) return { countLeft: 0, groupLeft: 0, groupRight: 0, mainRight: 0, sameRow: false };
              const count = footer.querySelector('p');
              const group = footer.querySelector('div');
              const main = document.querySelector('main');
              const countBox = count?.getBoundingClientRect();
              const groupBox = group?.getBoundingClientRect();
              return {
                countLeft: Math.round(countBox?.left ?? 0),
                groupLeft: Math.round(groupBox?.left ?? 0),
                groupRight: Math.round(groupBox?.right ?? 0),
                mainRight: Math.round((main?.getBoundingClientRect().right ?? 0) - 24),
                sameRow: countBox !== undefined && groupBox !== undefined
                  ? Math.abs((countBox.top + countBox.bottom) / 2 - (groupBox.top + groupBox.bottom) / 2) < 8
                  : false,
              };
            })()`);
            record(
              'the list footer puts the count on the left and the controls on the right, on one row',
              footer.countLeft < footer.groupLeft &&
                footer.sameRow === true &&
                Math.abs(footer.groupRight - footer.mainRight) <= 2,
              JSON.stringify(footer),
            );
            await browser.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await browser.screenshot('/tmp/qb-admin-orders-footer.png');

            await browser.navigate('/admin/customers');
            await browser.screenshot('/tmp/qb-admin-customers-desktop.png');

            /*
             * English only. The interface has one language (Phase 28); a list that leaked a second
             * one would be a regression this phase must not introduce.
             */
            await browser.navigate('/admin/orders');
            const language = await browser.evaluate<{ lang: string; bengali: boolean }>(`(() => ({
              lang: document.documentElement.lang,
              bengali: /[\\u0980-\\u09FF]/.test(document.body.textContent || ''),
            }))()`);
            record(
              'the list surfaces stay English only',
              language.lang === 'en' && language.bengali === false,
              JSON.stringify(language),
            );

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


            // ---- Phase 23: the owner-operated customer credential reset ----
            //
            // The credential must appear on the render that follows issuance and never again: it is
            // stored only as a digest, it is single-use, and the flash cookie is httpOnly and /admin
            // scoped. This drives the real route and then reloads to prove the second read is empty.
            const recoveryFormUi = await browser.evaluate<{ panel: boolean; reason: boolean }>(`(() => {
              const text = document.body.textContent ?? '';
              return {
                panel: text.includes('Password recovery'),
                reason: document.querySelector('form[action="/api/admin/customers/recovery"] textarea[name="reason"]') !== null,
              };
            })()`);
            record(
              'the customer detail page offers the recovery action with a required reason',
              recoveryFormUi.panel === true && recoveryFormUi.reason === true,
              JSON.stringify(recoveryFormUi),
            );

            // A live session for that customer, so revocation at issuance is observable.
            const seededSession = await withTransaction((tx) =>
              tx
                .insert(customerSession)
                .values({
                  customerId: secondCod.customerId,
                  tokenHash: createHash('sha256').update('verify-admin-session').digest('hex'),
                  idleExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                  absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                })
                .returning({ id: customerSession.id }),
            );
            record(
              'a live customer session exists before issuance, so its revocation can be observed',
              seededSession.length === 1,
              `${seededSession.length} session(s)`,
            );

            await browser.navigate(`/admin/customers/${secondCod.customerId}`);
            const recoveryCsrf = csrfFrom(
              await browser.evaluate<string>('document.documentElement.outerHTML'),
            );
            await browser.evaluate(`(() => {
              const form = document.createElement('form');
              form.method = 'post';
              form.action = '/api/admin/customers/recovery';
              const fields = {
                csrf: ${JSON.stringify(recoveryCsrf)},
                customerId: ${JSON.stringify(String(secondCod.customerId))},
                reason: 'Identity verified on the phone against the order on record',
              };
              for (const [name, value] of Object.entries(fields)) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = name;
                input.value = String(value);
                form.appendChild(input);
              }
              document.body.appendChild(form);
              form.submit();
              return true;
            })()`);
            await browser.waitFor("location.search.includes('notice=tokenIssued')");

            const issuedUi = await browser.evaluate<{ code: string | null; revokes: boolean }>(`(() => {
              const text = document.body.textContent ?? '';
              const node = document.querySelector('[data-testid="recovery-code"]');
              return {
                code: node?.textContent?.trim() ?? null,
                revokes: text.includes('revokes every active session'),
              };
            })()`);
            const issuedToken = issuedUi.code;
            record(
              'issuing shows the one-time code once, with the consequences stated',
              typeof issuedToken === 'string' &&
                issuedToken.length === 43 &&
                issuedUi.revokes === true,
              `code present: ${issuedUi.code !== null}`,
            );
            await browser.screenshot('/tmp/qb-admin-recovery-code.png');

            const liveSessionsAfter = await withTransaction((tx) =>
              tx
                .select({ total: sql<number>`count(*)::int` })
                .from(customerSession)
                .where(
                  sql`${customerSession.customerId} = ${secondCod.customerId}
                      and ${customerSession.revokedAt} is null`,
                ),
            );
            record(
              'issuance revokes every active customer session',
              liveSessionsAfter[0]?.total === 0,
              `${liveSessionsAfter[0]?.total} live session(s) remain`,
            );

            const storedDigests = await withTransaction((tx) =>
              tx
                .select({ tokenHash: accountRecoveryToken.tokenHash })
                .from(accountRecoveryToken)
                .where(sql`${accountRecoveryToken.customerId} = ${secondCod.customerId}`),
            );
            record(
              'only a digest of the code is stored, never the code itself',
              storedDigests.length === 1 &&
                storedDigests[0]?.tokenHash !== issuedToken &&
                storedDigests[0]?.tokenHash ===
                  createHash('sha256').update(issuedToken ?? '').digest('hex'),
              `${storedDigests.length} row(s); stored length ${storedDigests[0]?.tokenHash.length ?? 0}, code length ${issuedToken?.length ?? 0}`,
            );

            // The page offers the dismissal that makes the single read real: clicking it clears the flash
            // cookie through the route, so a reload shows nothing.
            const dismissClicked = await browser.evaluate<boolean>(`(() => {
              const form = document.querySelector('form[action="/api/admin/customers/recovery/dismiss"]');
              const button = form?.querySelector('button[type="submit"]');
              if (!button) return false;
              button.click();
              return true;
            })()`);
            record('the page offers a control that dismisses the code', dismissClicked === true, String(dismissClicked));
            await browser.waitFor("!document.body.innerText.includes('One-time code')");

            await browser.navigate(`/admin/customers/${secondCod.customerId}`);
            const stillVisible = await browser.evaluate<boolean>(
              `(document.body.textContent ?? '').includes(${JSON.stringify(issuedToken ?? '')})`,
            );
            record('the code is not shown again after a reload', stillVisible === false, String(stillVisible));

            // ---- Phase 19: delivery charges, configured through the real UI ----
            await browser.navigate('/admin/settings/delivery');
            const deliveryUi = await browser.evaluate<{
              title: string | null;
              areas: string[];
              inputs: number;
              missing: boolean;
            }>(`(() => {
              const text = document.body.textContent ?? '';
              return {
                title: document.querySelector('h1')?.textContent?.trim() ?? null,
                areas: ['Dhaka', 'Chattogram', 'Other districts'].filter((area) => text.includes(area)),
                inputs: document.querySelectorAll('form[action="/api/admin/delivery"] input[name="amount"]').length,
                missing: text.includes('No default delivery charge is configured'),
              };
            })()`);
            record(
              'the delivery settings screen shows the three areas and the unconfigured warning',
              deliveryUi.title === 'Delivery charges' &&
                deliveryUi.areas.length === 3 &&
                deliveryUi.inputs === 3 &&
                deliveryUi.missing === true,
              JSON.stringify(deliveryUi),
            );

            await browser.evaluate(`(() => {
              const form = document.querySelector('form[action="/api/admin/delivery"]');
              const input = form?.querySelector('input[name="amount"]');
              if (!(input instanceof HTMLInputElement)) return false;
              input.value = '85';
              form.requestSubmit();
              return true;
            })()`);
            await browser.waitFor(
              "location.pathname === '/admin/settings/delivery' && location.search.includes('notice=defaultSaved')",
            );
            const defaultAfter = await withTransaction((tx) =>
              tx.select({ defaultMinor: deliverySetting.defaultMinor }).from(deliverySetting).limit(1),
            );
            record(
              'saving the default through the form persists 85 taka as 8500 poisha',
              defaultAfter[0]?.defaultMinor === 8500,
              String(defaultAfter[0]?.defaultMinor),
            );

            /*
             * The announcement bar is owner-editable and, since ADR 0020, it carries **only** the owner's
             * line - the locked preview notice it used to sit under was removed with the rest of the demo
             * wording. The round trip matters more than the form: what the owner saves must reach the
             * storefront, and clearing the message must remove the bar rather than leave a blank strip.
             */
            await browser.navigate('/admin/settings/announcement');
            const announcementUi = await browser.evaluate<{
              title: string | null;
              hasTextarea: boolean;
              hasVisibleToggle: boolean;
              empty: boolean;
              previewCopy: boolean;
            }>(`(() => {
              const heading = document.querySelector('h1')?.textContent?.trim() ?? null;
              const card = document.querySelector('form[action="/api/admin/announcement"]');
              return {
                title: heading,
                hasTextarea: card !== null && card.querySelector('textarea[name="message"]') !== null,
                hasVisibleToggle: card !== null && card.querySelector('input[name="visible"]') !== null,
                empty: /no message saved/i.test(document.body.textContent || ''),
                previewCopy: /same component/i.test(document.body.textContent || ''),
              };
            })()`);
            record(
              'the announcement settings screen offers one message, one switch and the preview caption',
              announcementUi.title === 'Announcement bar' &&
                announcementUi.hasTextarea &&
                announcementUi.hasVisibleToggle &&
                announcementUi.empty &&
                announcementUi.previewCopy,
              JSON.stringify(announcementUi),
            );

            const ANNOUNCEMENT_TEXT = 'Order now for delivery before the weekend.';
            await browser.evaluate(`(() => {
              const form = document.querySelector('form[action="/api/admin/announcement"]');
              const textarea = form?.querySelector('textarea[name="message"]');
              const toggle = form?.querySelector('input[name="visible"]');
              if (!(textarea instanceof HTMLTextAreaElement) || !(toggle instanceof HTMLInputElement)) return false;
              textarea.value = '${ANNOUNCEMENT_TEXT}';
              toggle.checked = true;
              form.requestSubmit();
              return true;
            })()`);
            await browser.waitFor(
              "location.pathname === '/admin/settings/announcement' && location.search.includes('notice=saved')",
            );
            const storefrontWithMessage = await call(base, '/');
            const savedRows = await withTransaction((tx) =>
              tx.select({ key: storeSetting.key, value: storeSetting.value }).from(storeSetting),
            );
            record(
              'saving the announcement reaches the storefront and carries no demo notice',
              storefrontWithMessage.body.includes(ANNOUNCEMENT_TEXT) &&
                !/this is a preview store/i.test(storefrontWithMessage.body),
              `rows ${savedRows.length}`,
            );
            record(
              'the saved announcement is stored as typed settings, not as free-form HTML',
              savedRows.some((row) => row.key === 'announcement.message' && row.value === ANNOUNCEMENT_TEXT) &&
                savedRows.some((row) => row.key === 'announcement.visible' && row.value === true),
              JSON.stringify(savedRows.map((row) => row.key)),
            );

            await browser.navigate('/admin/settings/announcement');
            await browser.evaluate(`(() => {
              const form = document.querySelector('form[action="/api/admin/announcement"]');
              const textarea = form?.querySelector('textarea[name="message"]');
              const toggle = form?.querySelector('input[name="visible"]');
              if (!(textarea instanceof HTMLTextAreaElement) || !(toggle instanceof HTMLInputElement)) return false;
              textarea.value = '';
              toggle.checked = false;
              form.requestSubmit();
              return true;
            })()`);
            await browser.waitFor(
              "location.pathname === '/admin/settings/announcement' && location.search.includes('notice=saved')",
            );
            const storefrontCleared = await call(base, '/');
            record(
              'clearing the message removes the bar instead of leaving a blank line',
              !storefrontCleared.body.includes(ANNOUNCEMENT_TEXT) &&
                !storefrontCleared.body.includes('data-announcement-bar'),
              'storefront re-fetched',
            );

            /*
             * The preview is the point of the screen, so it is asserted as behaviour, not markup: the
             * draft has to reach it, and the visibility switch has to add and remove the owner's line.
             * Since ADR 0020 that line is the **only** thing the strip shows - there is no locked notice
             * above it any more. `browser.type` uses the native value setter on purpose: a plain
             * `el.value = x` would leave a controlled preview untouched and let this assertion pass
             * against a preview that never updates.
             */
            await browser.navigate('/admin/settings/announcement');
            await browser.type('textarea[name="message"]', 'Eid orders close on Friday.');
            const previewHidden = await browser.evaluate<{ text: string; count: string }>(`(() => ({
              text: document.querySelector('figure')?.textContent ?? '',
              count: document.querySelector('[class*="counter"]')?.textContent ?? '',
            }))()`);
            record(
              'typing updates the character count and stays out of the preview while the switch is off',
              previewHidden.count.includes('27 of 300') &&
                !previewHidden.text.includes('Eid orders close on Friday.'),
              JSON.stringify(previewHidden),
            );

            await browser.click('input[name="visible"]');
            const previewOn = await browser.evaluate<string>(
              `document.querySelector('figure')?.textContent ?? ''`,
            );
            record(
              'switching the message on shows it alone in the preview',
              previewOn.includes('Eid orders close on Friday.') &&
                !/this is a preview store/i.test(previewOn),
              JSON.stringify(previewOn.slice(0, 160)),
            );

            await browser.click('input[name="visible"]');
            const previewOff = await browser.evaluate<string>(
              `document.querySelector('figure')?.textContent ?? ''`,
            );
            record(
              'switching it off removes the owner line from the preview',
              !previewOff.includes('Eid orders close on Friday.'),
              JSON.stringify(previewOff.slice(0, 160)),
            );

            // The delivery checks that follow operate on the delivery page, so return to it.
            await browser.navigate('/admin/settings/delivery');

            await browser.evaluate(`(() => {
              const form = [...document.querySelectorAll('form[action="/api/admin/delivery"]')]
                .find((candidate) => candidate.querySelector('input[name="districtCode"]')?.value === 'dhaka');
              const input = form?.querySelector('input[name="amount"]');
              if (!(input instanceof HTMLInputElement)) return false;
              input.value = '125.50';
              form.requestSubmit();
              return true;
            })()`);
            await browser.waitFor(
              "location.pathname === '/admin/settings/delivery' && location.search.includes('notice=districtSaved')",
            );
            const dhakaAfter = await withTransaction((tx) =>
              tx
                .select({ amountMinor: deliveryDistrictCharge.amountMinor, isActive: deliveryDistrictCharge.isActive })
                .from(deliveryDistrictCharge)
                .where(sql`${deliveryDistrictCharge.districtCode} = 'dhaka'`),
            );
            record(
              'saving the Dhaka override through the form persists 125.50 taka as 12550 poisha',
              dhakaAfter[0]?.amountMinor === 12550 && dhakaAfter[0]?.isActive === true,
              JSON.stringify(dhakaAfter[0]),
            );
            await browser.screenshot('/tmp/qb-admin-delivery.png');
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
        /*
         * The demo notice was removed by the owner (2026-10-23), so this assertion guards the opposite
         * direction: no locked notice may come back, and no storefront page may describe the shop as a
         * preview. The configured list is read rather than hard-coded so a reintroduction fails here.
         */
        const lockedAnnouncements = activeAnnouncements().filter((announcement) => announcement.locked);
        record(
          'no demo or preview notice remains on the storefront',
          lockedAnnouncements.length === 0 &&
            !/preview store|demonstration storefront|no payments are taken/i.test(home.body),
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
