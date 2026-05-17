import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';
import { EU_WORLDS, dcOf } from '../../lib/europeWorlds';

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

function cheapestEuNq(m: MarketItem | undefined): { world: string; price: number; count: number } | null {
  if (!m) return null;
  let best: { world: string; price: number } | null = null;
  for (const l of m.worldListings) {
    if (l.hq) continue;
    if (!EU_WORLDS.has(l.world)) continue;
    if (!best || l.price < best.price) best = { world: l.world, price: l.price };
  }
  if (!best) return null;
  return { ...best, count: m.listingCount };
}

function itemRevenueUnit(itemId: number, snapshot: SnapshotItem[], prices: MarketData): number {
  const item = snapshot.find((s) => s.id === itemId);
  if (!item) return 0;
  const m = prices[itemId];
  if (!m) return 0;
  if (item.canHq && m.minHQ != null) return m.minHQ;
  if (m.minNQ != null) return m.minNQ;
  return cheapestEuNq(m)?.price ?? 0;
}

export function planShopping(
  demand: Map<number, number>,
  items: ShoppingListItem[],
  prices: MarketData,
  snapshot: SnapshotItem[],
): ShoppingPlan {
  const perIngredient: IngredientPlan[] = [];
  let spend = 0;
  let missingIngredients = 0;

  const sortedIds = [...demand.keys()].sort((a, b) => a - b);
  for (const id of sortedIds) {
    const qty = demand.get(id)!;
    const cheapest = cheapestEuNq(prices[id]);
    if (!cheapest) {
      perIngredient.push({ id, qty, bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0 });
      missingIngredients++;
      continue;
    }
    perIngredient.push({
      id, qty,
      bestWorld: cheapest.world,
      bestPrice: cheapest.price,
      isLightDc: dcOf(cheapest.world) === 'Light',
      listingCount: cheapest.count,
    });
    spend += cheapest.price * qty;
  }

  // Group by world.
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
  for (const it of items) {
    revenue += itemRevenueUnit(it.id, snapshot, prices) * it.qty;
  }

  return {
    perIngredient,
    byWorldSummary,
    rollup: {
      spend,
      revenue,
      profit: revenue - spend,
      missingIngredients,
    },
  };
}
