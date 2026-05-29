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

// src/api/plugin-trading-query.ts
var HOUSING_CATS = [56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82];
var MATERIAL_CATS = [7, 47, 48, 49, 50, 51, 52, 53, 54, 57, 58, 59, 61, 79, 80];
var PRESETS = [
  {
    id: "mega-value-hq",
    label: "Mega Value HQ",
    category: "trading",
    filter: { searchCategories: [], hq: "hq", minDealPct: 30, minVelocity: 0, minPrice: 1e6, maxPrice: null, sort: "unitPrice", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "fast-sellers-hq",
    label: "Fast Sellers HQ",
    category: "trading",
    filter: { searchCategories: [], hq: "hq", minDealPct: 15, minVelocity: 3, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "food-potions",
    label: "Food & Potions",
    category: "trading",
    filter: { searchCategories: [43, 45], hq: "either", minDealPct: 20, minVelocity: 0, minPrice: null, maxPrice: null, sort: "discount", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "furnishings",
    label: "Furnishings discount",
    category: "trading",
    filter: { searchCategories: HOUSING_CATS, hq: "nq", minDealPct: 30, minVelocity: 0, minPrice: null, maxPrice: null, sort: "discount", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "out-of-stock",
    label: "Out of Stock",
    category: "trading",
    filter: { searchCategories: [], hq: "either", minDealPct: 0, minVelocity: 0.14, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: 0, mode: "standard", minGap: null }
  },
  {
    id: "out-of-stock-nq",
    label: "Out of Stock NQ",
    category: "trading",
    filter: { searchCategories: [], hq: "nq", minDealPct: 0, minVelocity: 0.14, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: 0, mode: "standard", minGap: null }
  },
  {
    id: "high-value-materials",
    label: "High-value materials",
    category: "trading",
    filter: { searchCategories: MATERIAL_CATS, hq: "either", minDealPct: 0, minVelocity: 0, minPrice: 1e5, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "minions-quick-sell",
    label: "Minions quick sell",
    category: "trading",
    filter: { searchCategories: [75], hq: "either", minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: 5e4, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "treasure-maps",
    label: "Treasure Maps",
    category: "trading",
    filter: { searchCategories: [64], hq: "either", minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "glamour-gear",
    label: "Glamour Gear",
    category: "trading",
    filter: { searchCategories: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], hq: "either", minDealPct: 0, minVelocity: 0.5, minPrice: 2e4, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "top-food",
    label: "Top Food",
    category: "trading",
    filter: { searchCategories: [45], hq: "hq", minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "top-fish",
    label: "Top Fish",
    category: "trading",
    filter: { searchCategories: [46], hq: "either", minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "top-tinctures",
    label: "Top Tinctures",
    category: "trading",
    filter: { searchCategories: [43], hq: "hq", minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "top-dyes",
    label: "Top Dyes",
    category: "trading",
    filter: { searchCategories: [54], hq: "nq", minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "top-materia",
    label: "Top Materia",
    category: "trading",
    filter: { searchCategories: [57], hq: "either", minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "top-minions",
    label: "Top Minions",
    category: "trading",
    filter: { searchCategories: [75], hq: "either", minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  },
  {
    id: "gather-commodities",
    label: "Gatherer commodities",
    category: "gathering",
    filter: { searchCategories: [44, 46, 47, 48, 49, 50, 53, 58, 81], hq: "nq", minDealPct: 0, minVelocity: 5, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null }
  }
];
var PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));
var marketCache = null;
var marketCacheTs = 0;
var CACHE_TTL_MS = 10 * 60 * 1e3;
async function loadMarketCache() {
  const now = Date.now();
  if (marketCache && now - marketCacheTs < CACHE_TTL_MS) return marketCache;
  const url = process.env.VITE_CACHE_BLOB_URL;
  if (!url) return { phantom: {}, dc: {} };
  try {
    const res = await fetch(url);
    if (!res.ok) return marketCache ?? { phantom: {}, dc: {} };
    marketCache = await res.json();
    marketCacheTs = now;
    return marketCache;
  } catch {
    return marketCache ?? { phantom: {}, dc: {} };
  }
}
function pickTier(m, hq) {
  function tierFor(unit, avg, isHq) {
    if (avg == null || avg <= 0) return null;
    return { unit: unit ?? avg, avg, isHq };
  }
  if (hq === "hq") return tierFor(m.minHQ, m.averagePriceHQ, true);
  if (hq === "nq") return tierFor(m.minNQ, m.averagePriceNQ, false);
  const candidates = [tierFor(m.minHQ, m.averagePriceHQ, true), tierFor(m.minNQ, m.averagePriceNQ, false)].filter((c) => c !== null);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => a.unit <= b.unit ? a : b);
}
function runStandardQuery(snapshot, priceMap, filter) {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out = [];
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === "hq" && !item.canHq) continue;
    const m = priceMap[String(item.id)];
    if (!m) continue;
    const tier = pickTier(m, filter.hq);
    if (!tier) continue;
    const dealPct = Math.round((tier.avg - tier.unit) / tier.avg * 100);
    const gilFlow = tier.unit * m.velocity;
    if (dealPct < filter.minDealPct) continue;
    if (m.velocity < filter.minVelocity) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;
    if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;
    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      unitPrice: tier.unit,
      averagePrice: tier.avg,
      dealPct,
      velocity: m.velocity,
      gilFlow,
      hq: tier.isHq
    });
  }
  out.sort((a, b) => {
    switch (filter.sort) {
      case "discount":
        return b.dealPct - a.dealPct;
      case "gilFlow":
        return b.gilFlow - a.gilFlow;
      case "velocity":
        return b.velocity - a.velocity;
      case "unitPrice":
        return b.unitPrice - a.unitPrice;
    }
  });
  return out.slice(0, filter.limit);
}
async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { preset: presetId, world } = req.query;
  let filter = null;
  if (presetId) {
    const p = PRESET_MAP.get(String(presetId));
    if (!p) return res.status(400).json({ error: `Unknown preset: ${presetId}` });
    filter = { ...p.filter };
  } else {
    const hqRaw = req.query.hq ?? "either";
    filter = {
      searchCategories: req.query.sc ? String(req.query.sc).split(",").map(Number).filter(Boolean) : [],
      hq: ["hq", "nq", "either"].includes(hqRaw) ? hqRaw : "either",
      minDealPct: parseFloat(req.query.d) || 0,
      minVelocity: parseFloat(req.query.v) || 0,
      minPrice: req.query.pmin ? parseInt(req.query.pmin) : null,
      maxPrice: req.query.pmax ? parseInt(req.query.pmax) : null,
      sort: ["discount", "gilFlow", "velocity", "unitPrice"].includes(req.query.s) ? req.query.s : "gilFlow",
      limit: Math.min(200, Math.max(1, parseInt(req.query.l) || 100)),
      scope: req.query.scope === "home" ? "home" : "dc",
      maxListings: req.query.ml != null ? parseInt(req.query.ml) : null,
      mode: "standard",
      minGap: null
    };
  }
  if (filter.mode !== "standard") {
    return res.status(400).json({ error: "Only standard mode is supported by the plugin API currently." });
  }
  const baseUrl = process.env.VITE_APP_URL ?? "https://qiqirn.tools";
  const [snapshots, market] = await Promise.all([
    loadSnapshots(baseUrl),
    loadMarketCache()
  ]);
  const snapshot = [...snapshots.itemsById.values()];
  let priceMap;
  if (filter.scope === "home") {
    if (!world) return res.status(400).json({ error: "world param required for scope=home queries" });
    const worldKey = String(world).toLowerCase();
    priceMap = market[worldKey] ?? market.phantom ?? {};
  } else {
    priceMap = market.dc ?? {};
  }
  const rows = runStandardQuery(snapshot, priceMap, filter);
  return res.status(200).json({
    rows,
    total: rows.length,
    preset: presetId ?? null,
    scope: filter.scope === "home" ? world ?? "home" : "dc",
    mode: filter.mode
  });
}
export {
  handler as default
};
