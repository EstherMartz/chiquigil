import type { MarketData } from '../../lib/universalis';
import type { SnapshotQuest } from '../../lib/questSnapshot';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import type { HqMode } from './types';

export type { HqMode };

export type QuestItemSort =
  | 'level'
  | 'category'
  | 'quest'
  | 'item'
  | 'qty'
  | 'nq'
  | 'hq'
  | 'listings'
  | 'velocity'
  | 'revenue';

export type SortDir = 'asc' | 'desc';

export const DEFAULT_SORT_DIR: Record<QuestItemSort, SortDir> = {
  level: 'asc',
  category: 'asc',
  quest: 'asc',
  item: 'asc',
  qty: 'desc',
  nq: 'desc',
  hq: 'desc',
  listings: 'desc',
  velocity: 'desc',
  revenue: 'desc',
};

export interface QuestItemFilter {
  hq: HqMode;
  minListings: number;
  search: string;          // matches itemName substring (case-insensitive)
  categorySearch: string;  // matches categoryName substring (case-insensitive)
  sortBy: QuestItemSort;
  sortDir: SortDir;
}

export function defaultQuestItemFilter(): QuestItemFilter {
  return {
    hq: 'hq',
    minListings: 0,
    search: '',
    categorySearch: '',
    sortBy: 'revenue',
    sortDir: 'desc',
  };
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

function compareRows(a: QuestItemRow, b: QuestItemRow, key: QuestItemSort): number {
  switch (key) {
    case 'level': return a.level - b.level;
    case 'category': return a.categoryName.localeCompare(b.categoryName);
    case 'quest': return a.questName.localeCompare(b.questName);
    case 'item': return a.itemName.localeCompare(b.itemName);
    case 'qty': return a.qty - b.qty;
    case 'nq': return (a.nqPrice ?? -1) - (b.nqPrice ?? -1);
    case 'hq': return (a.hqPrice ?? -1) - (b.hqPrice ?? -1);
    case 'listings': return a.listingCount - b.listingCount;
    case 'velocity': return a.velocity - b.velocity;
    case 'revenue': return a.totalRevenue - b.totalRevenue;
  }
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

  const mul = filter.sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const primary = compareRows(a, b, filter.sortBy) * mul;
    if (primary !== 0) return primary;
    if (filter.sortBy !== 'revenue') {
      const revDiff = b.totalRevenue - a.totalRevenue;
      if (revDiff !== 0) return revDiff;
    }
    if (filter.sortBy !== 'velocity') {
      const velDiff = b.velocity - a.velocity;
      if (velDiff !== 0) return velDiff;
    }
    return a.itemId - b.itemId;
  });
  return rows;
}
