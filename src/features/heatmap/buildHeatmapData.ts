import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { Recipe } from '../../lib/recipes';

const MIN_VELOCITY = 0.1;

export type CellTag = 'craftable' | 'gatherable' | 'vendor' | 'currency' | 'material' | 'consumable' | 'equipment';
export type CellKind = 'craft' | 'vendor' | 'gather' | 'flip';
export type CellTier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface HeatmapCell {
  id: number;
  name: string;
  area: number;
  salePrice: number;
  velocity: number;
  margin: number | null;
  craftable: boolean;
  tags: Set<CellTag>;
  /** Primary play kind, drives hue in the chart and leaderboard accent. */
  kind: CellKind;
  /** Margin (or velocity, for non-craftables) bucket, drives chart brightness. */
  tier: CellTier;
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

// Pick the dominant play kind for the cell. Vendor wins over craft because NPC
// arbitrage is rare and high-signal; gather wins over flip for the same reason.
function classifyKind(args: { craftable: boolean; isVendor: boolean; isGather: boolean }): CellKind {
  if (args.isVendor) return 'vendor';
  if (args.craftable) return 'craft';
  if (args.isGather) return 'gather';
  return 'flip';
}

// Margin tiers for craftables; for non-craftables we use velocity-relative tiering
// (computed in a second pass since it depends on the population).
function marginTier(margin: number): CellTier {
  if (margin >= 0.40) return 'S';
  if (margin >= 0.25) return 'A';
  if (margin >= 0.10) return 'B';
  if (margin >= 0)    return 'C';
  return 'D';
}

function velocityTier(velocity: number, p90: number): CellTier {
  if (p90 <= 0) return 'C';
  const ratio = velocity / p90;
  if (ratio >= 1)    return 'S';
  if (ratio >= 0.6)  return 'A';
  if (ratio >= 0.3)  return 'B';
  if (ratio >= 0.1)  return 'C';
  return 'D';
}

// Item search category groups for tagging
// Crafting-material search categories. The umbrella "Materials" (7) is barely
// used — real mats carry their specific subcategory id, so we list them all:
// Stone/Metal/Lumber/Cloth/Leather/Bone/Reagents (47–53), Crystals (58),
// Catalysts (59), plus the umbrella (7) and Dyes (54) for completeness.
const MATERIAL_SCS = new Set([7, 47, 48, 49, 50, 51, 52, 53, 54, 58, 59]);
const CONSUMABLE_SCS = new Set([6, 44, 45, 46]); // Medicines & Meals (incl. subcats)
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
    const isGather = !!sources.gatherableIds?.has(item.id);
    const isVendor = !!sources.vendorIds?.has(item.id);
    const isCurrency = !!sources.currencyIds?.has(item.id);
    if (isGather) tags.add('gatherable');
    if (isVendor) tags.add('vendor');
    if (isCurrency) tags.add('currency');
    if (MATERIAL_SCS.has(item.sc)) tags.add('material');
    if (CONSUMABLE_SCS.has(item.sc)) tags.add('consumable');
    if (EQUIPMENT_SCS.has(item.sc)) tags.add('equipment');

    const kind = classifyKind({ craftable, isVendor, isGather });

    out.push({
      id: item.id,
      name: item.name,
      area: m.velocity,
      salePrice: price,
      velocity: m.velocity,
      margin,
      craftable,
      tags,
      kind,
      // Tier filled in after we know the population's velocity distribution.
      tier: 'C',
    });
  }

  // Second pass: assign tiers. Craftables use margin tier; everything else
  // uses a velocity tier relative to the 90th percentile of non-craftables,
  // so a tiny-but-busy market doesn't all collapse to "D".
  const nonCraftVels = out.filter((c) => !c.craftable).map((c) => c.velocity).sort((a, b) => a - b);
  const p90Idx = Math.floor(nonCraftVels.length * 0.9);
  const p90 = nonCraftVels[p90Idx] ?? 0;

  for (const c of out) {
    if (c.craftable && c.margin != null) {
      c.tier = marginTier(c.margin);
    } else {
      c.tier = velocityTier(c.velocity, p90);
    }
  }

  return out;
}
