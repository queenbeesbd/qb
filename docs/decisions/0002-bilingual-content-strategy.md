# ADR 0002 - Bilingual content strategy

- Status: accepted (owner-approved, Phase 1)
- Date: 2026-10-11

## Context

English and Bangla are both required, and the owner approved **Bangla as the default**. The Phase 0 audit found the existing storefront mixes English interface text with Bangla promotional copy, and publishes product names in English only. Translation must not be done by mechanical runtime substitution, and product content will exist in one language for the foreseeable future.

## Decision

1. **Interface copy** lives in one typed dictionary (`src/i18n/dictionaries.ts`) with semantic keys namespaced by area (`nav.*`, `catalog.*`, `product.*`, `cart.*`, `checkout.*`, `footer.*`, `error.*`, `validation.*`). Components never branch on locale and never hardcode interface text.
2. **Locale state** is a small external store read with `useSyncExternalStore`, persisted under a versioned key (`queenbees.locale.v1`). The server snapshot is always the approved default `bn`; the client snapshot is the saved preference.
3. **Missing values degrade to the approved default**, and unsupported stored values are discarded rather than honoured.
4. **Product content** is stored as `{ bn, en }` per field. The resolver returns the requested locale, then the other locale, then `null`. A `null` description renders an explicit "not published" message rather than invented copy.
5. **Numeral policy:** Bangla locale renders Bengali digits and the `৳` prefix; English renders Latin digits and the `Tk` prefix. Formatting is display-only - stored values are integer poisha and **never change with locale**.

## Rationale

- A typed key union makes missing or misspelled keys a compile error and lets `npm run check:i18n` assert bn/en parity plus placeholder-token equality per key.
- Per-field fallback is the only honest option while product copy is single-language; it also means adding merchant Bangla copy later requires no component changes.
- Using an external store avoids `setState` inside effects, which the React compiler rules in this Next version reject, and keeps hydration deterministic.

## Consequences

- Adding a locale means adding a dictionary and a locale entry; the toggle currently switches between exactly two.
- `document.documentElement.lang` is updated to match, so screen readers and font fallback behave correctly.
- Bangla typography is not assumed: the Bangla locale gets a longer base line-height, and letter-spacing is never applied to Bengali text.
- Product Bangla names in the demo catalog are transliterations pending native review (see `docs/catalog.md`).

## Verification

`npm run check:i18n` reports 124 keys present in both locales with matching placeholders. Browser checks confirm the toggle switches all interface copy, persists across reload, and that corrupt/unsupported stored values fall back to Bangla.
