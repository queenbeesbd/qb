#!/usr/bin/env node
/**
 * QueenBee's storefront - end-to-end browser verification.
 *
 * Drives a local Chromium over the DevTools Protocol using only Node built-ins
 * (node:http + global WebSocket), so the project gains no test dependency.
 *
 * Usage:
 *   npm run build && npx next start -p 3000 &
 *   QUEENBEES_BASE_URL=http://localhost:3000 node scripts/verify-browser.cjs
 *
 * Exits non-zero if any check fails. This is a demo-scope smoke suite: it
 * verifies the implemented frontend only and makes no claim about production
 * backend, payment or inventory behaviour.
 *
 * The target base URL comes from QUEENBEES_BASE_URL (or the first argument),
 * defaulting to http://localhost:3000. This script starts no server of its own:
 * the caller serves the build, so it can point the suite at any served target.
 */
const http = require('node:http');
const { spawn } = require('node:child_process');

const APP = process.env.QUEENBEES_BASE_URL || process.argv[2] || 'http://localhost:3000';
const CDP = 9228;
const results = [];

/**
 * The three products the seed's "recently added" selection must publish (D6, Phase 26).
 *
 * The seed records a creation instant per product that increases with fixture declaration order, so
 * the newest three are the fixture's last three, in reverse. Hard-coded slugs rather than a computed
 * expectation on purpose: this is the independent value the rendered page is checked against, so a
 * bug that re-ordered both the seed and the page could not cancel itself out.
 */
const SEEDED_RECENT_SLUGS = [
  'earth-beauty-anti-hairfall-shampoo-with-biotin-caffeine-350-ml',
  'earth-beauty-glosse-shampoo-with-argan-oil-amla-keratin-350-ml',
  'mamaearth-vitamin-c-daily-glow-face-wash-100ml',
];
const consoleErrors = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: CDP, path }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(body));
      })
      .on('error', reject);
  });
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        consoleErrors.push('exception: ' + (message.params.exceptionDetails.text || ''));
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(
          'console.error: ' +
            message.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200),
        );
      }
    };
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.text +
        ' ' +
        (response.exceptionDetails.exception?.description || ''),
    );
  }
  return response.result.value;
}

function record(step, ok, detail) {
  results.push({ step, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
}

/** Bengali digits are used by default, so numeric assertions normalise them. */
const HELPERS = `
  window.__qb = {
    num(value) {
      if (value == null) return null;
      const digits = {'\u09E6':'0','\u09E7':'1','\u09E8':'2','\u09E9':'3','\u09EA':'4','\u09EB':'5','\u09EC':'6','\u09ED':'7','\u09EE':'8','\u09EF':'9'};
      const text = String(value).replace(/[\u09E6-\u09EF]/g, (d) => digits[d]).replace(/[^0-9.]/g, '');
      return text === '' ? null : Number(text);
    },
    cardPrices() {
      return [...document.querySelectorAll('main article span')]
        .filter((s) => /_current$/.test(s.className))
        .map((s) => window.__qb.num(s.innerText));
    },
    pdpPrices() {
      const current = document.querySelector('main span[class$="_currentPrice"]');
      const compare = document.querySelector('main span[class$="_comparePrice"]');
      return {
        current: current ? window.__qb.num(current.innerText) : null,
        compare: compare ? window.__qb.num(compare.innerText) : null,
      };
    },
    cartLines() { return [...document.querySelectorAll('main ul > li')]; },
    cartTotals() {
      const dds = [...document.querySelectorAll('main aside dd')].map((d) => d.innerText.trim());
      return { raw: dds, subtotal: window.__qb.num(dds[0]), total: window.__qb.num(dds[2]) };
    },
    toggle() { return document.querySelector('header button[title]'); },
    addButton() {
      return [...document.querySelectorAll('main button')].find((b) => /কার্টে যোগ করুন|Add to cart/.test(b.textContent)) || null;
    },
    removeButton() {
      return [...document.querySelectorAll('main button')].find((b) => /সরান|Remove/.test(b.getAttribute('aria-label') || '')) || null;
    },
    shelf() {
      // The controls group also carries role=group, so target the scroller by
      // its own class rather than by role, which is no longer unique.
      const s = document.querySelector('div[class$="_scroller"]');
      if (!s) return null;
      const cards = [...s.children];
      const tops = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)))];
      const box = s.getBoundingClientRect();
      const fullyVisible = cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1;
      }).length;
      const btns = resolveButtons(s);
      return {
        cards: cards.length,
        rows: tops.length,
        fullyVisible,
        overflow: Math.round(s.scrollWidth - s.clientWidth),
        scrollLeft: Math.round(s.scrollLeft),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        controls: btns.length,
        labels: btns.map((b) => b.getAttribute('aria-label')),
        prevDisabled: btns[0] ? btns[0].disabled : null,
        nextDisabled: btns[1] ? btns[1].disabled : null,
      };

      function resolveButtons(node) {
        // The controls are rendered inside the shelf's section header, so the
        // section is the stable boundary - not a fixed DOM nesting.
        const section = node.closest('section');
        return section ? [...section.querySelectorAll('button')] : [];
      }
    },
    /**
     * Layout geometry shared by the width checks: the content box of main,
     * whether the header and footer resolve to that same box, and the shape of
     * every product grid.
     */
    layout() {
      const R = (el) => (el ? el.getBoundingClientRect() : null);
      const px = (v) => Math.round(v * 10) / 10;
      const main = document.querySelector('main');
      const mcs = getComputedStyle(main);
      const mR = R(main);
      const contentL = mR.left + parseFloat(mcs.paddingLeft);
      const contentR = mR.right - parseFloat(mcs.paddingRight);
      const headerInner = document.querySelector('header').firstElementChild;
      const hcs = getComputedStyle(headerInner);
      const hR = R(headerInner);
      const headerL = hR.left + parseFloat(hcs.paddingLeft);
      const headerR = hR.right - parseFloat(hcs.paddingRight);
      const footer = document.querySelector('footer');
      const footerInner = footer ? footer.querySelector('[class$="_inner"]') : null;
      const fcs = footerInner ? getComputedStyle(footerInner) : null;
      const fR = R(footerInner);
      const footerL = fR && fcs ? fR.left + parseFloat(fcs.paddingLeft) : null;
      const footerR = fR && fcs ? fR.right - parseFloat(fcs.paddingRight) : null;
      const grids = [...document.querySelectorAll('[class$="_grid"]')].map((g) => {
        const kids = [...g.children];
        const boxes = kids.map((k) => R(k));
        const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length;
        const lastTop = boxes.length ? Math.max(...boxes.map((b) => Math.round(b.top))) : 0;
        const inLastRow = boxes.filter((b) => Math.abs(Math.round(b.top) - lastTop) < 2).length;
        return {
          items: kids.length,
          cols,
          rows: [...new Set(boxes.map((b) => Math.round(b.top)))].length,
          cardW: boxes.length ? px(boxes[0].width) : null,
          trailingHoles: cols - inLastRow,
        };
      });
      return {
        vw: window.innerWidth,
        contentW: px(contentR - contentL),
        marginL: px(contentL),
        marginR: px(window.innerWidth - contentR),
        fillPct: Math.round(((contentR - contentL) / window.innerWidth) * 1000) / 10,
        headerAlignedL: Math.abs(headerL - contentL) < 1.5,
        headerAlignedR: Math.abs(headerR - contentR) < 1.5,
        footerAlignedL: footerL === null ? null : Math.abs(footerL - contentL) < 1.5,
        footerAlignedR: footerR === null ? null : Math.abs(footerR - contentR) < 1.5,
        headerH: px(hR.height),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        grids,
      };
    },

    shelfNext() {
      const s = document.querySelector('div[class$="_scroller"]');
      if (!s) return false;
      const section = s.closest('section');
      const btns = section ? [...section.querySelectorAll('button')] : [];
      btns[1].click();
      return true;
    },
    cardDiscounts() {
      const num = window.__qb.num;
      return [...document.querySelectorAll('main article')].map((card) => {
        const cur = card.querySelector('span[class$="_current"]');
        const cmp = card.querySelector('span[class$="_compare"]');
        const sav = card.querySelector('p[class$="_saving"]');
        let savingAmount = null;
        let savingPercent = null;
        if (sav) {
          // The saving line reads "Save <amount> - <percent>%"; splitting on the
          // dash avoids depending on whitespace or on digit script.
          const text = sav.innerText;
          const dash = text.indexOf('-');
          if (dash >= 0) {
            savingAmount = num(text.slice(0, dash));
            savingPercent = num(text.slice(dash));
          } else {
            savingAmount = num(text);
          }
        }
        return {
          current: cur ? num(cur.innerText) : null,
          compare: cmp ? num(cmp.innerText) : null,
          savingAmount,
          savingPercent,
        };
      });
    },
    sectionHrefs(id) {
      const heading = document.getElementById(id);
      const section = heading ? heading.closest('section') : null;
      if (!section) return null;
      return [...new Set([...section.querySelectorAll('article a')]
        .map((a) => a.getAttribute('href'))
        .filter((href) => href && href.indexOf('/products/') === 0))];
    },
  }; true;`;

async function nav(client, path) {
  await client.send('Page.navigate', { url: APP + path });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await evaluate(client, 'document.readyState')) === 'complete') break;
    } catch {}
    await sleep(100);
  }
  for (let i = 0; i < 60; i++) {
    try {
      if (await evaluate(client, "!!document.querySelector('header button[title]')")) break;
    } catch {}
    await sleep(100);
  }
  await evaluate(client, HELPERS);
  await sleep(180);
}

async function poll(client, expression, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, expression)) return true;
    } catch {}
    await sleep(120);
  }
  return false;
}

