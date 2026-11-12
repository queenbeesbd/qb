/**
 * The "added to cart" announcement, shared by every surface that adds a product.
 *
 * A card and a product page both put a product in the cart, and both need the same confirmation - so the
 * message lives in one tiny external store rather than in each component's state. The store is read with
 * `useSyncExternalStore`, like the cart itself: no context juggling, no state library, and a re-announce
 * is just a new `id`, which is what restarts the toast's animation for a second add.
 *
 * It carries **the product's own name** and nothing else, so the panel never has to guess what was added;
 * the count beside it comes from the cart store, which is the only place quantities live.
 */

export type CartToastMessage = {
  /** Bumped on every add, so the same product twice still replays the animation. */
  readonly id: number;
  readonly productName: string;
};

let current: CartToastMessage | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeCartToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCartToastSnapshot(): CartToastMessage | null {
  return current;
}

/** The server renders nothing here: a confirmation is an answer to a tap, not to a page load. */
export function getCartToastServerSnapshot(): CartToastMessage | null {
  return null;
}

/** Show the confirmation for one add. Called by the card's and the page's own add control. */
export function announceCartAdd(productName: string): void {
  current = { id: nextId, productName };
  nextId += 1;
  emit();
}

/** Dismiss it. Called by the close control and by the toast's own timer. */
export function dismissCartToast(): void {
  if (current === null) return;
  current = null;
  emit();
}
