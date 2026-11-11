/**
 * How many circles the two discovery rails publish, per width (owner direction, 2026-11-12).
 *
 * They are a shelf, not the index: on a desktop a shopper sees a generous run of departments or
 * brands and swipes further if they want, and on a phone the row stops earlier because every extra
 * circle is another screenful of thumb travel. The full list always has a home at `/categories` or
 * `/brands`, which is what the trailing circle links to.
 *
 * The phone number is also the point at which the trailing "View all" circle appears: a shop with
 * fourteen brands loses nothing by showing all fourteen, so it gets no extra control; a shop with
 * sixteen gets one, because the phone would otherwise hide two with no way to reach them.
 *
 * The phone cut is applied in CSS (`Carousel`'s `mobileLimit`), so the server renders the desktop
 * number and nothing has to be measured or guessed in the browser.
 */
export const RAIL_DESKTOP_LIMIT = 20;
export const RAIL_MOBILE_LIMIT = 15;
