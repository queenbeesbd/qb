import type { Metadata } from 'next';
import { CheckoutPreview } from '@/features/checkout/CheckoutPreview';

export const metadata: Metadata = {
  title: 'চেকআউট প্রিভিউ (ডেমো)',
  robots: { index: false, follow: false },
};

/**
 * Demo-only checkout preview. It deliberately contains no form fields, no
 * payment inputs and no submit action, so no order or payment can be created.
 * Real checkout belongs to a later phase after an authorised backend audit.
 */
export default function CheckoutPage() {
  return <CheckoutPreview />;
}
