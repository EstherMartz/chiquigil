import { openDB, type IDBPDatabase } from 'idb';
import type { Recipe } from './recipes';

const DB_NAME = 'ffxiv-helper';
const DB_VERSION = 1;
const STORE = 'recipes';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedRecipe(itemId: number): Promise<Recipe | null | undefined> {
  return (await db()).get(STORE, itemId);
}

export async function putCachedRecipe(itemId: number, recipe: Recipe | null): Promise<void> {
  await (await db()).put(STORE, recipe, itemId);
}

export async function clearRecipeCache(): Promise<void> {
  await (await db()).clear(STORE);
}
