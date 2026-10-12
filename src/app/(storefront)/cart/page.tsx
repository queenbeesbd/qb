import type { Metadata } from 'next';
import { CartView } from '@/features/cart/CartView';

export const metadata: Metadata = { title: 'কার্ট' };

export default function CartPage() {
  return <CartView />;
}
