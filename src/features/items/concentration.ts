import type { WorldListing } from '../../lib/universalis';

export type RiskLevel = 'thin' | 'moderate' | 'deep';

export interface Concentration {
  hhi: number;           // 1/N … 1, sum of squared per-seller unit shares
  topSellerShare: number; // 0 … 1
  sellerCount: number;
  risk: RiskLevel;
}

const HHI_THIN = 0.5;     // at/above → one player can move the market
const HHI_MODERATE = 0.28; // at/above → some concentration

/** Herfindahl-Hirschman index over per-seller unit share for one quality tier. */
export function concentrationHHI(listings: WorldListing[], hq: boolean): Concentration | null {
  const rows = listings.filter((l) => l.hq === hq && l.price > 0 && l.seller);
  if (rows.length === 0) return null;

  const unitsBySeller = new Map<string, number>();
  let totalUnits = 0;
  for (const l of rows) {
    const q = l.quantity ?? 1;
    const seller = l.seller as string;
    unitsBySeller.set(seller, (unitsBySeller.get(seller) ?? 0) + q);
    totalUnits += q;
  }
  if (totalUnits === 0) return null;

  let hhi = 0;
  let topSellerShare = 0;
  for (const units of unitsBySeller.values()) {
    const share = units / totalUnits;
    hhi += share * share;
    if (share > topSellerShare) topSellerShare = share;
  }

  const sellerCount = unitsBySeller.size;
  const risk: RiskLevel =
    sellerCount <= 2 || hhi >= HHI_THIN ? 'thin'
    : hhi >= HHI_MODERATE ? 'moderate'
    : 'deep';

  return { hhi, topSellerShare, sellerCount, risk };
}
