import { openDB, type IDBPDatabase } from 'idb';
import type { Recipe } from './recipes';
import type { SnapshotItem } from './itemSnapshot';
import type { GatheringInfo } from './gatheringCatalog';

const DB_NAME = 'ffxiv-helper';
const DB_VERSION = 6;
const RECIPE_STORE = 'recipes';
const NAME_STORE = 'names';
const ITEM_STORE = 'items';
const META_STORE = 'meta';
const GATHER_STORE = 'gathering';
const RECIPE_SNAPSHOT_STORE = 'recipeSnapshot';
const MARKET_STORE = 'market';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(RECIPE_STORE)) {
          database.createObjectStore(RECIPE_STORE);
        }
        if (!database.objectStoreNames.contains(NAME_STORE)) {
          database.createObjectStore(NAME_STORE);
        }
        if (!database.objectStoreNames.contains(ITEM_STORE)) {
          database.createObjectStore(ITEM_STORE);
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE);
        }
        if (!database.objectStoreNames.contains(GATHER_STORE)) {
          database.createObjectStore(GATHER_STORE);
        }
        if (!database.objectStoreNames.contains(RECIPE_SNAPSHOT_STORE)) {
          database.createObjectStore(RECIPE_SNAPSHOT_STORE);
        }
        if (!database.objectStoreNames.contains(MARKET_STORE)) {
          database.createObjectStore(MARKET_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedRecipe(itemId: number): Promise<Recipe | null | undefined> {
  return (await db()).get(RECIPE_STORE, itemId);
}

export async function putCachedRecipe(itemId: number, recipe: Recipe | null): Promise<void> {
  await (await db()).put(RECIPE_STORE, recipe, itemId);
}

export async function clearRecipeCache(): Promise<void> {
  await (await db()).clear(RECIPE_STORE);
}

export async function getCachedName(itemId: number): Promise<string | undefined> {
  return (await db()).get(NAME_STORE, itemId);
}

export async function putCachedName(itemId: number, name: string): Promise<void> {
  await (await db()).put(NAME_STORE, name, itemId);
}

export async function clearNameCache(): Promise<void> {
  await (await db()).clear(NAME_STORE);
}

const ITEM_SNAPSHOT_KEY = 'snapshot';
const ITEM_SNAPSHOT_TS_KEY = 'snapshotUpdatedAt';

export async function getAllCachedItems(): Promise<SnapshotItem[] | undefined> {
  return (await db()).get(ITEM_STORE, ITEM_SNAPSHOT_KEY);
}

export async function putCachedItems(items: SnapshotItem[]): Promise<void> {
  const handle = await db();
  await handle.put(ITEM_STORE, items, ITEM_SNAPSHOT_KEY);
  await handle.put(META_STORE, Date.now(), ITEM_SNAPSHOT_TS_KEY);
}

export async function clearItemCache(): Promise<void> {
  const handle = await db();
  await handle.clear(ITEM_STORE);
  await handle.delete(META_STORE, ITEM_SNAPSHOT_TS_KEY);
}

export async function getItemSnapshotUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, ITEM_SNAPSHOT_TS_KEY);
}

const GATHER_CATALOG_KEY = 'catalog';
const GATHER_CATALOG_TS_KEY = 'gatheringUpdatedAt';

export async function getCachedGatheringCatalog(): Promise<Array<[number, GatheringInfo]> | undefined> {
  return (await db()).get(GATHER_STORE, GATHER_CATALOG_KEY);
}

export async function putCachedGatheringCatalog(entries: Array<[number, GatheringInfo]>): Promise<void> {
  const handle = await db();
  await handle.put(GATHER_STORE, entries, GATHER_CATALOG_KEY);
  await handle.put(META_STORE, Date.now(), GATHER_CATALOG_TS_KEY);
}

export async function clearGatheringCatalog(): Promise<void> {
  const handle = await db();
  await handle.clear(GATHER_STORE);
  await handle.delete(META_STORE, GATHER_CATALOG_TS_KEY);
}

export async function getGatheringCatalogUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, GATHER_CATALOG_TS_KEY);
}

const RECIPE_SNAPSHOT_KEY = 'snapshot';
const RECIPE_SNAPSHOT_TS_KEY = 'recipeSnapshotUpdatedAt';

export async function getCachedRecipeSnapshot(): Promise<Array<[number, Recipe]> | undefined> {
  return (await db()).get(RECIPE_SNAPSHOT_STORE, RECIPE_SNAPSHOT_KEY);
}

export async function putCachedRecipeSnapshot(entries: Array<[number, Recipe]>): Promise<void> {
  const handle = await db();
  await handle.put(RECIPE_SNAPSHOT_STORE, entries, RECIPE_SNAPSHOT_KEY);
  await handle.put(META_STORE, Date.now(), RECIPE_SNAPSHOT_TS_KEY);
}

export async function clearRecipeSnapshot(): Promise<void> {
  const handle = await db();
  await handle.clear(RECIPE_SNAPSHOT_STORE);
  await handle.delete(META_STORE, RECIPE_SNAPSHOT_TS_KEY);
}

export async function getRecipeSnapshotUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, RECIPE_SNAPSHOT_TS_KEY);
}

// Market price cache (keyed by scope name; value is Array<[itemId, {ts, data}]>).
// Stored per-scope as a single blob for write efficiency.

export interface MarketCacheEntry<T = unknown> { ts: number; data: T }
export type MarketScopeBlob<T = unknown> = Array<[number, MarketCacheEntry<T>]>;

export async function getCachedMarketScope<T = unknown>(scope: string): Promise<MarketScopeBlob<T> | undefined> {
  return (await db()).get(MARKET_STORE, scope);
}

export async function putCachedMarketScope<T = unknown>(scope: string, entries: MarketScopeBlob<T>): Promise<void> {
  await (await db()).put(MARKET_STORE, entries, scope);
}

export async function clearMarketCache(): Promise<void> {
  await (await db()).clear(MARKET_STORE);
}
