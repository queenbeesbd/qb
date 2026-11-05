import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  composeOrderMessage,
  notifyOrderPlaced,
  parseChatId,
  readTelegramToken,
  telegramStatus,
  type OrderNotification,
} from '../../src/server/integrations/telegram';

/**
 * The Telegram integration's offline surface.
 *
 * The network is deliberately out of scope here: these tests cover what can be wrong *before* Telegram
 * is asked anything - the token's shape, the chat id's shape, the words in the message and the
 * decision not to send at all. Nothing in this file opens a connection, so it is safe to run anywhere.
 */

const VALID_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

describe('telegram token', () => {
  it('accepts a BotFather-shaped token and ignores surrounding whitespace', () => {
    assert.equal(readTelegramToken({ TELEGRAM_BOT_TOKEN: `  ${VALID_TOKEN}  ` }), VALID_TOKEN);
  });

  it('is absent, not broken, when the variable is unset', () => {
    assert.equal(readTelegramToken({}), null);
    assert.deepEqual(telegramStatus({}), { configured: false });
  });

  it('refuses a value that is not a token, so a typo cannot become a request', () => {
    assert.equal(readTelegramToken({ TELEGRAM_BOT_TOKEN: 'not-a-token' }), null);
    assert.equal(readTelegramToken({ TELEGRAM_BOT_TOKEN: '123456789:tooshort' }), null);
    assert.deepEqual(telegramStatus({ TELEGRAM_BOT_TOKEN: 'nope' }), { configured: false });
  });

  it('reports configured when a valid token is present', () => {
    assert.deepEqual(telegramStatus({ TELEGRAM_BOT_TOKEN: VALID_TOKEN }), { configured: true });
  });
});

describe('telegram chat id', () => {
  it('accepts a numeric user id', () => {
    assert.equal(parseChatId('123456789'), '123456789');
  });

  it('accepts a group id, which is negative', () => {
    assert.equal(parseChatId('-1001234567890'), '-1001234567890');
  });

  it('trims what was pasted', () => {
    assert.equal(parseChatId('  987654321 '), '987654321');
  });

  it('refuses anything that is not digits, so a @username is not silently stored', () => {
    assert.equal(parseChatId('@queenbees'), null);
    assert.equal(parseChatId('12ab34'), null);
    assert.equal(parseChatId(''), null);
    assert.equal(parseChatId('1234'), null);
    assert.equal(parseChatId(null), null);
  });
});

const ORDER: OrderNotification = {
  orderNumber: 'QB6F627EA11CCFA304',
  placedAt: new Date('2026-11-05T10:56:00Z'),
  itemsSubtotalMinor: 200000,
  shippingMinor: 13000,
  discountMinor: 0,
  totalMinor: 213000,
  items: [
    { nameEn: 'Nutty Chocolate Mini', variantLabel: '15 Piece Box', quantity: 1, lineTotalMinor: 100000 },
    { nameEn: 'Mixed Nut', variantLabel: '250gm', quantity: 1, lineTotalMinor: 100000 },
  ],
  districtCode: 'dhaka',
  recipientName: 'Nusrat Jahan',
  recipientPhone: '01712345678',
  addressLine: 'House 1, Road 2',
  area: 'Dhanmondi',
  city: 'Dhaka',
  deliveryNote: 'Call before coming',
};

describe('order notification message', () => {
  it('names the reference, the amount, the items and the area', () => {
    const message = composeOrderMessage(ORDER);
    assert.match(message, /QB6F627EA11CCFA304/);
    assert.match(message, /Tk 2,130/);
    assert.match(message, /2 items/);
    assert.match(message, /Dhaka/);
  });

  it('carries who to call, because approving a COD order starts with a phone call', () => {
    const message = composeOrderMessage(ORDER);
    assert.match(message, /Nusrat Jahan/);
    assert.match(message, /01712345678/);
  });

  it('never promises a delivery time or a payment state it does not have', () => {
    const message = composeOrderMessage(ORDER);
    assert.doesNotMatch(message, /delivered|tomorrow|within|guarantee/i);
    assert.match(message, /awaiting approval/);
  });

  it('says so when the area was not recorded, instead of guessing one', () => {
    const message = composeOrderMessage({ ...ORDER, districtCode: null });
    assert.match(message, /area not recorded/);
  });

  it('uses the singular for one item', () => {
    assert.match(composeOrderMessage({ ...ORDER, items: ORDER.items.slice(0, 1) }), /1 item\b/);
  });

  it('prints the recorded lines, the address and the customer note', () => {
    const message = composeOrderMessage(ORDER);
    assert.match(message, /1× Nutty Chocolate Mini \(<i>15 Piece Box<\/i>\) — Tk 1,000/);
    assert.match(message, /House 1, Road 2/);
    assert.match(message, /Dhanmondi, Dhaka/);
    assert.match(message, /Call before coming/);
  });

  it('bolds the section labels the owner scans for', () => {
    const message = composeOrderMessage(ORDER);
    assert.match(message, /<b>🛍️ New order · QB6F627EA11CCFA304<\/b>/);
    assert.match(message, /<b>📦 Items · 2 items<\/b>/);
    assert.match(message, /<b>Subtotal<\/b>/);
    assert.match(message, /<b>Total<\/b>/);
    assert.match(message, /<b>📍 Deliver to · Dhaka<\/b>/);
    assert.match(message, /<b>📝 Notes<\/b>/);
  });

  it('escapes order-supplied text so a note can never become markup', () => {
    const message = composeOrderMessage({
      ...ORDER,
      recipientName: '<b>Name</b>',
      deliveryNote: 'ring & <script>alert(1)</script>',
    });
    assert.match(message, /&lt;b&gt;Name&lt;\/b&gt;/);
    assert.match(message, /ring &amp; &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(message, /<script>/);
  });

  it('omits a blank contact line rather than printing whitespace', () => {
    const message = composeOrderMessage({ ...ORDER, recipientName: '   ', deliveryNote: null });
    assert.doesNotMatch(message, /\n[ \t]+\n/);
    assert.match(message, /01712345678/);
  });
});

describe('sending is skipped rather than attempted', () => {
  it('does nothing when no token is configured', async () => {
    const outcome = await notifyOrderPlaced(ORDER, { token: null });
    assert.deepEqual(outcome, { attempted: 0, delivered: 0, failures: [] });
  });

  it('does nothing when no destination is registered', async () => {
    const outcome = await notifyOrderPlaced(ORDER, { token: VALID_TOKEN, recipients: [] });
    assert.equal(outcome.attempted, 0);
  });
});
