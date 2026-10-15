#!/usr/bin/env tsx
/**
 * Customer authentication and checkout over real HTTP.
 *
 * The database tests prove the service layer and the browser suite proves the UI renders. Neither can
 * prove the properties that matter most here, because they belong to the served routes: an
 * **unauthenticated** client cannot create an order, a cross-origin or CSRF-less submission is refused,
 * a price sent by the browser is ignored, and one customer cannot read another customer's order.
 *
 * Called by scripts/verify-storefront.ts after the browser suite, against the same served build and
 * seeded database, so no second server or cluster is created.
 */

import type { Pool } from 'pg';

export type FlowCheck = { step: string; ok: boolean; detail: unknown };

/** Minimal cookie jar. Two cookies are stored: the session and nothing else. */
class Jar {
  private readonly cookies = new Map<string, string>();

  store(response: Response): void {
    for (const value of setCookieValues(response)) {
      const pair = value.split(';')[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => name + '=' + value).join('; ');
  }

  clear(): void {
    this.cookies.clear();
  }
}

function setCookieValues(response: Response): string[] {
  const getSetCookie = (response.headers as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') return getSetCookie.call(response.headers);
  const single = response.headers.get('set-cookie');
  return single === null ? [] : [single];
}

/** Extracts the session-bound CSRF token rendered into a form on the page. */
function csrfFrom(html: string): string | null {
  // Attribute order is not guaranteed, so both orders are matched rather than assuming one.
  const named = /name="csrf"[^>]*value="([0-9a-f]{64})"/.exec(html);
  if (named !== null) return named[1] ?? null;
  const reversed = /value="([0-9a-f]{64})"[^>]*name="csrf"/.exec(html);
  return reversed === null ? null : (reversed[1] ?? null);
}

function redact(value: string): string {
  return value.replace(/qb_customer_session=[^;]+/g, 'qb_customer_session=<redacted>');
}

async function body(response: Response): Promise<string> {
  return response.text();
}

/**
 * Runs the flow. Every step is recorded whether it passes or fails, so a failure reports what the
 * server actually did instead of stopping at the first problem.
 */
export async function runCustomerFlowChecks(options: { base: string; pool: Pool }): Promise<FlowCheck[]> {
  const base = options.base;
  const pool = options.pool;
  const checks: FlowCheck[] = [];
  const record = (step: string, ok: boolean, detail: unknown): void => {
    checks.push({ step, ok, detail });
  };

  const productRows = await pool.query<{ id: string; price_minor: number }>(
    'select p.id, v.price_minor from product p ' +
      'join product_variant v on v.product_id = p.id and v.is_default and v.is_active ' +
      "where p.is_published and p.availability = 'in_stock' and p.deleted_at is null " +
      'order by p.id limit 1',
  );
  const item = productRows.rows[0];
  if (item === undefined) throw new Error('no in-stock published product to order; seed the catalog first');
  const productId = String(item.id);
  const unitPrice = Number(item.price_minor);
  const orderItemCount = async (): Promise<number> => {
    const rows = await pool.query<{ total: number }>('select count(*)::int as total from "order"');
    return Number(rows.rows[0]?.total ?? 0);
  };

  const jar = new Jar();

  const form = (body: Record<string, string>): string => new URLSearchParams(body).toString();

  const post = async (
    path: string,
    fields: Record<string, string>,
    overrideOrigin?: string,
  ): Promise<Response> => {
    const response = await fetch(base + path, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: overrideOrigin ?? base,
        ...(jar.header() === '' ? {} : { cookie: jar.header() }),
      },
      body: form(fields),
    });
    return response;
  };

  const get = async (path: string): Promise<Response> =>
    fetch(base + path, {
      redirect: 'manual',
      headers: jar.header() === '' ? {} : { cookie: jar.header() },
    });

