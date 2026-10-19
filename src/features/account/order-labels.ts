import type { TranslationKey } from '@/i18n/dictionaries';

/**
 * Order-state labels.
 *
 * The order carries separate state columns by design (fulfilment, prepaid payment, COD). Each closed set
 * is mapped to a translation key here so no view can print a raw database value to a customer, and an
 * unrecognised value degrades to a stated "unknown" rather than being shown verbatim.
 */

export const STATUS_LABELS: Record<string, TranslationKey> = {
  pending: 'orders.status.pending',
  confirmed: 'orders.status.confirmed',
  processing: 'orders.status.processing',
  shipped: 'orders.status.shipped',
  delivered: 'orders.status.delivered',
  completed: 'orders.status.completed',
  cancelled: 'orders.status.cancelled',
  returned: 'orders.status.returned',
};

export const PAYMENT_LABELS: Record<string, TranslationKey> = {
  awaiting_payment: 'orders.payment.awaiting_payment',
  awaiting_verification: 'orders.payment.awaiting_verification',
  verified: 'orders.payment.verified',
  rejected: 'orders.payment.rejected',
  falsely_claimed: 'orders.payment.falsely_claimed',
  expired: 'orders.payment.expired',
};

export const COD_LABELS: Record<string, TranslationKey> = {
  cod_pending_approval: 'orders.cod.cod_pending_approval',
  cod_approved: 'orders.cod.cod_approved',
  cod_collected: 'orders.cod.cod_collected',
  cod_failed: 'orders.cod.cod_failed',
  cod_reconciled: 'orders.cod.cod_reconciled',
};

export const METHOD_LABELS: Record<string, TranslationKey> = {
  bkash: 'orders.method.bkash',
  nagad: 'orders.method.nagad',
  cod: 'orders.method.cod',
};

export function statusLabel(value: string): TranslationKey {
  return STATUS_LABELS[value] ?? 'orders.status.unknown';
}

/** The payment line: an MFS order shows its prepaid state, a COD order its own lifecycle state. */
export function paymentLabel(paymentMethod: string, paymentState: string, codState: string): TranslationKey {
  if (paymentMethod === 'cod') return COD_LABELS[codState] ?? 'orders.cod.unknown';
  return PAYMENT_LABELS[paymentState] ?? 'orders.payment.unknown';
}

export function methodLabel(value: string): TranslationKey {
  return METHOD_LABELS[value] ?? 'orders.method.unknown';
}

