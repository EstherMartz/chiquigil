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
function categoriesByGroup(group) {
  return ITEM_SEARCH_CATEGORIES.filter((c) => c.group === group).map((c) => c.id);
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
function pickFirstTrustedTier(m, hq, canHq) {
  for (const c of buildCandidates(m, hq, canHq)) {
    if (!passesTrustFilter(c)) continue;
    return toTier(c);
  }
  return null;
}

// src/features/items/verdict/pricing.ts
function captureShare(listingCount) {
  const n = listingCount > 0 ? listingCount : 0;
  return 1 / (1 + n);
}

// src/features/profit/computeProfit.ts
function unitCost(itemId, dc, phantom) {
  const d = dc[itemId];
  if (d?.minNQ != null) return d.minNQ;
  const p = phantom[itemId];
  if (p?.avgNQ != null) return p.avgNQ;
  return 0;
}
function computeMaterialLeaves(recipe, recipeMap, marketDc, flags, phantom = {}, depth = 0, mult = 1) {
  const out = [];
  for (const ing of recipe.ingredients) {
    const subRecipe = recipeMap.get(ing.itemId);
    const wantsCraft = flags[ing.itemId]?.craftIntermediates;
    if (wantsCraft && subRecipe && depth === 0) {
      out.push(...computeMaterialLeaves(subRecipe, recipeMap, marketDc, flags, phantom, depth + 1, mult * ing.amount));
    } else {
      out.push({ itemId: ing.itemId, qty: ing.amount * mult, unitPrice: unitCost(ing.itemId, marketDc, phantom) });
    }
  }
  return out;
}

// src/features/queries/commonFilters.ts
var CRYSTALS_SEARCH_CATEGORY = 58;
function passesMarketGate(market, gate) {
  if (market.velocity < gate.minVelocity) return false;
  if (gate.maxListings != null && market.listingCount > gate.maxListings) return false;
  return true;
}

// src/features/profit/materialSourcing.ts
function classifySource(itemId, sc, catalog) {
  if (sc === CRYSTALS_SEARCH_CATEGORY) return "crystal";
  const g = catalog.get(itemId);
  if (g) return g.timed ? "gather-timed" : "gather-standard";
  return "buy";
}
function deriveSourcing(leaves, scById, catalog, profit) {
  const byId = /* @__PURE__ */ new Map();
  let total = 0;
  for (const leaf of leaves) {
    const subtotal = leaf.qty * leaf.unitPrice;
    total += subtotal;
    const existing = byId.get(leaf.itemId);
    if (existing) {
      existing.qty += leaf.qty;
      existing.subtotal += subtotal;
    } else {
      const source = classifySource(leaf.itemId, scById.get(leaf.itemId), catalog);
      byId.set(leaf.itemId, {
        itemId: leaf.itemId,
        qty: leaf.qty,
        unitPrice: leaf.unitPrice,
        subtotal,
        source,
        gatherable: source !== "buy"
      });
    }
  }
  if (total === 0) return null;
  let gatherableCost = 0;
  for (const ing of byId.values()) if (ing.gatherable) gatherableCost += ing.subtotal;
  const buyOnlyCost = total - gatherableCost;
  const ingredients = [...byId.values()].sort((a, b) => {
    if (a.gatherable !== b.gatherable) return a.gatherable ? 1 : -1;
    return b.subtotal - a.subtotal;
  });
  return {
    ingredients,
    totalMaterialCost: total,
    gatherableCost,
    buyOnlyCost,
    gatherablePct: gatherableCost / total * 100,
    selfSourceProfit: profit + gatherableCost
  };
}

// src/features/items/concentration.ts
var HHI_THIN = 0.5;
var HHI_MODERATE = 0.28;
function concentrationHHI(listings, hq) {
  const rows = listings.filter((l) => l.hq === hq && l.price > 0 && l.seller);
  if (rows.length === 0) return null;
  const unitsBySeller = /* @__PURE__ */ new Map();
  let totalUnits = 0;
  for (const l of rows) {
    const q = l.quantity ?? 1;
    const seller = l.seller;
    unitsBySeller.set(seller, (unitsBySeller.get(seller) ?? 0) + q);
    totalUnits += q;
  }
  if (totalUnits === 0) return null;
  let hhi = 0;
  let topSellerShare = 0;
  for (const units of unitsBySeller.values()) {
    const share = units / totalUnits;
    hhi += share * share;
    if (share > topSellerShare) topSellerShare = share;
  }
  const sellerCount = unitsBySeller.size;
  const risk = sellerCount <= 2 || hhi >= HHI_THIN ? "thin" : hhi >= HHI_MODERATE ? "moderate" : "deep";
  return { hhi, topSellerShare, sellerCount, risk };
}

// src/features/items/ActivityCard.tsx
import { useMemo } from "react";

// src/lib/recipeCache.ts
import { openDB } from "idb";

// src/features/items/ActivityCard.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function supplyDepth(listings, velocity) {
  if (velocity <= 0) {
    return { days: null, note: listings > 0 ? "listed but not selling" : "no recent sales" };
  }
  if (listings === 0) return { days: 0, note: "sold out \u2014 none listed" };
  const days = listings / velocity;
  if (days < 1) return { days, note: "clears in under a day" };
  if (days < 14) return { days, note: `~${Math.round(days)}d to clear` };
  return { days, note: `oversupplied \xB7 ~${Math.round(days)}d to clear` };
}

