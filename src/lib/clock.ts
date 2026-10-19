/**
 * The request clock.
 *
 * Reading the wall clock is not a pure render operation, so it happens once per server render in a
 * named helper and travels to client components as a prop. That keeps client components pure and
 * makes every "waiting 3 hours" figure a statement about the request that produced the page, not
 * about the moment a component happened to re-render.
 */
export function requestNowIso(): string {
  return new Date().toISOString();
}