  const contact = {
    recipientName: 'Rahim Uddin',
    recipientPhone: '01712345678',
    addressLine: 'House 12, Road 5',
    area: 'Dhanmondi',
    city: 'Dhaka',
    paymentMethod: 'bkash',
  };

  // 1. Checkout is not reachable without an account (D12).
  const anonymousCheckout = await get('/checkout');
  const anonymousLocation = anonymousCheckout.headers.get('location') ?? '';
  await body(anonymousCheckout);
  record(
    'checkout redirects an anonymous visitor to sign in with the checkout path preserved',
    anonymousCheckout.status >= 300 &&
      anonymousCheckout.status < 400 &&
      anonymousLocation.includes('/account/login') &&
      anonymousLocation.includes('next=%2Fcheckout'),
    { status: anonymousCheckout.status, location: anonymousLocation },
  );

  // 2. A cross-origin registration is refused before anything is written.
  const crossEmail = 'flow-cross-' + Date.now() + '@example.test';
  const crossOrigin = await post(
    '/api/account/register',
    { email: crossEmail, password: 'a-long-enough-password', confirmPassword: 'a-long-enough-password' },
    'https://evil.example',
  );
  await body(crossOrigin);
  const crossRows = await pool.query('select 1 from customer where email = $1', [crossEmail]);
  record(
    'a cross-origin registration is refused and creates no account',
    crossOrigin.status === 403 && crossRows.rowCount === 0,
    { status: crossOrigin.status, rows: crossRows.rowCount },
  );

  // 3. Registration issues an httpOnly, SameSite=Lax, site-scoped session cookie.
  const email = 'flow-' + Date.now() + '@example.test';
  const password = 'a-long-enough-password';
  const registration = await post('/api/account/register', {
    email,
    password,
    confirmPassword: password,
    displayName: 'Flow Buyer',
    next: '/account',
  });
  await body(registration);
  const cookieText = setCookieValues(registration).join('\n');
  record(
    'registration redirects and sets an httpOnly SameSite=Lax session cookie',
    registration.status >= 300 &&
      registration.status < 400 &&
      /HttpOnly/i.test(cookieText) &&
      /SameSite=Lax/i.test(cookieText) &&
      /Path=\//i.test(cookieText) &&
      /qb_customer_session=/.test(cookieText),
    { status: registration.status, cookie: redact(cookieText) },
  );
  jar.store(registration);

  // 4. The account page is reachable only with the cookie, and shows the address.
  const account = await get('/account');
  const accountHtml = await body(account);
  const accountWithoutCookie = await fetch(base + '/account', { redirect: 'manual' });
  const anonymousAccountHtml = await body(accountWithoutCookie);
  record(
    'the account page shows the session holder their address, and an anonymous visitor the sign-in link',
    account.status === 200 &&
      accountHtml.includes(email) &&
      accountWithoutCookie.status === 200 &&
      /\/account\/login/.test(anonymousAccountHtml) &&
      !anonymousAccountHtml.includes(email),
    {
      withCookie: account.status,
      signedInShown: accountHtml.includes(email),
      withoutCookie: accountWithoutCookie.status,
      cookieLength: jar.header().length,
    },
  );

  // 5. The signed-in customer's password is never echoed back into a page.
  record(
    'no page echoes the submitted password back',
    !accountHtml.includes(password) && !accountHtml.includes('scrypt$'),
    { passwordEchoed: accountHtml.includes(password) },
  );

  // 6. Order creation without the session-bound CSRF token is refused.
  const ordersBeforeCsrfTest = await orderItemCount();
  const noCsrf = await post('/api/checkout/order', {
    ...contact,
    lines: JSON.stringify([{ productId: productId, quantity: 1 }]),
    idempotencyKey: 'flow-no-csrf-0000000000001',
  });
  await body(noCsrf);
  record(
    'an order submission without the CSRF token is refused and writes nothing',
    noCsrf.status === 403 && (await orderItemCount()) === ordersBeforeCsrfTest,
    { status: noCsrf.status },
  );

