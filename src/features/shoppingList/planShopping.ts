import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';
import { surveyIngredients } from './shoppingListSurvey';
import { applyShoppingOverrides } from './applyShoppingOverrides';

export interface IngredientPlan {
  id: number;
  qty: number;
  bestWorld: string | null;
  bestPrice: number | null;
  isLightDc: boolean;
  listingCount: number;
}

export interface WorldSummary {
  world: string;
  isLightDc: boolean;
  ingredients: { id: number; qty: number; price: number }[];
  total: number;
}

export interface ShoppingPlan {
  perIngredient: IngredientPlan[];
  byWorldSummary: WorldSummary[];
  rollup: {
    spend: number;
    revenue: number;
    profit: number;
    missingIngredients: number;
  };
}

export function planShopping(
  demand: Map<number, number>,
  items: ShoppingListItem[],
  prices: MarketData,
  snapshot: SnapshotItem[],
): ShoppingPlan {
  const survey = surveyIngredients(demand, prices, new Map(), { byCurrency: new Map() });
  return applyShoppingOverrides(survey, items, snapshot, prices, new Map());
}
