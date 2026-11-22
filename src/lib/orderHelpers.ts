import type { OrderRow } from './orderTypes';

/** 'COD' | 'THAWANI' | other gateway name | '—' */
export function getPaymentMethod(order: OrderRow): string {
  const method = order.payments?.[0]?.paymentMethod?.toUpperCase();
  if (method === 'COD') return 'COD';
  if (method === 'THAWANI') return 'THAWANI';
  return method || '—';
}

/** A real order: payment confirmed (paid/refunded) or Cash on Delivery. Unpaid online checkouts are not. */
export function isConfirmedOrder(order: OrderRow): boolean {
  if (order.paymentStatus === 'SUCCESS' || order.paymentStatus === 'REFUNDED') return true;
  return getPaymentMethod(order) === 'COD';
}

/** Online payment that was started but never completed (abandoned / still waiting) */
export function isAwaitingPayment(order: OrderRow): boolean {
  return getPaymentMethod(order) !== 'COD' && order.paymentStatus === 'PENDING' && order.orderStatus !== 'CANCELLED';
}

/** Ready for the team to act on: confirmed (paid online, or COD) and not yet shipped/finished */
export function needsAction(order: OrderRow): boolean {
  if (order.orderStatus !== 'PENDING' && order.orderStatus !== 'PROCESSING') return false;
  return !isAwaitingPayment(order);
}
