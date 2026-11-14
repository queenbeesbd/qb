/**
 * A delivery address as one readable line.
 *
 * The street line comes first because that is what the courier reads, then the district, then any area,
 * city and postcode the order recorded. `area`, `city` and `postcode` are optional: the checkout form
 * stopped collecting them (2026-11-14), while orders placed before that still carry them, and the rows
 * written by the catalog import carry an area alone. Each part is included only when it has text, so a
 * blank part never leaves a separator behind.
 */

import { deliveryAreaName } from './delivery-areas';

export function deliveryAddressText(address: {
  readonly addressLine: string;
  readonly districtCode: string | null;
  readonly area?: string | null;
  readonly city?: string | null;
  readonly postcode?: string | null;
}): string {
  return [
    address.addressLine,
    address.districtCode === null ? '' : deliveryAreaName(address.districtCode),
    address.area ?? '',
    address.city ?? '',
    address.postcode ?? '',
  ]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(', ');
}
