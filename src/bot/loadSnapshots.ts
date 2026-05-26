import type { SnapshotItem } from '../lib/itemSnapshot';
import type { Recipe } from '../lib/recipes';

export interface BotSnapshots {
  itemsById: Map<number, SnapshotItem>;
  namesById: Map<number, string>;
  recipes: Map<number, Recipe>;
  vendorMap: Map<number, number>;
  gatheringCatalog: Map<number, { level: number; timed: boolean }>;
}

let cached: BotSnapshots | null = null;

export async function loadSnapshots(baseUrl: string): Promise<BotSnapshots> {
  if (cached) return cached;

  const [itemsRaw, recipesRaw, vendorRaw, gatherRaw] = await Promise.all([
    fetch(`${baseUrl}/data/snapshots/items.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/recipes.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/vendorShop.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/gathering.json`).then(r => r.json()),
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

  const gatheringCatalog = new Map<number, { level: number; timed: boolean }>();
  for (const [id, info] of (gatherRaw as { entries: [number, { level: number; timed: boolean }][] }).entries) {
    gatheringCatalog.set(id, info);
  }

  cached = { itemsById, namesById, recipes, vendorMap, gatheringCatalog };
  return cached;
}
