import { openDB, type IDBPDatabase } from 'idb';
import type { Recipe } from './recipes';

const DB_NAME = 'ffxiv-helper';
const DB_VERSION = 2;
const RECIPE_STORE = 'recipes';
const NAME_STORE = 'names';

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
