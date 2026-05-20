import type { SnapshotItem } from './itemSnapshot';
import type { SnapshotLeve } from './leveSnapshot';
import type { SnapshotQuest } from './questSnapshot';
import type { Recipe } from './recipes';
import type { GatheringInfo } from './gatheringCatalog';
import type { ShopEntry, SpecialShopSnapshot } from './specialShopSnapshot';
import type { CurrencyId } from './currencies';

const BASE = '/data/snapshots';

export interface StaticBundle<T> {
  data: T;
  bakedAt: number;
}

async function load<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadStaticItemsSnapshot(): Promise<StaticBundle<SnapshotItem[]> | null> {
  const raw = await load<{ bakedAt: number; items: SnapshotItem[] }>(`${BASE}/items.json`);
  return raw ? { bakedAt: raw.bakedAt, data: raw.items } : null;
}

export async function loadStaticLevesSnapshot(): Promise<StaticBundle<SnapshotLeve[]> | null> {
  const raw = await load<{ bakedAt: number; leves: SnapshotLeve[] }>(`${BASE}/leves.json`);
  return raw ? { bakedAt: raw.bakedAt, data: raw.leves } : null;
}

export async function loadStaticRecipesSnapshot(): Promise<StaticBundle<Map<number, Recipe>> | null> {
  const raw = await load<{ bakedAt: number; entries: Array<[number, Recipe]> }>(`${BASE}/recipes.json`);
  return raw ? { bakedAt: raw.bakedAt, data: new Map(raw.entries) } : null;
}

export async function loadStaticVendorSnapshot(): Promise<StaticBundle<Map<number, number>> | null> {
  const raw = await load<{ bakedAt: number; entries: Array<[number, number]> }>(`${BASE}/vendorShop.json`);
  return raw ? { bakedAt: raw.bakedAt, data: new Map(raw.entries) } : null;
}

export async function loadStaticSpecialShopSnapshot(): Promise<StaticBundle<SpecialShopSnapshot> | null> {
  const raw = await load<{ bakedAt: number; byCurrency: Array<[CurrencyId, ShopEntry[]]> }>(`${BASE}/specialShop.json`);
  return raw ? { bakedAt: raw.bakedAt, data: { byCurrency: new Map(raw.byCurrency) } } : null;
}

export async function loadStaticGatheringCatalog(): Promise<StaticBundle<Map<number, GatheringInfo>> | null> {
  const raw = await load<{ bakedAt: number; entries: Array<[number, GatheringInfo]> }>(`${BASE}/gathering.json`);
  return raw ? { bakedAt: raw.bakedAt, data: new Map(raw.entries) } : null;
}

export async function loadStaticQuestSnapshot(): Promise<StaticBundle<SnapshotQuest[]> | null> {
  const raw = await load<{ bakedAt: number; quests: SnapshotQuest[] }>(`${BASE}/quests.json`);
  return raw ? { bakedAt: raw.bakedAt, data: raw.quests } : null;
}
