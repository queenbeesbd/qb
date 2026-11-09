/**
 * The owner's payment instructions, as published on checkout.
 *
 * **These are owner records, not interface copy** (the same rule the catalog and the delivery-area list
 * follow): the shop writes the words its customers read about paying, and the checkout prints them
 * verbatim. They are stored in `store_setting` (`payment.instructions`, `payment.bkash_number`,
 * `payment.bkash_visible`, `payment.send_money_note`, `payment.advance_threshold_minor`) and edited at
 * **Settings -> Other settings -> Checkout instructions**, so changing the number or the wording is a
 * data edit, not a deploy.
 *
 * The values below are the **defaults used until the owner saves a value**, and they are exactly the
 * copy the owner supplied. The number is validated as an 11-digit Bangladeshi mobile before it is
 * stored, and the text refuses `<` and `>` - it is rendered as plain paragraphs, never as markup.
 *
 * `check:i18n` scans application code for Bengali; this file is on its data allowlist because the
 * owner's own payment notice is a record, exactly like a product's Bengali name.
 */

/** Bangla: the advance-delivery rule, the gift note, and how to pay. Rendered one paragraph per line. */
export const DEFAULT_PAYMENT_INSTRUCTIONS = [
  '৫০০ টাকার নিচের অর্ডারের জন্য ডেলিভারি চার্জ এডভান্স পেমেন্ট করতে হবে।',
  '৫০০৳+ অর্ডারে ফুল পেমেন্ট এডভান্সে থাকছে সারপ্রাইজ গিফট।',
  'এডভান্স পেমেন্টের জন্য আমাদের মার্চেন্ট বিকাশ নাম্বারে Payment করে স্ক্রিনশট দিবেন ইনবক্সে।',
  'ফুল পেমেন্ট এডভান্স করে অর্ডার প্লেস করলে পার্সেলের সাথে ছোট্ট একটা সারপ্রাইজ গিফট থাকবে। অথবা ক্যাশ অন ডেলিভারিতেও নিতে পারবেন।🫶🏻',
].join('\n');

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
