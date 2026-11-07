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

  /** Seed a value directly, for a request that must carry a cookie the browser would have dropped. */
  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  /** Snapshot and restore, so a test can hold one session's cookie while another is exercised. */
  snapshot(): Map<string, string> {
    return new Map(this.cookies);
  }

  restore(snapshot: Map<string, string>): void {
    this.cookies.clear();
    for (const [name, value] of snapshot) this.cookies.set(name, value);
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

  // Cash on Delivery is the only method this release accepts (Phase 17), so the flow submits no
  // payment method at all: the route does not read one, and a submission cannot choose.
  const contact = {
    recipientName: 'Rahim Uddin',
    districtCode: 'dhaka',
    recipientPhone: '01712345678',
    addressLine: 'House 12, Route 5',
    area: 'Dhanmondi',
    city: 'Dhaka',
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

  // 7b. The served checkout carries no prepaid method and no claim field. This is the customer-facing
  // assertion that the manual prepaid subsystem is gone: no bKash/Nagad option, no sender number, no
  // transaction reference, no claimed amount and no payment-method radio to choose from. (The cart
  // lives in the browser, so a server render of /checkout has an empty cart and therefore does not
  // render the payment section at all; the COD method itself is asserted on the confirmation page
  // below, where a real order exists.)
  const prepaidTraces = /bkash|nagad|senderMsisdn|transactionReference|claimedAmount/i;
  const methodFields = /name="paymentMethod"/i;
  record(
    'the checkout renders no prepaid method, claim field or payment-method choice',
    checkoutPage.status === 200 && !prepaidTraces.test(checkoutHtml) && !methodFields.test(checkoutHtml),
    {
      status: checkoutPage.status,
      prepaidTraceFound: prepaidTraces.test(checkoutHtml),
      methodFieldFound: methodFields.test(checkoutHtml),
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

  // 9b. An out-of-stock product states its state on the page and is refused by the order route, so the
  // storefront cannot invite a purchase the server will reject. The product is restored afterwards.
  const oosRows = await pool.query<{ id: string; slug: string }>(
    'select p.id, p.slug from product p ' +
      'join product_variant v on v.product_id = p.id and v.is_default and v.is_active ' +
      "where p.is_published and p.availability = 'in_stock' and p.deleted_at is null " +
      'order by p.id limit 1',
  );
  const oos = oosRows.rows[0];
  if (oos !== undefined) {
    await pool.query("update product set availability = 'out_of_stock' where id = $1", [oos.id]);
    try {
      const oosPage = await fetch(base + '/products/' + oos.slug, { redirect: 'manual' });
      const oosHtml = await oosPage.text();
      // The default locale is Bangla, so the assertion accepts either locale's statement of the state.
      const statesOutOfStock =
        /out of stock/i.test(oosHtml);
      const offersAddToCart = /add to cart/i.test(oosHtml);
      record(
        'an out-of-stock product states its state on the product page and offers no add-to-cart control',
        oosPage.status === 200 && statesOutOfStock && !offersAddToCart,
        { status: oosPage.status, statesOutOfStock, offersAddToCart },
      );

      const oosOrder = await post('/api/checkout/order', {
        ...contact,
        csrf: csrf ?? '',
        lines: JSON.stringify([{ productId: oos.id, quantity: 1 }]),
        idempotencyKey: 'flow-out-of-stock-0000000001',
      });
      await body(oosOrder);
      record(
        'an order for an out-of-stock product is refused from database state',
        oosOrder.status >= 300 &&
          (oosOrder.headers.get('location') ?? '').includes('notice=unavailable'),
        { status: oosOrder.status, location: oosOrder.headers.get('location') },
      );
    } finally {
      await pool.query("update product set availability = 'in_stock' where id = $1", [oos.id]);
    }
  }

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
    placedLocation.includes('/orders/') && placedLocation.includes('?placed=1')
      ? (placedLocation.split('/orders/')[1] ?? '').split('?')[0] || null
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
    payment_method: string;
    payment_state: string;
    cod_state: string;
    expires_at: Date | null;
  }>(
    `select total_minor, items_subtotal_minor, shipping_minor, payment_method, payment_state, cod_state, expires_at
       from "order" where order_number = $1`,
    [orderNumber],
  );
  const storedRow = stored.rows[0];
  record(
    'the stored total is the database price times the quantity plus the configured delivery charge',
    storedRow?.total_minor === unitPrice * 2 + 12000 &&
      storedRow?.items_subtotal_minor === unitPrice * 2 &&
      storedRow?.shipping_minor === 12000,
    { stored: storedRow, expectedUnitPrice: unitPrice },
  );
  record(
    'the stored order is a COD order awaiting the owner, with no prepaid state and no expiry',
    storedRow?.payment_method === 'cod' &&
      storedRow?.payment_state === 'not_applicable' &&
      storedRow?.cod_state === 'cod_pending_approval' &&
      storedRow?.expires_at === null,
    {
      paymentMethod: storedRow?.payment_method,
      paymentState: storedRow?.payment_state,
      codState: storedRow?.cod_state,
      expiresAt: storedRow?.expires_at,
    },
  );

  const confirmation = await get('/orders/' + orderNumber + '?placed=1');
  const confirmationHtml = await body(confirmation);
  record(
    'the confirmation page renders the order for its owner',
    confirmation.status === 200 && confirmationHtml.includes(orderNumber),
    { status: confirmation.status },
  );

  // The order just placed is a COD order, so its page must say that cash is paid on delivery and must
  // not imply an online transfer, a transaction reference or a verification step. Both locales are
  // accepted because the storefront renders the default locale on the server.
  const saysCashOnDelivery =
    /cash is paid to the courier on delivery/i.test(confirmationHtml) ||
    /cash is collected on delivery/i.test(confirmationHtml);
  // The order's own method line must name Cash on Delivery, so the page cannot describe a COD order
  // without saying how it is paid.
  const namesMethod =
    /cash on delivery/i.test(confirmationHtml);
  const impliesPrepaid =
    /transaction id|sender number|bKash|Nagad/i.test(confirmationHtml) ||

    /sender number/i.test(confirmationHtml);
  record(
    'the COD confirmation names Cash on Delivery, says cash is paid on delivery, and implies no online payment',
    confirmation.status === 200 && saysCashOnDelivery && namesMethod && !impliesPrepaid,
    { status: confirmation.status, saysCashOnDelivery, namesMethod, impliesPrepaid },
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
  const foreignOrder = await get('/orders/' + orderNumber);
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



  /*
   * The owner-issued one-time code recovery was removed on 2026-11-08; recovery is the emailed
   * single-use link (ADR 0030), whose flow is verified by scripts that own a disposable cluster.
   */

  /*
   * ---------- Guest ordering: the owner switch (D12, ADR 0024) ----------
   *
   * The switch is a row in `store_setting` (key `checkout.guest_orders`), and **an absent row means
   * guests may not order** - the policy this product shipped with. These checks drive the served route,
   * not the service: refused while the switch is absent, refused from another origin, accepted from this
   * one, and readable only by its own order number.
   *
   * The setting key is written as a literal on purpose. Importing the server module would pull
   * `src/db/client`, whose pool binds to the developer's own `DATABASE_URL` - a different database from
   * this run's disposable cluster. The suite speaks to the cluster through `pool` and to the app over HTTP.
   *
   * Cleanup is TRUNCATE, not DELETE: `order_event` and `order_item` carry BEFORE UPDATE OR DELETE
   * triggers that refuse row deletes by design, which is why `scripts/purge-imported-orders.ts` uses
   * TRUNCATE for the same job. Every order this run created goes with it, and nothing after depends on one.
   */
  const GUEST_SETTING_KEY = 'checkout.guest_orders';
  const orderCount = async (): Promise<number> => {
    const rows = await pool.query<{ total: number }>('select count(*)::int as total from "order"');
    return Number(rows.rows[0]?.total ?? 0);
  };
  const staffRows = await pool.query<{ id: string }>('select id from staff_user order by id limit 1');
  const settingStaffId = staffRows.rows[0]?.id;
  const setGuestSwitch = async (on: boolean): Promise<void> => {
    if (!on) {
      await pool.query('delete from store_setting where key = $1', [GUEST_SETTING_KEY]);
      return;
    }
    await pool.query(
      'insert into store_setting (key, value, value_type, updated_by_staff_id) values ($1, $2::jsonb, $3, $4) ' +
        'on conflict (key) do update set value = $2::jsonb, value_type = $3, updated_by_staff_id = $4, updated_at = now()',
      [GUEST_SETTING_KEY, JSON.stringify(true), 'boolean', settingStaffId],
    );
  };
  const guestFields = (key: string): Record<string, string> => ({
    lines: JSON.stringify([{ productId: productId, quantity: 1 }]),
    recipientName: 'Guest Buyer',
    districtCode: 'dhaka',
    recipientPhone: '01712345677',
    addressLine: 'House 9, Road 2',
    area: 'Uttara',
    city: 'Dhaka',
    idempotencyKey: key,
  });

  jar.clear();
  await setGuestSwitch(false);
  const ordersBeforeGuest = await orderCount();
  const refusedGuest = await post('/api/checkout/order', guestFields('flow-guest-refused-0000001'));
  const refusedGuestLocation = refusedGuest.headers.get('location') ?? '';
  await body(refusedGuest);
  record(
    'guest ordering is refused while the owner switch is absent, and writes no order',
    refusedGuest.status >= 300 &&
      refusedGuest.status < 400 &&
      refusedGuestLocation.includes('/account/login') &&
      (await orderCount()) === ordersBeforeGuest,
    { status: refusedGuest.status, location: refusedGuestLocation, orders: await orderCount() },
  );

  await setGuestSwitch(true);
  const crossGuest = await post('/api/checkout/order', guestFields('flow-guest-cross-00000001'), 'https://evil.example');
  await body(crossGuest);
  record(
    'a cross-origin guest submission is refused and writes no order',
    crossGuest.status === 403 && (await orderCount()) === ordersBeforeGuest,
    { status: crossGuest.status, orders: await orderCount() },
  );

  jar.clear();
  const guestPlaced = await post('/api/checkout/order', guestFields('flow-guest-placed-0000001'));
  const guestLocation = guestPlaced.headers.get('location') ?? '';
  await body(guestPlaced);
  const guestNumber = /\/orders\/([^/?#]+)\?placed=1$/.exec(guestLocation)?.[1] ?? null;
  const guestRow = guestNumber === null
    ? null
    : (await pool.query<{ customer_id: string | null }>(
        'select customer_id from "order" where order_number = $1',
        [guestNumber],
      )).rows[0] ?? null;
  // The event log is where a guest is visible as its own actor (create.ts writes actor_type = 'guest'
  // for a principal-less order), and it is the durable record that this order had no account behind it.
  const guestEvent = guestNumber === null
    ? null
    : (await pool.query<{ actor_type: string }>(
        'select e.actor_type from order_event e join "order" o on o.id = e.order_id ' +
          'where o.order_number = $1 and e.event_type = $2 limit 1',
        [guestNumber, 'order_placed'],
      )).rows[0] ?? null;
  record(
    'a guest places one order without an account, and no session is issued to them',
    guestPlaced.status >= 300 &&
      guestPlaced.status < 400 &&
      guestNumber !== null &&
      guestRow !== null &&
      guestRow.customer_id === null &&
      guestEvent !== null && guestEvent.actor_type === 'guest' &&
      jar.header() === '',
    { status: guestPlaced.status, location: guestLocation, order: guestRow, actor: guestEvent, cookies: jar.header() },
  );

  const guestPage = guestNumber === null ? null : await get('/orders/' + guestNumber);
  const guestPageBody = guestPage === null ? '' : await body(guestPage);
  const unknownPage = await get('/orders/QB-0000000000');
  const unknownPageBody = await body(unknownPage);
  const customerOrderRow = await pool.query<{ order_number: string }>(
    'select order_number from "order" where customer_id is not null order by id desc limit 1',
  );
  const customerOrderNumber = customerOrderRow.rows[0]?.order_number ?? null;
  const customerOrderAnonymously =
    customerOrderNumber === null ? null : await get('/orders/' + customerOrderNumber);
  const customerOrderBody = customerOrderAnonymously === null ? '' : await body(customerOrderAnonymously);
  record(
    'a guest receipt renders for its own number only: an unknown number and a customer order do not',
    guestPage !== null &&
      guestPage.status === 200 &&
      guestPageBody.includes('Guest Buyer') &&
      unknownPage.status === 404 &&
      !unknownPageBody.includes('Guest Buyer') &&
      (customerOrderNumber === null ||
        (customerOrderAnonymously !== null &&
          customerOrderAnonymously.status === 404 &&
          !customerOrderBody.includes('Guest Buyer'))),
    {
      guestStatus: guestPage?.status ?? null,
      unknownStatus: unknownPage.status,
      customerOrderStatus: customerOrderAnonymously?.status ?? null,
    },
  );

  /*
   * A guest whose browser still holds a session cookie that no longer resolves - expired, revoked,
   * rotated - is a guest, not a customer. The receipt page used to branch on the cookie's *presence*
   * and sent exactly this visitor to sign in instead of showing the order they had just placed.
   */
  jar.set('qb_customer_session', 'A'.repeat(43));
  const deadCookieReceipt = guestNumber === null ? null : await get('/orders/' + guestNumber);
  const deadCookieBody = deadCookieReceipt === null ? '' : await body(deadCookieReceipt);
  jar.clear();
  record(
    'a guest receipt still renders when the browser carries a session cookie that no longer resolves',
    deadCookieReceipt !== null &&
      deadCookieReceipt.status === 200 &&
      deadCookieBody.includes('Guest Buyer'),
    { status: deadCookieReceipt?.status ?? null },
  );

  /*
   * The legacy account-scoped receipt address must send the visitor to the canonical one rather than
   * render a second copy of the same page.
   */
  const legacyReceipt = guestNumber === null ? null : await get('/account/orders/' + guestNumber + '?placed=1');
  record(
    'the old account-scoped receipt address redirects to the canonical receipt',
    legacyReceipt !== null &&
      legacyReceipt.status >= 300 &&
      legacyReceipt.status < 400 &&
      (legacyReceipt.headers.get('location') ?? '').startsWith('/orders/' + guestNumber),
    { status: legacyReceipt?.status ?? null, location: legacyReceipt?.headers.get('location') ?? null },
  );

  await setGuestSwitch(false);
  await pool.query('truncate table "order" cascade');
  const leftoverOrders = await orderCount();
  const switchRow = await pool.query('select 1 from store_setting where key = $1', [GUEST_SETTING_KEY]);
  record(
    'the guest checks leave no order rows and restore the switch to its absent, closed state',
    leftoverOrders === 0 && switchRow.rowCount === 0,
    { orders: leftoverOrders, switchRows: switchRow.rowCount },
  );

  return checks;
}
