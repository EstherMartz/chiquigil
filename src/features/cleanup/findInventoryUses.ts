import type { Recipe } from '../../lib/recipes';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketBundle } from '../watchlist/useMarketData';
import { lookupMbTier } from './marketLookup';
import type { InventoryEntry, UsesEntry } from './types';

const MAX_PER_ITEM = 5;

/**
 * For each inventory item id, return up to MAX_PER_ITEM recipes that use it as
 * an ingredient, ranked by output MB unit price descending. Unlike
 * findCraftOpportunities this ignores profitability and inventory coverage —
 * it's the "what could this become" lookup for items the bucketer routed to
 * vendor/discard.
 *
 * Recipes with zero-priced output across all scopes appear at the bottom; not
 * dropped, since the user may want to know "I can craft this into X" even if X
 * has no current market listings.
 */
export function findInventoryUses(
  inventory: InventoryEntry[],
  recipes: Map<number, Recipe>,
  market: MarketBundle,
  items: Map<number, SnapshotItem>,
): Map<number, UsesEntry[]> {
  // Set of inventory item ids we care about (skip itemId=0 unrecognized rows).
  const invItemIds = new Set<number>();
  for (const e of inventory) if (e.itemId > 0) invItemIds.add(e.itemId);
  if (invItemIds.size === 0) return new Map();

  // Reverse index: ingredient itemId -> [{ recipe, amountNeeded }]
  const usesByIngredient = new Map<number, Array<{ recipe: Recipe; amountNeeded: number }>>();
  for (const recipe of recipes.values()) {
    for (const ing of recipe.ingredients) {
      if (!invItemIds.has(ing.itemId)) continue;
      let bucket = usesByIngredient.get(ing.itemId);
      if (!bucket) { bucket = []; usesByIngredient.set(ing.itemId, bucket); }
      bucket.push({ recipe, amountNeeded: ing.amount });
    }
  }

  const out = new Map<number, UsesEntry[]>();
  for (const [ingItemId, hits] of usesByIngredient) {
    // Dedupe by output id — same output may have multiple recipes (job
    // variants); keep the first occurrence.
    const seenOutputs = new Set<number>();
    const entries: UsesEntry[] = [];
    for (const { recipe, amountNeeded } of hits) {
      if (seenOutputs.has(recipe.itemResultId)) continue;
      seenOutputs.add(recipe.itemResultId);
      const outItem = items.get(recipe.itemResultId);
      if (!outItem) continue;
      const mb = lookupMbTier(market, recipe.itemResultId, false, outItem.canHq);
      entries.push({
        outputItemId: recipe.itemResultId,
        outputName: outItem.name,
        outputUnitPrice: mb.unit,
        amountNeeded,
      });
    }
    entries.sort((a, b) => b.outputUnitPrice - a.outputUnitPrice);
    if (entries.length > 0) out.set(ingItemId, entries.slice(0, MAX_PER_ITEM));
  }
  return out;
}
