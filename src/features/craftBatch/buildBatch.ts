import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { pickFirstTrustedTier } from '../../lib/priceTrust';
import { computeMaterialCost } from '../profit/computeProfit';
import type { BatchItem, BatchConfig, BatchResult } from './types';

const MIN_VELOCITY = 0.3;

/**
 * Score every craftable item — same logic as runCraftFlip but
 * returns the full unsorted pool without limit or trainedEye filtering.
 */
export function scoreCraftPool(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
): BatchItem[] {
  const pool: BatchItem[] = [];

  for (const item of snapshot) {
    const m = priceMap[item.id];
    if (!m) continue;
    if (m.velocity < MIN_VELOCITY) continue;

    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;

    const tier = pickFirstTrustedTier(m, 'either', item.canHq);
    if (!tier) continue;

    const materialCost = computeMaterialCost(recipe, recipeMap, priceMap, {});
    const profit = tier.unit - materialCost;
    if (profit <= 0) continue;

    pool.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      materialCost,
      salePrice: tier.unit,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq,
      score: 0, // filled during batch building
    });
  }

  return pool;
}

/**
 * Greedy diversified batch builder. Picks items one at a time,
 * penalizing same-category items with an exponential decay multiplier.
 */
export function buildDiversifiedBatch(
  pool: BatchItem[],
  config: BatchConfig,
): BatchResult {
  const picked: BatchItem[] = [];
  const remaining = new Set(pool.map((_, i) => i));
  const categoryCounts: Record<number, number> = {};
  let budget = config.budget;

  while (picked.length < config.batchSize && remaining.size > 0) {
    let bestIdx = -1;
    let bestScore = -1;

    for (const i of remaining) {
      const item = pool[i];
      if (item.materialCost > budget) continue;
      const n = categoryCounts[item.sc] ?? 0;
      const score = item.gilPerDay / (1 << n); // 2^n penalty
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // nothing fits budget

    const pick = { ...pool[bestIdx], score: bestScore };
    picked.push(pick);
    remaining.delete(bestIdx);
    budget -= pick.materialCost;
    categoryCounts[pick.sc] = (categoryCounts[pick.sc] ?? 0) + 1;
  }

  const totalCost = picked.reduce((s, i) => s + i.materialCost, 0);
  const expectedRevenue = picked.reduce(
    (s, i) => s + i.salePrice * Math.min(i.velocity, 1),
    0,
  );

  return {
    items: picked,
    totalCost,
    expectedRevenue,
    expectedProfit: expectedRevenue - totalCost,
    roi: totalCost > 0 ? (expectedRevenue - totalCost) / totalCost : 0,
    budgetRemaining: config.budget - totalCost,
    categoryBreakdown: categoryCounts,
  };
}
