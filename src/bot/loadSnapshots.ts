import type { SnapshotItem } from '../lib/itemSnapshot';
import type { Recipe } from '../lib/recipes';
import type { GatheringInfo } from '../lib/gatheringCatalog';
import type { SpecialShopSnapshot } from '../lib/specialShopSnapshot';
import type { CompanyCraftRecipe } from '../lib/companyCraftSnapshot';

export interface BotSnapshots {
  itemsById: Map<number, SnapshotItem>;
  namesById: Map<number, string>;
  recipes: Map<number, Recipe>;
  vendorMap: Map<number, number>;
  specialShop: SpecialShopSnapshot;
  gatheringCatalog: Map<number, GatheringInfo>;
  companyCraft: Map<number, CompanyCraftRecipe>;
}

let cached: BotSnapshots | null = null;

/**
 * Lightweight loader for callers that only need the item-id set (e.g. the
 * cron-driven /api/refresh-cache, which iterates all items but doesn't touch
 * recipes/vendor/special/gathering/companyCraft). Avoids paying the cold-start
 * cost of five extra snapshot fetches when a function only has 300s budget.
 */
export async function loadItemIds(baseUrl: string): Promise<number[]> {
  const raw = await fetch(`${baseUrl}/data/snapshots/items.json`).then((r) => r.json()) as { items: { id: number }[] };
  return raw.items.map((i) => i.id);
}

export async function loadSnapshots(baseUrl: string): Promise<BotSnapshots> {
  if (cached) return cached;

  const [itemsRaw, recipesRaw, vendorRaw, specialRaw, gatherRaw, companyCraftRaw] = await Promise.all([
    fetch(`${baseUrl}/data/snapshots/items.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/recipes.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/vendorShop.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/specialShop.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/gathering.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/companyCraft.json`).then(r => r.json()),
  ]);

  const itemsById = new Map<number, SnapshotItem>();
  const namesById = new Map<number, string>();
  for (const item of (itemsRaw as { items: SnapshotItem[] }).items) {
    itemsById.set(item.id, item);
    namesById.set(item.id, item.name);
  }

  const recipes = new Map<number, Recipe>();
  for (const [id, recipe] of (recipesRaw as { entries: [number, Recipe][] }).entries) {
    recipes.set(id, recipe);
  }

  const vendorMap = new Map<number, number>();
  for (const [id, price] of (vendorRaw as { entries: [number, number][] }).entries) {
    vendorMap.set(id, price);
  }

  const specialShop: SpecialShopSnapshot = {
    byCurrency: new Map(
      (specialRaw as { byCurrency: [string, any[]][] }).byCurrency.map(
        ([currency, entries]) => [currency as any, entries] as [any, any]
      )
    ),
  };

  const gatheringCatalog = new Map<number, GatheringInfo>();
  for (const [id, info] of (gatherRaw as { entries: [number, GatheringInfo][] }).entries) {
    gatheringCatalog.set(id, info);
  }

  const companyCraft = new Map<number, CompanyCraftRecipe>();
  for (const [id, recipe] of (companyCraftRaw as { entries: [number, CompanyCraftRecipe][] }).entries) {
    companyCraft.set(id, recipe);
  }

  cached = { itemsById, namesById, recipes, vendorMap, specialShop, gatheringCatalog, companyCraft };
  return cached;
}
