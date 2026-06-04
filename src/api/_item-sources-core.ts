import type { BotSnapshots } from '../bot/loadSnapshots';
import type { MarketData } from '../lib/universalis';
import type { Recipe } from '../lib/recipes';

export type IngredientSourceTag = 'vendor' | 'gather' | 'craft' | 'mb';

/**
 * Classify how an ingredient is most cheaply obtained, in priority order:
 * NPC vendor → gatherable → craftable → marketboard-only. Mirrors the web
 * app's per-ingredient source tag, derived from the same snapshots.
 */
export function classifyIngredientSource(itemId: number, snapshots: BotSnapshots): IngredientSourceTag {
  if (snapshots.vendorMap.has(itemId)) return 'vendor';
  if (snapshots.gatheringCatalog.has(itemId)) return 'gather';
  if (snapshots.recipes.has(itemId)) return 'craft';
  return 'mb';
}

const JOB_NAME_BY_CODE: Record<string, string> = {
  CRP: 'Carpenter', BSM: 'Blacksmith', ARM: 'Armorer', GSM: 'Goldsmith',
  LTW: 'Leatherworker', WVR: 'Weaver', ALC: 'Alchemist', CUL: 'Culinarian',
  ANY: 'Any Crafter',
};

/** Map a crafter code (e.g. 'CRP') to a display job name, falling back to the code. */
export function jobNameOf(code: string): string {
  return JOB_NAME_BY_CODE[code] ?? code;
}

export interface PricedIngredient {
  itemId: number;
  itemName: string;
  qty: number;
  unitPrice: number | null;
  source: IngredientSourceTag;
}

export interface PricedRecipe {
  ingredients: PricedIngredient[];
  materialCost: number;
}

/**
 * Attach a home (phantom) unit price and source tag to each ingredient and sum
 * the material cost. A missing price contributes 0 to the total and a null
 * unitPrice (so the UI can show "—").
 */
export function priceRecipe(recipe: Recipe, phantom: MarketData, snapshots: BotSnapshots): PricedRecipe {
  let materialCost = 0;
  const ingredients: PricedIngredient[] = recipe.ingredients.map((ing) => {
    const m = phantom[String(ing.itemId)];
    const unitPrice = m?.minNQ ?? m?.minHQ ?? null;
    materialCost += (unitPrice ?? 0) * ing.amount;
    return {
      itemId: ing.itemId,
      itemName: snapshots.namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
      qty: ing.amount,
      unitPrice,
      source: classifyIngredientSource(ing.itemId, snapshots),
    };
  });
  return { ingredients, materialCost };
}
