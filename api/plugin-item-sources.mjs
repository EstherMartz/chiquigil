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

// src/api/_item-sources-core.ts
function classifyIngredientSource(itemId, snapshots) {
  if (snapshots.vendorMap.has(itemId)) return "vendor";
  if (snapshots.gatheringCatalog.has(itemId)) return "gather";
  if (snapshots.recipes.has(itemId)) return "craft";
  return "mb";
}
var JOB_NAME_BY_CODE = {
  CRP: "Carpenter",
  BSM: "Blacksmith",
  ARM: "Armorer",
  GSM: "Goldsmith",
  LTW: "Leatherworker",
  WVR: "Weaver",
  ALC: "Alchemist",
  CUL: "Culinarian",
  ANY: "Any Crafter"
};
function jobNameOf(code) {
  return JOB_NAME_BY_CODE[code] ?? code;
}
function priceRecipe(recipe, phantom, snapshots) {
  let materialCost = 0;
  const ingredients = recipe.ingredients.map((ing) => {
    const m = phantom[String(ing.itemId)];
    const unitPrice = m?.minNQ ?? m?.minHQ ?? null;
    materialCost += (unitPrice ?? 0) * ing.amount;
    return {
      itemId: ing.itemId,
      itemName: snapshots.namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
      qty: ing.amount,
      unitPrice,
      source: classifyIngredientSource(ing.itemId, snapshots)
    };
  });
  return { ingredients, materialCost };
}

