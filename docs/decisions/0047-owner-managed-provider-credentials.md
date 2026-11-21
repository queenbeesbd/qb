# ADR 0047 - Provider credentials are entered in the panel, not in deployment variables

Status: accepted (owner direction, 2026-11-21). Extends the SteadFast exception already recorded in
`src/server/integrations/steadfast.ts` to the other owner-rotatable provider credentials. The
environment-only rule for **infrastructure** secrets is unchanged.

## Context

The panel already lets the owner enter SteadFast's key pair on Settings → Integrations. Resend,
BulkSMSBD and the Telegram bot instead take their credentials from deployment variables. The owner is
not a deployment engineer: rotating a key means editing Coolify, rebuilding the image and waiting for
a rollout, so keys stay stale or get pasted into messages. The SteadFast screen proved the better
shape: a form beside the other integrations, masked display, no value ever shown again.

These credentials are provider account secrets, not infrastructure. They do not bootstrap the database
connection or the app; the provider simply refuses a call when they are missing or wrong.

## Decision

1. **Owner-managed provider credentials live in `store_setting`.** Each is edited on the page it
   belongs to: the bot token under Telegram notifications, the Resend key and sender under Account
   email (with the store web address), and the BulkSMS pair under the new SMS verification page. Keys:
   `telegram.bot_token`, `resend.api_key`, `resend.from_email`, `app.base_url`,
   `bulksms.api_key`, `bulksms.sender_id`. They are written from Settings → Integrations behind
   `settings.write`, the same permission as SteadFast.
2. **The environment remains a fallback, not a second source of truth.** A saved panel value wins;
   when it is absent the provider module still reads the previous environment variable, so an existing
   deployment keeps working until the owner enters the value. No provider call is attempted with
   half a pair.
3. **Blanks keep the stored value; removal is explicit.** A field left empty on save does not erase a
   secret the owner cannot read back. Each field has its own "Remove stored value" checkbox, so a stray
   save cannot silently disconnect a provider.
4. **Values are never exposed.** The server reads them on use. The browser receives only whether a
   value is stored and a `••••last4` hint. No value appears in a redirect, a log line, a response body,
   an audit record or a client bundle. Audit rows carry presence and hints only, exactly as SteadFast
   already does.
5. **Infrastructure secrets stay in the environment.** `DATABASE_URL`, object-storage credentials,
   `QUEENBEES_ENV` and runtime flags cannot be stored in the database they are needed to reach, and
   production uses local persistent volumes rather than object storage. This ADR does not move them.
6. **Failure stays closed.** A missing or malformed credential makes the integration report
   `not_configured` or `unavailable`; callers do not vary a customer-facing answer on provider state,
   and no message is sent or claimed as sent.

## Consequences

- The owner can rotate a bot token or SMS key without a deploy. The next call uses the new value; no
  cache or restart is involved.
- A provider being off is now a database state as well as an environment state. The integrations hub
  states which source is in force without printing either.
- `settings.write` holders can read provider secrets by direct database access; that is the same trust
  already accepted for SteadFast. The panel never widens that group and never echoes the value.
- Tests keep their synchronous `source` parameter on the provider modules; the new database read lives
  in thin async resolvers used by application callers, so provider behaviour stays unit-testable.
