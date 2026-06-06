import { loadSnapshots } from '../bot/loadSnapshots';
import { cheapestWorld } from '../lib/cheapestWorld';
import type { MarketData } from '../lib/universalis';
import { priceRecipe, jobNameOf } from './_item-sources-core';
import { categoryLabel } from '../lib/itemSearchCategories';
import { computeVerdict } from '../features/items/verdict/computeVerdict';

const HOME_WORLD = process.env.HOME_WORLD ?? 'Phantom';

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

let marketCache: SharedCache | null = null;
let marketCacheTs = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function loadMarketCache(baseUrl: string): Promise<SharedCache> {
  const now = Date.now();
  if (marketCache && now - marketCacheTs < CACHE_TTL_MS) return marketCache;
  // Prefer the full live blob (has dc + worldListings); fall back to static cache.
  const url = process.env.VITE_CACHE_BLOB_URL ?? process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
  try {
    const res = await fetch(url, { cache: 'no-store' } as RequestInit);
    if (!res.ok) return marketCache ?? { phantom: {}, dc: {}, region: {}, ts: 0 };
    marketCache = (await res.json()) as SharedCache;
    marketCacheTs = now;
    return marketCache;
  } catch {
    return marketCache ?? { phantom: {}, dc: {}, region: {}, ts: 0 };
  }
}

async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const itemIdStr = req.query.id;
  if (!itemIdStr) {
    return res.status(400).json({ error: 'Missing id query param' });
  }

  const itemId = parseInt(itemIdStr);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }

  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const snapshots = await loadSnapshots(baseUrl);

  const itemName = snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const sources: any[] = [];

  // Load the market cache up front; recipe pricing and the verdict both need it.
  const cache = await loadMarketCache(baseUrl);

  let primaryRecipe: import('../lib/recipes').Recipe | null = null;
  let primaryMaterialCost = 0;

  for (const [outputId, recipe] of snapshots.recipes) {
    if (outputId !== itemId) continue;
    const priced = priceRecipe(recipe, cache.phantom, snapshots);
    if (!primaryRecipe) {
      primaryRecipe = recipe;
      primaryMaterialCost = priced.materialCost;
    }
    sources.push({
      type: 'recipe',
      jobId: 0,
      jobName: jobNameOf(recipe.classJob),
      level: recipe.recipeLevel,
      ingredients: priced.ingredients.map(ing => ({
        itemId: ing.itemId,
        itemName: ing.itemName,
        qty: ing.qty,
        unitPrice: ing.unitPrice,
        source: ing.source,
      })),
      materialCost: priced.materialCost,
      outputQty: recipe.amountResult ?? 1,
    });
  }

  // Vendors
  const vendorPrice = snapshots.vendorMap.get(itemId);
  if (vendorPrice != null) {
    sources.push({
      type: 'vendor',
      npcId: 0, // We don't have NPC ID in the snapshot
      npcName: 'NPC Vendor',
      price: vendorPrice,
    });
  }

  // Gathering
  const gatherInfo = snapshots.gatheringCatalog.get(itemId);
  if (gatherInfo) {
    sources.push({
      type: 'gather',
      level: gatherInfo.level,
      timed: gatherInfo.timed,
    });
  }

  // Special shop
  for (const [currency, entries] of snapshots.specialShop.byCurrency) {
    for (const entry of entries) {
      if (entry.itemId === itemId) {
        sources.push({
          type: 'special_shop',
          currency,
          currencyId: 0, // Would need extended data
          cost: entry.cost,
        });
        break;
      }
    }
  }

  // Company craft
  for (const [craftId, companyCraft] of snapshots.companyCraft) {
    for (const phase of companyCraft.phases || []) {
      for (const ingredient of phase.ingredients || []) {
        if (ingredient.itemId === itemId) {
          sources.push({
            type: 'company_craft',
            craftName: companyCraft.name || `Company Craft #${craftId}`,
            ingredients: phase.ingredients.map(ing => ({
              itemId: ing.itemId,
              itemName: snapshots.namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
              qty: ing.amount,
            })),
          });
          break;
        }
      }
    }
  }

  if (sources.length === 0) {
    sources.push({ type: 'unknown' });
  }

  // Market summary: velocity + where the item is cheapest on the DC ("where to buy").
  let market: {
    velocity: number;
    listingCount: number;
    minNQ: number | null;
    cheapestWorld: string | null;
    cheapestPrice: number | null;
  } | null = null;
  try {
    const dcEntry = cache.dc?.[String(itemId)];
    const homeEntry = cache.phantom?.[String(itemId)];
    if (dcEntry || homeEntry) {
      const best = cheapestWorld(dcEntry);
      market = {
        velocity: dcEntry?.velocity ?? homeEntry?.velocity ?? 0,
        listingCount: dcEntry?.listingCount ?? homeEntry?.listingCount ?? 0,
        minNQ: homeEntry?.minNQ ?? dcEntry?.minNQ ?? null,
        cheapestWorld: best?.world ?? null,
        cheapestPrice: best?.price ?? null,
      };
    }
  } catch {
    // market summary is best-effort
  }

  const meta = snapshots.itemsById.get(itemId);

  // Verdict — reuse the web app's tested computeVerdict. computeVerdict itself
  // returns an "untraded" result when there is no usable home price, so we only
  // skip it entirely when there is neither market data nor a recipe to assess.
  const phantomItem = cache.phantom?.[String(itemId)];
  let verdict: Record<string, unknown> | null = null;
  let runnerUp: Record<string, unknown> | null = null;
  if (phantomItem || primaryRecipe) {
    const vr = computeVerdict({
      phantom: phantomItem,
      region: cache.region?.[String(itemId)],
      recipe: primaryRecipe ?? undefined,
      vendorPrice: snapshots.vendorMap.get(itemId),
      materialCost: primaryMaterialCost,
      homeWorld: HOME_WORLD,
      canHq: meta?.canHq ?? false,
      now: Date.now(),
    });
    verdict = {
      headline: vr.best.headline,
      rationale: vr.best.rationale,
      bestPlay: vr.best.bestPlay,
      bestPlayDetail: vr.best.bestPlayDetail,
      netPerUnit: Math.round(vr.best.netPerUnit),
      gilPerDay: Math.round(vr.best.gilPerDay),
      roi: vr.best.roi,
      risk: vr.best.risk,
      tone: vr.best.tone,
      quality: vr.best.quality,
      kind: vr.best.kind,
    };
    runnerUp = vr.runnerUp
      ? { bestPlay: vr.runnerUp.bestPlay, gilPerDay: Math.round(vr.runnerUp.gilPerDay), kind: vr.runnerUp.kind }
      : null;
  }

  res.setHeader('Cache-Control', 'public, max-age=600');
  return res.status(200).json({
    itemId,
    itemName,
    ilvl: meta?.ilvl ?? 0,
    category: meta?.sc ? categoryLabel(meta.sc) : null,
    rarity: meta?.rarity ?? 0,
    canHq: meta?.canHq ?? false,
    sources,
    market,
    verdict,
    runnerUp,
  });
}

export { handler as default };
