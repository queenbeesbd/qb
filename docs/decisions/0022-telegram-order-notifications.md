# ADR 0022 - Telegram order notifications

- Status: accepted (owner request, 2026-10-23); decision 3 amended 2026-10-29 (owner request, see the amendment at the end)
- Phase: 39
- Supersedes: nothing. Does not change any payment, order or messaging policy.

## Context

The owner wanted to be told that an order exists without opening the admin panel. The shop already
holds everything such a message needs - reference, amount, area, who to call - and had no outbound
channel at all: there is no mail provider, no SMS provider and no webhook in this product (ADR 0012,
ADR 0015).

Telegram was chosen by the owner, with a bot already created for the store
(`@queenbees_orderbot`). It needs no sender identity, no domain and no webhook: a bot with a token can
send a message to any chat that has spoken to it first.

## Decision

1. **The bot token is deployment configuration, never data.** It is read from `TELEGRAM_BOT_TOKEN` in
   the process environment. It is not stored in the database, not returned to any page, not put in a
   log and not committed. `.env.example` carries a placeholder only. The admin screen therefore shows
   *whether* the bot is configured (`configured: true|false`) and can never show the token: a secret on
   a screen is a secret in a screenshot, a backup and a support paste.
2. **Recipients are rows, not a setting.** A new table `telegram_recipient` holds one row per
   destination: a human `label`, the numeric `chat_id`, and `is_active`. Each owner or staff member
   registers their own Telegram id, and **every active row receives every notification** - that is the
   whole fan-out rule, with no per-order addressing, no routing table and no priority.
3. **A recipient is paused by default, and can be removed when the row itself is the mistake.**
   Pausing keeps the id, so a mistyped id is corrected (the id is editable) rather than re-typed, and a
   paused destination resumes without touching Telegram again. **Removal deletes the row**, for a
   destination that should not be in the fan-out list at all: the test id registered while the bot was
   being set up, someone who has left. It sits behind a confirmation that names the destination and the
   id it is about to lose, it is audited, and the id is re-registerable - so the action is recoverable
   rather than final. The unique index on `chat_id` is what prevents the same destination being
   registered twice and the owner receiving two identical messages for one order.
4. **The send is scheduled after the response and can never fail the order.** Checkout calls
   `after()` (Next's post-response hook), which runs `notifyOrderPlaced` - a function that returns a
   summary instead of throwing and attempts each destination independently. A Telegram outage, a wrong
   chat id or a missing token changes nothing about the order, its totals or the customer's redirect.
5. **A replayed submission does not notify.** `createOrder` now reports `replayed: true` when it
   returned an earlier order for a repeated idempotency key, and the route notifies only when it did
   not. A customer's second click does not ring the owner's phone twice.
6. **Plain text, no parse mode.** Telegram's Markdown/HTML modes require escaping every interpolated
   value, and an escaped order number reads as a bug. The message states only what the shop knows:
   reference, amount, item count, area, customer name and phone, and "Cash on delivery · awaiting
   approval" - never a delivery promise and never a payment state the order does not have.
7. **Settings, not a queue.** Recipients are managed at **Settings → Integrations → Telegram** behind
   `settings.write`, and every change is audited
   (`integration.telegram_recipient_added|_updated|_activated|_paused|_removed`). The screen offers a **test
   message**, because Telegram's failure mode is silence: a chat id is only usable once that person has
   pressed Start, and until then every send fails without a trace anywhere the owner would look.

## Decisions deliberately not taken

- **No inbound webhook.** Commands, replies, approval buttons and delivery-status updates from
  Telegram are not read: that would make a chat message a command channel into commerce state, which
  needs its own authorization, its own audit design and a public HTTPS endpoint this product does not
  have.
- **No token-per-recipient, no OAuth bot install, no second provider.** One bot, one secret.
- **No message templates or per-event subscriptions.** One event - an order placed - and one message.
  Owner-driven status changes already have the panel, the COD worklist and their own notifications in
  the existing `customer_notification` table.
- **No queue, retry or delivery log.** A notification is a courtesy, not a record: the order is the
  record. A failed send is visible in the test button and the server log, and no table records it.
- **No customer-facing messages.** This channel reaches the owner, never a customer; marketing, order
  confirmations and delivery updates to customers remain out of scope (ADR 0012 has no provider).

## Consequences

- **A customer's name and phone number leave the platform** for Telegram's servers when an order is
  placed. That is the point of the feature - the owner needs to call - but it is a real data flow and it
  is stated on the screen, in this ADR and in `docs/security.md`'s data-flow list.
- **A deployment that does not set `TELEGRAM_BOT_TOKEN` is simply not notifying.** Nothing errors, the
  admin screen says "Bot not configured", and orders behave exactly as before.
- The schema grows to **46 tables** (migration `0009_telegram_recipients`, additive, one table, two
  indexes, two foreign keys, two checks).
- The Telegram id is a *user* id, not a phone number and not a username: `@name` is refused because it
  cannot be messaged without a lookup, and a phone number is not an address on Telegram.

## Amendment (2026-10-29, owner request): the roster can remove a destination

The owner registered a smoke-test destination while the bot was being set up and then found it could not
be removed: the roster offered **Pause** and nothing else, so the row stayed in the fan-out list for
good. Decision 3 above is the settled reading - pausing first, removal for a row that should not exist,
confirmed and audited. Two things are worth recording because they are not obvious from the code:

- **The deleted row is the only place its chat id lived.** The audit entry carries the label, the chat id
  and the active state as `before`, which is what makes "what was removed" answerable afterwards; the
  id is also on the screen before the dialog opens, so nothing is destroyed that the owner cannot type
  again.
- **A removal that finds nothing is not an error.** Two owners, or a page open since before someone else
  removed the row, reach the same delete with no row to delete; that answers "already gone" into the
  notice strip rather than a 500 or a false success.

## Verification

- `tests/unit/telegram.test.ts` (16 assertions, no network): token shape accepted/refused, chat id
  accepted/refused, message wording, singular/plural, missing-area wording, and "sends nothing" when
  the token or the roster is empty.
- Live: `getMe` returned `queenbees_orderbot` for the configured token; a real `sendMessage` to an
  unregistered id returned Telegram's own `chat not found` and was handled
  (`{attempted: 1, delivered: 0, failures: [...]}`); the token appeared nowhere in the rendered page.
- HTTP: add, duplicate refused, malformed id refused, test → `testFailed` (the fake id), pause →
  `noRecipients` on the next test, resume, anonymous page 307 to login, anonymous POST 401.
- **Not verified:** delivery to a real Telegram account (no owner chat id was available), the
  `after()` scheduling under a deployed runtime, and any behaviour of the Telegram app itself.
