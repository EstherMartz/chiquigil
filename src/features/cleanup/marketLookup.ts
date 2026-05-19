import type { MarketBundle } from '../watchlist/useMarketData';
import type { MarketItem } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import type { MbScope } from './types';

export interface MbLookup {
  unit: number;
  listingCount: number;
  scope: MbScope;
}

/**
 * Cascade trusted-tier lookup: home (phantom) -> own DC -> cross-DC region.
 * Returns the first scope with a trusted tier for this item + HQ flag.
 *
 * Used by both runCleanup (deciding which bucket) and findCraftOpportunities
 * (pricing outputs + missing ingredients) so an item active only on other DCs
 * still surfaces instead of being treated as un-sellable / un-priceable.
 */
export function lookupMbTier(
  market: MarketBundle,
  itemId: number,
  isHq: boolean,
  canHq: boolean,
): MbLookup {
  const scopes: Array<{ key: 'phantom' | 'dc' | 'region'; scope: MbScope }> = [
    { key: 'phantom', scope: 'home' },
    { key: 'dc', scope: 'dc' },
    { key: 'region', scope: 'region' },
  ];
  for (const { key, scope } of scopes) {
    const m = (market[key] as Record<number, MarketItem | undefined>)[itemId];
    if (!m) continue;
    const tier = pickHighestTrustedTier(m, isHq ? 'hq' : 'nq', canHq);
    if (!tier) continue;
    const listingCount = (m as { listingCount?: number }).listingCount ?? 0;
    return { unit: tier.unit, listingCount, scope };
  }
  return { unit: 0, listingCount: 0, scope: null };
}