// src/lib/itemSearchCategories.ts
var ITEM_SEARCH_CATEGORIES = [
  { id: 1, name: "Primary Arms", group: "Weapons" },
  { id: 2, name: "Primary Tools", group: "Tools" },
  { id: 3, name: "Primary Tools", group: "Tools" },
  { id: 4, name: "Armor", group: "Armor" },
  { id: 5, name: "Accessories", group: "Accessories" },
  { id: 6, name: "Medicines", group: "Medicines & Meals" },
  { id: 7, name: "Materials", group: "Materials" },
  { id: 8, name: "Other", group: "Other" },
  { id: 9, name: "Pugilist's Arms", group: "Weapons" },
  { id: 10, name: "Gladiator's Arms", group: "Weapons" },
  { id: 11, name: "Marauder's Arms", group: "Weapons" },
  { id: 12, name: "Archer's Arms", group: "Weapons" },
  { id: 13, name: "Lancer's Arms", group: "Weapons" },
  { id: 14, name: "Thaumaturge's Arms", group: "Weapons" },
  { id: 15, name: "Conjurer's Arms", group: "Weapons" },
  { id: 16, name: "Arcanist's Arms", group: "Weapons" },
  { id: 17, name: "Shields", group: "Weapons" },
  { id: 18, name: "Dancer's Arms", group: "Weapons" },
  { id: 19, name: "Carpenter's Tools", group: "Tools" },
  { id: 20, name: "Blacksmith's Tools", group: "Tools" },
  { id: 21, name: "Armorer's Tools", group: "Tools" },
  { id: 22, name: "Goldsmith's Tools", group: "Tools" },
  { id: 23, name: "Leatherworker's Tools", group: "Tools" },
  { id: 24, name: "Weaver's Tools", group: "Tools" },
  { id: 25, name: "Alchemist's Tools", group: "Tools" },
  { id: 26, name: "Culinarian's Tools", group: "Tools" },
  { id: 27, name: "Miner's Tools", group: "Tools" },
  { id: 28, name: "Botanist's Tools", group: "Tools" },
  { id: 29, name: "Fisher's Tools", group: "Tools" },
  { id: 30, name: "Fishing Tackle", group: "Tools" },
  { id: 31, name: "Head", group: "Armor" },
  { id: 32, name: "Undershirts", group: "Armor" },
  { id: 33, name: "Body", group: "Armor" },
  { id: 34, name: "Undergarments", group: "Armor" },
  { id: 35, name: "Legs", group: "Armor" },
  { id: 36, name: "Hands", group: "Armor" },
  { id: 37, name: "Feet", group: "Armor" },
  { id: 38, name: "Waist", group: "Armor" },
  { id: 39, name: "Necklaces", group: "Accessories" },
  { id: 40, name: "Earrings", group: "Accessories" },
  { id: 41, name: "Bracelets", group: "Accessories" },
  { id: 42, name: "Rings", group: "Accessories" },
  { id: 43, name: "Medicine", group: "Medicines & Meals" },
  { id: 44, name: "Ingredients", group: "Medicines & Meals" },
  { id: 45, name: "Meals", group: "Medicines & Meals" },
  { id: 46, name: "Seafood", group: "Medicines & Meals" },
  { id: 47, name: "Stone", group: "Materials" },
  { id: 48, name: "Metal", group: "Materials" },
  { id: 49, name: "Lumber", group: "Materials" },
  { id: 50, name: "Cloth", group: "Materials" },
  { id: 51, name: "Leather", group: "Materials" },
  { id: 52, name: "Bone", group: "Materials" },
  { id: 53, name: "Reagents", group: "Materials" },
  { id: 54, name: "Dyes", group: "Materials" },
  { id: 55, name: "Weapon Parts", group: "Other" },
  { id: 56, name: "Furnishings", group: "Housing" },
  { id: 57, name: "Materia", group: "Materials" },
  { id: 58, name: "Crystals", group: "Materials" },
  { id: 59, name: "Catalysts", group: "Materials" },
  { id: 60, name: "Miscellany", group: "Other" },
  { id: 61, name: "Soul Crystals", group: "Materials" },
  { id: 62, name: "Arrows", group: "Weapons" },
  { id: 63, name: "Quest Items", group: "Other" },
  { id: 64, name: "Other", group: "Other" },
  { id: 65, name: "Exterior Fixtures", group: "Housing" },
  { id: 66, name: "Interior Fixtures", group: "Housing" },
  { id: 67, name: "Outdoor Furnishings", group: "Housing" },
  { id: 68, name: "Chairs and Beds", group: "Housing" },
  { id: 69, name: "Tables", group: "Housing" },
  { id: 70, name: "Tabletop", group: "Housing" },
  { id: 71, name: "Wall-mounted", group: "Housing" },
  { id: 72, name: "Rugs", group: "Housing" },
  { id: 73, name: "Rogue's Arms", group: "Weapons" },
  { id: 74, name: "Seasonal Miscellany", group: "Other" },
  { id: 75, name: "Minions", group: "Other" },
  { id: 76, name: "Dark Knight's Arms", group: "Weapons" },
  { id: 77, name: "Machinist's Arms", group: "Weapons" },
  { id: 78, name: "Astrologian's Arms", group: "Weapons" },
  { id: 79, name: "Airship/Submersible Components", group: "Materials" },
  { id: 80, name: "Orchestrion Components", group: "Materials" },
  { id: 81, name: "Gardening Items", group: "Housing" },
  { id: 82, name: "Paintings", group: "Housing" },
  { id: 83, name: "Samurai's Arms", group: "Weapons" },
  { id: 84, name: "Red Mage's Arms", group: "Weapons" },
  { id: 85, name: "Scholar's Arms", group: "Weapons" },
  { id: 86, name: "Gunbreaker's Arms", group: "Weapons" },
  { id: 87, name: "Dancer's Arms", group: "Weapons" },
  { id: 88, name: "Reaper's Arms", group: "Weapons" },
  { id: 89, name: "Sage's Arms", group: "Weapons" },
  { id: 90, name: "Registrable Miscellany", group: "Other" },
  { id: 91, name: "Viper's Arms", group: "Weapons" },
  { id: 92, name: "Pictomancer's Arms", group: "Weapons" }
];
function categoryLabel(id) {
  return ITEM_SEARCH_CATEGORIES.find((c) => c.id === id)?.name ?? `SC ${id}`;
}
var CATEGORY_GROUPS = (() => {
  const order = [];
  const byGroup = /* @__PURE__ */ new Map();
  for (const c of ITEM_SEARCH_CATEGORIES) {
    let ids = byGroup.get(c.group);
    if (!ids) {
      ids = [];
      byGroup.set(c.group, ids);
      order.push(c.group);
    }
    ids.push(c.id);
  }
  return order.map((label) => ({ label, ids: byGroup.get(label) }));
})();