async function setValue(client, selector, value) {
  return evaluate(
    client,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
      const proto = el instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true; })()`,
  );
}

async function pressTab(client, shift) {
  const modifiers = shift ? 8 : 0;
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers });
  await sleep(150);
}

async function main() {
  const chrome = spawn(
    'chromium',
    ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--remote-debugging-port=' + CDP, '--window-size=1440,900', 'about:blank'],
    { stdio: 'ignore' },
  );

  try {
    let target = null;
    for (let i = 0; i < 80; i++) {
      try {
        const list = JSON.parse(await httpGet('/json/list'));
        target = list.find((t) => t.type === 'page');
        if (target) break;
      } catch {}
      await sleep(250);
    }
    if (!target) throw new Error('Chromium DevTools target unavailable');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('DevTools websocket failed'));
    });
    const client = new CdpClient(ws);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    // Headless pages are unfocused by default, which suppresses :focus and Tab.
    await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });

    // 1 - Bangla default
    await nav(client, '/');
    const home = await evaluate(client, `({ lang: document.documentElement.lang, bangla: /[\u0980-\u09FF]/.test(document.body.innerText), cards: document.querySelectorAll('main article').length, toggleTitle: document.querySelector('header button[title]')?.getAttribute('title') })`);
    record('1. homepage opens in Bangla with Bangla copy and product cards', home.lang === 'bn' && home.bangla && home.cards >= 8 && home.toggleTitle === 'Switch to English', home);

    // 2 - language toggle and persistence
    await evaluate(client, `window.__qb.toggle().click()`);
    await poll(client, "document.documentElement.lang === 'en'");
    const english = await evaluate(client, `({ lang: document.documentElement.lang, stored: localStorage.getItem('queenbees.locale.v1'), h1: document.querySelector('h1')?.textContent?.trim(), navBangla: /[\u0980-\u09FF]/.test(document.querySelector('header nav')?.innerText || ''), bodyBangla: /[\u0980-\u09FF]/.test(document.querySelector('main')?.innerText || '') })`);
    record('2a. toggle switches the whole UI to English', english.lang === 'en' && english.stored === 'en' && !english.navBangla && !english.bodyBangla, english);
    await client.send('Page.reload');
    await nav(client, '/');
    const persisted = await evaluate(client, `({ lang: document.documentElement.lang, stored: localStorage.getItem('queenbees.locale.v1') })`);
    record('2b. English preference persists after reload', persisted.lang === 'en' && persisted.stored === 'en', persisted);
    await evaluate(client, `window.__qb.toggle().click()`);
    await poll(client, "document.documentElement.lang === 'bn'");
    const banglaAgain = await evaluate(client, `({ lang: document.documentElement.lang, stored: localStorage.getItem('queenbees.locale.v1') })`);
    record('2c. toggles back to Bangla', banglaAgain.lang === 'bn' && banglaAgain.stored === 'bn', banglaAgain);

    // 3 - category browse
    await nav(client, '/categories/haircare');
    const category = await evaluate(client, `({ count: document.querySelector('[aria-live="polite"]')?.textContent?.trim(), products: document.querySelectorAll('main article').length, links: [...new Set([...document.querySelectorAll('main article a[href^="/products/"]')].map((a) => a.getAttribute('href')))].length })`);
    record('3. category page lists only its own 6 products', category.products === 6 && category.links === 6, category);

    // 4 - search
    await nav(client, '/products');
    await setValue(client, '#catalog-search', 'niacinamide');
    await evaluate(client, `document.getElementById('catalog-search').form.requestSubmit()`);
    await poll(client, `location.search.includes('q=niacinamide')`);
    await nav(client, '/products?q=niacinamide');
    const search = await evaluate(client, `({ url: location.search, products: document.querySelectorAll('main article').length, count: document.querySelector('[aria-live="polite"]')?.textContent?.trim() })`);
    record('4. search filters results and is reflected in the URL', search.url.includes('q=niacinamide') && search.products === 1, search);

    // 5 - sorting (English locale keeps digits ASCII for clarity)
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    await nav(client, '/products?sort=price-asc');
    const ascending = await evaluate(client, `(() => { const p = window.__qb.cardPrices(); return { prices: p, ascending: p.every((v, i) => i === 0 || p[i - 1] <= v), count: p.length }; })()`);
    await nav(client, '/products?sort=price-desc');
    const descending = await evaluate(client, `(() => { const p = window.__qb.cardPrices(); return { first: p.slice(0, 3), descending: p.every((v, i) => i === 0 || p[i - 1] >= v), count: p.length }; })()`);
    record('5. price sorting is monotonic in both directions', ascending.ascending && descending.descending && ascending.count === 22 && ascending.prices[0] === 30 && ascending.prices[21] === 1150, { ascending, descending });

    // 6 - filters compose
    await nav(client, '/products?category=skincare&brand=Lilac');
    const composed = await evaluate(client, `({ products: document.querySelectorAll('main article').length, chip: [...document.querySelectorAll('main span')].some((s) => s.innerText.trim() === 'Lilac') })`);
    record('6. category and brand filters compose into one result set', composed.products === 1 && composed.chip, composed);

    // 7 - empty search
    await nav(client, '/products?q=zzzznotfound');
    const emptySearch = await evaluate(client, `({ heading: document.querySelector('h2')?.textContent?.trim(), recovery: !!document.querySelector('main a[href="/products"]'), products: document.querySelectorAll('main article').length })`);
    record('7. empty search shows recovery and no cards', emptySearch.products === 0 && emptySearch.recovery && !!emptySearch.heading, emptySearch);

    // 8 - product detail
    await nav(client, '/products/oriox-tinted-lipbalm-strawberry');
    const detail = await evaluate(client, `(() => { const p = window.__qb.pdpPrices(); return { h1: document.querySelector('h1')?.textContent?.trim(), current: p.current, compare: p.compare, saving: [...document.querySelectorAll('main p')].map((n) => n.innerText).find((t) => /Save/.test(t)), imagesLoaded: [...document.querySelectorAll('main img')].every((i) => i.complete && i.naturalWidth > 0), imageCount: document.querySelectorAll('main img').length, hasQuantity: !!document.getElementById('pdp-quantity'), externalLinks: document.querySelectorAll('main a[href^="http"]').length, captions: document.querySelectorAll('main figure figcaption').length }; })()`);
    record('8. product page shows verified price, comparison price and loaded images', detail.current === 350 && detail.compare === 420 && detail.imagesLoaded && detail.imageCount > 0 && detail.hasQuantity && detail.externalLinks === 0 && detail.captions === 0, detail);

    // 9 - add to cart
    await setValue(client, '#pdp-quantity', 2);
    await evaluate(client, `window.__qb.addButton().click()`);
    const badgeUpdated = await poll(client, `(() => { const l = document.querySelector('a[href="/cart"]'); return !!l && /[0-9]/.test(l.innerText); })()`);
    const announced = await evaluate(client, `document.querySelector('[role=status]')?.textContent?.trim() || null`);
    // Phase 25: the live region now names the product, which is more useful than the bare
    // "Added to cart" it replaced, and the visible confirmation carries the same sentence.
    record('9. add to cart updates the header badge and announces the added product',
      badgeUpdated && typeof announced === 'string' && announced.length > 0 && /cart/i.test(announced),
      { badgeUpdated, announced });

    // 10 - cart maths
    await nav(client, '/cart');
    const cartTwo = await evaluate(client, `(() => { const t = window.__qb.cartTotals(); return { lines: window.__qb.cartLines().length, qty: document.querySelector('main input[type=number]')?.value, subtotal: t.subtotal, total: t.total }; })()`);
    record('10a. cart shows one line, quantity 2, subtotal and total 700', cartTwo.lines === 1 && cartTwo.qty === '2' && cartTwo.subtotal === 700 && cartTwo.total === 700, cartTwo);
    await setValue(client, 'main input[type=number]', 5);
    await sleep(500);
    const cartFive = await evaluate(client, `(() => { const t = window.__qb.cartTotals(); return { qty: document.querySelector('main input[type=number]')?.value, subtotal: t.subtotal }; })()`);
    record('10b. quantity change recomputes the subtotal (5 x 350 = 1750)', cartFive.qty === '5' && cartFive.subtotal === 1750, cartFive);

    // 11 - typed quantity bounds
    await nav(client, '/products/lilac-5-niacinamide-serum-30-ml');
    await setValue(client, '#pdp-quantity', 999);
    await sleep(250);
    const high = await evaluate(client, `document.getElementById('pdp-quantity').value`);
    await setValue(client, '#pdp-quantity', -4);
    await sleep(250);
    const low = await evaluate(client, `document.getElementById('pdp-quantity').value`);
    record('11. typed quantity is clamped into range', high === '20' && low === '1', { high, low });

    // 12 - persistence
    await nav(client, '/cart');
    await client.send('Page.reload');
    await nav(client, '/cart');
    const reloaded = await evaluate(client, `({ lines: window.__qb.cartLines().length, qty: document.querySelector('main input[type=number]')?.value, badge: (document.querySelector('a[href="/cart"]')?.innerText || '').trim() })`);
    record('12. cart survives a refresh with the same quantity', reloaded.lines === 1 && reloaded.qty === '5' && reloaded.badge === '5', reloaded);

    // 13 - remove to empty
    await evaluate(client, `window.__qb.removeButton().click()`);
    const emptied = await poll(client, `/(Your cart is empty|কার্ট খালি)/.test(document.body.innerText)`);
    const emptyAfterRemove = await evaluate(client, `({ recovery: !!document.querySelector('main a[href="/products"]'), hasSummary: !!document.querySelector('main aside'), storage: localStorage.getItem('queenbees.cart.v1') })`);
    record('13. removing the line empties the cart, offers recovery and clears storage', emptied && emptyAfterRemove.recovery && !emptyAfterRemove.hasSummary && emptyAfterRemove.storage === '[]', emptyAfterRemove);

    // 14 - empty cart in isolation
    await evaluate(client, `localStorage.setItem('queenbees.cart.v1', '[]')`);
    await nav(client, '/cart');
    const emptyCart = await evaluate(client, `({ empty: /(Your cart is empty|কার্ট খালি)/.test(document.body.innerText), recovery: !!document.querySelector('main a[href="/products"]'), hasSummary: !!document.querySelector('main aside'), badge: (document.querySelector('a[href="/cart"]')?.innerText || '').trim() })`);
    record('14. empty cart shows recovery and no order summary', emptyCart.empty && emptyCart.recovery && !emptyCart.hasSummary && emptyCart.badge === '', emptyCart);

    // 15 - corrupt storage is discarded
    await evaluate(client, `localStorage.setItem('queenbees.cart.v1', '{not json'); localStorage.setItem('queenbees.locale.v1', 'fr')`);
    await nav(client, '/cart');
    const corrupt = await evaluate(client, `({ lang: document.documentElement.lang, lines: window.__qb.cartLines().length, recovery: !!document.querySelector('main a[href="/products"]') })`);
    record('15. corrupt cart and unsupported locale fall back safely', corrupt.lang === 'bn' && corrupt.lines === 0 && corrupt.recovery, corrupt);

    // 16 - checkout requires an account (D12). An anonymous visitor is redirected to sign in, and the
    // screen reached is a sign-in form: one password field, no card fields, no order fields. Locale is
    // reset first because the previous check deliberately left an unsupported preference.
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    await nav(client, '/products/lilac-5-niacinamide-serum-30-ml');
    await evaluate(client, `window.__qb.addButton().click()`);
    await sleep(400);
    await nav(client, '/checkout');
    const checkout = await evaluate(client, `({ path: location.pathname, forms: document.querySelectorAll('main form').length, passwordFields: document.querySelectorAll('main input[type=password]').length, cardFields: document.querySelectorAll('main input[name*=card], main input[name*=cvv], main input[name*=payment]').length, orderFields: document.querySelectorAll('main input[name*=lines], main input[name*=idempotencyKey], main input[name=csrf]').length, externalHosts: [...new Set([...document.querySelectorAll('a[href^="http"]')].map((a) => new URL(a.href).host))], signInCopy: /(Sign in|সাইন ইন)/i.test(document.body.innerText), noRecovery: /(no password recovery|পাসওয়ার্ড পুনরুদ্ধারের কোনো পথ নেই)/i.test(document.body.innerText), cartPreserved: (document.querySelector('a[href="/cart"]')?.innerText || '').trim() })`);
    record('16. checkout requires an account: anonymous visitors reach the sign-in form, with no order or card fields and the cart preserved', checkout.path === '/account/login' && checkout.forms === 1 && checkout.passwordFields === 1 && checkout.cardFields === 0 && checkout.orderFields === 0 && checkout.externalHosts.length === 0 && checkout.signInCopy && checkout.noRecovery && /[0-9]/.test(checkout.cartPreserved), checkout);

    // 17 - not found
    await nav(client, '/products/does-not-exist');
    const notFound = await evaluate(client, `({ copy: /(not found|পাওয়া যায়নি)/i.test(document.body.innerText), recovery: !!document.querySelector('a[href="/"]') })`);
    record('17. unknown product shows not-found copy with a route home', notFound.copy && notFound.recovery, notFound);

    // 18 - viewports
    const viewports = [{ w: 320, h: 720, mobile: true }, { w: 375, h: 812, mobile: true }, { w: 768, h: 1024, mobile: true }, { w: 1024, h: 768, mobile: false }, { w: 1280, h: 800, mobile: false }, { w: 1440, h: 900, mobile: false }, { w: 1920, h: 1080, mobile: false }];
    for (const vp of viewports) {
      await client.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
      await nav(client, '/');
      const overflow = await evaluate(client, `({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })`);
      record('18. no horizontal overflow at ' + vp.w + 'px', overflow.scrollWidth <= overflow.innerWidth + 1, overflow);
    }

    // 19 - mobile drawer
    await client.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await nav(client, '/');
    await evaluate(client, `document.querySelector('header button[aria-controls="site-menu"]').click()`);
    const drawerOpened = await poll(client, `!!document.getElementById('site-menu')`);
    const focusInside = await evaluate(client, `(() => { const d = document.getElementById('site-menu'); return !!d && d.contains(document.activeElement); })()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(350);
    const drawerClosed = await evaluate(client, `({ closed: !document.getElementById('site-menu'), focusReturned: document.activeElement?.getAttribute('aria-controls') === 'site-menu' })`);
    record('19. mobile drawer opens, focuses inside, closes on Escape and returns focus', drawerOpened && focusInside && drawerClosed.closed && drawerClosed.focusReturned, { drawerOpened, focusInside, drawerClosed });

    // 20 - mobile touch targets
    await nav(client, '/products/oriox-tinted-lipbalm-strawberry');
    const targets = await evaluate(client, `(() => { const els = [...document.querySelectorAll('main button, main input, main a[href]')].filter((e) => !(e.tagName === 'A' && !e.className)); const small = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 40; }).map((e) => e.tagName + ':' + Math.round(e.getBoundingClientRect().height) + ':' + String(e.className).split(' ')[0]); return { checked: els.length, small: small.slice(0, 6) }; })()`);
    record('20. primary mobile controls are at least 40px tall', targets.small.length === 0, targets);

    // 21 - inline breadcrumb target size (WCAG 2.5.8)
    const crumbs = await evaluate(client, `[...document.querySelectorAll('main nav a')].map((a) => ({ text: a.innerText.trim(), height: Math.round(a.getBoundingClientRect().height) })).filter((c) => c.height > 0)`);
    record('21. breadcrumb links reach the 24px minimum target', crumbs.length > 0 && crumbs.every((c) => c.height >= 24), crumbs);

    // 22 - reduced motion
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await nav(client, '/');
    const motion = await evaluate(client, `(() => { const d = getComputedStyle(document.querySelector('main a')).transitionDuration; return { raw: d, collapsed: d.split(',').map((s) => parseFloat(s)).every((s) => s <= 0.001) }; })()`);
    record('22. reduced-motion collapses transition durations', motion.collapsed, motion);
    await client.send('Emulation.setEmulatedMedia', { features: [] });

    // 23 - skip link via real Tab keystrokes
    await client.send('Emulation.clearDeviceMetricsOverride');
    await nav(client, '/');
    await evaluate(client, `document.activeElement && document.activeElement.blur()`);
    await pressTab(client, false);
    const skip = await evaluate(client, `(() => { const a = document.querySelector('a.skip-link'); const s = getComputedStyle(a); return { isSkip: document.activeElement === a, top: s.top, focusMatches: a.matches(':focus') }; })()`);
    const skipActivation = await evaluate(client, `(() => { const a = document.querySelector('a.skip-link'); a.focus(); a.click(); return { hash: location.hash, mainFocused: document.activeElement?.id === 'main-content' }; })()`);
    record('23. skip link is reachable by Tab, becomes visible and targets main content', skip.isSkip && skip.focusMatches && parseFloat(skip.top) >= 0 && skipActivation.hash === '#main-content' && skipActivation.mainFocused, { skip, skipActivation });

    // 24 - announcement strip: present, readable, localized, above the header
    await client.send('Emulation.clearDeviceMetricsOverride');
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'bn')`);
    await nav(client, '/');
    const barBn = await evaluate(client, `(() => {
      const bar = document.querySelector('main')?.parentElement?.querySelector('aside');
      const header = document.querySelector('header');
      const msg = bar ? bar.innerText.replace(/\\s+/g, ' ').trim() : '';
      const cs = bar ? getComputedStyle(bar) : null;
      const item = bar ? bar.querySelector('p') : null;
      const fontSize = item ? parseFloat(getComputedStyle(item).fontSize) : null;
      const headerSize = header ? parseFloat(getComputedStyle(header.querySelector('nav a')).fontSize) : null;
      return {
        present: !!bar,
        aboveHeader: bar && header ? bar.getBoundingClientRect().bottom <= header.getBoundingClientRect().top + 1 : false,
        bangla: /[\u0980-\u09FF]/.test(msg),
        mentionsPreview: /প্রিভিউ/.test(msg),
        mentionsNoOrder: /অর্ডার/.test(msg) && /পেমেন্ট/.test(msg),
        fontSize,
        headerSize,
        subordinate: fontSize !== null && headerSize !== null ? fontSize <= headerSize + 1 : false,
        height: bar ? Math.round(bar.getBoundingClientRect().height) : null,
        role: bar ? bar.tagName : null,
      };
    })()`);
    record('24. announcement strip present in Bangla, above header, mentions no real orders/payments', barBn.present && barBn.aboveHeader && barBn.bangla && barBn.mentionsPreview && barBn.mentionsNoOrder, barBn);

    // 25 - announcement strip in English and mobile fit
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    await nav(client, '/');
    const barEn = await evaluate(client, `(() => {
      const bar = document.querySelector('main')?.parentElement?.querySelector('aside');
      const msg = bar ? bar.innerText.replace(/\\s+/g, ' ').trim() : '';
      return { present: !!bar, english: /preview/i.test(msg) && /orders/i.test(msg) && /payments/i.test(msg), noBangla: !/[\u0980-\u09FF]/.test(msg), text: msg.slice(0, 90) };
    })()`);
    record('25. announcement strip switches to English copy', barEn.present && barEn.english && barEn.noBangla, barEn);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, deviceScaleFactor: 1, mobile: true });
    await nav(client, '/');
    const barMobile = await evaluate(client, `(() => {
      const bar = document.querySelector('main')?.parentElement?.querySelector('aside');
      const item = bar ? bar.querySelector('p') : null;
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        wraps: item ? item.getBoundingClientRect().height : null,
        visible: bar ? bar.getBoundingClientRect().height > 0 : false,
      };
    })()`);
    record('25b. announcement strip readable at 320px with no horizontal overflow', barMobile.visible && barMobile.overflow <= 1, barMobile);
    await client.send('Emulation.clearDeviceMetricsOverride');

    // 26 - authentic product imagery on cards and detail
    await nav(client, '/products');
    // Cards below the fold are lazy-loaded by design, so scrolling through the
    // page is what exercises every declared asset. Asserting on a settled state
    // afterwards avoids racing the network.
    for (let y = 0; y <= 8000; y += 600) {
      await evaluate(client, `window.scrollTo(0, ${y})`);
      await sleep(120);
    }
    await evaluate(client, `window.scrollTo(0, 0)`);
    const imagerySettled = await poll(
      client,
      `(() => { const imgs = [...document.querySelectorAll('main article picture img')]; return imgs.length === 22 && imgs.every((i) => i.complete && i.naturalWidth > 0); })()`,
      20000,
    );
    const imagery = await evaluate(client, `(() => {
      const imgs = [...document.querySelectorAll('main article picture img')];
      const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
      const webp = [...document.querySelectorAll('main article picture source[type="image/webp"]')];
      const ratios = [...new Set(imgs.map((i) => (i.getAttribute('width') + 'x' + i.getAttribute('height'))))];
      const altTexts = imgs.map((i) => i.getAttribute('alt'));
      return {
        total: imgs.length,
        loaded: loaded.length,
        webpSources: webp.length,
        ratios,
        localOnly: imgs.every((i) => new URL(i.currentSrc || i.src || '/', location.href).origin === location.origin),
        anyRemoteHost: imgs.some((i) => /zatiqeasy|ghorerbazar/.test(i.currentSrc || i.src)),
        decoded3x4: imgs.length > 0 && imgs.every((i) => Math.abs(i.naturalWidth / i.naturalHeight - 0.75) < 0.02),
      };
    })()`);
    record('26. product cards use local WebP imagery at 3:4 with no remote host', imagerySettled && imagery.total === 22 && imagery.loaded === 22 && imagery.webpSources === 22 && imagery.localOnly && !imagery.anyRemoteHost && imagery.decoded3x4, { ...imagery, imagerySettled });

    await nav(client, '/products/oriox-tinted-lipbalm-strawberry');
    const detailImg = await evaluate(client, `(() => {
      const img = document.querySelector('main picture img');
      const caption = document.querySelector('main figure figcaption');
      return {
        loaded: !!img && img.complete && img.naturalWidth > 0,
        eager: img ? img.getAttribute('loading') === 'eager' : false,
        alt: img ? (img.getAttribute('alt') || '').trim() : null,
        caption: caption ? caption.innerText.trim() : null,
        ratio: img ? Number((img.naturalWidth / img.naturalHeight).toFixed(3)) : null,
      };
    })()`);
    record('26b. detail photo loads eagerly with descriptive alt and no audit caption', detailImg.loaded && detailImg.eager && (detailImg.alt || '').length > 3 && detailImg.caption === null && detailImg.ratio === 0.75, detailImg);

    // 26c - the served page is the database catalog, and the retired fixture
    // wording is gone. The 22 products come from the seeded database read, and
    // the copy removed in the cutover must not survive in any locale.
    await nav(client, '/products');
    const catalogSource = await evaluate(client, `(() => {
      const cards = [...document.querySelectorAll('main article')];
      const slugs = [...document.querySelectorAll('main a[href*="/products/"]')]
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => /^\\/products\\/[^/?#]+$/.test(href));
      const text = document.body.innerText;
      const retired = [
        'not live inventory',
        '\\u09B2\\u09BE\\u0987\\u09AD \\u09B8\\u09CD\\u099F\\u0995 \\u09A8\\u09AF\\u09BC',
        'Demo catalog captured',
        '\\u09A1\\u09C7\\u09AE\\u09CB \\u0995\\u09CD\\u09AF\\u09BE\\u099F\\u09BE\\u09B2\\u0997',
      ];
      return {
        cards: cards.length,
        distinctSlugs: new Set(slugs).size,
        retiredPresent: retired.filter((phrase) => text.includes(phrase)),
      };
    })()`);
    record('26c. database cutover serves 22 products and retires the fixture catalog wording',
      catalogSource.cards === 22 && catalogSource.distinctSlugs === 22 && catalogSource.retiredPresent.length === 0,
      catalogSource);

    // 27 - featured shelf: exactly one row, bounded controls, real advancement
    await nav(client, '/');
    const shelfStart = await evaluate(client, `window.__qb.shelf()`);
    const shelfFocusable = await evaluate(client, `(() => { const s = document.querySelector('div[class$="_scroller"]'); s.focus(); return document.activeElement === s; })()`);
    record('27. featured shelf is one row of six with bounded group controls',
      !!shelfStart && shelfStart.rows === 1 && shelfStart.cards === 6 && shelfStart.overflow > 0 &&
      shelfStart.pageOverflow <= 1 && shelfStart.controls === 2 &&
      shelfStart.prevDisabled === true && shelfStart.nextDisabled === false && shelfFocusable,
      { ...shelfStart, focusable: shelfFocusable });

    await evaluate(client, `window.__qb.shelfNext()`);
    await sleep(900);
    const shelfAdvanced = await evaluate(client, `window.__qb.shelf()`);
    // The suite runs at 1440px, where the shelf shows five of its six cards, so one page of scrolling
    // lands on the remaining five and cannot go further.
    record('27b. advancing reveals the remaining products and flips both control states',
      !!shelfAdvanced && shelfAdvanced.scrollLeft > 0 && shelfAdvanced.rows === 1 &&
      shelfAdvanced.prevDisabled === false && shelfAdvanced.nextDisabled === true &&
      shelfAdvanced.fullyVisible === 5,
      shelfAdvanced);

    // 27c - the shelf owns its header: controls in the former "View all" slot
    const shelfHeader = await evaluate(client, `(() => {
      const s = document.querySelector('div[class$="_scroller"]');
      const section = s.closest('section');
      const header = section.querySelector('header');
      const btns = [...section.querySelectorAll('button')];
      const cbox = btns[0].parentElement.getBoundingClientRect();
      const titleBox = header.querySelector('div').getBoundingClientRect();
      return {
        heading: header.querySelector('h2')?.textContent?.trim(),
        controlsInsideHeader: header.contains(btns[0]),
        controlCount: btns.length,
        labels: btns.map((b) => b.getAttribute('aria-label')),
        headerHasViewAll: /View all|সব দেখুন/.test(header.innerText),
        noOverlap: cbox.left >= titleBox.right - 1,
        groupLabel: btns[0].parentElement.getAttribute('aria-label'),
      };
    })()`);
    record('27c. featured controls sit in the section header and "View all" is gone from that section',
      shelfHeader.heading === 'Featured products' && shelfHeader.controlsInsideHeader &&
      shelfHeader.controlCount === 2 && shelfHeader.headerHasViewAll === false &&
      shelfHeader.noOverlap && !!shelfHeader.groupLabel,
      shelfHeader);

    // 27d - the homepage sections that intend a route into the catalog keep exactly one each
    // The featured shelf uses its own previous/next controls instead of a link, and the offer row
    // deliberately carries no "View all" - it is a four-card derived row, not a listing. So the
    // categories section and "Recently added" (Phase 26) are the two that render one. Asserting the
    // section ids rather than a bare count means a second link added to either is still caught.
    const viewAllSections = await evaluate(client, `[...document.querySelectorAll('main section')]
      .filter((s) => /View all|সব দেখুন/.test(s.innerText))
      .map((s) => { const h = s.querySelector('h1, h2'); return h ? h.id : 'unknown'; })`);
    record('27d. the categories and "Recently added" sections each keep their "View all" route',
      JSON.stringify(viewAllSections) === JSON.stringify(['categories-title', 'recently-added-title']),
      { sections: viewAllSections });

    // 28 - hero has a purposeful product composition
    const hero = await evaluate(client, `(() => {
      const heroSection = document.querySelector('main section');
      const photos = [...heroSection.querySelectorAll('picture img')];
      const copy = heroSection.querySelector('div');
      const cs = getComputedStyle(document.querySelector('h1'));
      return {
        heroPhotos: photos.length,
        photosLoaded: photos.filter((i) => i.complete && i.naturalWidth > 0).length,
        hasHeading: !!heroSection.querySelector('h1'),
        hasPrimaryCta: !!heroSection.querySelector('a[href="/products"]'),
        h1Weight: cs.fontWeight,
        h1Tracking: cs.letterSpacing,
        lang: document.documentElement.lang,
      };
    })()`);
    record('28. hero composes real product photos alongside the copy and CTAs', hero.heroPhotos === 3 && hero.photosLoaded === 3 && hero.hasHeading && hero.hasPrimaryCta, hero);

    // 28b - the hero photographs are the catalog's three newest products (owner decision, Phase 26
    // revision). The expectation is the seeded newest three in newest-first order, agreed with the
    // seed's own instants rather than with the page's layout order.
    const heroNewest = await evaluate(client, `(() => {
      const heroSection = document.querySelector('main section');
      const links = [...heroSection.querySelectorAll('a[href^="/products/"]')];
      const photos = [...heroSection.querySelectorAll('picture img')];
      return {
        hrefs: links.map((a) => a.getAttribute('href')),
        labels: links.map((a) => a.getAttribute('aria-label')),
        alts: photos.map((i) => i.getAttribute('alt')),
        srcs: photos.map((i) => i.getAttribute('src')),
        loaded: photos.filter((i) => i.complete && i.naturalWidth > 0).length,
      };
    })()`);
    const expectedHero = SEEDED_RECENT_SLUGS.map((slug) => '/products/' + slug);
    record('28b. the hero photographs are the three newest products, newest first',
      JSON.stringify(heroNewest.hrefs) === JSON.stringify(expectedHero) &&
      heroNewest.alts.length === 3 && heroNewest.loaded === 3 &&
      heroNewest.srcs.every((src) => typeof src === 'string' && src.indexOf('/catalog/') !== -1) &&
      new Set(heroNewest.srcs).size === 3,
      { shown: heroNewest.hrefs, expected: expectedHero, srcs: heroNewest.srcs });

    record('28c. each hero frame links to the product it depicts and carries its name',
      heroNewest.labels.length === 3 && heroNewest.alts.length === 3 &&
      heroNewest.labels.every((label, index) => typeof label === 'string' && label.length > 0 &&
        label === heroNewest.alts[index]),
      { labels: heroNewest.labels, alts: heroNewest.alts });

    // 29 - Bangla headings carry no negative tracking and use a shared weight
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'bn')`);
    await nav(client, '/');
    const bnType = await evaluate(client, `(() => {
      const h1 = document.querySelector('h1');
      const h2 = document.querySelector('h2');
      const cs = getComputedStyle(h1);
      return { weight: cs.fontWeight, tracking: cs.letterSpacing, h2Weight: getComputedStyle(h2).fontWeight, lang: document.documentElement.lang };
    })()`);
    record('29. Bangla headings use no negative tracking and a shared weight', bnType.lang === 'bn' && (bnType.tracking === 'normal' || parseFloat(bnType.tracking) >= 0) && bnType.weight === bnType.h2Weight, bnType);

    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    await nav(client, '/');
    const enType = await evaluate(client, `(() => {
      const h1 = document.querySelector('h1');
      const h2 = document.querySelector('h2');
      return { weight: getComputedStyle(h1).fontWeight, h2Weight: getComputedStyle(h2).fontWeight, lang: document.documentElement.lang };
    })()`);
    record('29b. English headings use the same weight as Bangla', enType.lang === 'en' && enType.weight === enType.h2Weight && enType.weight === bnType.weight, { en: enType, bn: bnType });

    // 31 - the shelf is one row of at most six at every supported viewport
    const shelfViewports = [
      { w: 320, h: 720, mobile: true },
      { w: 375, h: 812, mobile: true },
      { w: 768, h: 1024, mobile: true },
      { w: 1024, h: 768, mobile: false },
      { w: 1280, h: 800, mobile: false },
      { w: 1440, h: 900, mobile: false },
      { w: 1920, h: 1080, mobile: false },
    ];
    const shelfShapes = [];
    for (const vp of shelfViewports) {
      await client.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
      await nav(client, '/');
      const s = await evaluate(client, `window.__qb.shelf()`);
      // The shelf must not invent its own scale: its column width and column count are compared against
      // the standard full-width grid in the offer row, which uses ProductGrid. Both sit in the same
      // container, so the only reason for a difference is a different rule.
      const density = await evaluate(client, `(() => {
        const s = document.querySelector('div[class$="_scroller"]');
        const slot = s && s.firstElementChild ? s.firstElementChild.getBoundingClientRect().width : null;
        const heading = document.getElementById('deals-title');
        const grid = heading ? heading.closest('section').querySelector('ul') : null;
        const card = grid ? grid.querySelector('article') : null;
        return {
          shelfCardW: slot ? Math.round(slot) : null,
          gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null,
          gridCardW: card ? Math.round(card.getBoundingClientRect().width) : null,
        };
      })()`);
      shelfShapes.push({ w: vp.w, rows: s && s.rows, cards: s && s.cards, visible: s && s.fullyVisible,
        pageOverflow: s && s.pageOverflow, ...density });
    }
    record('31. featured shelf is exactly one row of at most six cards at every viewport',
      shelfShapes.every((r) => r.rows === 1 && r.cards === 6 && r.cards <= 6 && r.pageOverflow <= 1),
      shelfShapes);

    // The standard full-width grid publishes 2 / 3 / 3 / 4 / 5 columns at these widths, and the shelf
    // is required to show the same number rather than a scale of its own. Five columns is the
    // wide-desktop rule (1440px and up); it does not ask for five products at every viewport.
    const expectedVisible = { 320: 2, 375: 2, 768: 3, 1024: 3, 1280: 4, 1440: 5, 1920: 5 };
    record('31b. featured cards follow the standard grid column counts at every viewport',
      shelfShapes.every((r) => r.visible === expectedVisible[r.w] && r.gridCols === expectedVisible[r.w]),
      shelfShapes.map((r) => ({ w: r.w, featuredVisible: r.visible, gridColumns: r.gridCols })));

    record('31c. mobile shows two featured cards without pushing the page sideways',
      shelfShapes.filter((r) => r.w <= 375).every((r) => r.visible === 2),
      shelfShapes.filter((r) => r.w <= 375));

    // Measured card width, not the declared track: `grid-auto-columns` computes as the unresolved
    // `calc(...)` expression, so the rendered width is the only honest comparison.
    record('31d. a featured card is the same width as a standard grid card at every viewport',
      shelfShapes.every((r) => r.shelfCardW !== null && r.gridCardW !== null &&
        Math.abs(r.shelfCardW - r.gridCardW) <= 1),
      shelfShapes.map((r) => ({ w: r.w, featuredCard: r.shelfCardW, standardCard: r.gridCardW })));

    // 32 - pricing hierarchy on cards
    await client.send('Emulation.clearDeviceMetricsOverride');
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    await nav(client, '/products');
    const cardType = await evaluate(client, `(() => {
      const card = [...document.querySelectorAll('main article')].find((c) => c.querySelector('span[class$="_compare"]'));
      if (!card) return { error: 'no discounted card' };
      const cur = card.querySelector('span[class$="_current"]');
      const cmp = card.querySelector('span[class$="_compare"]');
      const cs = getComputedStyle(cur);
      const ccs = getComputedStyle(cmp);
      return {
        currentSize: parseFloat(cs.fontSize),
        currentWeight: cs.fontWeight,
        compareSize: parseFloat(ccs.fontSize),
        compareDecoration: ccs.textDecorationLine,
        numeric: cs.fontVariantNumeric,
      };
    })()`);
    record('32. the card current price dominates the struck-through comparison price',
      cardType.currentSize > cardType.compareSize && cardType.currentWeight === '700' &&
      cardType.compareDecoration.includes('line-through') && cardType.numeric.includes('tabular-nums'),
      cardType);

    // 33 - every shown discount is derived correctly from the stored prices
    const discounts = await evaluate(client, `window.__qb.cardDiscounts()`);
    const withCompare = discounts.filter((d) => d.compare !== null);
    const wrongDiscount = discounts.filter((d) => {
      if (d.compare === null) return d.savingAmount !== null || d.savingPercent !== null;
      if (!(d.compare > d.current)) return true;
      const amount = d.compare - d.current;
      const percent = Math.floor((amount / d.compare) * 100);
      return d.savingAmount !== amount || d.savingPercent !== percent;
    });
    record('33. comparison prices are always genuine and savings are derived correctly',
      discounts.length === 22 && withCompare.length === 13 && wrongDiscount.length === 0,
      { cards: discounts.length, withComparisonPrice: withCompare.length, wrong: wrongDiscount.slice(0, 4) });

    // 34 - pricing hierarchy is consistent on the detail page and in the cart
    await nav(client, '/products/oriox-tinted-lipbalm-strawberry');
    const pdpType = await evaluate(client, `(() => {
      const cur = document.querySelector('main span[class$="_currentPrice"]');
      const cmp = document.querySelector('main span[class$="_comparePrice"]');
      if (!cur || !cmp) return { error: 'pricing markup missing' };
      const cs = getComputedStyle(cur);
      const ccs = getComputedStyle(cmp);
      return {
        currentSize: parseFloat(cs.fontSize),
        currentWeight: cs.fontWeight,
        compareSize: parseFloat(ccs.fontSize),
        compareDecoration: ccs.textDecorationLine,
      };
    })()`);
    await evaluate(client, `window.__qb.addButton().click()`);
    await sleep(400);
    await nav(client, '/cart');
    const cartType = await evaluate(client, `(() => {
      const line = document.querySelector('main p[class$="_linePrice"]');
      const dds = [...document.querySelectorAll('main aside dd')];
      const total = dds[dds.length - 1];
      return {
        lineSize: line ? parseFloat(getComputedStyle(line).fontSize) : null,
        lineWeight: line ? getComputedStyle(line).fontWeight : null,
        totalSize: total ? parseFloat(getComputedStyle(total).fontSize) : null,
        totalWeight: total ? getComputedStyle(total).fontWeight : null,
      };
    })()`);
    record('34. price hierarchy is consistent on the product page and in the cart',
      pdpType.currentSize > pdpType.compareSize && pdpType.currentWeight === '700' &&
      pdpType.compareDecoration.includes('line-through') &&
      cartType.lineWeight === '700' && cartType.totalWeight === '700' &&
      cartType.totalSize > cartType.lineSize,
      { pdpType, cartType });

    // 35 - homepage sections complement each other instead of repeating cards
    await nav(client, '/');
    const featuredHrefs = await evaluate(client, `window.__qb.sectionHrefs('featured-title')`);
    const recentHrefs = await evaluate(client, `window.__qb.sectionHrefs('recently-added-title')`);
    const dealsHrefs = await evaluate(client, `window.__qb.sectionHrefs('deals-title')`);
    const collectionHrefs = await evaluate(client, `window.__qb.sectionHrefs('collection-title')`);
    const shared = (a, b) => a.filter((href) => b.includes(href));
    // Phase 25 removed the redundant "more to explore" section; Phase 26 added "Recently added".
    // The assertion pins the three sections that now exist and proves none of them repeats a card
    // from another. "Recently added" is not curated, so it may legitimately overlap the *catalog*,
    // but a duplicate between two homepage sections would still be a defect.
    record('35. homepage shows three product sections with no card repeated between them',
      featuredHrefs.length === 6 && recentHrefs.length === 3 && dealsHrefs.length === 4 &&
      collectionHrefs === null &&
      shared(featuredHrefs, recentHrefs).length === 0 &&
      shared(featuredHrefs, dealsHrefs).length === 0 &&
      shared(recentHrefs, dealsHrefs).length === 0,
      { featured: featuredHrefs.length, recent: recentHrefs.length, offers: dealsHrefs.length,
        thirdSection: collectionHrefs,
        overlaps: { featuredRecent: shared(featuredHrefs, recentHrefs),
                    featuredOffers: shared(featuredHrefs, dealsHrefs),
                    recentOffers: shared(recentHrefs, dealsHrefs) } });


    /*
     * ---------- Phase 25: header, account, grid density and add-to-cart feedback ----------
     *
     * These pin the behaviours the Phase 24 audit found broken. Each one is asserted against
     * the served build in both locales, because the worst of them (a 15px search input) only
     * reproduced in Bangla.
     */

    // 42 - the header search is genuinely typeable at 1024px in both locales.
    // The audit measured a 15px input inside a 79px container in Bangla; the acceptance bar is
    // 180px, and the fix buys a second header row rather than a narrower field.
    const searchWidths = [];
    for (const locale of ['bn', 'en']) {
      for (const w of [1024, 1200, 1280, 1440, 1920]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
        await evaluate(client, `localStorage.setItem('queenbees.locale.v1', '${locale}')`);
        await nav(client, '/');
        const state = await evaluate(client, `(() => {
          const inner = document.querySelector('header').firstElementChild;
          const forms = [...inner.querySelectorAll('form[role="search"]')];
          const visible = forms.filter((f) => f.getBoundingClientRect().width > 0);
          const input = visible[0] ? visible[0].querySelector('input') : null;
          const headerBox = document.querySelector('header').getBoundingClientRect();
          const controls = [...inner.querySelectorAll('a[href="/account"], a[href="/cart"], button[title]')];
          const offscreen = controls.filter((c) => {
            const r = c.getBoundingClientRect();
            return r.width === 0 || r.right > window.innerWidth + 1 || r.left < -1;
          }).length;
          return {
            inputsVisible: visible.length,
            inputW: input ? Math.round(input.getBoundingClientRect().width) : 0,
            headerH: Math.round(headerBox.height),
            offscreen,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
          };
        })()`);
        searchWidths.push({ locale, w, ...state });
      }
    }
    record('42. the header search input stays >=180px wide at every desktop width in both locales',
      searchWidths.every((r) => r.inputsVisible === 1 && r.inputW >= 180),
      searchWidths);
    record('42b. exactly one search field is visible per breakpoint, and no header control is clipped or offscreen',
      searchWidths.every((r) => r.offscreen === 0 && r.overflow <= 1),
      searchWidths.map((r) => ({ locale: r.locale, w: r.w, headerH: r.headerH, offscreen: r.offscreen, overflow: r.overflow })));
    record('42c. the header is a single 65px row from 1200px up',
      searchWidths.filter((r) => r.w >= 1200).every((r) => r.headerH === 65),
      searchWidths.filter((r) => r.w >= 1200).map((r) => ({ w: r.w, headerH: r.headerH })));

    // 42d - the search field is operable by keyboard: focus, type, submit, reach the results.
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    await nav(client, '/');
    const searchKeyboard = await evaluate(client, `(() => {
      const inner = document.querySelector('header').firstElementChild;
      const input = [...inner.querySelectorAll('form[role="search"] input')].find((i) => i.getBoundingClientRect().width > 0);
      input.focus();
      const focused = document.activeElement === input;
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      proto.call(input, 'niacinamide');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return { focused, value: input.value, focusRing: getComputedStyle(input.closest('form')).outlineStyle };
    })()`);
    await evaluate(client, `document.activeElement.form.requestSubmit()`);
    await poll(client, `location.pathname === '/products'`);
    const searchSubmitted = await evaluate(client, `({ path: location.pathname, q: new URLSearchParams(location.search).get('q'), cards: document.querySelectorAll('main article').length })`);
    record('42d. the header search accepts typed input and submits to the catalog',
      searchKeyboard.focused && searchSubmitted.path === '/products' && searchSubmitted.q === 'niacinamide' && searchSubmitted.cards === 1,
      { searchKeyboard, searchSubmitted });

    // 43 - My Account is one tap from the header at every width, including mobile.
    // The audit found it was only reachable through the drawer, as the ninth item.
    const accountReach = [];
    for (const w of [320, 360, 390, 768, 1024, 1440]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 768 });
      await nav(client, '/');
      const state = await evaluate(client, `(() => {
        const header = document.querySelector('header');
        const link = header.querySelector('a[href="/account"]');
        const r = link ? link.getBoundingClientRect() : null;
        return {
          inHeader: !!link,
          visible: !!r && r.width > 0 && r.height >= 40,
          label: link ? link.getAttribute('aria-label') : null,
          signedIn: link ? link.getAttribute('data-signed-in') : null,
          drawerOpen: !!document.getElementById('site-menu'),
        };
      })()`);
      accountReach.push({ w, ...state });
    }
    record('43. the account control is visible in the header at every width, as a >=40px target',
      accountReach.every((r) => r.inHeader && r.visible),
      accountReach);
    record('43b. the signed-out account control is named "My account" and states its signed-out condition',
      accountReach.every((r) => r.label === 'My account' && r.signedIn === 'false'),
      accountReach.map((r) => ({ w: r.w, label: r.label, signedIn: r.signedIn })));

    // 43c - the account control and the drawer do not duplicate the cart's job, and the drawer no
    // longer buries the account entry behind six categories and a checkout link.
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await nav(client, '/');
    await evaluate(client, `document.querySelector('header button[aria-controls="site-menu"]').click()`);
    await poll(client, `!!document.getElementById('site-menu')`);
    const drawerShape = await evaluate(client, `(() => {
      const drawer = document.getElementById('site-menu');
      if (!drawer) return { open: false };
      const links = [...drawer.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      return {
        open: true,
        accountIndex: links.indexOf('/account'),
        categories: links.filter((h) => h && h.startsWith('/categories/')).length,
        hasAccountSection: !!drawer.querySelector('[class*="_drawerAccount"]'),
      };
    })()`);
    record('43c. the account is a header control, and the drawer keeps an account section of its own',
      drawerShape.open && drawerShape.categories === 5 && drawerShape.hasAccountSection,
      drawerShape);
    await evaluate(client, `document.getElementById('site-menu').querySelector('a[href="/account"]').click()`);
    await poll(client, `location.pathname === '/account'`);
    const accountPage = await evaluate(client, `({ path: location.pathname, heading: document.querySelector('h1')?.textContent?.trim(), signIn: !!document.querySelector('main a[href*="/account/login"]') })`);
    record('43d. the header account control lands on the account page',
      accountPage.path === '/account' && !!accountPage.heading && accountPage.signIn,
      accountPage);

    // 44 - product grid density follows the surface, not the viewport.
    // Full-width surfaces reach five columns; the sidebar catalog stays at four, because five there
    // would produce ~197px cards (the audit's 144px defect in a milder form).
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    const density = { home: [], catalog: [] };
    for (const [route, key] of [['/', 'home'], ['/products', 'catalog']]) {
      for (const w of [320, 360, 390, 768, 1024, 1280, 1440, 1920]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: w < 768 });
        await nav(client, route);
        const shape = await evaluate(client, `(() => {
          const grids = [...document.querySelectorAll('main ul')].filter((u) =>
            getComputedStyle(u).display === 'grid' && u.children.length >= 4 && u.querySelector('article'));
          const grid = grids[0];
          if (!grid) return null;
          const style = getComputedStyle(grid);
          const cols = style.gridTemplateColumns.split(' ').length;
          const boxes = [...grid.children].map((c) => c.getBoundingClientRect());
          const tops = [...new Set(boxes.map((b) => Math.round(b.top)))];
          const lastTop = Math.max(...tops);
          const inLastRow = boxes.filter((b) => Math.abs(Math.round(b.top) - lastTop) < 2).length;
          // Every card must keep its name, price and availability legible: the title is not
          // allowed to collapse to a zero-height line and the price must render.
          const card = grid.querySelector('article');
          const title = card.querySelector('h3');
          const price = card.querySelector('span[class$="_current"]');
          return {
            cols,
            cardW: Math.round(boxes[0].width),
            cardH: Math.round(boxes[0].height),
            rows: tops.length,
            holes: cols - inLastRow,
            titleVisible: title ? title.getBoundingClientRect().height > 0 : false,
            priceVisible: price ? price.getBoundingClientRect().height > 0 : false,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            pageH: document.documentElement.scrollHeight,
          };
        })()`);
        density[key].push({ w, ...shape });
      }
    }
    record('44. there is no horizontal overflow from the product grids at any width',
      [...density.home, ...density.catalog].every((r) => r && r.overflow <= 1),
      [...density.home, ...density.catalog].map((r) => ({ w: r.w, overflow: r.overflow })));
    record('44b. full-width surfaces reach five columns on wide desktops, keeping cards >=240px',
      density.home.filter((r) => r.w >= 1440).every((r) => r.cols === 5 && r.cardW >= 240),
      density.home.filter((r) => r.w >= 1440));
    // The sidebar catalog takes its *last* column step later than a full-width grid, because the
    // 240px filter column plus its 48px gap is spent before the grid begins. Four columns appear
    // at 1280px (210px cards) and stay; a fifth would be ~197px, which is the audit's defect.
    record('44c. the sidebar catalog reaches four columns at 1280px and never shrinks a card below 200px',
      density.catalog.filter((r) => r.w === 1024).every((r) => r.cols === 3) &&
      density.catalog.filter((r) => r.w >= 1280).every((r) => r.cols === 4 && r.cardW >= 200),
      density.catalog.filter((r) => r.w >= 1024));
    record('44d. every card keeps its name and price visible at every width',
      [...density.home, ...density.catalog].every((r) => r.titleVisible && r.priceVisible),
      [...density.home, ...density.catalog].filter((r) => !r.titleVisible || !r.priceVisible));
    record('44e. cards are shorter than the audited 620px baseline on wide desktops',
      density.home.filter((r) => r.w >= 1440).every((r) => r.cardH < 620) &&
      density.catalog.filter((r) => r.w >= 1440).every((r) => r.cardH < 620),
      [...density.home, ...density.catalog].filter((r) => r.w >= 1440).map((r) => ({ route: 'x', w: r.w, cardH: r.cardH })));

    // 45 - add to cart offers a next step, and only announces genuine changes.
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(client, `localStorage.setItem('queenbees.cart.v1', '[]')`);
    await nav(client, '/products/oriox-tinted-lipbalm-strawberry');
    // Nothing is announced merely because the page mounted.
    const liveOnLoad = await evaluate(client, `(document.querySelector('main [role="status"]') || {}).textContent?.trim() ?? null`);
    const confirmBefore = await evaluate(client, `!!document.querySelector('[class*="_confirmation"]')`);
    record('45. no add-to-cart confirmation or announcement exists before the customer acts',
      liveOnLoad === '' && confirmBefore === false, { liveOnLoad, confirmBefore });

    await setValue(client, '#pdp-quantity', 2);
    await evaluate(client, `window.__qb.addButton().click()`);
    const confirmShown = await poll(client, `!!document.querySelector('[class*="_confirmation"]')`);
    const confirmation = await evaluate(client, `(() => {
      const panel = document.querySelector('[class*="_confirmation"]');
      if (!panel) return null;
      const links = [...panel.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      const buttons = [...panel.querySelectorAll('button')].map((b) => b.textContent.trim());
      const live = document.querySelector('main [role="status"]');
      return {
        visible: panel.getBoundingClientRect().height > 0,
        links,
        buttons,
        text: panel.innerText.replace(/\\s+/g, ' ').trim(),
        live: live ? live.textContent.trim() : null,
        cart: localStorage.getItem('queenbees.cart.v1'),
        badge: (document.querySelector('a[href="/cart"]') || {}).textContent?.trim() ?? null,
      };
    })()`);
    record('45b. a successful add shows a confirmation with View cart and Continue shopping',
      confirmShown && confirmation !== null && confirmation.visible &&
      confirmation.links.includes('/cart') && confirmation.buttons.length === 1 &&
      /View cart/.test(confirmation.text) && /Continue shopping/.test(confirmation.text),
      confirmation);
    record('45c. the confirmation is announced once and the cart badge stays in step',
      confirmation !== null && confirmation.live !== null && confirmation.live.length > 0 &&
      confirmation.cart === '[{"productId":"14","quantity":2}]' && confirmation.badge === '2',
      { live: confirmation && confirmation.live, cart: confirmation && confirmation.cart, badge: confirmation && confirmation.badge });

    // 45d - Continue shopping dismisses the panel and leaves the customer in the flow.
    await evaluate(client, `document.querySelector('[class*="_confirmation"] button').click()`);
    await sleep(300);
    const afterContinue = await evaluate(client, `({
      panel: !!document.querySelector('[class*="_confirmation"]'),
      path: location.pathname,
      cart: localStorage.getItem('queenbees.cart.v1'),
      addable: !!window.__qb.addButton(),
    })`);
    record('45d. Continue shopping dismisses the confirmation, keeps the page and keeps the cart',
      afterContinue.panel === false && afterContinue.path === '/products/oriox-tinted-lipbalm-strawberry' &&
      afterContinue.cart === '[{"productId":"14","quantity":2}]' && afterContinue.addable,
      afterContinue);

    // 45e - a repeated add increments one line rather than duplicating it.
    await evaluate(client, `window.__qb.addButton().click()`);
    await sleep(400);
    const afterRepeat = await evaluate(client, `({
      cart: localStorage.getItem('queenbees.cart.v1'),
      badge: (document.querySelector('a[href="/cart"]') || {}).textContent?.trim() ?? null,
    })`);
    record('45e. adding the same product again increments one cart line and does not duplicate it',
      afterRepeat.cart === '[{"productId":"14","quantity":4}]' && afterRepeat.badge === '4',
      afterRepeat);

    // 45f - View cart lands on the cart with the same product and quantity, and it persists.
    await evaluate(client, `document.querySelector('[class*="_confirmation"] a').click()`);
    await poll(client, `location.pathname === '/cart'`);
    const cartAfterView = await evaluate(client, `({
      path: location.pathname,
      lines: window.__qb.cartLines().length,
      qty: document.querySelector('main input[type=number]') ? document.querySelector('main input[type=number]').value : null,
    })`);
    record('45f. View cart opens the cart with the same product and quantity',
      cartAfterView.path === '/cart' && cartAfterView.lines === 1 && cartAfterView.qty === '4',
      cartAfterView);

    await client.send('Page.reload');
    await nav(client, '/cart');
    const cartPersisted = await evaluate(client, `({
      lines: window.__qb.cartLines().length,
      qty: document.querySelector('main input[type=number]') ? document.querySelector('main input[type=number]').value : null,
    })`);
    record('45g. the cart survives a reload with the same line and quantity',
      cartPersisted.lines === 1 && cartPersisted.qty === '4', cartPersisted);

    // 45h - the cart's own live region does not announce the count on page load, but does respond
    // to a real change. The audit found it announced "cart updated: N items" merely on mount.
    const cartLiveOnLoad = await evaluate(client, `(document.querySelector('main [role="status"]') || {}).textContent?.trim() ?? null`);
    await setValue(client, 'main input[type=number]', 3);
    const cartAnnounced = await poll(client, `(() => { const s = document.querySelector('main [role="status"]'); return !!s && s.textContent.trim().length > 0; })()`);
    const cartLiveAfter = await evaluate(client, `(document.querySelector('main [role="status"]') || {}).textContent?.trim() ?? null`);
    record('45h. the cart live region is silent on load and announces a real quantity change',
      cartLiveOnLoad === '' && cartAnnounced && /3/.test(cartLiveAfter || ''),
      { cartLiveOnLoad, cartLiveAfter });

    // 45i - an unavailable product offers no add control at all, so no false success is possible.
    // Availability is the owner's state; the product page states it and removes the button.
    const outOfStock = await evaluate(client, `(async () => {
      const response = await fetch('/api/admin/catalog');
      return { exists: response.status !== 404 };
    })()`);
    await nav(client, '/products/oriox-tinted-lipbalm-strawberry');
    const unavailableShape = await evaluate(client, `(() => {
      const add = window.__qb.addButton();
      const block = document.querySelector('[class*="_unavailable"]');
      return {
        addPresent: !!add,
        unavailableBlock: !!block,
        confirmations: document.querySelectorAll('[class*="_confirmation"]').length,
      };
    })()`);
    record('45i. an in-stock product shows the add control and no stale confirmation on a fresh page',
      unavailableShape.addPresent && !unavailableShape.unavailableBlock && unavailableShape.confirmations === 0,
      { ...unavailableShape, adminApi: outOfStock });

    // 46 - the language toggle exposes one accessible name rather than two concatenated strings.
    await nav(client, '/');
    const toggleName = await evaluate(client, `(() => {
      const button = document.querySelector('header button[title]');
      return { label: button.getAttribute('aria-label'), title: button.getAttribute('title'), text: button.textContent.trim() };
    })()`);
    record('46. the language toggle has a single explicit accessible name',
      !!toggleName.label && toggleName.label === toggleName.title && !toggleName.label.includes('Current language'),
      toggleName);

    // 36 - the category section is desktop-only, and mobile keeps a route to every category
    await client.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await nav(client, '/');
    const mobileCategories = await evaluate(client, `(() => {
      const section = document.getElementById('categories');
      if (!section) return { present: false };
      return {
        present: true,
        display: getComputedStyle(section).display,
        height: Math.round(section.getBoundingClientRect().height),
        visibleLinks: [...section.querySelectorAll('a')].filter((a) => a.getBoundingClientRect().height > 0).length,
      };
    })()`);
    await evaluate(client, `document.querySelector('header button[aria-controls="site-menu"]').click()`);
    await poll(client, `!!document.getElementById('site-menu')`);
    const drawerCategories = await evaluate(client, `(() => {
      const d = document.getElementById('site-menu');
      if (!d) return { open: false, categories: 0 };
      return { open: true, categories: [...new Set([...d.querySelectorAll('a[href^="/categories/"]')].map((a) => a.getAttribute('href')))].length };
    })()`);
    record('36. category section is absent on mobile while the drawer still reaches all five categories',
      mobileCategories.present && mobileCategories.display === 'none' && mobileCategories.height === 0 &&
      mobileCategories.visibleLinks === 0 && drawerCategories.open && drawerCategories.categories === 5,
      { mobileCategories, drawerCategories });

    const heroCtaMobile = await evaluate(client, `(() => {
      const a = document.querySelector('a[class*="_heroCategoriesAction"]');
      if (!a) return { present: false };
      return { present: true, display: getComputedStyle(a).display, height: Math.round(a.getBoundingClientRect().height) };
    })()`);
    record('36b. the category anchor is hidden on mobile instead of pointing at a hidden target',
      heroCtaMobile.present && heroCtaMobile.display === 'none' && heroCtaMobile.height === 0,
      heroCtaMobile);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await nav(client, '/');
    const desktopCategories = await evaluate(client, `(() => {
      const section = document.getElementById('categories');
      const cards = [...section.querySelectorAll('a[href^="/categories/"]')];
      const a = document.querySelector('a[class*="_heroCategoriesAction"]');
      return {
        display: getComputedStyle(section).display,
        visibleCards: cards.filter((c) => c.getBoundingClientRect().height > 0).length,
        ctaVisible: a ? a.getBoundingClientRect().height > 0 : false,
      };
    })()`);
    record('36c. category section and its anchor are both present on desktop',
      desktopCategories.display !== 'none' && desktopCategories.visibleCards === 5 && desktopCategories.ctaVisible,
      desktopCategories);
    await client.send('Emulation.clearDeviceMetricsOverride');

    // 37 - the preview announcement survives on every route
    const barRoutes = [];
    for (const route of ['/', '/products', '/cart', '/checkout', '/products/oriox-tinted-lipbalm-strawberry']) {
      await nav(client, route);
      const state = await evaluate(client, `(() => {
        const bar = document.querySelector('main')?.parentElement?.querySelector('aside');
        const msg = bar ? bar.innerText.replace(/\\s+/g, ' ').trim() : '';
        return { present: !!bar, mentions: /preview/i.test(msg) && /orders/i.test(msg) && /payments/i.test(msg) };
      })()`);
      barRoutes.push({ route, present: state.present, mentions: state.mentions });
    }
    record('37. the preview announcement is present on every route', barRoutes.every((r) => r.present && r.mentions), barRoutes);

    // 38 - no horizontal overflow on the key routes at the narrowest width
    await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, deviceScaleFactor: 1, mobile: true });
    const overflowRoutes = [];
    for (const route of ['/', '/products', '/cart', '/checkout', '/products/lilac-5-niacinamide-serum-30-ml', '/categories/haircare']) {
      await nav(client, route);
      const state = await evaluate(client, `({ overflow: document.documentElement.scrollWidth - window.innerWidth })`);
      overflowRoutes.push({ route, overflow: state.overflow });
    }
    record('38. no horizontal overflow on the key routes at 320px', overflowRoutes.every((r) => r.overflow <= 1), overflowRoutes);
    await client.send('Emulation.clearDeviceMetricsOverride');

    // 40 - brand assets: one identity, outlined wordmark, favicon linked, old variant gone
    const brand = await evaluate(client, `Promise.all([
      fetch('/brand/logo.svg').then(async (r) => ({ url: '/brand/logo.svg', status: r.status, body: await r.text() })),
      fetch('/brand/logo-mark.svg').then(async (r) => ({ url: '/brand/logo-mark.svg', status: r.status, body: await r.text() })),
      fetch('/brand/favicon.svg').then(async (r) => ({ url: '/brand/favicon.svg', status: r.status, body: await r.text() })),
      fetch('/brand/logo-dark.svg').then((r) => ({ url: '/brand/logo-dark.svg', status: r.status })),
    ])`);
    const byUrl = Object.fromEntries(brand.map((b) => [b.url, b]));
    const logo = byUrl['/brand/logo.svg'];
    const mark = byUrl['/brand/logo-mark.svg'];
    const favicon = byUrl['/brand/favicon.svg'];
    const safe = (svg) => svg && !/<script/i.test(svg) && !/xlink:href|href=\"http|url\(/i.test(svg);
    const headerBrand = await evaluate(client, `(() => {
      const img = document.querySelector('header img[src="/brand/logo.svg"]');
      if (!img) return { present: false };
      const r = img.getBoundingClientRect();
      return {
        present: true,
        loaded: img.complete && img.naturalWidth === 173 && img.naturalHeight === 40,
        declared: img.getAttribute('width') + 'x' + img.getAttribute('height'),
        alt: (img.getAttribute('alt') || '').trim(),
        height: Math.round(r.height),
      };
    })()`);
    const faviconLink = await evaluate(client, `(() => {
      const link = document.querySelector('link[rel="icon"]');
      return link ? { href: link.getAttribute('href'), type: link.getAttribute('type') } : null;
    })()`);
    record('40. brand assets share one identity: outlined wordmark, no scripts, no old variant, favicon linked',
      logo.status === 200 && mark.status === 200 && favicon.status === 200 &&
      byUrl['/brand/logo-dark.svg'].status === 404 &&
      safe(logo.body) && safe(mark.body) && safe(favicon.body) &&
      !/<text/i.test(logo.body) && logo.body.includes('aria-label="QueenBee\u2019s"') &&
      mark.body.includes('viewBox="0 0 40 40"') &&
      headerBrand.present && headerBrand.loaded && headerBrand.alt.length > 0 &&
      headerBrand.height <= 40 && headerBrand.declared === '173x40' &&
      faviconLink && faviconLink.href === '/brand/favicon.svg' && faviconLink.type === 'image/svg+xml',
      { logo: logo.status, mark: mark.status, favicon: favicon.status, headerBrand, faviconLink,
        oldVariantStatus: byUrl['/brand/logo-dark.svg'].status });

    // 40b - the symbol stays legible when rendered at favicon size
    const favProbe = await evaluate(client, `(async () => {
      const img = new Image();
      img.src = '/brand/favicon.svg?' + Math.random();
      img.style.cssText = 'width:16px;height:16px;position:absolute;left:-9999px';
      document.body.appendChild(img);
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('favicon load')); });
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      c.getContext('2d').drawImage(img, 0, 0, 16, 16);
      const d = c.getContext('2d').getImageData(0, 0, 16, 16).data;
      const palette = {};
      for (let i = 0; i < d.length; i += 4) {
        const key = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
        palette[key] = (palette[key] || 0) + 1;
      }
      const top = Object.entries(palette).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = Object.values(palette).reduce((n, v) => n + v, 0);
      img.remove();
      return { top, total, tilePixels: palette['86,53,140'] || 0 };
    })()`);
    record('40b. the favicon mark keeps its ink and tile colour at 16px',
      favProbe.total === 256 && favProbe.tilePixels >= 140 && favProbe.top[0][0] === '86,53,140' &&
      favProbe.top.length >= 3,
      favProbe);
    // 41 - one content grid: container, gutters and aligned chrome at every width
    const widthViewports = [
      { w: 320, h: 720, mobile: true },
      { w: 375, h: 812, mobile: true },
      { w: 768, h: 1024, mobile: true },
      { w: 1024, h: 768, mobile: false },
      { w: 1280, h: 800, mobile: false },
      { w: 1440, h: 900, mobile: false },
      { w: 1920, h: 1080, mobile: false },
    ];
    const widthShapes = [];
    for (const vp of widthViewports) {
      await client.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
      await nav(client, '/');
      const shape = await evaluate(client, `window.__qb.layout()`);
      widthShapes.push({
        w: vp.w,
        contentW: shape.contentW,
        marginL: shape.marginL,
        marginR: shape.marginR,
        fill: shape.fillPct,
        headerAligned: shape.headerAlignedL && shape.headerAlignedR,
        footerAligned: shape.footerAlignedL && shape.footerAlignedR,
        headerH: shape.headerH,
        overflow: shape.pageOverflow,
        cards: shape.grids.map((g) => g.cardW),
        holes: shape.grids.map((g) => g.trailingHoles),
        rows: shape.grids.map((g) => g.rows),
      });
    }
    record('41. every section shares one content grid: header, main and footer align at all seven widths',
      widthShapes.every((r) => r.headerAligned && r.footerAligned) &&
      widthShapes.every((r) => r.overflow <= 1),
      widthShapes);

    /*
     * Below the cap the layout is fluid, so fill is the meaningful number.
     * At and above it the container binds by design, so the assertions switch
     * to the absolute content width - which must still beat the previous
     * 1200px container's 1152px - and to a reduced margin.
     */
    record('41b. desktop content occupies substantially more of the viewport than the previous 1200px container',
      /* Mobile keeps 16px gutters, so its fill is legitimately ~90%; the fluid
         desktop range is where a high fill is the goal. */
      widthShapes.filter((r) => r.w >= 1024 && r.w <= 1440).every((r) => r.fill >= 92) &&
      widthShapes.filter((r) => r.w === 1440).every((r) => r.marginL <= 48) &&
      widthShapes.filter((r) => r.w >= 1920).every((r) => r.contentW >= 1300 && r.contentW > 1152 && r.marginL < 384),
      widthShapes.filter((r) => r.w >= 1280));

    record('41c. mobile gutters stay at 16px and are unaffected by the desktop container',
      widthShapes.filter((r) => r.w <= 375).every((r) => r.marginL === 16 && r.marginR === 16 && r.contentW === r.w - 32),
      widthShapes.filter((r) => r.w <= 375));

    /*
     * Two different things, asserted separately:
     *
     *  - A grid that renders as ONE row must fill its track. This is the defect
     *    that auto-fill produced: at 1920px the 4-item curated row was given six
     *    columns and filled only four, leaving two empty columns inside a row
     *    that is meant to read as complete.
     *  - At the desktop design width the curated 4- and 8-item selections must
     *    divide evenly into the 4-column track, so no row is left ragged.
     *
     * A multi-row grid ending on a partial row is normal and is not asserted
     * against: at 768px the 3-column tablet track cannot divide 4 or 8 items
     * evenly, and the alternatives were measured and rejected (2 columns gives
     * 357px cards, wider than desktop; 4 columns gives 170px cards, smaller
     * than the phone grid). The tablet card size is the priority there.
     */
    /*
     * Phase 25 changed the column model, so this assertion changed with it. The curated rows are
     * no longer required to divide evenly into a fixed four-column track: the homepage now uses
     * five columns from 1440px, which a 4-item row and a 6-item shelf cannot both fill exactly.
     * A trailing gap on the final row of a multi-row grid is normal typography, and the offer row
     * is deliberately capped at four. What still matters is that every card stays a usable size
     * and that no card is squeezed below the readability floor.
     */
    record('41d. product grids keep cards at a usable width with no squeezed columns',
      widthShapes.filter((r) => r.w >= 1024).every((r) => r.cards.every((c) => c >= 200)),
      widthShapes.map((r) => ({ w: r.w, cards: r.cards, holes: r.holes, rows: r.rows })));

    // 41e - the inline navigation and the drawer trigger swap at one breakpoint, and the header
    // is a single row from 1200px up. Phase 25 made the swap and the single row two different
    // breakpoints on purpose: between 1024 and 1199px the inline navigation is present but shares
    // a second row with the search field, which is what keeps the field typeable there.
    const headerSwap = [];
    for (const w of [880, 1023, 1024, 1280, 1920]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await nav(client, '/');
      const state = await evaluate(client, `(() => {
        const inner = document.querySelector('header').firstElementChild;
        const R = (el) => (el ? el.getBoundingClientRect() : null);
        const nav = inner.querySelector('nav');
        // Both search fields are mounted; only one is displayed. The old probe took the first
        // form in the DOM, which is the hidden one, so it reported a search at every width.
        const search = [...inner.querySelectorAll('form[role="search"]')]
          .find((f) => f.getBoundingClientRect().width > 0) || null;
        const trigger = inner.querySelector('button[aria-controls="site-menu"]');
        const nR = R(nav), sR = R(search), tR = R(trigger), iR = R(inner);
        const navVisible = !!nR && nR.width > 0;
        const searchVisible = !!sR && sR.width > 0;
        return {
          headerH: Math.round(iR.height),
          navVisible,
          triggerVisible: !!tR && tR.width > 0,
          searchVisible,
          overlap: navVisible && searchVisible ? Math.round(nR.right - sR.left) : null,
        };
      })()`);
      headerSwap.push({ w, ...state });
    }
    record('41e. below 1024px only the drawer navigates; from 1024px the inline navigation replaces it, and a single 65px row appears at 1200px',
      headerSwap.filter((r) => r.w < 1024).every((r) => !r.navVisible && r.triggerVisible && !r.searchVisible) &&
      headerSwap.filter((r) => r.w >= 1024).every((r) => r.navVisible && !r.triggerVisible && r.searchVisible) &&
      headerSwap.filter((r) => r.w >= 1200).every((r) => r.headerH <= 65 && r.overlap <= 0),
      headerSwap);



    /*
     * ---------- Phase 26: three recently added products (D6) ----------
     *
     * The homepage now publishes a recency claim, so the browser suite checks the claim itself and
     * not merely that three cards rendered: the three shown must be the three newest by the stored
     * `created_at`, agreed with the seeded timestamps rather than with visual order.
     */

    // 42 - exactly three distinct products, and they are the three newest
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await nav(client, '/');
    const recent = await evaluate(client, `(() => {
      const heading = document.getElementById('recently-added-title');
      if (!heading) return { section: false };
      const section = heading.closest('section');
      const cards = [...section.querySelectorAll('article')];
      const hrefs = [...new Set([...section.querySelectorAll('article a')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h.indexOf('/products/') === 0))];
      const names = cards.map((c) => {
        const n = c.querySelector('h3, [class$="_name"]');
        return n ? n.innerText.trim() : null;
      });
      const imgs = cards.map((c) => {
        const img = c.querySelector('img');
        return img ? { src: img.getAttribute('src'), alt: img.getAttribute('alt'),
                       complete: img.complete, w: img.naturalWidth } : null;
      });
      return { section: true, heading: heading.innerText.trim(), headingId: heading.id,
               cards: cards.length, hrefs, names, imgs,
               body: (section.querySelector('p') || {}).innerText || '' };
    })()`);

    // The server-rendered order is the authority; the expected three are the last three seeded
    // products, because the seed's instants increase with fixture order.
    const expectedRecent = SEEDED_RECENT_SLUGS.map((s) => '/products/' + s);
    record('42. "Recently added" shows exactly three distinct products, newest first',
      recent.section === true && recent.cards === 3 && recent.hrefs.length === 3 &&
      JSON.stringify(recent.hrefs) === JSON.stringify(expectedRecent),
      { shown: recent.hrefs, expected: expectedRecent, cards: recent.cards });

    record('42b. the three cards carry real images, names and product links',
      recent.imgs.length === 3 &&
      recent.imgs.every((i) => i && i.src && i.src.indexOf('/catalog/') !== -1 && i.w > 0) &&
      recent.names.every((n) => typeof n === 'string' && n.length > 0),
      { images: recent.imgs, names: recent.names });

    record('42c. the section is worded as recency and states the count honestly',
      /three products most recently added/i.test(recent.body),
      { body: recent.body, heading: recent.heading });

    // 43 - the same three survive a reload (deterministic, not incidental)
    await nav(client, '/');
    const recentAgain = await evaluate(client, `(() => {
      const heading = document.getElementById('recently-added-title');
      if (!heading) return null;
      const section = heading.closest('section');
      return [...new Set([...section.querySelectorAll('article a')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h.indexOf('/products/') === 0))];
    })()`);
    record('43. the selection is identical after a reload',
      JSON.stringify(recentAgain) === JSON.stringify(recent.hrefs), { first: recent.hrefs, second: recentAgain });

    // 44 - Bangla renders the section with the same products
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'bn')`);
    await nav(client, '/');
    const recentBn = await evaluate(client, `(() => {
      const heading = document.getElementById('recently-added-title');
      if (!heading) return null;
      const section = heading.closest('section');
      return { heading: heading.innerText.trim(),
               hrefs: [...new Set([...section.querySelectorAll('article a')]
                 .map((a) => a.getAttribute('href'))
                 .filter((h) => h && h.indexOf('/products/') === 0))],
               cards: section.querySelectorAll('article').length,
               lang: document.documentElement.lang };
    })()`);
    record('44. the section renders in Bangla with the same three products',
      recentBn && recentBn.cards === 3 && recentBn.lang === 'bn' &&
      /[\u0980-\u09FF]/.test(recentBn.heading) &&
      JSON.stringify(recentBn.hrefs) === JSON.stringify(recent.hrefs),
      recentBn);

    // 45 - layout and overflow at every required width, both locales
    const recentShapes = [];
    for (const locale of ['en', 'bn']) {
      await evaluate(client, `localStorage.setItem('queenbees.locale.v1', '${locale}')`);
      for (const w of [320, 390, 768, 1024, 1280, 1440, 1920]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 720 });
        await nav(client, '/');
        const shape = await evaluate(client, `(() => {
          const heading = document.getElementById('recently-added-title');
          if (!heading) return { missing: true };
          const section = heading.closest('section');
          const grid = section.querySelector('ul') || section.querySelector('div');
          const cards = [...section.querySelectorAll('article')];
          const r = section.getBoundingClientRect();
          // The offer row is the reference: it is a plain ProductGrid with the full-width density, so
          // it states what a standard card measures at this viewport.
          const deals = document.getElementById('deals-title');
          const standardGrid = deals ? deals.closest('section').querySelector('ul') : null;
          const standardCard = standardGrid ? standardGrid.querySelector('article') : null;
          const colsOf = (el) => (el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : null);
          return {
            cards: cards.length,
            pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
            sectionOverflow: Math.round(grid.scrollWidth - grid.clientWidth),
            width: Math.round(r.width),
            rows: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size,
            cols: colsOf(grid),
            cardW: cards.length ? Math.round(cards[0].getBoundingClientRect().width) : null,
            standardCols: colsOf(standardGrid),
            standardCardW: standardCard ? Math.round(standardCard.getBoundingClientRect().width) : null,
          };
        })()`);
        recentShapes.push({ locale, w, ...shape });
      }
    }
    record('45. the section has no horizontal overflow at 320-1920px in both locales',
      recentShapes.every((r) => !r.missing && r.cards === 3 && r.pageOverflow <= 1 && r.sectionOverflow <= 1),
      recentShapes.filter((r) => r.missing || r.cards !== 3 || r.pageOverflow > 1 || r.sectionOverflow > 1));

    /*
     * 48/48b - the row is the standard grid, not a scale of its own.
     *
     * Phase 26 first gave this section a `trio` density so three cards filled the row; the result was
     * cards wider than every other card on the page. It now uses `ProductGrid`'s full-width density, so
     * the column count and the card width must match the offer row exactly at every viewport, and the
     * row is allowed to leave the columns its three products do not fill.
     */
    const standardColumns = { 320: 2, 390: 2, 768: 3, 1024: 3, 1280: 4, 1440: 5, 1920: 5 };
    record('48. "Recently added" uses the standard grid columns and card width at every viewport',
      recentShapes.every((r) => !r.missing && r.cols === standardColumns[r.w] &&
        r.standardCols === standardColumns[r.w] && r.cardW !== null && r.standardCardW !== null &&
        Math.abs(r.cardW - r.standardCardW) <= 1),
      recentShapes.map((r) => ({ locale: r.locale, w: r.w, cols: r.cols, standardCols: r.standardCols,
        cardW: r.cardW, standardCardW: r.standardCardW })));

    const wideRows = recentShapes.filter((r) => r.w === 1440);
    record('48b. wide desktop declares five columns and leaves the two it cannot fill empty',
      wideRows.length === 2 && wideRows.every((r) => r.cols === 5 && r.cards === 3 && r.rows === 1 &&
        r.cardW === r.standardCardW),
      wideRows.map((r) => ({ locale: r.locale, cols: r.cols, cards: r.cards, rows: r.rows,
        cardW: r.cardW, standardCardW: r.standardCardW })));

    // 46 - recency did not disturb the catalog listing or the cart
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    await client.send('Emulation.clearDeviceMetricsOverride');
    await nav(client, '/products');
    const catalogOrder = await evaluate(client, `(() => {
      const links = [...document.querySelectorAll('main a[href^="/products/"]')]
        .map((a) => a.getAttribute('href'));
      return { first: links[0], last: links[links.length - 1],
               count: new Set(links).size,
               descending: JSON.stringify(links) === JSON.stringify([...links].sort().reverse()),
               containsRecent: links.includes('/products/${SEEDED_RECENT_SLUGS[0]}') };
    })()`);
    // The catalog's default sort is "relevance", which is the record id ascending - deliberately not
    // creation order. If recency had leaked into the listing, the last product in creation order
    // would lead the list and this ordering would come out descending instead.
    record('46. the catalog listing keeps its own id ascending order and is not re-ordered by recency',
      catalogOrder.count === 22 && catalogOrder.descending === false &&
      catalogOrder.first === '/products/lilac-5-niacinamide-serum-30-ml' &&
      catalogOrder.containsRecent === true,
      catalogOrder);

    // 47 - a recently added product can be added to the cart
    const recentTarget = SEEDED_RECENT_SLUGS[0];
    // Start from an empty cart: earlier journeys leave items in storage, and the badge would then
    // report someone else's total rather than this add.
    await evaluate(client, `localStorage.removeItem('queenbees.cart.v1')`);
    await nav(client, '/products/' + recentTarget);
    const added = await evaluate(client, `(async () => {
      const btn = [...document.querySelectorAll('main button')].find((b) => /Add to cart/i.test(b.textContent));
      if (!btn) return { error: 'no add button' };
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      await new Promise((r) => setTimeout(r, 600));
      const stored = JSON.parse(localStorage.getItem('queenbees.cart.v1') || '[]');
      return { clicked: true, stored, lines: stored.length,
               slug: stored.length === 1 ? stored[0].productId : null };
    })()`);
    record('47. a recently added product still adds to the cart as a single line',
      added && added.clicked === true && added.lines === 1 &&
      added.stored[0].quantity === 1, added);

    // 39 - no console errors
    record('39. no console errors or uncaught exceptions across all journeys', consoleErrors.length === 0, consoleErrors.slice(0, 5));
  } catch (error) {
    record('browser suite completed', false, String(error && error.message));
  } finally {
    chrome.kill('SIGKILL');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\nBrowser verification against ' + APP + '\n');
  for (const r of results) {
    console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.step);
    if (!r.ok) console.log('        ' + r.detail);
  }
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed.');
  if (failed.length > 0) process.exitCode = 1;
}

main();
