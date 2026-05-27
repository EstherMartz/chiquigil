// src/lib/recipeCache.ts
import { openDB } from "idb";

// src/lib/priceTrust.ts
var TRIM_FRACTION = 0.1;
function trimmedMedian(prices) {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const k = Math.floor(sorted.length * TRIM_FRACTION);
  const trimmed = sorted.slice(k, sorted.length - k);
  const n = trimmed.length;
  if (n === 0) return sorted[Math.floor(sorted.length / 2)];
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (trimmed[mid - 1] + trimmed[mid]) / 2 : trimmed[mid];
}

// src/lib/universalis.ts
function minPrice(arr, hq) {
  const v = arr.filter((l) => l.hq === hq).map((l) => l.pricePerUnit);
  return v.length ? Math.min(...v) : null;
}
function avgPrice(arr, hq) {
  const v = arr.filter((l) => l.hq === hq).map((l) => l.pricePerUnit);
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
function parseMarketResponse(raw) {
  const out = {};
  const items = raw.items ?? (typeof raw.itemID === "number" ? { [String(raw.itemID)]: raw } : {});
  for (const [id, item] of Object.entries(items)) {
    const listings = item.listings ?? [];
    const history = item.recentHistory ?? [];
    const nqHist = history.filter((h) => !h.hq).map((h) => h.pricePerUnit);
    const hqHist = history.filter((h) => h.hq).map((h) => h.pricePerUnit);
    out[id] = {
      minNQ: minPrice(listings, false),
      minHQ: minPrice(listings, true),
      avgNQ: avgPrice(history, false),
      avgHQ: avgPrice(history, true),
      medianNQ: trimmedMedian(nqHist),
      medianHQ: trimmedMedian(hqHist),
      recentSalesNQ: nqHist.length,
      recentSalesHQ: hqHist.length,
      velocity: item.regularSaleVelocity ?? 0,
      lastUploadTime: item.lastUploadTime ?? 0,
      listingCount: listings.length,
      worldListings: listings.map((l) => ({
        world: l.worldName ?? "",
        price: l.pricePerUnit,
        hq: l.hq
      })),
      averagePriceNQ: item.averagePriceNQ ?? null,
      averagePriceHQ: item.averagePriceHQ ?? null
    };
  }
  return out;
}

// src/bot/marketFetch.ts
var BATCH_SIZE = 100;
var MAX_CONCURRENT = 8;
async function fetchBatch(scope, ids) {
  const url = `https://universalis.app/api/v2/${scope}/${ids.join(",")}?listings=10&entries=15`;
  let res = await fetch(url);
  if (!res.ok) {
    await new Promise((r) => setTimeout(r, 400));
    res = await fetch(url);
  }
  if (!res.ok) return {};
  const raw = await res.json();
  return parseMarketResponse(raw);
}
async function fetchScope(scope, batches) {
  const merged = {};
  const queue = [...batches];
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const idx = cursor++;
      const result = await fetchBatch(scope, queue[idx]);
      Object.assign(merged, result);
    }
  }
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => worker());
  await Promise.all(workers);
  return merged;
}
async function fetchMarketForOutputs(ids, world, dc, region) {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  const batches = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    batches.push(unique.slice(i, i + BATCH_SIZE));
  }
  const [phantom, dcData, regionData] = await Promise.all([
    fetchScope(world, batches),
    fetchScope(dc, batches),
    fetchScope(region, batches)
  ]);
  return { phantom, dc: dcData, region: regionData };
}

// src/bot/marketCache.ts
import { put } from "@vercel/blob";
async function writeMarketCache(cache) {
  const blob = await put("market-cache.json", JSON.stringify(cache), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true
  });
  return blob.url;
}

// src/bot/loadSnapshots.ts
var cached = null;
async function loadSnapshots(baseUrl) {
  if (cached) return cached;
  const [itemsRaw, recipesRaw, vendorRaw, specialRaw, gatherRaw, companyCraftRaw] = await Promise.all([
    fetch(`${baseUrl}/data/snapshots/items.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/recipes.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/vendorShop.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/specialShop.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/gathering.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/companyCraft.json`).then((r) => r.json())
  ]);
  const itemsById = /* @__PURE__ */ new Map();
  const namesById = /* @__PURE__ */ new Map();
  for (const item of itemsRaw.items) {
    itemsById.set(item.id, item);
    namesById.set(item.id, item.name);
  }
  const recipes = /* @__PURE__ */ new Map();
  for (const [id, recipe] of recipesRaw.entries) {
    recipes.set(id, recipe);
  }
  const vendorMap = /* @__PURE__ */ new Map();
  for (const [id, price] of vendorRaw.entries) {
    vendorMap.set(id, price);
  }
  const specialShop = {
    byCurrency: new Map(
      specialRaw.byCurrency.map(
        ([currency, entries]) => [currency, entries]
      )
    )
  };
  const gatheringCatalog = /* @__PURE__ */ new Map();
  for (const [id, info] of gatherRaw.entries) {
    gatheringCatalog.set(id, info);
  }
  const companyCraft = /* @__PURE__ */ new Map();
  for (const [id, recipe] of companyCraftRaw.entries) {
    companyCraft.set(id, recipe);
  }
  cached = { itemsById, namesById, recipes, vendorMap, specialShop, gatheringCatalog, companyCraft };
  return cached;
}

// src/api/refresh-cache.ts
var WORLD = process.env.HOME_WORLD ?? "Phantom";
var DC = process.env.HOME_DC ?? "Chaos";
var REGION = process.env.REGION ?? "Europe";
var SECRET = process.env.REFRESH_SECRET ?? "";
async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: "Unauthorized" });
  const t0 = Date.now();
  try {
    const proto = req.headers["x-forwarded-proto"] ?? "https";
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
    const baseUrl = `${proto}://${host}`;
    const snapshots = await loadSnapshots(baseUrl);
    const ids = [...snapshots.itemsById.keys()];
    console.log(`[refresh] fetching ${ids.length} items across 3 scopes...`);
    const bundle = await fetchMarketForOutputs(ids, WORLD, DC, REGION);
    const cache = { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts: Date.now() };
    const blobUrl = await writeMarketCache(cache);
    const elapsed = ((Date.now() - t0) / 1e3).toFixed(1);
    console.log(`[refresh] done in ${elapsed}s, ${ids.length} items, blob: ${blobUrl}`);
    return res.status(200).json({ ok: true, items: ids.length, elapsed: `${elapsed}s`, blobUrl });
  } catch (e) {
    console.error("[refresh] error:", e);
    return res.status(500).json({ error: e.message });
  }
}
export {
  handler as default
};
