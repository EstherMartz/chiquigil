import type { Recipe } from '../../lib/recipes';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketBundle } from '../watchlist/useMarketData';
import { lookupMbTier } from './marketLookup';
import type { InventoryEntry, CraftOpportunity } from './types';

const MAX_MISSING = 2;
const MAX_OPPORTUNITIES_PER_ITEM = 5;

function nqUnitPrice(market: MarketBundle, itemId: number, canHq: boolean): { unit: number; listingCount: number } | null {
  // Cascade home -> DC -> region so recipes whose output (or whose missing
  // ingredient) lives only on other DCs still surface and price correctly.
  const mb = lookupMbTier(market, itemId, false, canHq);
  if (mb.unit === 0) return null;
  return { unit: mb.unit, listingCount: mb.listingCount };
}

interface CoverageResult {
  used: Array<{ itemId: number; amount: number }>;
  missing: Array<{ itemId: number; amount: number }>;
}

function coverInventory(
  recipe: Recipe,
  invByItem: Map<number, number>,
): CoverageResult | null {
  const used: CoverageResult['used'] = [];
  const missing: CoverageResult['missing'] = [];
  for (const ing of recipe.ingredients) {
    const have = invByItem.get(ing.itemId) ?? 0;
    if (have >= ing.amount) {
      used.push({ itemId: ing.itemId, amount: ing.amount });
    } else {
      missing.push({ itemId: ing.itemId, amount: ing.amount - have });
      // if user has some but not all, still count what they have as "used"
      if (have > 0) used.push({ itemId: ing.itemId, amount: have });
    }
  }
  if (missing.length > MAX_MISSING) return null;
  return { used, missing };
}

interface RecipeProfit {
  netProfit: number;
  opportunity: CraftOpportunity;
}

function evaluateRecipe(
  recipe: Recipe,
  invByItem: Map<number, number>,
  market: MarketBundle,
  items: Map<number, SnapshotItem>,
): RecipeProfit | null {
  const outputItem = items.get(recipe.itemResultId);
  if (!outputItem) return null;

  const outputPrice = nqUnitPrice(market, recipe.itemResultId, outputItem.canHq);
  if (!outputPrice) return null;

  const coverage = coverInventory(recipe, invByItem);
  if (!coverage) return null;

  // Opportunity cost per used unit: max of (NQ MB unit price, priceLow). Falls
  // back to priceLow when there's no trusted MB tier — vendoring is the floor.
  let opportunityCost = 0;
  for (const u of coverage.used) {
    const ingItem = items.get(u.itemId);
    const mbPrice = nqUnitPrice(market, u.itemId, ingItem?.canHq ?? false)?.unit ?? 0;
    const floor = ingItem?.priceLow ?? 0;
    opportunityCost += Math.max(mbPrice, floor) * u.amount;
  }

  // Missing-ingredient buy cost: MB only. If any missing ingredient has no trusted tier, we can't price the recipe — skip.
  let missingCost = 0;
  const missingDetailed: CraftOpportunity['missingIngredients'] = [];
  for (const m of coverage.missing) {
    const ingItem = items.get(m.itemId);
    const mb = nqUnitPrice(market, m.itemId, ingItem?.canHq ?? false);
    if (!mb) return null;
    missingCost += mb.unit * m.amount;
    missingDetailed.push({ itemId: m.itemId, name: ingItem?.name ?? '', amount: m.amount, mbUnitPrice: mb.unit });
  }

  const netProfit = outputPrice.unit - opportunityCost - missingCost;
  if (netProfit <= 0) return null;

  const usedDetailed: CraftOpportunity['usedFromInventory'] = coverage.used.map((u) => ({
    itemId: u.itemId,
    name: items.get(u.itemId)?.name ?? '',
    amount: u.amount,
  }));

  return {
    netProfit,
    opportunity: {
      outputItemId: recipe.itemResultId,
      outputName: outputItem.name,
      outputUnitPrice: outputPrice.unit,
      netProfit,
      usedFromInventory: usedDetailed,
      missingIngredients: missingDetailed,
    },
  };
}

/**
 * For each inventory item, find recipes that:
 *  - use this item as an ingredient
 *  - need at most MAX_MISSING ingredients the user doesn't have
 *  - have a trusted NQ MB tier for the output AND for every missing ingredient
 *  - yield positive net profit after opportunity cost on used inventory
 *
 * Returns Map<inventoryItemId, opportunities ranked by netProfit DESC>, capped at MAX_OPPORTUNITIES_PER_ITEM.
 */
export function findCraftOpportunities(
  inventory: InventoryEntry[],
  recipes: Map<number, Recipe>,
  market: MarketBundle,
  items: Map<number, SnapshotItem>,
): Map<number, CraftOpportunity[]> {
  // Pool HQ + NQ counts under one key per item id; recipes don't care about HQ.
  const invByItem = new Map<number, number>();
  for (const e of inventory) {
    if (e.itemId === 0) continue;
    invByItem.set(e.itemId, (invByItem.get(e.itemId) ?? 0) + e.qty);
  }

  // Reverse index: itemId -> list of recipes that use it as an ingredient.
  const recipesUsing = new Map<number, Recipe[]>();
  for (const recipe of recipes.values()) {
    for (const ing of recipe.ingredients) {
      if (!invByItem.has(ing.itemId)) continue;
      let bucket = recipesUsing.get(ing.itemId);
      if (!bucket) { bucket = []; recipesUsing.set(ing.itemId, bucket); }
      bucket.push(recipe);
    }
  }

  const out = new Map<number, CraftOpportunity[]>();
  for (const [invItemId, candidateRecipes] of recipesUsing) {
    const seenRecipeOutput = new Set<number>();
    const opts: CraftOpportunity[] = [];
    for (const recipe of candidateRecipes) {
      if (seenRecipeOutput.has(recipe.itemResultId)) continue;
      seenRecipeOutput.add(recipe.itemResultId);
      const evald = evaluateRecipe(recipe, invByItem, market, items);
      if (evald) opts.push(evald.opportunity);
    }
    opts.sort((a, b) => b.netProfit - a.netProfit);
    if (opts.length > 0) out.set(invItemId, opts.slice(0, MAX_OPPORTUNITIES_PER_ITEM));
  }

  return out;
}
