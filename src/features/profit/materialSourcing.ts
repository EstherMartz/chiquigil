import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { MaterialLeaf } from './computeProfit';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';

export type SourceKind = 'gather-standard' | 'gather-timed' | 'crystal' | 'buy';

export interface IngredientSourcing {
  itemId: number;
  qty: number;
  unitPrice: number;
  subtotal: number;
  source: SourceKind;
  gatherable: boolean;
}

export interface MaterialSourcing {
  ingredients: IngredientSourcing[];
  totalMaterialCost: number;
  gatherableCost: number;
  buyOnlyCost: number;
  gatherablePct: number;
  selfSourceProfit: number;
}

/**
 * Gather-vs-buy classification for a single ingredient. Crystals (by search
 * category) and any item present in the gathering catalog count as gatherable;
 * everything else (crafted intermediates, vendor/drop items) counts as buy.
 */
export function classifySource(
  itemId: number,
  sc: number | undefined,
  catalog: GatheringCatalog,
): SourceKind {
  if (sc === CRYSTALS_SEARCH_CATEGORY) return 'crystal';
  const g = catalog.get(itemId);
  if (g) return g.timed ? 'gather-timed' : 'gather-standard';
  return 'buy';
}

/**
 * Derive the per-row material sourcing breakdown from the costed leaves.
 * Returns null when the total material cost is 0 (nothing to split).
 */
export function deriveSourcing(
  leaves: MaterialLeaf[],
  scById: Map<number, number>,
  catalog: GatheringCatalog,
  profit: number,
): MaterialSourcing | null {
  const byId = new Map<number, IngredientSourcing>();
  let total = 0;
  for (const leaf of leaves) {
    const subtotal = leaf.qty * leaf.unitPrice;
    total += subtotal;
    const existing = byId.get(leaf.itemId);
    if (existing) {
      existing.qty += leaf.qty;
      existing.subtotal += subtotal;
    } else {
      const source = classifySource(leaf.itemId, scById.get(leaf.itemId), catalog);
      byId.set(leaf.itemId, {
        itemId: leaf.itemId,
        qty: leaf.qty,
        unitPrice: leaf.unitPrice,
        subtotal,
        source,
        gatherable: source !== 'buy',
      });
    }
  }
  if (total === 0) return null;

  let gatherableCost = 0;
  for (const ing of byId.values()) if (ing.gatherable) gatherableCost += ing.subtotal;
  const buyOnlyCost = total - gatherableCost;

  const ingredients = [...byId.values()].sort((a, b) => {
    if (a.gatherable !== b.gatherable) return a.gatherable ? 1 : -1;
    return b.subtotal - a.subtotal;
  });

  return {
    ingredients,
    totalMaterialCost: total,
    gatherableCost,
    buyOnlyCost,
    gatherablePct: (gatherableCost / total) * 100,
    selfSourceProfit: profit + gatherableCost,
  };
}
