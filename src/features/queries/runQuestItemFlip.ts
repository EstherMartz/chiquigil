import type { MarketData } from '../../lib/universalis';
import type { SnapshotQuest } from '../../lib/questSnapshot';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { pickHighestTrustedTier } from '../../lib/priceTrust';

export type HqMode = 'hq' | 'nq' | 'either';

export interface QuestItemFilter {
  hq: HqMode;
  minListings: number;
  search: string;          // matches itemName substring (case-insensitive)
  categorySearch: string;  // matches categoryName substring (case-insensitive)
}

export function defaultQuestItemFilter(): QuestItemFilter {
  return { hq: 'hq', minListings: 0, search: '', categorySearch: '' };
}

export interface QuestItemRow {
  questId: number;
  questName: string;
  categoryName: string;
  level: number;
  itemId: number;
  itemName: string;
  qty: number;
  nqPrice: number | null;
  hqPrice: number | null;
  listingCount: number;
  velocity: number;
  totalRevenue: number;
}

function priceForRanking(row: { nqPrice: number | null; hqPrice: number | null }, hq: HqMode): number {
  if (hq === 'hq') return row.hqPrice ?? 0;
  if (hq === 'nq') return row.nqPrice ?? 0;
  return Math.max(row.nqPrice ?? 0, row.hqPrice ?? 0);
}

export function runQuestItemFlip(
  snapshot: SnapshotQuest[],
  itemsById: Map<number, SnapshotItem>,
  market: MarketData,
  filter: QuestItemFilter,
): QuestItemRow[] {
  const searchLower = filter.search.trim().toLowerCase();
  const categoryLower = filter.categorySearch.trim().toLowerCase();
  const rows: QuestItemRow[] = [];

  for (const quest of snapshot) {
    if (categoryLower && !quest.categoryName.toLowerCase().includes(categoryLower)) continue;

    for (const required of quest.requiredItems) {
      const item = itemsById.get(required.itemId);
      const itemName = required.itemName || item?.name || `Item #${required.itemId}`;

      if (searchLower && !itemName.toLowerCase().includes(searchLower)) continue;

      const m = market[required.itemId];
      const listingCount = m?.listingCount ?? 0;
      if (listingCount < filter.minListings) continue;

      const canHq = item?.canHq ?? true;
      const nqTier = m ? pickHighestTrustedTier(m, 'nq', canHq) : null;
      const hqTier = m ? pickHighestTrustedTier(m, 'hq', canHq) : null;

      const nqPrice = nqTier?.unit ?? null;
      const hqPrice = hqTier?.unit ?? null;

      const row: QuestItemRow = {
        questId: quest.questId,
        questName: quest.questName,
        categoryName: quest.categoryName,
        level: quest.level,
        itemId: required.itemId,
        itemName,
        qty: required.qty,
        nqPrice,
        hqPrice,
        listingCount,
        velocity: m?.velocity ?? 0,
        totalRevenue: 0,
      };
      row.totalRevenue = required.qty * priceForRanking(row, filter.hq);
      rows.push(row);
    }
  }

  rows.sort((a, b) => {
    const revDiff = b.totalRevenue - a.totalRevenue;
    if (revDiff !== 0) return revDiff;
    const velDiff = b.velocity - a.velocity;
    if (velDiff !== 0) return velDiff;
    return a.itemId - b.itemId;
  });
  return rows;
}
