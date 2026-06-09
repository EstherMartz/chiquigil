import { openDB, type IDBPDatabase } from 'idb';
import type { Recipe } from './recipes';
import type { SnapshotItem } from './itemSnapshot';
import type { GatheringInfo } from './gatheringCatalog';
import type { SnapshotLeve } from './leveSnapshot';
import type { SpecialShopSnapshot } from './specialShopSnapshot';
import type { CurrencyId } from './currencies';
import type { SnapshotQuest } from './questSnapshot';

const DB_NAME = 'ffxiv-helper';
const DB_VERSION = 12;
const RECIPE_STORE = 'recipes';
const NAME_STORE = 'names';
const ITEM_STORE = 'items';
const META_STORE = 'meta';
const GATHER_STORE = 'gathering';
const RECIPE_SNAPSHOT_STORE = 'recipeSnapshot';
const MARKET_STORE = 'market';
const LEVE_STORE = 'leves';
const GILSHOP_STORE = 'gilShop';
const SPECIALSHOP_STORE = 'specialShop';
const QUEST_STORE = 'quest';
const HISTORY_STORE = 'history';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion, _newVersion, transaction) {
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
        if (!database.objectStoreNames.contains(LEVE_STORE)) {
          database.createObjectStore(LEVE_STORE);
        }
        if (!database.objectStoreNames.contains(GILSHOP_STORE)) {
          database.createObjectStore(GILSHOP_STORE);
        }
        if (!database.objectStoreNames.contains(SPECIALSHOP_STORE)) {
          database.createObjectStore(SPECIALSHOP_STORE);
        }
        if (!database.objectStoreNames.contains(QUEST_STORE)) {
          database.createObjectStore(QUEST_STORE);
        }
        if (!database.objectStoreNames.contains(HISTORY_STORE)) {
          database.createObjectStore(HISTORY_STORE);
        }
        if (oldVersion > 0 && oldVersion < 10) {
          // v10 added priceLow to SnapshotItem; wipe the item store so the next load
          // re-hydrates from the new static bundle (which carries the field).
          // Must reuse the upgrade's versionchange transaction — opening a new one
          // throws InvalidStateError ("A version change transaction is running").
          transaction.objectStore(ITEM_STORE).clear();
          transaction.objectStore(META_STORE).delete(ITEM_SNAPSHOT_TS_KEY);
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

export async function putCachedItems(items: SnapshotItem[], ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(ITEM_STORE, items, ITEM_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), ITEM_SNAPSHOT_TS_KEY);
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

export async function putCachedGatheringCatalog(entries: Array<[number, GatheringInfo]>, ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(GATHER_STORE, entries, GATHER_CATALOG_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), GATHER_CATALOG_TS_KEY);
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

export async function putCachedRecipeSnapshot(entries: Array<[number, Recipe]>, ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(RECIPE_SNAPSHOT_STORE, entries, RECIPE_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), RECIPE_SNAPSHOT_TS_KEY);
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

/** Most-recent entry timestamp across all cached scopes; null if cache is empty. */
export async function getMarketCacheLastFetchedAt(): Promise<number | null> {
  const handle = await db();
  const keys = await handle.getAllKeys(MARKET_STORE);
  let maxTs = 0;
  for (const k of keys) {
    const blob = (await handle.get(MARKET_STORE, k)) as MarketScopeBlob | undefined;
    if (!blob) continue;
    for (const [, entry] of blob) {
      if (entry.ts > maxTs) maxTs = entry.ts;
    }
  }
  return maxTs > 0 ? maxTs : null;
}

const LEVE_SNAPSHOT_KEY = 'snapshot';
const LEVE_SNAPSHOT_TS_KEY = 'leveSnapshotUpdatedAt';

export async function getCachedLeves(): Promise<SnapshotLeve[] | undefined> {
  return (await db()).get(LEVE_STORE, LEVE_SNAPSHOT_KEY);
}

export async function putCachedLeves(leves: SnapshotLeve[], ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(LEVE_STORE, leves, LEVE_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), LEVE_SNAPSHOT_TS_KEY);
}

export async function clearLeveCache(): Promise<void> {
  const handle = await db();
  await handle.clear(LEVE_STORE);
  await handle.delete(META_STORE, LEVE_SNAPSHOT_TS_KEY);
}

export async function getLeveSnapshotUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, LEVE_SNAPSHOT_TS_KEY);
}

