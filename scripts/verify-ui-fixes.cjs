#!/usr/bin/env node
/**
 * The UI audit's regression gate (ui_bug.md, UI-01 to UI-09), and nothing else.
 *
 * This is deliberately narrow. The project's two full suites - `verify:browser` and `verify:admin` -
 * cover the whole shop and take a long time; running them after every small change is waste. This
 * script drives only the nine defects the 2026-10-29 audit found, against a served build, in well
 * under a minute. Run the full suites at a phase checkpoint, or on request.
 *
 * Usage:
 *   npm run build && npx next start -p 3000 &
 *   QUEENBEES_ADMIN_EMAIL=... QUEENBEES_ADMIN_PASSWORD=... node scripts/verify-ui-fixes.cjs
 *
 * Chromium is driven over the DevTools protocol with Node built-ins only, so this adds no dependency.
 * Exits non-zero if a check fails. A check that cannot run (no customer row, no discounted product)
 * is reported as SKIP with its reason - never as a pass.
 */
const http = require('node:http');
const { spawn } = require('node:child_process');

const APP = process.env.QUEENBEES_BASE_URL || process.argv[2] || 'http://localhost:3000';
const EMAIL = process.env.QUEENBEES_ADMIN_EMAIL || '';
const PASSWORD = process.env.QUEENBEES_ADMIN_PASSWORD || '';
const CDP = 9229;
const results = [];
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

class Cdp {
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

async function evalIn(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    // Name the expression that broke: a syntax error in a probe string is otherwise anonymous.
    const snippet = expression.replace(/\s+/g, ' ').slice(0, 90);
    throw new Error(
      response.exceptionDetails.text + ' ' + (response.exceptionDetails.exception?.description || '') +
        ' | in: ' + snippet,
    );
  }
  return response.result.value;
}

async function nav(client, path) {
  await client.send('Page.navigate', { url: APP + path });
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    const state = await evalIn(client, 'document.readyState');
    if (state === 'complete') break;
  }
  await sleep(220);
}

async function viewport(client, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 720,
  });
}

function record(step, ok, detail) {
  results.push({ step, ok: Boolean(ok), detail: JSON.stringify(detail) });
}

function skip(step, reason) {
  results.push({ step, ok: true, skipped: true, detail: reason });
}

