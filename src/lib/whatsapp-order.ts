/**
 * "Order on WhatsApp" - the product page's one outbound ordering path.
 *
 * The owner's address is the **only** source of the conversation link: `support.whatsapp_url` from
 * Settings -> Support links, the same value the floating support rail uses. This module adds the
 * product to the message; it never invents a number, and it never rewrites a host.
 *
 * Only WhatsApp's own hosts are accepted, because that is the only place a `text` parameter is
 * honoured. A support link pointing anywhere else - a shortener, a Facebook page, a typo - yields
 * `null`, so the button is simply not rendered rather than opening something that is not WhatsApp.
 */

const WHATSAPP_HOSTS: Readonly<Record<string, true>> = {
  'wa.me': true,
  'www.wa.me': true,
  'api.whatsapp.com': true,
};

/**
 * The configured support link with `text` set, or `null` when it is not usable for ordering.
 *
 * An owner-supplied `text` is preserved: it is their own message, and silently replacing it would
 * change what they configured. Our product message is only added when the URL carries none.
 */
export function whatsappOrderHref(configuredUrl: string | null, message: string): string | null {
  if (configuredUrl === null || configuredUrl.trim() === '') return null;

  let url: URL;
  try {
    url = new URL(configuredUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (WHATSAPP_HOSTS[url.hostname] !== true) return null;

  if (url.searchParams.get('text') === null && message.trim() !== '') {
    url.searchParams.set('text', message);
  }
  return url.toString();
}

/**
 * The message a customer sends. It states what they are asking for, with the page they came from, so
 * the shop can price and confirm it in the conversation - nothing here promises a price, stock or
 * delivery time, because WhatsApp cannot check any of them.
 */
export function productOrderMessage(input: {
  readonly name: string;
  readonly pack: string | null;
  readonly url: string | null;
}): string {
  const name = input.pack === null ? input.name : `${input.name} (${input.pack})`;
  return input.url === null
    ? `Hello QueenBee's, I would like to order: ${name}`
    : `Hello QueenBee's, I would like to order: ${name} - ${input.url}`;
}