const GILSHOP_SNAPSHOT_KEY = 'snapshot';
const GILSHOP_SNAPSHOT_TS_KEY = 'vendorSnapshotUpdatedAt';

export async function getCachedVendorSnapshot(): Promise<Map<number, number> | undefined> {
  const raw = await (await db()).get(GILSHOP_STORE, GILSHOP_SNAPSHOT_KEY) as Array<[number, number]> | undefined;
  if (!raw) return undefined;
  return new Map(raw);
}

export async function putCachedVendorSnapshot(snapshot: Map<number, number>, ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(GILSHOP_STORE, [...snapshot.entries()], GILSHOP_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), GILSHOP_SNAPSHOT_TS_KEY);
}

export async function clearVendorSnapshotCache(): Promise<void> {
  const handle = await db();
  await handle.clear(GILSHOP_STORE);
  await handle.delete(META_STORE, GILSHOP_SNAPSHOT_TS_KEY);
}

export async function getVendorSnapshotUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, GILSHOP_SNAPSHOT_TS_KEY);
}

const SPECIALSHOP_SNAPSHOT_KEY = 'snapshot';
const SPECIALSHOP_SNAPSHOT_TS_KEY = 'specialShopUpdatedAt';

export async function getCachedSpecialShop(): Promise<SpecialShopSnapshot | undefined> {
  const raw = await (await db()).get(SPECIALSHOP_STORE, SPECIALSHOP_SNAPSHOT_KEY) as { byCurrency: Array<[CurrencyId, SpecialShopSnapshot['byCurrency'] extends Map<infer _K, infer V> ? V : never]> } | undefined;
  if (!raw) return undefined;
  return { byCurrency: new Map(raw.byCurrency) };
}

export async function putCachedSpecialShop(snapshot: SpecialShopSnapshot, ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(SPECIALSHOP_STORE, { byCurrency: [...snapshot.byCurrency.entries()] }, SPECIALSHOP_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), SPECIALSHOP_SNAPSHOT_TS_KEY);
}

export async function clearSpecialShopCache(): Promise<void> {
  const handle = await db();
  await handle.clear(SPECIALSHOP_STORE);
  await handle.delete(META_STORE, SPECIALSHOP_SNAPSHOT_TS_KEY);
}

export async function getSpecialShopUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, SPECIALSHOP_SNAPSHOT_TS_KEY);
}

const QUEST_SNAPSHOT_KEY = 'snapshot';
const QUEST_SNAPSHOT_TS_KEY = 'questSnapshotUpdatedAt';

export async function getCachedQuests(): Promise<SnapshotQuest[] | undefined> {
  return (await db()).get(QUEST_STORE, QUEST_SNAPSHOT_KEY);
}

export async function putCachedQuests(quests: SnapshotQuest[], ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(QUEST_STORE, quests, QUEST_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), QUEST_SNAPSHOT_TS_KEY);
}

export async function clearQuestCache(): Promise<void> {
  const handle = await db();
  await handle.clear(QUEST_STORE);
  await handle.delete(META_STORE, QUEST_SNAPSHOT_TS_KEY);
}

export async function getQuestSnapshotUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, QUEST_SNAPSHOT_TS_KEY);
}

// Sale-history cache: one record per (scope, item, window), keyed
// `${scope}:${itemId}:${withinSeconds}`. Value carries a fetch timestamp so the
// caller can TTL it. Batched get/put share a single transaction so a watchlist's
// worth of items costs one round-trip, not one per id.

export interface HistoryCacheEntry { ts: number; entries: unknown[] }

export async function getCachedHistories(keys: string[]): Promise<Map<string, HistoryCacheEntry>> {
  const out = new Map<string, HistoryCacheEntry>();
  if (keys.length === 0) return out;
  const tx = (await db()).transaction(HISTORY_STORE, 'readonly');
  await Promise.all(keys.map(async (k) => {
    const v = (await tx.store.get(k)) as HistoryCacheEntry | undefined;
    if (v) out.set(k, v);
  }));
  await tx.done;
  return out;
}

export async function putCachedHistories(entries: Array<[string, HistoryCacheEntry]>): Promise<void> {
  if (entries.length === 0) return;
  const tx = (await db()).transaction(HISTORY_STORE, 'readwrite');
  await Promise.all(entries.map(([k, v]) => tx.store.put(v, k)));
  await tx.done;
}

export async function clearHistoryCache(): Promise<void> {
  await (await db()).clear(HISTORY_STORE);
}
