/**
 * GET /api/search?q= - the header's search suggestions (ADR 0041).
 *
 * **Why this exists.** The owner asked for the reference's type-ahead: typing a brand or a product
 * opens a short list of matches instead of throwing the customer onto the listing. That needs the
 * matches in the browser before a navigation happens, so this is the one read surface the storefront
 * exposes. ADR 0041 records the decision and narrows the "no public catalog endpoint" line ADR 0011 used
 * to draw.
 *
 * **What keeps it cheap.** It reads `getStorefrontCatalog()` - the same cached snapshot every storefront
 * page already uses, tagged under `storefront-catalog` and invalidated by every catalog write - so a
 * keystroke never adds a database read of its own. Neon's Free plan allows 5 GB of transfer a month and
 * this snapshot is the shop's largest transfer; the cache is what makes a per-keystroke search safe.
 *
 * **What it does not do.** It is not a listing: at most six rows, no facet counts, no paging and no
 * total. The selection and its ranking live in `selectSuggestions`, which shares the listing's matcher.
 * Nothing here is private - every row is a published product the shop already draws on its own pages -
 * and the response is never cached by a browser or a CDN.
 *
 * **A refusal is a normal state.** A term shorter than the popup's own floor, or a catalog that cannot
 * be read, answers `results: []` rather than an error: the field stays usable and Enter still searches
 * the listing.
 */

import {
  MIN_SUGGESTION_LETTERS,
  type SearchSuggestions,
} from '@/lib/search-suggestions';
import { normaliseForSearch } from '@/lib/format';
import { selectSuggestions } from '@/features/catalog/suggestions';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

export const dynamic = 'force-dynamic';

/** Matches `parseCatalogQuery`'s bound on a search term, so the popup and the listing agree. */
const MAX_QUERY = 80;

const NO_STORE = { 'cache-control': 'no-store' } as const;

function answer(query: string, results: SearchSuggestions['results']): Response {
  return Response.json({ query, results } satisfies SearchSuggestions, { headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY).trim();

  // A term too short to match anything meaningfully is answered without reading the catalog at all.
  if (normaliseForSearch(query).length < MIN_SUGGESTION_LETTERS) return answer(query, []);

  try {
    const catalog = await getStorefrontCatalog();
    return answer(query, selectSuggestions(catalog.products, query));
  } catch {
    // The catalog could not be read. The header closes its list and the form still works; the page the
    // customer is on already states a database failure through its own error boundary.
    return answer(query, []);
  }
}
