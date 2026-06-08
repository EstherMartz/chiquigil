import type { MarketItem, WorldListing } from '../../lib/universalis';
import { concentrationHHI, type RiskLevel } from '../items/concentration';
import { supplyDepth } from '../items/ActivityCard';
import { captureShare } from '../items/verdict/pricing';
import { depthBuckets, type DepthBucket } from '../items/depth';

export type { DepthBucket } from '../items/depth';
export type { RiskLevel } from '../items/concentration';

/** Composite competitive-safety label for entering a market as a new lister. */
export type CraftRisk = 'EMPTY' | 'OPEN' | 'HEALTHY' | 'CROWDED' | 'DOMINATED';

/** Worst-first ordering, used for the optional RISK sort and for filtering. */
export const RISK_ORDER: CraftRisk[] = ['DOMINATED', 'CROWDED', 'HEALTHY', 'OPEN', 'EMPTY'];

export type MaxRisk = 'any' | 'healthy' | 'open';

// Gap color thresholds (fraction of sale price). Shared with the SALE-cell gap line.
export const GAP_GREEN = 0.20;
export const GAP_AMBER = 0.05;

export interface ListingGap {
  cheapest: number;
  secondTier: number | null;
  gap: number;        // gil from cheapest to the next distinct price tier (0 when none)
  gapPct: number;     // gap / cheapest; Infinity when onlyListing; 0 when tied
  hasSecondTier: boolean;
  onlyListing: boolean; // <=1 listing in this tier — empty above you
  empty: boolean;       // 0 listings in this tier
}

/** Gap from the cheapest listing to the next strictly-higher price, for one quality tier. */
export function listingGap(listings: WorldListing[], hq: boolean): ListingGap {
  const prices = listings
    .filter((x) => x.hq === hq && x.price > 0)
    .map((x) => x.price)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return { cheapest: 0, secondTier: null, gap: 0, gapPct: 0, hasSecondTier: false, onlyListing: false, empty: true };
  }
  const cheapest = prices[0];
  const onlyListing = prices.length <= 1;
  const second = prices.find((p) => p > cheapest) ?? null;
  if (second == null) {
    // No higher tier. Either a single listing (open above you) or everything tied at one price.
    return {
      cheapest, secondTier: null, gap: 0,
      gapPct: onlyListing ? Infinity : 0,
      hasSecondTier: false, onlyListing, empty: false,
    };
  }
  const gap = second - cheapest;
  return {
    cheapest, secondTier: second, gap,
    gapPct: cheapest > 0 ? gap / cheapest : 0,
    hasSecondTier: true, onlyListing: false, empty: false,
  };
}

export interface CraftRiskInput {
  empty: boolean;
  onlyListing: boolean;
  gapPct: number;
  sellerCount: number;
  topSellerShare: number; // 0..1
  clearDays: number | null;
}

/**
 * Composite risk, applied in priority order (honors the PRD edge cases):
 *  1. No listings → EMPTY (best case for a new lister).
 *  2. A market held by ≤1 seller is wide open regardless of share.
 *  3. DOMINATED: one seller controls supply, or jammed prices with a crowd.
 *  4. OPEN: big breathing room, few/non-dominant sellers, sells through fast.
 *  5. CROWDED: jammed-with-a-crowd, a large seller crowd, or stock that just sits.
 *  6. Otherwise HEALTHY.
 */
export function classifyCraftRisk(a: CraftRiskInput): CraftRisk {
  if (a.empty) return 'EMPTY';
  if (a.onlyListing || a.sellerCount <= 1) return 'OPEN';

  if (a.topSellerShare > 0.60) return 'DOMINATED';
  if (a.gapPct < 0.02 && a.sellerCount > 5) return 'DOMINATED';

  if (a.gapPct >= GAP_GREEN && (a.sellerCount <= 3 || a.topSellerShare < 0.40)
      && a.clearDays !== null && a.clearDays < 3) return 'OPEN';

  // Tied/near-tied prices only count as crowded when there's an actual crowd;
  // a couple of sellers stacked at one price can still be HEALTHY (PRD edge case).
  if (a.gapPct < GAP_AMBER && a.sellerCount > 3) return 'CROWDED';
  if (a.sellerCount >= 8) return 'CROWDED';
  if (a.clearDays !== null && a.clearDays > 5) return 'CROWDED';

  return 'HEALTHY';
}

export function passesMaxRisk(risk: CraftRisk, max: MaxRisk): boolean {
  if (max === 'any') return true;
  if (max === 'open') return risk === 'OPEN' || risk === 'EMPTY';
  // 'healthy or better' — exclude CROWDED and DOMINATED.
  return risk !== 'CROWDED' && risk !== 'DOMINATED';
}

/** Everything the scan row + popover need about an item's competitive listing picture. */
export interface CraftListingAnalysis {
  risk: CraftRisk;
  gap: ListingGap;
  sellerCount: number;
  topSellerShare: number;       // 0..1
  concentrationRisk: RiskLevel; // 'thin' | 'moderate' | 'deep'
  clearDays: number | null;
  clearNote: string;
  captureRate: number;          // 0..1
  totalUnits: number;
  depth: DepthBucket[];
}

/** Analyze one item's listings for the chosen quality tier. */
export function analyzeCraftListings(m: MarketItem, hq: boolean): CraftListingAnalysis {
  const gap = listingGap(m.worldListings, hq);
  const conc = concentrationHHI(m.worldListings, hq);
  const { days, note } = supplyDepth(m.listingCount, m.velocity);
  const depth = depthBuckets(m.worldListings, hq);

  const sellerCount = conc?.sellerCount ?? 0;
  const topSellerShare = conc?.topSellerShare ?? 0;
  const totalUnits = depth.reduce((s, b) => s + b.units, 0);

  const risk = classifyCraftRisk({
    empty: gap.empty,
    onlyListing: gap.onlyListing,
    gapPct: gap.gapPct,
    sellerCount,
    topSellerShare,
    clearDays: days,
  });

  return {
    risk, gap, sellerCount, topSellerShare,
    concentrationRisk: conc?.risk ?? 'deep',
    clearDays: days, clearNote: note,
    captureRate: captureShare(m.listingCount),
    totalUnits, depth,
  };
}