// src/features/items/depth.ts
var BUCKET_COUNT = 8;
function depthBuckets(listings, hq) {
  const rows = listings.filter((l) => l.hq === hq && l.price > 0);
  if (rows.length === 0) return [];
  const prices = rows.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const width = (max - min) / BUCKET_COUNT;
  const buckets = /* @__PURE__ */ new Map();
  for (const l of rows) {
    const idx = width === 0 ? 0 : Math.min(BUCKET_COUNT - 1, Math.floor((l.price - min) / width));
    let acc = buckets.get(idx);
    if (!acc) {
      acc = { units: 0, sellers: /* @__PURE__ */ new Set(), listings: 0 };
      buckets.set(idx, acc);
    }
    acc.units += l.quantity ?? 1;
    acc.listings += 1;
    if (l.seller) acc.sellers.add(l.seller);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([idx, acc]) => ({
    priceLow: Math.round(width === 0 ? min : min + idx * width),
    priceHigh: Math.round(width === 0 ? max : min + (idx + 1) * width),
    units: acc.units,
    sellers: acc.sellers.size,
    listings: acc.listings
  }));
}

// src/features/queries/craftListingAnalysis.ts
var RISK_ORDER = ["DOMINATED", "CROWDED", "HEALTHY", "OPEN", "EMPTY"];
var GAP_GREEN = 0.2;
var GAP_AMBER = 0.05;
function listingGap(listings, hq) {
  const prices = listings.filter((x) => x.hq === hq && x.price > 0).map((x) => x.price).sort((a, b) => a - b);
  if (prices.length === 0) {
    return { cheapest: 0, secondTier: null, gap: 0, gapPct: 0, hasSecondTier: false, onlyListing: false, empty: true };
  }
  const cheapest = prices[0];
  const onlyListing = prices.length <= 1;
  const second = prices.find((p) => p > cheapest) ?? null;
  if (second == null) {
    return {
      cheapest,
      secondTier: null,
      gap: 0,
      gapPct: onlyListing ? Infinity : 0,
      hasSecondTier: false,
      onlyListing,
      empty: false
    };
  }
  const gap = second - cheapest;
  return {
    cheapest,
    secondTier: second,
    gap,
    gapPct: cheapest > 0 ? gap / cheapest : 0,
    hasSecondTier: true,
    onlyListing: false,
    empty: false
  };
}
function classifyCraftRisk(a) {
  if (a.empty) return "EMPTY";
  if (a.onlyListing || a.sellerCount <= 1) return "OPEN";
  if (a.topSellerShare > 0.6) return "DOMINATED";
  if (a.gapPct < 0.02 && a.sellerCount > 5) return "DOMINATED";
  if (a.gapPct >= GAP_GREEN && (a.sellerCount <= 3 || a.topSellerShare < 0.4) && a.clearDays !== null && a.clearDays < 3) return "OPEN";
  if (a.gapPct < GAP_AMBER && a.sellerCount > 3) return "CROWDED";
  if (a.sellerCount >= 8) return "CROWDED";
  if (a.clearDays !== null && a.clearDays > 5) return "CROWDED";
  return "HEALTHY";
}
function analyzeCraftListings(m, hq) {
  const gap = listingGap(m.worldListings, hq);
  const conc = concentrationHHI(m.worldListings, hq);
  const { days, note } = supplyDepth(m.listingCount, m.velocity);
  const depth = depthBuckets(m.worldListings, hq);
  const sellerCount = conc?.sellerCount ?? 0;
  const topSellerShare = conc?.topSellerShare ?? 0;
  const totalUnits = depth.reduce((s, b) => s + b.units, 0);
  const risk = classifyCraftRisk({
    empty: gap.empty,
    onlyListing: gap.onlyListing,
    gapPct: gap.gapPct,
    sellerCount,
    topSellerShare,
    clearDays: days
  });
  return {
    risk,
    gap,
    sellerCount,
    topSellerShare,
    concentrationRisk: conc?.risk ?? "deep",
    clearDays: days,
    clearNote: note,
    captureRate: captureShare(m.listingCount),
    totalUnits,
    depth
  };
}

