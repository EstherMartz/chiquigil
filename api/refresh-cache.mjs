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
  let raw;
  try {
    raw = await res.json();
  } catch (e) {
    console.warn(`[marketFetch] ${scope}: non-JSON body for ${ids.length}-id batch \u2014 ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
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
  const phantom = await fetchScope(world, batches);
  const dcData = await fetchScope(dc, batches);
  const regionData = await fetchScope(region, batches);
  return { phantom, dc: dcData, region: regionData };
}

// src/bot/marketCache.ts
import { AwsClient } from "aws4fetch";
var DEFAULT_MAX_AGE = 2592e3;
function r2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicUrl = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  return { accountId, bucket, accessKeyId, secretAccessKey, publicUrl };
}
async function writeBlobJson(name, data, cacheControlMaxAge = DEFAULT_MAX_AGE) {
  const { accountId, bucket, accessKeyId, secretAccessKey, publicUrl } = r2();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials missing (need R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }
  const client = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  const res = await client.fetch(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${name}`, {
    method: "PUT",
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${cacheControlMaxAge}`
    }
  });
  if (!res.ok) {
    throw new Error(`R2 put ${name} failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return `${publicUrl}/${name}`;
}
async function readBlobJson(name) {
  const { publicUrl } = r2();
  if (!publicUrl) return null;
  try {
    const res = await fetch(`${publicUrl}/${name}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
async function writeMarketCache(cache, name = "market-cache.json", cacheControlMaxAge) {
  return writeBlobJson(name, cache, cacheControlMaxAge);
}

// src/bot/refreshMarket.ts
async function refreshHot(cfg) {
  const ids = await readBlobJson("hot-ids.json");
  if (!ids || ids.length === 0) return { seeded: false };
  const bundle = await fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
  const ts = Date.now();
  const blobUrl = await writeMarketCache(
    { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts },
    "market-cache-hot.json",
    300
    // 5 min: matches hot-cache refresh cadence
  );
  return { seeded: true, items: ids.length, blobUrl };
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
    const result = await refreshHot({ world: WORLD, dc: DC, region: REGION });
    if (!result.seeded) {
      console.warn("[refresh:hot] hot-ids.json not seeded \u2014 run the refresh-market GitHub Action first");
      return res.status(503).json({ error: "hot-ids.json not seeded \u2014 run the refresh-market GitHub Action first" });
    }
    const elapsed = ((Date.now() - t0) / 1e3).toFixed(1);
    console.log(`[refresh:hot] done in ${elapsed}s, ${result.items} items, blob: ${result.blobUrl}`);
    return res.status(200).json({ ok: true, items: result.items, elapsed: `${elapsed}s`, blobUrl: result.blobUrl });
  } catch (e) {
    console.error("[refresh:hot] error:", e);
    return res.status(500).json({ error: e.message });
  }
}
export {
  handler as default
};
