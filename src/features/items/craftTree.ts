import type { Recipe } from '../../lib/recipes';
import type { MarketItem } from '../../lib/universalis';

export interface CraftTreeNode {
  itemId: number;
  name: string;
  /** Units of this item needed by the parent (or the requested qty at the root). */
  qty: number;
  recipe: Recipe | null;
  /** Cost to buy `qty` outright from the market. 0 if unpriced. */
  marketBuyCost: number;
  /** Optimal cost to craft `qty` (sum of children's best cost). null if not craftable. */
  craftCost: number | null;
  /** Cheaper of buy/craft. */
  bestCost: number;
  bestChoice: 'buy' | 'craft';
  /** Sub-ingredients (present whenever the item has a recipe). */
  children: CraftTreeNode[];
}

type Prices = Record<string, MarketItem> | undefined;

/** Per-unit buy cost, mirroring computeProfit.unitCost with HQ fallbacks. */
function buyUnit(id: number, dc: Prices, phantom: Prices): number {
  const d = dc?.[String(id)];
  if (d?.minNQ != null) return d.minNQ;
  if (d?.minHQ != null) return d.minHQ;
  const p = phantom?.[String(id)];
  if (p?.avgNQ != null) return p.avgNQ;
  if (p?.avgHQ != null) return p.avgHQ;
  return 0;
}

const MAX_DEPTH = 12;

/**
 * Build a recursive make-vs-buy cost tree for crafting `qty` of `itemId`.
 * Each node knows its market buy cost and (if craftable) its optimal craft cost
 * — where every sub-node independently takes its own cheaper option.
 */
export function buildCraftTree(
  itemId: number,
  qty: number,
  recipeMap: Map<number, Recipe>,
  dc: Prices,
  phantom: Prices,
  nameOf: (id: number) => string,
  path: Set<number> = new Set(),
  depth = 0,
): CraftTreeNode {
  const marketBuyCost = buyUnit(itemId, dc, phantom) * qty;
  const recipe = recipeMap.get(itemId) ?? null;

  let children: CraftTreeNode[] = [];
  let craftCost: number | null = null;

  if (recipe && !path.has(itemId) && depth < MAX_DEPTH) {
    const nextPath = new Set(path);
    nextPath.add(itemId);
    const amountResult = recipe.amountResult && recipe.amountResult > 0 ? recipe.amountResult : 1;
    const batches = Math.ceil(qty / amountResult);
    children = recipe.ingredients.map((ing) =>
      buildCraftTree(ing.itemId, ing.amount * batches, recipeMap, dc, phantom, nameOf, nextPath, depth + 1),
    );
    craftCost = children.reduce((sum, c) => sum + c.bestCost, 0);
  }

  // Craft wins when it's cheaper, or when the item simply can't be bought.
  let bestChoice: 'buy' | 'craft' = 'buy';
  let bestCost = marketBuyCost;
  if (craftCost != null && (marketBuyCost <= 0 || craftCost < marketBuyCost)) {
    bestChoice = 'craft';
    bestCost = craftCost;
  }

  return {
    itemId,
    name: nameOf(itemId),
    qty,
    recipe,
    marketBuyCost,
    craftCost,
    bestCost,
    bestChoice,
    children,
  };
}
