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

/**
 * The bake timestamp from the lightweight manifest, used to decide whether a
 * cached snapshot is stale relative to the deployed bundle. Returns null when
 * the manifest can't be read (offline / older deploy) — callers must treat
 * null as "can't tell, keep the cache" rather than forcing a re-fetch.
 */
export async function loadSnapshotManifestBakedAt(): Promise<number | null> {
  const raw = await load<{ bakedAt: number }>(`${BASE}/manifest.json`);
  return raw && typeof raw.bakedAt === 'number' ? raw.bakedAt : null;
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

export interface WhatsNewData {
  prevBakedAt: number | null;
  newItems: number[];
  newRecipeItems: number[];
}

export async function loadStaticWhatsNewSnapshot(): Promise<StaticBundle<WhatsNewData> | null> {
  const raw = await load<{ bakedAt: number; prevBakedAt: number | null; newItems: number[]; newRecipeItems: number[] }>(
    `${BASE}/whatsNew.json`,
  );
  return raw
    ? { bakedAt: raw.bakedAt, data: { prevBakedAt: raw.prevBakedAt, newItems: raw.newItems, newRecipeItems: raw.newRecipeItems } }
    : null;
}

export interface RawGlamourEntry {
  item: string;
  uses: number;
}

export interface GlamourRankingData {
  generatedAt: string | null;
  ranking: RawGlamourEntry[];
}

/** Which glamour-usage window to load: all-time vs the last-month scrape. */
export type GlamourPeriod = 'all' | 'recent';

const GLAMOUR_FILES: Record<GlamourPeriod, string> = {
  all: 'glamours.json',
  recent: 'glamours-recent.json',
};

/**
 * Loads an Eorzea Collection glamour-item ranking produced by the standalone
 * scraper (see docs/scraping-glamours.md). `period` selects the all-time vs
 * last-month window. Plain fetch, null on failure — the page treats null as
 * "no data yet" and shows an empty state.
 */
export async function loadStaticGlamourRanking(
  period: GlamourPeriod = 'all',
): Promise<GlamourRankingData | null> {
  const raw = await load<{ generated_at?: string; ranking?: RawGlamourEntry[] }>(
    `${BASE}/${GLAMOUR_FILES[period]}`,
  );
  if (!raw) return null;
  return {
    generatedAt: typeof raw.generated_at === 'string' ? raw.generated_at : null,
    ranking: Array.isArray(raw.ranking) ? raw.ranking : [],
  };
}