// src/features/items/verdict/pricing.ts
var MB_TAX = 0.05;
var FRESH_HOURS = 24;
var STALE_DAYS = 14;
var FULL_LIQUIDITY_SALES = 10;
var HEALTHY_VELOCITY = 5;
var CONFIDENCE_LOW = 0.35;
var BLEND_GIL = 0.5;
var BLEND_ROI = 0.5;
var RUNNER_UP_MIN_SCORE = 0.05;
var ARB_DISCOUNT = 0.7;
var clamp01 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
function applyTax(price) {
  return price * (1 - MB_TAX);
}
function captureShare(listingCount) {
  const n = listingCount > 0 ? listingCount : 0;
  return 1 / (1 + n);
}
function effectiveUnitsPerDay(velocity, listingCount) {
  return velocity * captureShare(listingCount);
}
function robustSellPrice(m, quality) {
  const lowest = quality === "HQ" ? m.minHQ : m.minNQ;
  const avg = quality === "HQ" ? m.avgHQ : m.avgNQ;
  const recent = quality === "HQ" ? m.recentSalesHQ : m.recentSalesNQ;
  if (recent > 0 && avg != null) {
    return lowest != null ? Math.min(lowest, avg) : avg;
  }
  if (lowest != null) return lowest;
  return null;
}
function ageScore(lastUploadTime, now) {
  if (lastUploadTime <= 0) return 0;
  const ageHours = (now - lastUploadTime) / 36e5;
  const staleHours = STALE_DAYS * 24;
  if (ageHours <= FRESH_HOURS) return 1;
  if (ageHours >= staleHours) return 0;
  return 1 - (ageHours - FRESH_HOURS) / (staleHours - FRESH_HOURS);
}
function liquidityScore(m, quality) {
  const recent = quality === "HQ" ? m.recentSalesHQ : m.recentSalesNQ;
  const bySales = recent / FULL_LIQUIDITY_SALES;
  const byVelocity = m.velocity / HEALTHY_VELOCITY;
  return clamp01(Math.max(bySales, byVelocity));
}
function confidence(m, quality, now) {
  return ageScore(m.lastUploadTime, now) * liquidityScore(m, quality);
}
function riskLabel(conf, velocity) {
  if (conf < CONFIDENCE_LOW) return "Low confidence \u2014 stale or thin data";
  if (velocity >= HEALTHY_VELOCITY) return "Strong \u2014 moves daily";
  if (velocity >= 1) return "Steady";
  return "Slow seller";
}
function playMetrics(sellPrice, cost, m, quality, now) {
  const netPerUnit = applyTax(sellPrice) - cost;
  const units = effectiveUnitsPerDay(m.velocity, m.listingCount);
  return {
    netPerUnit,
    effectiveUnitsPerDay: units,
    gilPerDay: netPerUnit * units,
    roi: cost > 0 ? netPerUnit / cost : null,
    confidence: confidence(m, quality, now)
  };
}

// src/lib/format.ts
function fmtGil(n) {
  if (n == null) return "\u2014";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (abs >= 1e4) return sign + Math.round(abs / 1e3) + "k";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + "k";
  const rounded = Math.round(abs);
  return rounded === 0 ? "0" : sign + rounded.toLocaleString("en-US");
}

