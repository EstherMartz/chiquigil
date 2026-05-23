import type { Tier } from './submarineTypes';

export const DROP_RATES: Record<Tier, number> = {
  common: 0.30,
  uncommon: 0.15,
  rare: 0.05,
};

export const DROP_RATE_DISCLAIMER =
  'Drop rates are rough estimates based on community data tiers. Actual rates vary by submarine stats and RNG.';

/** Expected gil for a single loot item given its tier and market price. */
export function expectedGil(tier: Tier, price: number | null): number {
  if (price == null) return 0;
  return DROP_RATES[tier] * price;
}