// src/features/queries/runCraftFlip.ts
function narrowForCraftFlip(snapshot, priceMap, filter) {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out = [];
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === "hq" && !item.canHq) continue;
    const m = priceMap[item.id];
    if (!m) continue;
    if (!passesMarketGate(m, { minVelocity: filter.minVelocity, maxListings: filter.maxListings ?? null })) continue;
    if (pickFirstTrustedTier(m, filter.hq, item.canHq) == null) continue;
    out.push(item.id);
  }
  return out;
}
function compare(a, b, sort) {
  switch (sort) {
    case "gilFlow":
      return b.gilPerDay - a.gilPerDay;
    case "velocity":
      return b.velocity - a.velocity;
    case "unitPrice":
      return b.unitPrice - a.unitPrice;
    case "risk":
      return RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk);
    // worst (DOMINATED) first
    case "selfSourceGilFlow":
      return b.selfSourceGilPerDay - a.selfSourceGilPerDay;
    case "discount":
      return b.profit / Math.max(1, b.unitPrice) - a.profit / Math.max(1, a.unitPrice);
  }
}
function runCraftFlip(snapshot, priceMap, recipeMap, filter, levels, gathering) {
  const narrowed = new Set(narrowForCraftFlip(snapshot, priceMap, filter));
  const scById = new Map(snapshot.map((i) => [i.id, i.sc]));
  const out = [];
  for (const item of snapshot) {
    if (!narrowed.has(item.id)) continue;
    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;
    if (filter.trainedEye) {
      if (!levels) continue;
      if (recipe.classJob === "ANY") continue;
      const crafterLevel = levels[recipe.classJob];
      if (crafterLevel == null) continue;
      if (recipe.recipeLevel > crafterLevel - 10) continue;
    }
    const m = priceMap[item.id];
    const tier = pickFirstTrustedTier(m, filter.hq, item.canHq);
    if (!tier) continue;
    const leaves = computeMaterialLeaves(recipe, recipeMap, priceMap, {});
    const materialCost = leaves.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const profit = tier.unit - materialCost;
    if (profit <= 0) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;
    const analysis = analyzeCraftListings(m, tier.isHq);
    const sourcing = gathering ? deriveSourcing(leaves, scById, gathering, profit) : null;
    if (filter.minGatherablePct != null) {
      if (!sourcing || sourcing.gatherablePct < filter.minGatherablePct) continue;
    }
    const selfSourceProfit = sourcing ? sourcing.selfSourceProfit : profit;
    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      unitPrice: tier.unit,
      materialCost,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq,
      risk: analysis.risk,
      gap: analysis.gap.gap,
      gapPct: analysis.gap.gapPct,
      hasSecondTier: analysis.gap.hasSecondTier,
      onlyListing: analysis.gap.onlyListing,
      sellerCount: analysis.sellerCount,
      topSellerShare: analysis.topSellerShare,
      concentrationRisk: analysis.concentrationRisk,
      clearDays: analysis.clearDays,
      clearNote: analysis.clearNote,
      captureRate: analysis.captureRate,
      totalUnits: analysis.totalUnits,
      depth: analysis.depth,
      sourcing,
      selfSourceGilPerDay: selfSourceProfit * m.velocity
    });
  }
  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}

