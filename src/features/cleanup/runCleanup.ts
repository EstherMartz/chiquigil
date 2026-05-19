import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketBundle } from '../watchlist/useMarketData';
import { lookupMbTier } from './marketLookup';
import type { Bucket, CleanupRow, CleanupResult, CraftOpportunity, InventoryEntry } from './types';

const MB_OVER_VENDOR_RATIO = 1.1;
const MAX_OTHER_CRAFTS = 4;

export interface RunCleanupInput {
  inventory: InventoryEntry[];
  market: MarketBundle;
  items: Map<number, SnapshotItem>;
  craftOpportunities: Map<number, CraftOpportunity[]>;
  unrecognized: InventoryEntry[];
}

function buildRow(
  entry: InventoryEntry,
  market: MarketBundle,
  items: Map<number, SnapshotItem>,
  crafts: CraftOpportunity[] | undefined,
): CleanupRow {
  const item = items.get(entry.itemId);
  const priceLow = item?.priceLow ?? 0;
  const vendorRevenue = priceLow * entry.qty;

  const mb = lookupMbTier(market, entry.itemId, entry.isHq, item?.canHq ?? false);
  const mbRevenue = mb.unit * entry.qty;
  const mbListingCount = mb.listingCount;
  const mbScope = mb.scope;

  // MB suppression: needs revenue meaningfully above vendor, or vendor=0.
  const mbEligible = mb.unit > 0 && (vendorRevenue === 0 || mbRevenue > vendorRevenue * MB_OVER_VENDOR_RATIO);

  const bestCraft = crafts && crafts.length > 0 ? crafts[0] : null;
  const otherCrafts = crafts ? crafts.slice(1, 1 + MAX_OTHER_CRAFTS) : [];

  const craftScore = bestCraft?.netProfit ?? Number.NEGATIVE_INFINITY;
  const mbScore = mbEligible ? mbRevenue : 0;
  const vendorScore = vendorRevenue;

  let bucket: Bucket;
  // Any feasible craft wins — even at a loss. The alternative (MB or vendor)
  // is surfaced inline as runner-up so the user can compare without losing
  // the crafting suggestion to a bucket they'd never scroll back to.
  if (bestCraft) bucket = 'craft';
  else if (mbScore > 0 && mbScore >= vendorScore) bucket = 'sellMb';
  else if (vendorScore > 0) bucket = 'vendor';
  else bucket = 'discard';

  // runnerUp: the non-winning action with the highest non-zero value.
  const candidates: Array<{ action: Exclude<Bucket, 'discard'>; value: number }> = [];
  if (bucket !== 'craft' && bestCraft && craftScore > 0) candidates.push({ action: 'craft', value: craftScore });
  if (bucket !== 'sellMb' && mbScore > 0) candidates.push({ action: 'sellMb', value: mbScore });
  if (bucket !== 'vendor' && vendorScore > 0) candidates.push({ action: 'vendor', value: vendorScore });
  candidates.sort((a, b) => b.value - a.value);
  const runnerUp = candidates[0] ?? null;

  return {
    entry, vendorRevenue, mbRevenue, mbListingCount, mbScope,
    bestCraft, otherCrafts, bucket, runnerUp,
  };
}

function sortValue(r: CleanupRow): number {
  switch (r.bucket) {
    case 'craft':  return r.bestCraft?.netProfit ?? 0;
    case 'sellMb': return r.mbRevenue;
    case 'vendor': return r.vendorRevenue;
    case 'discard': return 0;
  }
}

export function runCleanup(input: RunCleanupInput): CleanupResult {
  const rows = input.inventory.map((entry) =>
    buildRow(entry, input.market, input.items, input.craftOpportunities.get(entry.itemId)),
  );

  const result: CleanupResult = {
    craft: rows.filter((r) => r.bucket === 'craft').sort((a, b) => sortValue(b) - sortValue(a)),
    sellMb: rows.filter((r) => r.bucket === 'sellMb').sort((a, b) => sortValue(b) - sortValue(a)),
    vendor: rows.filter((r) => r.bucket === 'vendor').sort((a, b) => sortValue(b) - sortValue(a)),
    discard: rows.filter((r) => r.bucket === 'discard'),
    unrecognized: input.unrecognized,
  };
  return result;
}