// src/features/items/verdict/plays.ts
function homeQuality(canHq) {
  return canHq ? "HQ" : "NQ";
}
function bestForeignListing(m, homeWorld, canHq) {
  if (!m) return null;
  const candidates = m.worldListings.filter((l) => l.world !== homeWorld && l.hq === canHq).sort((a, b) => a.price - b.price);
  return candidates[0] ?? null;
}
function listPlay(phantom, now) {
  const quality = phantom.recentSalesHQ > phantom.recentSalesNQ ? "HQ" : "NQ";
  const sellPrice = robustSellPrice(phantom, quality);
  if (sellPrice == null) return null;
  const mtr = playMetrics(sellPrice, 0, phantom, quality, now);
  const thin = mtr.confidence < 0.35 && phantom.velocity < 1;
  return {
    kind: "list",
    quality,
    sellPrice,
    cost: 0,
    ...mtr,
    score: 0,
    headline: thin ? "Don't trust the home price" : "Normal marketboard listing",
    rationale: thin ? `Only ${phantom.listingCount} listing(s) and ${phantom.velocity.toFixed(1)} sales/day \u2014 the listed price likely isn't backed by real trades.` : `Sells around ${fmtGil(sellPrice)} at ${phantom.velocity.toFixed(1)}/day. No obvious arb or craft edge.`,
    bestPlay: "List on MB",
    bestPlayDetail: `~ ${fmtGil(sellPrice)} per unit (${quality})`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: thin ? "bad" : phantom.velocity >= 1 ? "gold" : "mute"
  };
}
function craftPlay(phantom, recipe, materialCost, quality, now) {
  if (materialCost <= 0) return null;
  const sellPrice = robustSellPrice(phantom, quality);
  if (sellPrice == null) return null;
  const mtr = playMetrics(sellPrice, materialCost, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: "craft",
    quality,
    sellPrice,
    cost: materialCost,
    ...mtr,
    score: 0,
    headline: `Craft and sell (${quality})`,
    rationale: `Materials cost about ${fmtGil(materialCost)}; ${quality} sells around ${fmtGil(sellPrice)} at ${phantom.velocity.toFixed(1)}/day.`,
    bestPlay: "Craft-flip",
    bestPlayDetail: `${recipe.classJob} \xB7 Lv ${recipe.recipeLevel} \xB7 ${quality}`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: "gold"
  };
}
function arbPlay(phantom, region, homeWorld, canHq, now) {
  const quality = homeQuality(canHq);
  const homePrice = robustSellPrice(phantom, quality);
  if (homePrice == null) return null;
  const foreign = bestForeignListing(region, homeWorld, canHq);
  if (!foreign || foreign.price <= 0 || foreign.price >= homePrice * ARB_DISCOUNT) return null;
  const mtr = playMetrics(homePrice, foreign.price, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: "arb",
    quality,
    sellPrice: homePrice,
    cost: foreign.price,
    ...mtr,
    score: 0,
    headline: `Cheaper on ${foreign.world}`,
    rationale: `Buy on ${foreign.world} for ${fmtGil(foreign.price)}, resell home around ${fmtGil(homePrice)}.`,
    bestPlay: "Cross-world arb",
    bestPlayDetail: `Buy on ${foreign.world} \xB7 resell home`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: "good"
  };
}
function vendorPlay(phantom, vendorPrice, canHq, now) {
  if (!vendorPrice || vendorPrice <= 0) return null;
  const quality = homeQuality(canHq);
  const homePrice = robustSellPrice(phantom, quality);
  if (homePrice == null) return null;
  const mtr = playMetrics(homePrice, vendorPrice, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: "vendor",
    quality,
    sellPrice: homePrice,
    cost: vendorPrice,
    ...mtr,
    score: 0,
    headline: "Buy from NPC, sell on MB",
    rationale: `Vendor sells for ${fmtGil(vendorPrice)}, MB sells around ${fmtGil(homePrice)}.`,
    bestPlay: "Vendor flip",
    bestPlayDetail: `Buy ${fmtGil(vendorPrice)} \u2192 sell ${fmtGil(homePrice)}`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: "gold"
  };
}

