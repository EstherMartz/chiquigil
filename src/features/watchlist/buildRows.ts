import type { TrackedItem } from '../items/types';
import type { MarketData, MarketItem } from '../../lib/universalis';
import { craftStatus, type CraftStatus, type CrafterLevels } from '../items/craftStatus';
import { computeRawScore, normalizeScores } from '../../lib/score';
import type { Recipe } from '../../lib/recipes';
import { computeProfit, type FlagMap } from '../profit/computeProfit';

export interface WatchlistRow extends TrackedItem {
  pMinNQ: number | null;
  pMinHQ: number | null;
  pAvgNQ: number | null;
  pAvgHQ: number | null;
  pSpd: number;
  pListings: number;
  dcMinNQ: number | null;
  dcMinHQ: number | null;
  dcSpd: number;
  refPrice: number;
  rawScore: number;
  score: number;
  staleDays: number | null;
  craftStatus: CraftStatus;
  // Phase 2 fields:
  craftable: boolean | null;
  materialCost: number | null;
  salePrice: number | null;
  profit: number | null;
  gilPerDay: number | null;
  // Trend column:
  delta: number | null;
}

function refPrice(p: MarketItem | undefined, d: MarketItem | undefined): number {
  return d?.minHQ ?? d?.minNQ ?? p?.avgHQ ?? p?.avgNQ ?? 0;
}

export function buildRows(
  items: TrackedItem[],
  phantom: MarketData,
  dc: MarketData,
  levels: CrafterLevels,
  recipeMap: Map<number, Recipe | null>,
  flags: FlagMap,
  now: number,
): WatchlistRow[] {
  const partial = items.map((item) => {
    const p = phantom[item.id];
    const d = dc[item.id];
    const lastUpload = Math.max(p?.lastUploadTime ?? 0, d?.lastUploadTime ?? 0);
    const staleDays = lastUpload ? (now - lastUpload) / 86_400_000 : null;
    const price = refPrice(p, d);
    const velocity = d?.velocity ?? p?.velocity ?? 0;

    const recipeEntry = recipeMap.has(item.id) ? recipeMap.get(item.id)! : undefined;
    const craftable = recipeEntry === undefined ? null : recipeEntry !== null;
    const profitResult = recipeEntry ? computeProfit(item, recipeEntry, recipeMap, phantom, dc, flags) : null;

    return {
      ...item,
      pMinNQ: p?.minNQ ?? null,
      pMinHQ: p?.minHQ ?? null,
      pAvgNQ: p?.avgNQ ?? null,
      pAvgHQ: p?.avgHQ ?? null,
      pSpd: p?.velocity ?? 0,
      pListings: p?.listingCount ?? 0,
      dcMinNQ: d?.minNQ ?? null,
      dcMinHQ: d?.minHQ ?? null,
      dcSpd: d?.velocity ?? 0,
      refPrice: price,
      rawScore: computeRawScore({ refPrice: price, velocity }),
      staleDays,
      craftStatus: craftStatus(item, levels),
      craftable,
      materialCost: profitResult?.materialCost ?? null,
      salePrice: profitResult?.salePrice ?? null,
      profit: profitResult?.profit ?? null,
      gilPerDay: profitResult
        ? profitResult.profit * velocity
        : recipeEntry === null
          ? (d?.minHQ ?? d?.minNQ ?? 0) * velocity || null
          : null,
      delta: null,
    };
  });

  const scores = normalizeScores(partial.map((r) => r.rawScore));
  return partial.map((r, i) => ({ ...r, score: scores[i] }));
}
