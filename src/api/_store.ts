import { openCraftStore, type CraftStore } from '../bot/craftStore';

let storePromise: Promise<CraftStore> | null = null;

/** Shared Turso store accessor for the auth endpoints. Honors the
 *  `__testCraftStore` injection used by the handler tests. */
export function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}