async function main() {
  if (EMAIL === '' || PASSWORD === '') {
    console.error('Set QUEENBEES_ADMIN_EMAIL and QUEENBEES_ADMIN_PASSWORD: the admin checks sign in.');
    process.exit(2);
  }

  const chrome = spawn(
    'chromium',
    ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--remote-debugging-port=' + CDP, '--window-size=1280,900', 'about:blank'],
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
    const client = new Cdp(ws);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });

    await viewport(client, 390, 844);
    await nav(client, '/qbpanel/login');
    await evalIn(client, `(() => {
      const set = (id, value) => {
        const el = document.getElementById(id);
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('login-email', ${JSON.stringify(EMAIL)});
      set('login-password', ${JSON.stringify(PASSWORD)});
      document.getElementById('login-email').form.requestSubmit();
    })()`);
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      if ((await evalIn(client, 'location.pathname')) !== '/qbpanel/login') break;
    }
    if ((await evalIn(client, 'location.pathname')) === '/qbpanel/login') {
      throw new Error('admin sign-in failed: check QUEENBEES_ADMIN_EMAIL / QUEENBEES_ADMIN_PASSWORD');
    }

    /*
     * UI-01 - a focused field must never sit under the fixed phone navigation.
     * Both reported cases: the delivery amount and the product description.
     */
    const clearance = async (route, selector) => {
      await nav(client, route);
      await evalIn(client, `document.querySelector(${JSON.stringify(selector)}).focus()`);
      await sleep(500);
      return evalIn(client, `(() => {
        const field = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        const bar = document.querySelector('[data-admin-bottom-nav]');
        const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
        return { fieldBottom: Math.round(field.bottom), barTop: Math.round(barTop) };
      })()`);
    };
    const deliveryFocus = await clearance('/qbpanel/settings/delivery', '#delivery-default-amount');
    const descriptionFocus = await clearance('/qbpanel/catalog/new', '#descriptionEn');
    record('UI-01 focused admin fields clear the fixed bottom navigation',
      deliveryFocus.fieldBottom < deliveryFocus.barTop && descriptionFocus.fieldBottom < descriptionFocus.barTop,
      { deliveryFocus, descriptionFocus });

    /*
     * UI-02 - the promo editor uses the shared admin control: 40px and 16px on a phone.
     */
    await nav(client, '/qbpanel/promo-codes/new');
    const promoControls = await evalIn(client, `[...document.querySelectorAll('form input:not([type=hidden]), form select')]
      .map((el) => ({ name: el.getAttribute('name'), height: Math.round(el.getBoundingClientRect().height), font: getComputedStyle(el).fontSize }))`);
    record('UI-02 promo inputs and selects are 40px/16px shared controls',
      promoControls.length > 0 && promoControls.every((c) => c.height === 40 && c.font === '16px'),
      promoControls);

    /*
     * UI-03 - an invalid create submission states its problems, marks the fields, and focuses the first.
     */
    await evalIn(client, `[...document.querySelectorAll('button')].find((b) => /create code/i.test(b.textContent)).click()`);
    await sleep(400);
    const promoInvalid = await evalIn(client, `(() => {
      const alert = document.querySelector('[role="alert"]');
      return {
        path: location.pathname,
        items: alert ? alert.querySelectorAll('li').length : 0,
        text: alert ? alert.innerText.replace(/\\s+/g, ' ').trim() : null,
        invalid: [...document.querySelectorAll('[aria-invalid="true"]')].map((el) => el.getAttribute('name')),
        focused: document.activeElement ? document.activeElement.getAttribute('name') : null,
      };
    })()`);
    record('UI-03 an invalid promo submission shows a named summary, marks fields and focuses the first',
      promoInvalid.path === '/qbpanel/promo-codes/new' && promoInvalid.items >= 2 &&
      promoInvalid.invalid.includes('code') && promoInvalid.focused === 'code',
      promoInvalid);

    /*
     * UI-04 - the money fields fit a 320px screen without widening the document.
     */
    await viewport(client, 320, 800);
    await nav(client, '/qbpanel/catalog/new');
    const narrowMoney = await evalIn(client, `(() => {
      const price = document.querySelector('input[name="price"]');
      const wrapper = price.closest('div');
      const card = wrapper.closest('section');
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        wrapperRight: Math.round(wrapper.getBoundingClientRect().right),
        cardRight: Math.round(card.getBoundingClientRect().right),
      };
    })()`);
    record('UI-04 product money inputs fit 320px with no page overflow',
      narrowMoney.scrollWidth <= narrowMoney.innerWidth && narrowMoney.wrapperRight <= narrowMoney.cardRight,
      narrowMoney);

    /*
     * UI-05 - the customer recovery panel separates its field group from its button.
     */
    await viewport(client, 390, 844);
    await nav(client, '/qbpanel/customers');
    const customerHref = await evalIn(client, `(() => {
      const link = [...document.querySelectorAll('main a[href^="/qbpanel/customers/"]')]
        .map((a) => a.getAttribute('href'))
        .find((href) => {
          // No regex here on purpose: a slash escape inside this template literal would collapse the
          // regex delimiter and break the whole probe.
          const id = href.slice('/qbpanel/customers/'.length);
          return id !== '' && String(Number(id)) === id;
        });
      return link || null;
    })()`);
    if (customerHref === null) {
      skip('UI-05 the recovery panel separates its field group from its button', 'this database has no customer row');
    } else {
      await nav(client, customerHref);
      const recovery = await evalIn(client, `(() => {
        const form = document.querySelector('form[action="/api/qbpanel/customers/recovery"]');
        if (!form) return { missing: true };
        const field = form.querySelector('textarea');
        const button = form.querySelector('button[type="submit"]');
        return {
          gap: Math.round(button.getBoundingClientRect().top - field.getBoundingClientRect().bottom),
          font: getComputedStyle(field).fontSize,
          border: getComputedStyle(field).borderTopWidth,
        };
      })()`);
      record('UI-05 the recovery panel separates its field group from its button',
        recovery.missing !== true && recovery.gap >= 16 && recovery.font === '16px' && recovery.border === '1px',
        recovery);
    }

    /*
     * UI-06 - all three analytics period labels are readable at 320px.
     */
    await viewport(client, 320, 800);
    await nav(client, '/qbpanel/analytics');
    const periodTabs = await evalIn(client, `(() => {
      const nav = [...document.querySelectorAll('nav[aria-label]')].find((n) => /last 90 days/i.test(n.textContent));
      const links = [...nav.querySelectorAll('a')].map((a) => {
        const r = a.getBoundingClientRect();
        return { label: a.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right) };
      });
      return { links, innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
    })()`);
    record('UI-06 every analytics period label is fully readable at 320px',
      periodTabs.links.length === 3 &&
      periodTabs.links.every((l) => l.left >= 0 && l.right <= periodTabs.innerWidth) &&
      periodTabs.scrollWidth <= periodTabs.innerWidth,
      periodTabs);

    /*
     * UI-07 - the mobile brand and every product title are 40px targets.
     */
    await viewport(client, 390, 844);
    await nav(client, '/qbpanel');
    const brandTarget = await evalIn(client, `(() => {
      const link = document.querySelector('header a[aria-label]');
      const r = link.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    })()`);
    await nav(client, '/qbpanel/catalog');
    const titleTargets = await evalIn(client, `[...document.querySelectorAll('main a[href^="/qbpanel/catalog/"]')]
      .filter((a) => a.getBoundingClientRect().height > 0)
      .slice(0, 8)
      .map((a) => Math.round(a.getBoundingClientRect().height))`);
    record('UI-07 the mobile brand and product title links are 40px targets',
      brandTarget.width >= 40 && brandTarget.height >= 40 &&
      titleTargets.length > 0 && titleTargets.every((h) => h >= 40),
      { brandTarget, titleTargets });

    /*
     * UI-08 - the audit table says that it scrolls, and is reachable by keyboard.
     */
    await nav(client, '/qbpanel/audit');
    const auditRegion = await evalIn(client, `(() => {
      const region = document.querySelector('[data-table-scroller]');
      if (!region) return { missing: true };
      const frame = region.parentElement;
      const hint = [...document.querySelectorAll('p')].find((p) => /scroll sideways/i.test(p.textContent));
      return {
        role: region.getAttribute('role'),
        tabIndex: region.getAttribute('tabindex'),
        label: region.getAttribute('aria-label'),
        scrollable: region.scrollWidth > region.clientWidth,
        hint: hint ? hint.textContent.trim() : null,
        fade: frame ? getComputedStyle(frame, '::after').content : null,
      };
    })()`);
    record('UI-08 the audit table is a labelled, focusable region with a scroll cue',
      auditRegion.missing !== true && auditRegion.role === 'region' && auditRegion.tabIndex === '0' &&
      typeof auditRegion.label === 'string' && auditRegion.label.length > 0 &&
      (auditRegion.scrollable === false || (auditRegion.hint !== null && auditRegion.fade !== 'none')),
      auditRegion);

    /*
     * UI-09 - a spanning odd related card is not an oversized portrait.
     */
    await nav(client, '/products');
    const productHref = await evalIn(client, `(() => {
      const link = [...document.querySelectorAll('main a[href^="/products/"]')][0];
      return link ? link.getAttribute('href') : null;
    })()`);
    await viewport(client, 390, 844);
    await nav(client, productHref);
    const related = await evalIn(client, `(() => {
      const heading = document.getElementById('related-title');
      if (!heading) return { missing: true };
      const section = heading.closest('section');
      const cards = [...section.querySelectorAll('ul > li > *')];
      if (cards.length < 2) return { missing: true };
      const sizes = cards.map((card) => {
        const r = card.getBoundingClientRect();
        const photo = card.querySelector('img');
        const pr = photo ? photo.getBoundingClientRect() : null;
        return { width: Math.round(r.width), height: Math.round(r.height), photoWidth: pr ? Math.round(pr.width) : null };
      });
      return {
        count: sizes.length,
        sizes,
        odd: section.querySelector('ul').getAttribute('data-count-odd'),
        spanMode: section.querySelector('ul').getAttribute('data-odd-last'),
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    })()`);
    const lastCard = related.missing ? null : related.sizes[related.sizes.length - 1];
    const sibling = related.missing ? null : related.sizes[0];
    record('UI-09 a spanning related card stays beside its photograph instead of stretching it',
      related.missing !== true && related.scrollWidth <= related.innerWidth &&
      related.odd === 'true' && related.spanMode === 'wide' &&
      lastCard.width > sibling.width &&
      lastCard.photoWidth <= sibling.photoWidth + 8 &&
      lastCard.height <= sibling.height,
      related);
  } catch (error) {
    record('ui-fix suite completed', false, String(error && error.message));
  } finally {
    chrome.kill('SIGKILL');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\nUI-fix verification against ' + APP + '\n');
  for (const r of results) {
    const tag = r.ok ? (r.skipped ? 'SKIP' : 'PASS') : 'FAIL';
    console.log('  ' + tag + '  ' + r.step);
    if (!r.ok || r.skipped) console.log('        ' + r.detail);
  }
  const skippedCount = results.filter((r) => r.skipped).length;
  console.log('\n' + (results.length - failed.length - skippedCount) + ' passed, ' + skippedCount + ' skipped, ' + failed.length + ' failed.');
  if (failed.length > 0) process.exitCode = 1;
}

main();
