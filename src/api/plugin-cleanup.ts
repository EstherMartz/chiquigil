import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadSnapshots } from '../bot/loadSnapshots';
import type { MarketData } from '../lib/universalis';
import type { MarketBundle } from '../watchlist/useMarketData';
import type { Recipe } from '../lib/recipes';
import { runCleanup } from '../features/cleanup/runCleanup';
import { findCraftOpportunities } from '../features/cleanup/findCraftOpportunities';
import { parseGcSupply } from '../lib/questSnapshot';
import type { InventoryEntry } from '../features/cleanup/types';
import { loadMarketBundle } from '../lib/marketBundle';

// Teamcraft GC-supply turn-in data (questSnapshot.ts keeps this private).
const GC_SUPPLY_URL =
  'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/master/libs/data/src/lib/json/gc-supply.json';

interface InvIn { id: number; qty: number; hq?: boolean }

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

// ── GC-supply ids (module-cached; powers the Craft bucket scoping) ─────────
let gcIds: Set<number> | null = null;
let gcTs = 0;
const GC_TTL_MS = 24 * 60 * 60 * 1000;

async function loadGcSupplyIds(): Promise<Set<number>> {
  const now = Date.now();
  if (gcIds && now - gcTs < GC_TTL_MS) return gcIds;
  try {
    const res = await fetch(GC_SUPPLY_URL);
    if (!res.ok) return gcIds ?? new Set();
    const raw = await res.json();
    const quests = parseGcSupply(raw as Parameters<typeof parseGcSupply>[0]);
    const ids = new Set<number>();
    for (const q of quests) for (const r of q.requiredItems) ids.add(r.itemId);
    gcIds = ids;
    gcTs = now;
    return ids;
  } catch {
    return gcIds ?? new Set();
  }
}

// ── Market blob (full: phantom/dc/region with worldListings) ───────────────
let marketCache: SharedCache | null = null;
let marketTs = 0;
const MKT_TTL_MS = 10 * 60 * 1000;

async function loadMarket(baseUrl: string): Promise<SharedCache> {
  const now = Date.now();
  if (marketCache && now - marketTs < MKT_TTL_MS) return marketCache;
  // Shared cold+hot loader (hourly cold + ~5-min hot, hot wins). See marketBundle.ts.
  const bundle = await loadMarketBundle(process.env, {
    defaultColdUrl: `${baseUrl}/data/market-cache-cold.json`,
    defaultHotUrl: `${baseUrl}/data/market-cache-hot.json`,
  });
  if (bundle) {
    marketCache = bundle;
    marketTs = now;
  }
  return marketCache ?? { phantom: {}, dc: {}, region: {}, ts: 0 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Parse inventory: URL-encoded JSON array of {id, qty, hq}
  let raw: InvIn[];
  try {
    const q = req.query.inv;
    if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Missing inv query param' });
    raw = JSON.parse(q) as InvIn[];
    if (!Array.isArray(raw)) throw new Error('not array');
  } catch {
    return res.status(400).json({ error: 'inv must be a URL-encoded JSON array of {id, qty, hq}' });
  }

  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const [snapshots, cache, gc] = await Promise.all([
    loadSnapshots(baseUrl),
    loadMarket(baseUrl),
    loadGcSupplyIds(),
  ]);

  // Build InventoryEntry[] (one per id+hq the plugin sent).
  const inventory: InventoryEntry[] = [];
  for (const e of raw) {
    if (!e || e.id <= 0 || e.qty <= 0) continue;
    inventory.push({
      itemId: e.id,
      name: snapshots.namesById.get(e.id) ?? `Item #${e.id}`,
      qty: e.qty,
      isHq: !!e.hq,
      locations: ['bag'],
    });
  }

  const market = { phantom: cache.phantom, dc: cache.dc, region: cache.region } as unknown as MarketBundle;

  // Craft scoping: only recipes whose output is a GC-supply turn-in (matches web).
  const gcRecipes = new Map<number, Recipe>();
  for (const [id, recipe] of snapshots.recipes) {
    if (gc.has(recipe.itemResultId)) gcRecipes.set(id, recipe);
  }

  const craftMap = findCraftOpportunities(inventory, gcRecipes, market, snapshots.itemsById);
  const result = runCleanup({
    inventory,
    market,
    items: snapshots.itemsById,
    craftOpportunities: craftMap,
    unrecognized: [],
  });

  const summary = {
    craftCount: result.craft.length,
    sellMbCount: result.sellMb.length,
    vendorCount: result.vendor.length,
    discardCount: result.discard.length,
    vendorTotal: result.vendor.reduce((a, r) => a + r.vendorRevenue, 0),
    mbTotal: result.sellMb.reduce((a, r) => a + r.mbRevenue, 0),
  };

  return res.status(200).json({
    craft: result.craft,
    sellMb: result.sellMb,
    vendor: result.vendor,
    discard: result.discard,
    summary,
  });
}

export const config = { api: { bodyParser: false } };
