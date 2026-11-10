/**
 * The checkout payment notice, as published.
 *
 * **Static by owner decision (2026-11-10).** This copy used to be owner-editable at
 * Settings -> Other settings -> Checkout instructions and stored in `store_setting`
 * (`payment.instructions`). The owner no longer wants the wording controlled from the back office: the
 * terms are the shop's standing policy, so they live here as code and the admin screen does not edit
 * them. The advance-payment **number**, its visibility switch, the "Payment, not Send Money" caution and
 * the advance threshold are still settings, because they are facts about where to send money.
 *
 * One entry per printed line. A line carrying `whatsapp` draws the mark beside that number, inside the
 * sentence the owner wrote - there is no second WhatsApp card.
 *
 * `check:i18n` scans application code for Bengali; this file is on its data allowlist because the
 * owner's own payment notice is a record, exactly like a product's Bengali name.
 */

/** One printed line. `before` is printed as written; `whatsapp` is the number the mark sits beside. */
export type PaymentNoticeLine = {
  readonly before: string;
  readonly whatsapp?: string;
  readonly after?: string;
};

/** Bangla: the advance-delivery rule, the gift note, where to send the screenshot, and the COD option. */
export const CHECKOUT_PAYMENT_NOTICE: readonly PaymentNoticeLine[] = [
  {
    before:
      '📍৫০০ টাকার নিচের অর্ডারের জন্য ডেলিভারি চার্জ এডভান্স পেমেন্ট করতে হবে ✅',
  },
  {
    before:
      '📍এডভান্স পেমেন্টের জন্য আমাদের মার্চেন্ট বিকাশ নাম্বারে Payment করে স্ক্রিনশট দিবেন Business Whatsapp এ - ',
    whatsapp: '01871161571',
    after: ' ✅',
  },
  {
    before:
      '📍ফুল পেমেন্ট এডভান্স করে অর্ডার প্লেস করলে পার্সেলের সাথে ছোট্ট একটা সারপ্রাইজ গিফট থাকবে (গিফট এর জন্য মিনিমাম অর্ডার ভ্যালু ৫০০৳ হতে হবে)✅',
  },
  {
    before: '📍এছাড়াও Full Cash On Delivery এভেইলেবল রয়েছে ✅',
  },
];

/** The merchant bKash number the owner published. */
export const DEFAULT_BKASH_NUMBER = '01560035645';

/** Bangla: pay, do not send money. */
export const DEFAULT_SEND_MONEY_NOTE = '(Bkash Payment করবেন, Send Money নয় ❌)';

/**
 * Below this goods subtotal the delivery charge is payable in advance. 500 BDT, in poisha.
 *
 * It is a **setting**, not a constant, because it is a money threshold; this is only the default the
 * owner starts from.
 */
export const DEFAULT_ADVANCE_THRESHOLD_MINOR = 50_000;
