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
var LISTINGS_CAP = 50;
var LISTINGS_KEPT = LISTINGS_CAP;
var MARKET_FIELD_PATHS = [
  "itemID",
  "listings.pricePerUnit",
  "listings.hq",
  "listings.worldName",
  "listings.quantity",
  "listings.retainerName",
  "recentHistory.pricePerUnit",
  "recentHistory.hq",
  "recentHistory.timestamp",
  "regularSaleVelocity",
  "lastUploadTime",
  "averagePriceNQ",
  "averagePriceHQ",
  "listingsCount"
];
function marketFields(idCount) {
  const prefix = idCount > 1 ? "items." : "";
  return MARKET_FIELD_PATHS.map((p) => prefix + p).join(",");
}
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
    const saleTimes = history.map((h) => h.timestamp).filter((t) => typeof t === "number" && t > 0);
    const lastSaleMs = saleTimes.length ? Math.max(...saleTimes) * 1e3 : null;
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
      // True total listings (Universalis' count, capped at the fetch cap), not
      // just the rows we keep. Falls back to the row count if absent.
      listingCount: item.listingsCount ?? listings.length,
      // Keep only the cheapest rows (API returns cheapest-first) so the cache
      // stays small even when many listings are fetched for the count.
      worldListings: listings.slice(0, LISTINGS_KEPT).map((l) => ({
        world: l.worldName ?? "",
        price: l.pricePerUnit,
        hq: l.hq,
        quantity: l.quantity ?? 1,
        seller: l.retainerName ?? ""
      })),
      averagePriceNQ: item.averagePriceNQ ?? null,
      averagePriceHQ: item.averagePriceHQ ?? null,
      lastSaleMs
    };
  }
  return out;
}

// src/bot/marketFetch.ts
var BATCH_SIZE = 100;
var MAX_CONCURRENT = 8;
async function fetchBatch(scope, ids) {
  const url = `https://universalis.app/api/v2/${scope}/${ids.join(",")}?listings=${LISTINGS_CAP}&entries=15&fields=${marketFields(ids.length)}`;
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
import { put, head } from "@vercel/blob";
async function writeBlobJson(name, data) {
  const blob = await put(name, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true
  });
  return blob.url;
}
async function readBlobJson(name) {
  try {
    const meta = await head(name);
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
async function writeMarketCache(cache, name = "market-cache.json") {
  return writeBlobJson(name, cache);
}

// src/bot/loadSnapshots.ts
async function loadItemIds(baseUrl) {
  const raw = await fetch(`${baseUrl}/data/snapshots/items.json`).then((r) => r.json());
  return raw.items.map((i) => i.id);
}

// src/bot/hotSet.ts
function selectHotIds(bundle, velocityThreshold) {
  const hot = /* @__PURE__ */ new Set();
  for (const scope of [bundle.phantom, bundle.dc, bundle.region]) {
    for (const [id, item] of Object.entries(scope)) {
      if (item.velocity >= velocityThreshold) hot.add(Number(id));
    }
  }
  return [...hot].sort((a, b) => a - b);
}

// src/bot/marketDiff.ts
var SPIKE_PCT = 20;
var CRASH_PCT = -20;
var EMPTY_MAX = 2;
function diffMarket(prev, next, now) {
  const out = [];
  for (const [idStr, n] of Object.entries(next)) {
    const p = prev[idStr];
    if (!p) continue;
    const itemId = Number(idStr);
    if (p.listingCount > EMPTY_MAX && n.listingCount <= EMPTY_MAX) {
      out.push({
        itemId,
        kind: "empty",
        world: "",
        oldValue: p.listingCount,
        newValue: n.listingCount,
        changePct: null,
        velocity: n.velocity,
        gilPerDay: 0,
        detectedAt: now
      });
      continue;
    }
    if (p.minNQ != null && p.minNQ > 0 && n.minNQ != null) {
      const changePct = (n.minNQ - p.minNQ) / p.minNQ * 100;
      const kind = changePct <= CRASH_PCT ? "crash" : changePct >= SPIKE_PCT ? "spike" : null;
      if (kind) {
        out.push({
          itemId,
          kind,
          world: n.worldListings[0]?.world ?? "",
          oldValue: p.minNQ,
          newValue: n.minNQ,
          changePct: Math.round(changePct * 10) / 10,
          velocity: n.velocity,
          gilPerDay: Math.round(n.minNQ * n.velocity),
          detectedAt: now
        });
      }
    }
  }
  return out;
}
function mergeOpportunities(existing, fresh, ttlMs, now) {
  const byKey = /* @__PURE__ */ new Map();
  const keyOf = (o) => `${o.itemId}:${o.kind}`;
  for (const o of existing) byKey.set(keyOf(o), o);
  for (const o of fresh) byKey.set(keyOf(o), o);
  const cutoff = now - ttlMs;
  return [...byKey.values()].filter((o) => o.detectedAt >= cutoff).sort((a, b) => b.detectedAt - a.detectedAt);
}

// src/api/refresh-cache.ts
var WORLD = process.env.HOME_WORLD ?? "Phantom";
var DC = process.env.HOME_DC ?? "Chaos";
var REGION = process.env.REGION ?? "Europe";
var SECRET = process.env.REFRESH_SECRET ?? "";
var VELOCITY_THRESHOLD = Number(process.env.HOT_VELOCITY_THRESHOLD ?? 10);
var OPP_TTL_MS = 2 * 60 * 60 * 1e3;
async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: "Unauthorized" });
  const tier = req.query.tier === "hot" ? "hot" : "cold";
  const t0 = Date.now();
  try {
    const proto = req.headers["x-forwarded-proto"] ?? "https";
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
    const baseUrl = `${proto}://${host}`;
    const ids = tier === "hot" ? await readBlobJson("hot-ids.json") ?? await loadItemIds(baseUrl) : await loadItemIds(baseUrl);
    console.log(`[refresh:${tier}] fetching ${ids.length} items across 3 scopes...`);
    const bundle = await fetchMarketForOutputs(ids, WORLD, DC, REGION);
    const blobName = tier === "hot" ? "market-cache-hot.json" : "market-cache-cold.json";
    const prev = await readBlobJson(blobName);
    const cache = { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts: Date.now() };
    const blobUrl = await writeMarketCache(cache, blobName);
    let oppCount;
    if (prev) {
      const fresh = diffMarket(prev.dc, cache.dc, cache.ts);
      const existing = (await readBlobJson("opportunities.json"))?.opportunities ?? [];
      const merged = mergeOpportunities(existing, fresh, OPP_TTL_MS, cache.ts);
      await writeBlobJson("opportunities.json", { ts: cache.ts, opportunities: merged });
      oppCount = merged.length;
    }
    let hotCount;
    if (tier === "cold") {
      const hotIds = selectHotIds(bundle, VELOCITY_THRESHOLD);
      await writeBlobJson("hot-ids.json", hotIds);
      hotCount = hotIds.length;
    }
    const elapsed = ((Date.now() - t0) / 1e3).toFixed(1);
    console.log(`[refresh:${tier}] done in ${elapsed}s, ${ids.length} items, blob: ${blobUrl}`);
    return res.status(200).json({ ok: true, tier, items: ids.length, hotCount, oppCount, elapsed: `${elapsed}s`, blobUrl });
  } catch (e) {
    console.error(`[refresh:${tier}] error:`, e);
    return res.status(500).json({ error: e.message });
  }
}
export {
  handler as default
};
