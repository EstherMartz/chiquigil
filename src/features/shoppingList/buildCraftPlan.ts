import { explode } from '../../bot/craftExplode';
import type { Recipe } from '../../lib/recipes';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { ShoppingListItem } from './shoppingListStore';

export type SourceKind = 'craft' | 'gather' | 'buy';

export interface CraftPlan {
  /** Items to synthesize (targets + craftable intermediates). */
  craft: Map<number, { qty: number; craftCount: number; job: string }>;
  /** Raw leaves available from gathering nodes. */
  gather: Map<number, { qty: number; level: number; timed: boolean }>;
  /** Leaves to purchase (fed into surveyIngredients). itemId -> qty. */
  buy: Map<number, number>;
}

export function buildCraftPlan(
  items: ShoppingListItem[],
  recipeMap: Map<number, Recipe | null>,
  gathering: GatheringCatalog,
  overrides: Map<number, SourceKind> = new Map(),
): CraftPlan {
  const craft: CraftPlan['craft'] = new Map();
  const leaves = new Map<number, number>();

  // A node the user chose to buy/gather instead of craft becomes a leaf.
  const forceLeaf = (id: number) => {
    const o = overrides.get(id);
    return o === 'buy' || o === 'gather';
  };

  // explode truthy-checks recipes.get(id), so null snapshot entries are safe.
  const recipes = recipeMap as Map<number, Recipe>;

  for (const it of items) {
    const { crafts, leaves: lv } = explode(it.id, it.qty, recipes, {
      craftIntermediates: true,
      forceLeaf,
    });
    for (const [id, c] of crafts) {
      const ex = craft.get(id);
      if (ex) {
        ex.qty += c.outputQty;
        ex.craftCount += c.craftCount;
      } else {
        craft.set(id, { qty: c.outputQty, craftCount: c.craftCount, job: c.job });
      }
    }
    for (const [id, qty] of lv) leaves.set(id, (leaves.get(id) ?? 0) + qty);
  }

  const gather: CraftPlan['gather'] = new Map();
  const buy: CraftPlan['buy'] = new Map();
  for (const [id, qty] of leaves) {
    const info = gathering.get(id);
    const forcedBuy = overrides.get(id) === 'buy';
    if (info && !forcedBuy) {
      gather.set(id, { qty, level: info.level, timed: info.timed });
    } else {
      buy.set(id, qty);
    }
  }

  return { craft, gather, buy };
}