  // 7. The checkout form carries a CSRF token and no price field.
  const checkoutPage = await get('/checkout');
  const checkoutHtml = await body(checkoutPage);
  const csrf = csrfFrom(checkoutHtml);
  record(
    'the checkout form carries a session-bound CSRF token and no price or total field',
    checkoutPage.status === 200 &&
      csrf !== null &&
      !/name="price/.test(checkoutHtml) &&
      !/name="total/.test(checkoutHtml),
    {
      status: checkoutPage.status,
      hasCsrf: csrf !== null,
      location: checkoutPage.headers.get('location'),
      bytes: checkoutHtml.length,
      hasSignIn: /\/account\/login/.test(checkoutHtml),
      hasCheckoutForm: /name="lines"/.test(checkoutHtml),
      cookieLength: jar.header().length,
    },
  );

  // 8. An invalid delivery contact is refused with a notice, not with a partial order.
  const invalid = await post('/api/checkout/order', {
    ...contact,
    csrf: csrf ?? '',
    lines: JSON.stringify([{ productId: productId, quantity: 1 }]),
    recipientPhone: '123',
    idempotencyKey: 'flow-invalid-0000000000001',
  });
  await body(invalid);
  record(
    'an invalid delivery contact is refused with a notice',
    invalid.status >= 300 && (invalid.headers.get('location') ?? '').includes('notice=invalid'),
    { status: invalid.status, location: invalid.headers.get('location') },
  );

  // 9. An unavailable product is refused from database state.
  const unavailable = await post('/api/checkout/order', {
    ...contact,
    csrf: csrf ?? '',
    lines: JSON.stringify([{ productId: '999999999', quantity: 1 }]),
    idempotencyKey: 'flow-unavailable-000000000001',
  });
  await body(unavailable);
  record(
    'an unavailable product is refused with a notice',
    unavailable.status >= 300 && (unavailable.headers.get('location') ?? '').includes('notice=unavailable'),
    { status: unavailable.status, location: unavailable.headers.get('location') },
  );

  // 10. A real order succeeds, and prices submitted by the browser are ignored.
  const idempotencyKey = 'flow-order-0000000000000001';
  const orderBody = {
    ...contact,
    csrf: csrf ?? '',
    lines: JSON.stringify([{ productId: productId, quantity: 2 }]),
    idempotencyKey,
    priceMinor: '1',
    totalMinor: '1',
    itemsSubtotalMinor: '1',
  };
  const placed = await post('/api/checkout/order', orderBody);
  await body(placed);
  const placedLocation = placed.headers.get('location') ?? '';
  // Split rather than match: the order number is the path segment between the route prefix and the
  // query string, and a string split has no escaping to get wrong.
  const orderNumber =
    placedLocation.includes('/account/orders/') && placedLocation.includes('?placed=1')
      ? (placedLocation.split('/account/orders/')[1] ?? '').split('?')[0] || null
      : null;
  record(
    'a valid submission creates an order and redirects to its confirmation',
    placed.status >= 300 && placed.status < 400 && orderNumber !== null,
    { status: placed.status, location: placedLocation },
  );

  if (orderNumber === null) return checks;

  const stored = await pool.query<{
    total_minor: number;
    items_subtotal_minor: number;
    shipping_minor: number;
  }>(
    'select total_minor, items_subtotal_minor, shipping_minor from "order" where order_number = $1',
    [orderNumber],
  );
  const storedRow = stored.rows[0];
  record(
    'the stored total is the database price times the quantity, not the submitted price',
    storedRow?.total_minor === unitPrice * 2 &&
      storedRow?.items_subtotal_minor === unitPrice * 2 &&
      storedRow?.shipping_minor === 0,
    { stored: storedRow, expectedUnitPrice: unitPrice },
  );

