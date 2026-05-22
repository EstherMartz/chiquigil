import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { Recipe } from '../../lib/recipes';

const MIN_VELOCITY = 0.1;

export type CellTag = 'craftable' | 'gatherable' | 'vendor' | 'currency' | 'material' | 'consumable' | 'equipment';

export interface HeatmapCell {
  id: number;
  name: string;
  area: number;
  salePrice: number;
  velocity: number;
  margin: number | null;
  craftable: boolean;
  tags: Set<CellTag>;
}

export interface HeatmapSourceSets {
  gatherableIds?: Set<number>;
  vendorIds?: Set<number>;
  currencyIds?: Set<number>;
}

function salePrice(m: MarketItem): number {
  return m.medianNQ ?? m.medianHQ ?? m.minNQ ?? m.minHQ ?? 0;
}

function ingredientCost(recipe: Recipe, market: MarketData): number | null {
  let total = 0;
  for (const ing of recipe.ingredients) {
    const m = market[String(ing.itemId)];
    if (!m) return null;
    const price = m.minNQ ?? m.minHQ ?? 0;
    if (price === 0) return null;
    total += price * ing.amount;
  }
  return total;
}

// Item search category groups for tagging
const MATERIAL_SCS = new Set([7, 58]); // Materials + Crystals
const CONSUMABLE_SCS = new Set([6]);   // Medicines & Meals
const EQUIPMENT_SCS = new Set([1, 2, 3, 4, 5]); // Weapons, Tools, Armor, Accessories

export function buildHeatmapCells(
  items: SnapshotItem[],
  market: MarketData,
  recipes: Map<number, Recipe>,
  sources: HeatmapSourceSets = {},
): HeatmapCell[] {
  const out: HeatmapCell[] = [];
  for (const item of items) {
    const m = market[String(item.id)];
    if (!m || m.velocity < MIN_VELOCITY) continue;
    const price = salePrice(m);
    if (price <= 0) continue;

    const recipe = recipes.get(item.id);
    let margin: number | null = null;
    let craftable = false;
    if (recipe) {
      const matCost = ingredientCost(recipe, market);
      if (matCost != null && matCost > 0) {
        margin = (price - matCost) / price;
        craftable = true;
      }
    }

    const tags = new Set<CellTag>();
    if (craftable) tags.add('craftable');
    if (sources.gatherableIds?.has(item.id)) tags.add('gatherable');
    if (sources.vendorIds?.has(item.id)) tags.add('vendor');
    if (sources.currencyIds?.has(item.id)) tags.add('currency');
    if (MATERIAL_SCS.has(item.sc)) tags.add('material');
    if (CONSUMABLE_SCS.has(item.sc)) tags.add('consumable');
    if (EQUIPMENT_SCS.has(item.sc)) tags.add('equipment');

    out.push({
      id: item.id,
      name: item.name,
      area: m.velocity,
      salePrice: price,
      velocity: m.velocity,
      margin,
      craftable,
      tags,
    });
  }
  return out;
}
