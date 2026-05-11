import { openDB, type IDBPDatabase } from 'idb';
import type { Recipe } from './recipes';
import type { SnapshotItem } from './itemSnapshot';

const DB_NAME = 'ffxiv-helper';
const DB_VERSION = 3;
const RECIPE_STORE = 'recipes';
const NAME_STORE = 'names';
const ITEM_STORE = 'items';
const META_STORE = 'meta';

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
