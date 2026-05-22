/**
 * Shared per-item filters used by run*Flip runners and narrow* helpers.
 * Extracted to keep the velocity/maxListings check (used in 5+ places)
 * consistent — adding a new gate (e.g. minSales) should require touching
 * one file, not five.
 */
import type { MarketItem } from '../../lib/universalis';

export interface MarketGate {
  minVelocity: number;
  maxListings: number | null;
}

/**
 * True when the market item meets the gate. False otherwise.
 *
 * Encapsulates the recurring pattern:
 *   if (market.velocity < filter.minVelocity) continue;
 *   if (filter.maxListings != null && market.listingCount > filter.maxListings) continue;
 */
/** Item-search-category 58 = "Crystals" (shards / crystals / clusters). */
export const CRYSTALS_SEARCH_CATEGORY = 58;

export function passesMarketGate(market: MarketItem, gate: MarketGate): boolean {
  if (market.velocity < gate.minVelocity) return false;
  if (gate.maxListings != null && market.listingCount > gate.maxListings) return false;
  return true;
}