// src/api/plugin-trading-query.ts
var HOUSING_CATS = categoriesByGroup("Housing");
var MATERIAL_CATS = categoriesByGroup("Materials");
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
  // ── Gathering (gatherableOnly intersects the gathering catalog) ──────────
  {
    id: "gather-commodities",
    label: "Gatherer commodities",
    category: "gathering",
    filter: { searchCategories: [44, 46, 47, 48, 49, 50, 53, 58, 81], hq: "nq", minDealPct: 0, minVelocity: 5, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "dc", maxListings: null, mode: "standard", minGap: null, gatherableOnly: true }
  },
  {
    id: "mining-commodities",
    label: "Mining commodities",
    category: "gathering",
    filter: { searchCategories: [47, 48, 58], hq: "nq", minDealPct: 0, minVelocity: 3, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: null, mode: "standard", minGap: null, gatherableOnly: true }
  },
  {
    id: "botany-commodities",
    label: "Botany commodities",
    category: "gathering",
    filter: { searchCategories: [49, 50, 53, 81], hq: "nq", minDealPct: 0, minVelocity: 3, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: null, mode: "standard", minGap: null, gatherableOnly: true }
  },
  {
    id: "fishing-commodities",
    label: "Fishing commodities",
    category: "gathering",
    filter: { searchCategories: [46], hq: "nq", minDealPct: 0, minVelocity: 3, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: null, mode: "standard", minGap: null, gatherableOnly: true }
  },
  // ── Crafting (craft mode: profit = sale − material cost, ranked by gil/day) ──
  {
    id: "craft-flip",
    label: "Craft-flip",
    category: "crafting",
    filter: { searchCategories: [], hq: "either", minDealPct: 0, minVelocity: 3, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: null, mode: "craft", minGap: null }
  },
  {
    id: "undersupply",
    label: "Undersupply",
    category: "crafting",
    filter: { searchCategories: [], hq: "either", minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: 2, mode: "craft", minGap: null }
  },
  {
    id: "intermediate-materials",
    label: "Intermediate Materials",
    category: "crafting",
    filter: { searchCategories: MATERIAL_CATS, hq: "either", minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: null, mode: "craft", minGap: null }
  },
  {
    id: "craftable-housing",
    label: "Craftable Housing",
    category: "crafting",
    filter: { searchCategories: HOUSING_CATS, hq: "either", minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: "gilFlow", limit: 100, scope: "home", maxListings: null, mode: "craft", minGap: null }
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
function runStandardQuery(snapshot, priceMap, filter, gatherSet, recipeSet) {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out = [];
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.gatherableOnly && (!gatherSet || !gatherSet.has(item.id))) continue;
    if (filter.craftableOnly && (!recipeSet || !recipeSet.has(item.id))) continue;
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
    const best = cheapestWorld(m, tier.isHq);
    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      unitPrice: tier.unit,
      averagePrice: tier.avg,
      dealPct,
      velocity: m.velocity,
      gilFlow,
      hq: tier.isHq,
      cheapestWorld: best?.world ?? null,
      cheapestPrice: best?.price ?? null
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
  if (req.query.list) {
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.status(200).json({
      presets: PRESETS.map((p) => ({ id: p.id, label: p.label, category: p.category }))
    });
  }
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
  if (filter.mode === "repost") {
    return res.status(400).json({ error: "Repost mode is not supported by the plugin API yet." });
  }
  const baseUrl = process.env.VITE_APP_URL ?? "https://qiqirn.tools";
  const [snapshots, market] = await Promise.all([
    loadSnapshots(baseUrl),
    loadMarketCache()
  ]);
  const snapshot = [...snapshots.itemsById.values()];
  const gatherSet = filter.gatherableOnly ? new Set(snapshots.gatheringCatalog.keys()) : null;
  const recipeSet = filter.craftableOnly ? new Set(snapshots.recipes.keys()) : null;
  let priceMap;
  if (filter.scope === "home") {
    if (!world) return res.status(400).json({ error: "world param required for scope=home queries" });
    const worldKey = String(world).toLowerCase();
    priceMap = market[worldKey] ?? market.phantom ?? {};
  } else {
    priceMap = market.dc ?? {};
  }
  let rows;
  if (filter.mode === "craft") {
    const flips = runCraftFlip(
      snapshot,
      priceMap,
      snapshots.recipes,
      { ...filter, trainedEye: false }
    );
    rows = flips.map((r) => ({
      id: r.id,
      name: r.name,
      sc: r.sc,
      unitPrice: r.unitPrice,
      averagePrice: r.unitPrice,
      dealPct: 0,
      velocity: r.velocity,
      gilFlow: r.gilPerDay,
      hq: r.hq,
      cheapestWorld: null,
      cheapestPrice: null,
      materialCost: r.materialCost,
      profit: r.profit,
      gilPerDay: r.gilPerDay
    }));
  } else {
    rows = runStandardQuery(snapshot, priceMap, filter, gatherSet, recipeSet);
  }
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
