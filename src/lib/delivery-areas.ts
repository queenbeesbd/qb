/**
 * The three delivery areas a customer can choose.
 *
 * One canonical list, imported by checkout and the owner's delivery settings. Matching is by the stable
 * `code`, never by a customer-typed name. Two areas can carry their own charge; every other district of
 * Bangladesh is the single `others` area and uses the required default charge.
 *
 * This replaced an earlier 64-district list: three choices are enough to express the approved pricing
 * model without asking the customer or the owner to maintain a long taxonomy.
 */

export type DeliveryAreaCode = 'dhaka' | 'chattogram' | 'others';

export type DeliveryArea = {
  readonly code: DeliveryAreaCode;
  /** The customer-facing name. English only, like the rest of the interface (Phase 28). */
  readonly name: string;
  /** True for the area priced by the required default rather than its own optional override. */
  readonly usesDefault: boolean;
};

export const DELIVERY_AREAS: readonly DeliveryArea[] = [
  { code: 'dhaka', name: 'Dhaka', usesDefault: false },
  { code: 'chattogram', name: 'Chattogram', usesDefault: false },
  { code: 'others', name: 'Other districts', usesDefault: true },
];

const BY_CODE = new Map<string, DeliveryArea>(DELIVERY_AREAS.map((area) => [area.code, area]));

export function deliveryAreaByCode(code: string): DeliveryArea | null {
  return BY_CODE.get(code) ?? null;
}

export function isDeliveryAreaCode(value: unknown): value is DeliveryAreaCode {
  return typeof value === 'string' && BY_CODE.has(value);
}

/** The area's name; an unknown code is returned unchanged so an old order still reads. */
export function deliveryAreaName(code: string): string {
  const area = BY_CODE.get(code);
  if (area === undefined) return code;
  return area.name;
}

/** The two areas with an optional override, in display order. */
export function overrideAreas(): readonly DeliveryArea[] {
  return DELIVERY_AREAS.filter((area) => !area.usesDefault);
}