  const confirmation = await get('/account/orders/' + orderNumber + '?placed=1');
  const confirmationHtml = await body(confirmation);
  record(
    'the confirmation page renders the order for its owner',
    confirmation.status === 200 && confirmationHtml.includes(orderNumber),
    { status: confirmation.status },
  );

  const list = await get('/account/orders');
  const listHtml = await body(list);
  record(
    'the order appears in the customer order list',
    list.status === 200 && listHtml.includes(orderNumber),
    { status: list.status },
  );

  // 11. The same submission key and body returns the original order, once.
  const replay = await post('/api/checkout/order', orderBody);
  await body(replay);
  const replayLocation = replay.headers.get('location') ?? '';
  const replayCount = await pool.query<{ total: number }>(
    'select count(*)::int as total from "order" where order_number = $1',
    [orderNumber],
  );
  record(
    'a repeated submission returns the original order and creates no duplicate',
    replay.status >= 300 &&
      replay.status < 400 &&
      replayLocation.includes(orderNumber) &&
      Number(replayCount.rows[0]?.total ?? 0) === 1,
    { status: replay.status, orders: replayCount.rows[0]?.total },
  );

  // 12. Another customer cannot read this order.
  jar.clear();
  const second = await post('/api/account/register', {
    email: 'flow-second-' + Date.now() + '@example.test',
    password,
    confirmPassword: password,
    next: '/account',
  });
  await body(second);
  jar.store(second);
  const foreignOrder = await get('/account/orders/' + orderNumber);
  await body(foreignOrder);
  record(
    'another customer order number is not found, not forbidden',
    foreignOrder.status === 404,
    { status: foreignOrder.status },
  );

  // 13. A banned customer cannot order, and their session stops working (D20).
  jar.clear();
  const banEmail = 'flow-ban-' + Date.now() + '@example.test';
  const banRegistration = await post('/api/account/register', {
    email: banEmail,
    password,
    confirmPassword: password,
    next: '/account',
  });
  await body(banRegistration);
  jar.store(banRegistration);
  const banCheckout = await get('/checkout');
  const banCsrf = csrfFrom(await body(banCheckout));

  const banned = await pool.query<{ id: string }>('select id from customer where email = $1', [banEmail]);
  const bannedCustomerId = Number(banned.rows[0]?.id);
  await pool.query("update customer set status = 'suspended' where id = $1", [bannedCustomerId]);

  const bannedOrder = await post('/api/checkout/order', {
    ...contact,
    csrf: banCsrf ?? '',
    lines: JSON.stringify([{ productId: productId, quantity: 1 }]),
    idempotencyKey: 'flow-banned-000000000000001',
  });
  const bannedLocation = bannedOrder.headers.get('location') ?? '';
  await body(bannedOrder);
  const bannedOrders = await pool.query<{ total: number }>(
    'select count(*)::int as total from "order" where customer_id = $1',
    [bannedCustomerId],
  );
  // A protected page is the probe: /account renders a signed-out state for anyone, so it cannot
  // distinguish "no session" from "refused session". /account/orders requires the session.
  const bannedOrdersPage = await get('/account/orders');
  await body(bannedOrdersPage);
  record(
    'a banned customer cannot order, and their session is refused on the next request',
    bannedOrder.status >= 300 &&
      bannedOrder.status < 400 &&
      !bannedLocation.includes('/account/orders/') &&
      Number(bannedOrders.rows[0]?.total ?? 0) === 0 &&
      bannedOrdersPage.status >= 300 &&
      bannedOrdersPage.status < 400 &&
      (bannedOrdersPage.headers.get('location') ?? '').includes('/account/login'),
    {
      orderStatus: bannedOrder.status,
      location: bannedLocation,
      orders: bannedOrders.rows[0]?.total,
      ordersPageStatus: bannedOrdersPage.status,
      ordersPageLocation: bannedOrdersPage.headers.get('location'),
    },
  );

  return checks;
}
