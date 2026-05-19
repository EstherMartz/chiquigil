import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketBundle } from '../watchlist/useMarketData';
import type { MarketItem } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import type { Bucket, CleanupRow, CleanupResult, CraftOpportunity, InventoryEntry, MbScope } from './types';

const MB_OVER_VENDOR_RATIO = 1.1;
const MAX_OTHER_CRAFTS = 4;

export interface RunCleanupInput {
  inventory: InventoryEntry[];
  market: MarketBundle;
  items: Map<number, SnapshotItem>;
  craftOpportunities: Map<number, CraftOpportunity[]>;
  unrecognized: InventoryEntry[];
}

interface MbLookup { unit: number; listingCount: number; scope: MbScope }

/**
 * Cascade trusted-tier lookup: home -> own DC -> cross-DC region. Returns the
 * first scope that has a trusted tier for this item + HQ flag, so an item with
 * zero listings on the player's world can still be MB-recommended when buyers
 * elsewhere in the region are active.
 */
function lookupMb(market: MarketBundle, itemId: number, isHq: boolean, canHq: boolean): MbLookup {
  const scopes: Array<{ key: 'phantom' | 'dc' | 'region'; scope: MbScope }> = [
    { key: 'phantom', scope: 'home' },
    { key: 'dc',      scope: 'dc' },
    { key: 'region',  scope: 'region' },
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

function buildRow(
  entry: InventoryEntry,
  market: MarketBundle,
  items: Map<number, SnapshotItem>,
  crafts: CraftOpportunity[] | undefined,
): CleanupRow {
  const item = items.get(entry.itemId);
  const priceLow = item?.priceLow ?? 0;
  const vendorRevenue = priceLow * entry.qty;

  const mb = lookupMb(market, entry.itemId, entry.isHq, item?.canHq ?? false);
  const mbRevenue = mb.unit * entry.qty;
  const mbListingCount = mb.listingCount;
  const mbScope = mb.scope;

  // MB suppression: needs revenue meaningfully above vendor, or vendor=0.
  const mbEligible = mb.unit > 0 && (vendorRevenue === 0 || mbRevenue > vendorRevenue * MB_OVER_VENDOR_RATIO);

  const bestCraft = crafts && crafts.length > 0 ? crafts[0] : null;
  const otherCrafts = crafts ? crafts.slice(1, 1 + MAX_OTHER_CRAFTS) : [];

  const craftScore = bestCraft?.netProfit ?? 0;
  const mbScore = mbEligible ? mbRevenue : 0;
  const vendorScore = vendorRevenue;

  let bucket: Bucket;
  // Tie-break order: craft > mb > vendor > discard.
  if (craftScore > 0 && craftScore >= mbScore && craftScore >= vendorScore) bucket = 'craft';
  else if (mbScore > 0 && mbScore >= vendorScore) bucket = 'sellMb';
  else if (vendorScore > 0) bucket = 'vendor';
  else bucket = 'discard';

  // runnerUp: the non-winning action with the highest non-zero value.
  const candidates: Array<{ action: Exclude<Bucket, 'discard'>; value: number }> = [];
  if (bucket !== 'craft' && craftScore > 0) candidates.push({ action: 'craft', value: craftScore });
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
