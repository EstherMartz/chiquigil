import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';
import type { IngredientSurvey } from './shoppingListSurvey';
import type { IngredientPlan, ShoppingPlan, WorldSummary } from './planShopping';

export type ChosenSource = 'mb' | 'npc';
export const NPC_VENDOR_WORLD = 'NPC vendor';

function resolveSource(survey: IngredientSurvey, overrides: Map<number, ChosenSource>): ChosenSource | null {
  const requested = overrides.get(survey.id);
  if (requested === 'mb' && survey.mb) return 'mb';
  if (requested === 'npc' && survey.npc) return 'npc';
  return survey.autoSource;
}

function itemRevenueUnit(itemId: number, snapshot: SnapshotItem[], prices: MarketData): number {
  const item = snapshot.find((s) => s.id === itemId);
  if (!item) return 0;
  const m = prices[itemId];
  if (!m) return 0;
  if (item.canHq && m.minHQ != null) return m.minHQ;
  if (m.minNQ != null) return m.minNQ;
  return 0;
}

export function applyShoppingOverrides(
  survey: IngredientSurvey[],
  shoppingItems: ShoppingListItem[],
  snapshot: SnapshotItem[],
  prices: MarketData,
  overrides: Map<number, ChosenSource>,
): ShoppingPlan {
  const perIngredient: IngredientPlan[] = [];
  let spend = 0;
  let missingIngredients = 0;

  for (const row of survey) {
    const source = resolveSource(row, overrides);
    if (source === 'mb' && row.mb) {
      perIngredient.push({
        id: row.id, qty: row.qty,
        bestWorld: row.mb.world, bestPrice: row.mb.price,
        isLightDc: row.mb.isLightDc, listingCount: row.mb.count,
      });
      spend += row.mb.price * row.qty;
    } else if (source === 'npc' && row.npc) {
      perIngredient.push({
        id: row.id, qty: row.qty,
        bestWorld: NPC_VENDOR_WORLD, bestPrice: row.npc.price,
        isLightDc: false, listingCount: 0,
      });
      spend += row.npc.price * row.qty;
    } else {
      perIngredient.push({
        id: row.id, qty: row.qty,
        bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0,
      });
      missingIngredients++;
    }
  }

  const worldMap = new Map<string, WorldSummary>();
  for (const ing of perIngredient) {
    if (!ing.bestWorld || ing.bestPrice == null) continue;
    let summary = worldMap.get(ing.bestWorld);
    if (!summary) {
      summary = {
        world: ing.bestWorld,
        isLightDc: ing.isLightDc,
        ingredients: [],
        total: 0,
      };
      worldMap.set(ing.bestWorld, summary);
    }
    summary.ingredients.push({ id: ing.id, qty: ing.qty, price: ing.bestPrice });
    summary.total += ing.bestPrice * ing.qty;
  }
  const byWorldSummary = [...worldMap.values()].sort((a, b) => b.total - a.total);

  let revenue = 0;
  for (const it of shoppingItems) {
    revenue += itemRevenueUnit(it.id, snapshot, prices) * it.qty;
  }

  return {
    perIngredient,
    byWorldSummary,
    rollup: { spend, revenue, profit: revenue - spend, missingIngredients },
  };
}