// src/features/items/verdict/computeVerdict.ts
function untradedVerdict() {
  return {
    best: {
      kind: "untraded",
      quality: "NQ",
      sellPrice: 0,
      cost: 0,
      netPerUnit: 0,
      effectiveUnitsPerDay: 0,
      gilPerDay: 0,
      roi: null,
      confidence: 0,
      score: 0,
      headline: "Not enough data",
      rationale: "No marketboard activity on the home world. Check Garland or Universalis, or wait for a listing.",
      bestPlay: "Wait or check externally",
      bestPlayDetail: "No play yet",
      risk: "n/a",
      tone: "mute"
    },
    runnerUp: null
  };
}
function computeVerdict(input) {
  const { phantom, region, recipe, vendorPrice, materialCost, homeWorld, canHq, now } = input;
  if (!phantom || robustSellPrice(phantom, "NQ") == null && robustSellPrice(phantom, "HQ") == null) {
    return untradedVerdict();
  }
  const candidates = [];
  const push = (p) => {
    if (p) candidates.push(p);
  };
  push(listPlay(phantom, now));
  if (recipe) {
    push(craftPlay(phantom, recipe, materialCost, "NQ", now));
    if (canHq) push(craftPlay(phantom, recipe, materialCost, "HQ", now));
  }
  push(arbPlay(phantom, region, homeWorld, canHq, now));
  push(vendorPlay(phantom, vendorPrice, canHq, now));
  const maxGil = Math.max(1, ...candidates.map((c) => c.gilPerDay));
  const roiVals = candidates.filter((c) => c.roi != null).map((c) => c.roi);
  const maxRoi = roiVals.length ? Math.max(1, ...roiVals) : 1;
  const costBearingRNorms = candidates.filter((c) => c.roi != null).map((c) => c.roi / maxRoi);
  const meanRoiNorm = costBearingRNorms.length ? costBearingRNorms.reduce((a, b) => a + b, 0) / costBearingRNorms.length : 0;
  for (const c of candidates) {
    const gNorm = c.gilPerDay / maxGil;
    const rNorm = c.roi != null ? c.roi / maxRoi : meanRoiNorm;
    c.score = c.confidence * (BLEND_GIL * gNorm + BLEND_ROI * rNorm);
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates.find((c) => c.kind !== "list") ?? candidates[0];
  const runnerUp = candidates.find(
    (c) => c !== best && c.kind !== best.kind && c.score >= RUNNER_UP_MIN_SCORE
  ) ?? null;
  return { best, runnerUp };
}

// src/api/plugin-item-sources.ts
var HOME_WORLD = process.env.HOME_WORLD ?? "Phantom";
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
  const cache = await loadMarketCache(baseUrl);
  let primaryRecipe = null;
  let primaryMaterialCost = 0;
  for (const [outputId, recipe] of snapshots.recipes) {
    if (outputId !== itemId) continue;
    const priced = priceRecipe(recipe, cache.phantom, snapshots);
    if (!primaryRecipe) {
      primaryRecipe = recipe;
      primaryMaterialCost = priced.materialCost;
    }
    sources.push({
      type: "recipe",
      jobId: 0,
      jobName: jobNameOf(recipe.classJob),
      level: recipe.recipeLevel,
      ingredients: priced.ingredients.map((ing) => ({
        itemId: ing.itemId,
        itemName: ing.itemName,
        qty: ing.qty,
        unitPrice: ing.unitPrice,
        source: ing.source
      })),
      materialCost: priced.materialCost,
      outputQty: recipe.amountResult ?? 1
    });
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
  const meta = snapshots.itemsById.get(itemId);
  const phantomItem = cache.phantom?.[String(itemId)];
  let verdict = null;
  let runnerUp = null;
  if (phantomItem || primaryRecipe) {
    const vr = computeVerdict({
      phantom: phantomItem,
      region: cache.region?.[String(itemId)],
      recipe: primaryRecipe ?? void 0,
      vendorPrice: snapshots.vendorMap.get(itemId),
      materialCost: primaryMaterialCost,
      homeWorld: HOME_WORLD,
      canHq: meta?.canHq ?? false,
      now: Date.now()
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
      kind: vr.best.kind
    };
    runnerUp = vr.runnerUp ? { bestPlay: vr.runnerUp.bestPlay, gilPerDay: Math.round(vr.runnerUp.gilPerDay), kind: vr.runnerUp.kind } : null;
  }
  res.setHeader("Cache-Control", "public, max-age=600");
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
    runnerUp
  });
}
export {
  handler as default
};
