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

// src/lib/cheapestWorld.ts
function cheapestWorld(m, hq) {
  if (!m || !m.worldListings || m.worldListings.length === 0) return null;
  let best = null;
  for (const l of m.worldListings) {
    if (hq != null && l.hq !== hq) continue;
    if (l.price <= 0) continue;
    if (best === null || l.price < best.price) best = { world: l.world, price: l.price };
  }
  return best;
}

// src/api/plugin-item-sources.ts
var marketCache = null;
var marketCacheTs = 0;
var CACHE_TTL_MS = 10 * 60 * 1e3;
async function loadMarketCache(baseUrl) {
  const now = Date.now();
  if (marketCache && now - marketCacheTs < CACHE_TTL_MS) return marketCache;
  const url = process.env.VITE_CACHE_BLOB_URL ?? process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return marketCache ?? { phantom: {}, dc: {}, region: {}, ts: 0 };
    marketCache = await res.json();
    marketCacheTs = now;
    return marketCache;
  } catch {
    return marketCache ?? { phantom: {}, dc: {}, region: {}, ts: 0 };
  }
}
async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const itemIdStr = req.query.id;
  if (!itemIdStr) {
    return res.status(400).json({ error: "Missing id query param" });
  }
  const itemId = parseInt(itemIdStr);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: "Invalid item id" });
  }
  const baseUrl = process.env.VITE_APP_URL ?? "https://qiqirn.tools";
  const snapshots = await loadSnapshots(baseUrl);
  const itemName = snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const sources = [];
  const jobNames = {
    8: "Carpenter",
    9: "Blacksmith",
    10: "Armorer",
    11: "Goldsmith",
    12: "Weaver",
    13: "Leatherworker",
    14: "Carpenter",
    15: "Alchemist",
    16: "Culinarian"
  };
  for (const [outputId, recipe] of snapshots.recipes) {
    if (outputId === itemId) {
      const jobName = jobNames[recipe.classJobId] || `Job #${recipe.classJobId}`;
      sources.push({
        type: "recipe",
        jobId: recipe.classJobId,
        jobName,
        level: recipe.recipeLevel?.stars || 1,
        ingredients: recipe.ingredients.map((ing) => ({
          itemId: ing.itemId,
          itemName: snapshots.namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
          qty: ing.amount
        })),
        outputQty: recipe.amountResult ?? 1
      });
    }
  }
  const vendorPrice = snapshots.vendorMap.get(itemId);
  if (vendorPrice != null) {
    sources.push({
      type: "vendor",
      npcId: 0,
      // We don't have NPC ID in the snapshot
      npcName: "NPC Vendor",
      price: vendorPrice
    });
  }
  const gatherInfo = snapshots.gatheringCatalog.get(itemId);
  if (gatherInfo) {
    sources.push({
      type: "gather",
      level: gatherInfo.level,
      timed: gatherInfo.timed
    });
  }
  for (const [currency, entries] of snapshots.specialShop.byCurrency) {
    for (const entry of entries) {
      if (entry.itemId === itemId) {
        sources.push({
          type: "special_shop",
          currency,
          currencyId: 0,
          // Would need extended data
          cost: entry.cost
        });
        break;
      }
    }
  }
  for (const [craftId, companyCraft] of snapshots.companyCraft) {
    for (const phase of companyCraft.phases || []) {
      for (const ingredient of phase.ingredients || []) {
        if (ingredient.itemId === itemId) {
          sources.push({
            type: "company_craft",
            craftName: companyCraft.name || `Company Craft #${craftId}`,
            ingredients: phase.ingredients.map((ing) => ({
              itemId: ing.itemId,
              itemName: snapshots.namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
              qty: ing.amount
            }))
          });
          break;
        }
      }
    }
  }
  if (sources.length === 0) {
    sources.push({ type: "unknown" });
  }
  let market = null;
  try {
    const cache = await loadMarketCache(baseUrl);
    const dcEntry = cache.dc?.[String(itemId)];
    const homeEntry = cache.phantom?.[String(itemId)];
    if (dcEntry || homeEntry) {
      const best = cheapestWorld(dcEntry);
      market = {
        velocity: dcEntry?.velocity ?? homeEntry?.velocity ?? 0,
        listingCount: dcEntry?.listingCount ?? homeEntry?.listingCount ?? 0,
        minNQ: homeEntry?.minNQ ?? dcEntry?.minNQ ?? null,
        cheapestWorld: best?.world ?? null,
        cheapestPrice: best?.price ?? null
      };
    }
  } catch {
  }
  return res.status(200).json({
    itemId,
    itemName,
    sources,
    market
  });
}
export {
  handler as default
};
