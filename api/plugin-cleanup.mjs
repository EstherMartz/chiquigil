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

// src/lib/priceTrust.ts
var MIN_RECENT_SALES = 5;
var MAX_LISTING_RATIO = 5;
function buildCandidates(m, hq, canHq) {
  const out = [];
  if ((hq === "hq" || hq === "either") && canHq) {
    out.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === "nq" || hq === "either") {
    out.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  return out;
}
function passesTrustFilter(c) {
  if (c.rawMin == null) return false;
  if (c.recent < MIN_RECENT_SALES) return false;
  if (c.median == null) return false;
  if (c.rawMin > c.median * MAX_LISTING_RATIO) return false;
  return true;
}
function toTier(c) {
  return { unit: Math.min(c.rawMin, c.median), isHq: c.isHq };
}
function pickHighestTrustedTier(m, hq, canHq) {
  let best = null;
  for (const c of buildCandidates(m, hq, canHq)) {
    if (!passesTrustFilter(c)) continue;
    const tier = toTier(c);
    if (!best || tier.unit > best.unit) best = tier;
  }
  return best;
}

// src/features/cleanup/marketLookup.ts
function lookupMbTier(market, itemId, isHq, canHq) {
  const scopes = [
    { key: "phantom", scope: "home" },
    { key: "dc", scope: "dc" },
    { key: "region", scope: "region" }
  ];
  for (const { key, scope } of scopes) {
    const m = market[key][itemId];
    if (!m) continue;
    const tier = pickHighestTrustedTier(m, isHq ? "hq" : "nq", canHq);
    if (!tier) continue;
    const listingCount = m.listingCount ?? 0;
    return { unit: tier.unit, listingCount, scope };
  }
  return { unit: 0, listingCount: 0, scope: null };
}

// src/features/cleanup/runCleanup.ts
var MB_OVER_VENDOR_RATIO = 1.1;
var MAX_OTHER_CRAFTS = 4;
function buildRow(entry, market, items, crafts) {
  const item = items.get(entry.itemId);
  const priceLow = item?.priceLow ?? 0;
  const vendorRevenue = priceLow * entry.qty;
  const mb = lookupMbTier(market, entry.itemId, entry.isHq, item?.canHq ?? false);
  const mbRevenue = mb.unit * entry.qty;
  const mbListingCount = mb.listingCount;
  const mbScope = mb.scope;
  const mbEligible = mb.unit > 0 && (vendorRevenue === 0 || mbRevenue > vendorRevenue * MB_OVER_VENDOR_RATIO);
  const bestCraft = crafts && crafts.length > 0 ? crafts[0] : null;
  const otherCrafts = crafts ? crafts.slice(1, 1 + MAX_OTHER_CRAFTS) : [];
  const craftScore = bestCraft?.netProfit ?? Number.NEGATIVE_INFINITY;
  const mbScore = mbEligible ? mbRevenue : 0;
  const vendorScore = vendorRevenue;
  let bucket;
  if (bestCraft) bucket = "craft";
  else if (mbScore > 0 && mbScore >= vendorScore) bucket = "sellMb";
  else if (vendorScore > 0) bucket = "vendor";
  else bucket = "discard";
  const candidates = [];
  if (bucket !== "craft" && bestCraft && craftScore > 0) candidates.push({ action: "craft", value: craftScore });
  if (bucket !== "sellMb" && mbScore > 0) candidates.push({ action: "sellMb", value: mbScore });
  if (bucket !== "vendor" && vendorScore > 0) candidates.push({ action: "vendor", value: vendorScore });
  candidates.sort((a, b) => b.value - a.value);
  const runnerUp = candidates[0] ?? null;
  return {
    entry,
    vendorRevenue,
    mbRevenue,
    mbListingCount,
    mbScope,
    bestCraft,
    otherCrafts,
    bucket,
    runnerUp
  };
}
function sortValue(r) {
  switch (r.bucket) {
    case "craft":
      return r.bestCraft?.netProfit ?? 0;
    case "sellMb":
      return r.mbRevenue;
    case "vendor":
      return r.vendorRevenue;
    case "discard":
      return 0;
  }
}
function runCleanup(input) {
  const rows = input.inventory.map(
    (entry) => buildRow(entry, input.market, input.items, input.craftOpportunities.get(entry.itemId))
  );
  const result = {
    craft: rows.filter((r) => r.bucket === "craft").sort((a, b) => sortValue(b) - sortValue(a)),
    sellMb: rows.filter((r) => r.bucket === "sellMb").sort((a, b) => sortValue(b) - sortValue(a)),
    vendor: rows.filter((r) => r.bucket === "vendor").sort((a, b) => sortValue(b) - sortValue(a)),
    discard: rows.filter((r) => r.bucket === "discard"),
    unrecognized: input.unrecognized
  };
  return result;
}

// src/features/cleanup/findCraftOpportunities.ts
var MAX_MISSING = 2;
var MAX_OPPORTUNITIES_PER_ITEM = 5;
function nqUnitPrice(market, itemId, canHq) {
  const mb = lookupMbTier(market, itemId, false, canHq);
  if (mb.unit === 0) return null;
  return { unit: mb.unit, listingCount: mb.listingCount };
}
function coverInventory(recipe, invByItem) {
  const used = [];
  const missing = [];
  for (const ing of recipe.ingredients) {
    const have = invByItem.get(ing.itemId) ?? 0;
    if (have >= ing.amount) {
      used.push({ itemId: ing.itemId, amount: ing.amount });
    } else {
      missing.push({ itemId: ing.itemId, amount: ing.amount - have });
      if (have > 0) used.push({ itemId: ing.itemId, amount: have });
    }
  }
  if (missing.length > MAX_MISSING) return null;
  return { used, missing };
}
function evaluateRecipe(recipe, invByItem, market, items) {
  const outputItem = items.get(recipe.itemResultId);
  if (!outputItem) return null;
  const outputPrice = nqUnitPrice(market, recipe.itemResultId, outputItem.canHq);
  if (!outputPrice) return null;
  const coverage = coverInventory(recipe, invByItem);
  if (!coverage) return null;
  let opportunityCost = 0;
  for (const u of coverage.used) {
    const ingItem = items.get(u.itemId);
    const mbPrice = nqUnitPrice(market, u.itemId, ingItem?.canHq ?? false)?.unit ?? 0;
    const floor = ingItem?.priceLow ?? 0;
    opportunityCost += Math.max(mbPrice, floor) * u.amount;
  }
  let missingCost = 0;
  const missingDetailed = [];
  for (const m of coverage.missing) {
    const ingItem = items.get(m.itemId);
    const mb = nqUnitPrice(market, m.itemId, ingItem?.canHq ?? false);
    if (!mb) return null;
    missingCost += mb.unit * m.amount;
    missingDetailed.push({ itemId: m.itemId, name: ingItem?.name ?? "", amount: m.amount, mbUnitPrice: mb.unit });
  }
  const netProfit = outputPrice.unit - opportunityCost - missingCost;
  const usedDetailed = coverage.used.map((u) => ({
    itemId: u.itemId,
    name: items.get(u.itemId)?.name ?? "",
    amount: u.amount
  }));
  return {
    netProfit,
    opportunity: {
      outputItemId: recipe.itemResultId,
      outputName: outputItem.name,
      outputUnitPrice: outputPrice.unit,
      netProfit,
      usedFromInventory: usedDetailed,
      missingIngredients: missingDetailed
    }
  };
}
function findCraftOpportunities(inventory, recipes, market, items) {
  const invByItem = /* @__PURE__ */ new Map();
  for (const e of inventory) {
    if (e.itemId === 0) continue;
    invByItem.set(e.itemId, (invByItem.get(e.itemId) ?? 0) + e.qty);
  }
  const recipesUsing = /* @__PURE__ */ new Map();
  for (const recipe of recipes.values()) {
    for (const ing of recipe.ingredients) {
      if (!invByItem.has(ing.itemId)) continue;
      let bucket = recipesUsing.get(ing.itemId);
      if (!bucket) {
        bucket = [];
        recipesUsing.set(ing.itemId, bucket);
      }
      bucket.push(recipe);
    }
  }
  const out = /* @__PURE__ */ new Map();
  for (const [invItemId, candidateRecipes] of recipesUsing) {
    const seenRecipeOutput = /* @__PURE__ */ new Set();
    const opts = [];
    for (const recipe of candidateRecipes) {
      if (seenRecipeOutput.has(recipe.itemResultId)) continue;
      seenRecipeOutput.add(recipe.itemResultId);
      const evald = evaluateRecipe(recipe, invByItem, market, items);
      if (evald) opts.push(evald.opportunity);
    }
    opts.sort((a, b) => b.netProfit - a.netProfit);
    if (opts.length > 0) out.set(invItemId, opts.slice(0, MAX_OPPORTUNITIES_PER_ITEM));
  }
  return out;
}

// src/lib/questSnapshot.ts
var CATEGORY_NAMES = {
  8: "CRP",
  9: "BSM",
  10: "ARM",
  11: "GSM",
  12: "LTW",
  13: "WVR",
  14: "ALC",
  15: "CUL",
  16: "MIN",
  17: "BTN",
  18: "FSH"
};
function parseGcSupply(raw) {
  const out = [];
  for (const [levelStr, categories] of Object.entries(raw)) {
    const level = Number(levelStr);
    if (!Number.isFinite(level) || level <= 0) continue;
    for (const [catStr, items] of Object.entries(categories)) {
      const cat = Number(catStr);
      const categoryName = CATEGORY_NAMES[cat];
      if (!categoryName) continue;
      const requiredItems = [];
      for (const item of items) {
        if (item.itemId <= 0 || item.count <= 0) continue;
        requiredItems.push({ itemId: item.itemId, itemName: "", qty: item.count });
      }
      if (requiredItems.length === 0) continue;
      out.push({
        questId: level * 100 + cat,
        questName: `GC Supply Lv.${level}`,
        categoryName,
        level,
        requiredItems
      });
    }
  }
  return out;
}

// src/api/plugin-cleanup.ts
var GC_SUPPLY_URL = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/master/libs/data/src/lib/json/gc-supply.json";
var gcIds = null;
var gcTs = 0;
var GC_TTL_MS = 24 * 60 * 60 * 1e3;
async function loadGcSupplyIds() {
  const now = Date.now();
  if (gcIds && now - gcTs < GC_TTL_MS) return gcIds;
  try {
    const res = await fetch(GC_SUPPLY_URL);
    if (!res.ok) return gcIds ?? /* @__PURE__ */ new Set();
    const raw = await res.json();
    const quests = parseGcSupply(raw);
    const ids = /* @__PURE__ */ new Set();
    for (const q of quests) for (const r of q.requiredItems) ids.add(r.itemId);
    gcIds = ids;
    gcTs = now;
    return ids;
  } catch {
    return gcIds ?? /* @__PURE__ */ new Set();
  }
}
var marketCache = null;
var marketTs = 0;
var MKT_TTL_MS = 10 * 60 * 1e3;
async function loadMarket(baseUrl) {
  const now = Date.now();
  if (marketCache && now - marketTs < MKT_TTL_MS) return marketCache;
  const url = process.env.VITE_CACHE_BLOB_URL ?? process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return marketCache ?? { phantom: {}, dc: {}, region: {}, ts: 0 };
    marketCache = await res.json();
    marketTs = now;
    return marketCache;
  } catch {
    return marketCache ?? { phantom: {}, dc: {}, region: {}, ts: 0 };
  }
}
async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  let raw;
  try {
    const q = req.query.inv;
    if (!q || typeof q !== "string") return res.status(400).json({ error: "Missing inv query param" });
    raw = JSON.parse(q);
    if (!Array.isArray(raw)) throw new Error("not array");
  } catch {
    return res.status(400).json({ error: "inv must be a URL-encoded JSON array of {id, qty, hq}" });
  }
  const baseUrl = process.env.VITE_APP_URL ?? "https://qiqirn.tools";
  const [snapshots, cache, gc] = await Promise.all([
    loadSnapshots(baseUrl),
    loadMarket(baseUrl),
    loadGcSupplyIds()
  ]);
  const inventory = [];
  for (const e of raw) {
    if (!e || e.id <= 0 || e.qty <= 0) continue;
    inventory.push({
      itemId: e.id,
      name: snapshots.namesById.get(e.id) ?? `Item #${e.id}`,
      qty: e.qty,
      isHq: !!e.hq,
      locations: ["bag"]
    });
  }
  const market = { phantom: cache.phantom, dc: cache.dc, region: cache.region };
  const gcRecipes = /* @__PURE__ */ new Map();
  for (const [id, recipe] of snapshots.recipes) {
    if (gc.has(recipe.itemResultId)) gcRecipes.set(id, recipe);
  }
  const craftMap = findCraftOpportunities(inventory, gcRecipes, market, snapshots.itemsById);
  const result = runCleanup({
    inventory,
    market,
    items: snapshots.itemsById,
    craftOpportunities: craftMap,
    unrecognized: []
  });
  const summary = {
    craftCount: result.craft.length,
    sellMbCount: result.sellMb.length,
    vendorCount: result.vendor.length,
    discardCount: result.discard.length,
    vendorTotal: result.vendor.reduce((a, r) => a + r.vendorRevenue, 0),
    mbTotal: result.sellMb.reduce((a, r) => a + r.mbRevenue, 0)
  };
  return res.status(200).json({
    craft: result.craft,
    sellMb: result.sellMb,
    vendor: result.vendor,
    discard: result.discard,
    summary
  });
}
var config = { api: { bodyParser: false } };
export {
  config,
  handler as default
};
