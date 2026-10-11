#!/usr/bin/env node
/**
 * QueenBee's storefront - end-to-end browser verification.
 *
 * Drives a local Chromium over the DevTools Protocol using only Node built-ins
 * (node:http + global WebSocket), so the project gains no test dependency.
 *
 * Usage:
 *   npm run build && npx next start -p 4311 &
 *   node scripts/verify-browser.cjs [baseUrl]
 *
 * Exits non-zero if any check fails. This is a demo-scope smoke suite: it
 * verifies the implemented frontend only and makes no claim about production
 * backend, payment or inventory behaviour.
 */
const http = require('node:http');
const { spawn } = require('node:child_process');

const APP = process.argv[2] || 'http://127.0.0.1:4311';
const CDP = 9228;
const results = [];
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
    record('9. add to cart updates the header badge and announces status', badgeUpdated && announced === 'Added to cart', { badgeUpdated, announced });

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

    // 16 - checkout preview inert. Locale is reset first because the previous
    // check deliberately left an unsupported preference that falls back to Bangla.
    await evaluate(client, `localStorage.setItem('queenbees.locale.v1', 'en')`);
    await nav(client, '/products/lilac-5-niacinamide-serum-30-ml');
    await evaluate(client, `window.__qb.addButton().click()`);
    await sleep(400);
    await nav(client, '/checkout');
    const checkout = await evaluate(client, `({ mainForms: document.querySelectorAll('main form').length, mainInputs: document.querySelectorAll('main input, main textarea, main select').length, paymentFields: document.querySelectorAll('main input[type=password], main input[name*=card], main input[name*=cvv], main input[name*=payment]').length, submitButtons: document.querySelectorAll('main button[type=submit]').length, externalHosts: [...new Set([...document.querySelectorAll('a[href^="http"]')].map((a) => new URL(a.href).host))], banner: /(preview only|প্রিভিউ)/i.test(document.body.innerText), demoBadge: /(Demo preview|ডেমো প্রিভিউ)/i.test(document.body.innerText), lineItems: document.querySelectorAll('main ul > li').length })`);
    record('16. checkout preview is inert, demo-labelled and contacts no external host', checkout.mainForms === 0 && checkout.mainInputs === 0 && checkout.paymentFields === 0 && checkout.submitButtons === 0 && checkout.externalHosts.length === 0 && checkout.banner && checkout.demoBadge && checkout.lineItems === 1, checkout);

    // 17 - not found
    await nav(client, '/products/does-not-exist');
    const notFound = await evaluate(client, `({ copy: /(not found|পাওয়া যায়নি)/i.test(document.body.innerText), recovery: !!document.querySelector('a[href="/"]') })`);
    record('17. unknown product shows not-found copy with a route home', notFound.copy && notFound.recovery, notFound);

    // 18 - viewports
    const viewports = [{ w: 320, h: 720, mobile: true }, { w: 375, h: 812, mobile: true }, { w: 768, h: 1024, mobile: true }, { w: 1024, h: 768, mobile: false }, { w: 1440, h: 900, mobile: false }];
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
        localOnly: imgs.every((i) => (i.currentSrc || i.src).startsWith('http://127.0.0.1') || (i.currentSrc || i.src).startsWith('/')),
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
    record('27b. advancing reveals the remaining products and flips both control states',
      !!shelfAdvanced && shelfAdvanced.scrollLeft > 0 && shelfAdvanced.rows === 1 &&
      shelfAdvanced.prevDisabled === false && shelfAdvanced.nextDisabled === true &&
      shelfAdvanced.fullyVisible === 4,
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

    // 27d - other homepage sections keep their "View all" links
    const viewAllCount = await evaluate(client, `[...document.querySelectorAll('main section')].filter((s) => /View all|সব দেখুন/.test(s.innerText)).length`);
    record('27d. other homepage sections keep their "View all" links', viewAllCount >= 2, { viewAllCount });

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
      { w: 1440, h: 900, mobile: false },
    ];
    const shelfShapes = [];
    for (const vp of shelfViewports) {
      await client.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
      await nav(client, '/');
      const s = await evaluate(client, `window.__qb.shelf()`);
      shelfShapes.push({ w: vp.w, rows: s && s.rows, cards: s && s.cards, visible: s && s.fullyVisible, pageOverflow: s && s.pageOverflow });
    }
    record('31. featured shelf is exactly one row of at most six cards at every viewport',
      shelfShapes.every((r) => r.rows === 1 && r.cards === 6 && r.cards <= 6 && r.pageOverflow <= 1),
      shelfShapes);

    record('31b. four featured cards are visible initially on desktop widths',
      shelfShapes.filter((r) => r.w >= 1024).every((r) => r.visible === 4),
      shelfShapes.filter((r) => r.w >= 1024));

    record('31c. mobile shows two featured cards without pushing the page sideways',
      shelfShapes.filter((r) => r.w <= 375).every((r) => r.visible === 2),
      shelfShapes.filter((r) => r.w <= 375));

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
    const dealsHrefs = await evaluate(client, `window.__qb.sectionHrefs('deals-title')`);
    const collectionHrefs = await evaluate(client, `window.__qb.sectionHrefs('collection-title')`);
    const shared = (a, b) => a.filter((href) => b.includes(href));
    record('35. homepage sections show distinct products with no repeated card',
      featuredHrefs.length === 6 && dealsHrefs.length === 4 && collectionHrefs.length === 8 &&
      shared(featuredHrefs, dealsHrefs).length === 0 &&
      shared(featuredHrefs, collectionHrefs).length === 0 &&
      shared(dealsHrefs, collectionHrefs).length === 0,
      { featured: featuredHrefs.length, offers: dealsHrefs.length, collection: collectionHrefs.length });

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
