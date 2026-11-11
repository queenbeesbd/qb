# 0036 - Phone or email as the customer account identifier

**Date:** 2026-11-11
**Status:** Accepted (owner direction)
**Amends:** ADR 0012 (customer authentication), ADR 0030 (email account security)

## Context

Customer accounts were email-only (D17, ADR 0012). Registration collected an email and a password,
sign-in accepted the email, and no verification step existed. `customer.phone` existed as an optional
contact field with a shape check but no uniqueness, and `account_recovery_token` already reserved the
`email_verify` purpose.

The owner asked for the ordinary modern-app pattern: register with a **mobile number** by default, with
a switch to register with an **email address** instead; sign in the same way; and send a **Resend
verification mail** for the address. The owner also stated that the phone number is not configured for
verification yet - there is no SMS provider - so no code may be promised now.

## Decision

1. **Two sign-in identifiers, one account.** An account can be signed in with its email address or,
   when one is stored, its Bangladeshi mobile number. There is no "primary identifier" column: the
   identifier used at registration decides only what the form requires, not what the account accepts
   later.
2. **Phone is the default registration mode.** A phone-first registration requires a mobile number in
   the schema's canonical form (`01[3-9]` plus eight digits). Spacing, dashes, brackets and an optional
   `880` prefix are normalised before storage. `customer_phone_unique` (partial, where the number is
   not null) makes one number name exactly one account.
3. **Email is required in both modes.** A phone-first account still gives an address, because the
   mailed recovery link is the only self-service way back in. Email-only registration remains available
   through the switch.
4. **Email verification is not a gate.** Registration creates a usable account and session
   immediately. A Resend verification message is scheduled after the transaction commits. The account
   page states whether the address is confirmed and offers one resend. The link works once, expires in
   48 hours, and a second click is a dead link. Every generated link supersedes the previous one.
5. **No phone verification.** No SMS provider, code, one-time password or number-confirmation step
   exists. The account records only that the number was typed. Adding a provider later is a new owner
   decision and a new mail/SMS surface, not an implied part of this one.
6. **Recovery stays by email.** The self-service reset link (ADR 0030) is unchanged. A recovery request
   still answers identically whether the address is registered or not. A completed reset also marks the
   address confirmed, because opening a mailed single-use link proves control of it.
7. **Sign-in by phone is password-based.** The same scrypt credential, the same account/source
   throttling, the same generic failure and the same session mint are used for both identifiers.

## Why

Phone-first registration matches how the shop's customers are reached, but a phone number alone cannot
recover an account without an SMS provider. Requiring the address keeps recovery honest instead of
silently discovering, at the first forgotten password, that there is no way back in. Letting the
account work before verification avoids turning a mail outage or a spam folder into a lost sale, and
the owner's own shop is cash-on-delivery, so there is no payment credential the unverified state puts
at risk.

The verification link still has value: it marks the recovery address as one the customer controls and
gives them a visible account-security fact. It is not presented as a condition of shopping.

## Consequences

- Migration `0028_account_phone_identifier` adds `customer_phone_unique`. It is additive; existing
  accounts, credentials, sessions and orders are untouched. `customer.email` stays `NOT NULL`.
- A new account can be created with a phone and no verified email; the account screen says the address
  is unconfirmed. Nothing in the storefront or checkout reads that state as a gate.
- A phone-first account that mistypes its recovery address can still shop. Recovery is the one thing
  the typo can break, and the interface states that the address is unconfirmed.
- `customer.email_verified` is appended to the audit vocabulary as a `system` record, like the other
  completed account-security actions. A customer is still never an audit actor (D23).
- The registration and sign-in forms switch identifier by **link**, not client state, so the choice
  survives a POST refusal and works without JavaScript.
- The Resend configuration requirement is unchanged and now covers five messages: the four account
  security messages from ADR 0030 plus the registration verification. `RESEND_API_KEY` and
  `EMAIL_FROM` must both be present in the deployment, with a verified sender domain, and
  `APP_BASE_URL` must name the deployed origin. None of these values is stored in the repository.

## Not decided here

- SMS verification of the number, phone-number change, or recovery by phone.
- Passwordless or OTP sign-in.
- A customer-editable phone number (the account page shows it; it does not edit it).
- Any merge of two accounts that share a number or an address.
