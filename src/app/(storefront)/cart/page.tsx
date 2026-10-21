import type { Metadata } from 'next';
import { CartView } from '@/features/cart/CartView';

export const metadata: Metadata = { title: 'Cart' };

export default function CartPage() {
  return <CartView />;
}
