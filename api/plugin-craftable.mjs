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

// src/features/craftFromInventory/findCraftable.ts
function findCraftableFromInventory(inventory, recipes, namesById, filter) {
  const { maxMissing, marketableOnly, velocityMap, vendorMap, gatheringSet, excludeIngredientIds } = filter;
  const rows = [];
  for (const [itemId, recipe] of recipes) {
    const ingredients = [];
    let missingCount = 0;
    for (const ing of recipe.ingredients) {
      if (excludeIngredientIds?.has(ing.itemId)) continue;
      const have = inventory.get(ing.itemId) ?? 0;
      const fulfilled = have >= ing.amount;
      if (!fulfilled) missingCount++;
      let source = "unknown";
      let unitPrice = null;
      if (!fulfilled) {
        if (vendorMap?.has(ing.itemId)) {
          source = "vendor";
          unitPrice = vendorMap.get(ing.itemId);
        } else if (gatheringSet?.has(ing.itemId)) {
          source = "gather";
        } else {
          source = "market";
        }
      }
      ingredients.push({
        itemId: ing.itemId,
        name: namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
        needed: ing.amount,
        have,
        fulfilled,
        source,
        unitPrice
      });
    }
    if (missingCount > maxMissing) continue;
    if (marketableOnly && velocityMap && !velocityMap.has(itemId)) continue;
    const totalIngredients = ingredients.length;
    const completeness = totalIngredients > 0 ? (totalIngredients - missingCount) / totalIngredients : 1;
    rows.push({
      recipeItemId: itemId,
      name: namesById.get(itemId) ?? `Item #${itemId}`,
      classJob: recipe.classJob,
      recipeLevel: recipe.recipeLevel,
      amountResult: recipe.amountResult ?? 1,
      totalIngredients,
      missingCount,
      completeness,
      ingredients
    });
  }
  rows.sort((a, b) => b.completeness - a.completeness || b.recipeLevel - a.recipeLevel);
  return rows;
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

// src/api/plugin-craftable.ts
async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  let inventory;
  try {
    const raw = req.query.inv;
    if (!raw || typeof raw !== "string") {
      return res.status(400).json({ error: "Missing inv query param" });
    }
    inventory = JSON.parse(raw);
    if (!Array.isArray(inventory)) throw new Error("Not an array");
  } catch {
    return res.status(400).json({ error: "inv must be a URL-encoded JSON array of {id, qty} objects" });
  }
  const maxMissing = Math.min(5, Math.max(0, parseInt(String(req.query.maxMissing)) || 0));
  const invMap = /* @__PURE__ */ new Map();
  for (const entry of inventory) {
    invMap.set(entry.id, (invMap.get(entry.id) ?? 0) + entry.qty);
  }
  const baseUrl = process.env.VITE_APP_URL ?? "https://qiqirn.tools";
  const snapshots = await loadSnapshots(baseUrl);
  const rows = findCraftableFromInventory(invMap, snapshots.recipes, snapshots.namesById, { maxMissing });
  const craftable = rows.map((r) => {
    const recipe = snapshots.recipes.get(r.recipeItemId);
    let canMake = Infinity;
    if (recipe) {
      for (const ing of recipe.ingredients) {
        const have = invMap.get(ing.itemId) ?? 0;
        const batches = Math.floor(have / ing.amount);
        if (batches < canMake) canMake = batches;
      }
    }
    const qty = isFinite(canMake) && canMake > 0 ? canMake * r.amountResult : 0;
    return {
      itemId: r.recipeItemId,
      name: r.name,
      qty,
      missingCount: r.missingCount,
      completeness: r.completeness,
      minNQ: null,
      velocity: 0,
      cheapestWorld: null,
      cheapestPrice: null,
      ingredients: r.ingredients.map((i) => ({
        itemId: i.itemId,
        name: i.name,
        needed: i.needed,
        have: i.have
      }))
    };
  });
  if (craftable.length === 0) {
    return res.status(200).json({ craftable: [] });
  }
  try {
    const cacheUrl = process.env.VITE_CACHE_BLOB_URL ?? process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
    const cacheRes = await fetch(cacheUrl, { cache: "no-store" });
    if (cacheRes.ok) {
      const cache = await cacheRes.json();
      const home = cache.phantom ?? {};
      const dc = cache.dc ?? {};
      for (const item of craftable) {
        const homeEntry = home[String(item.itemId)];
        if (homeEntry) {
          item.minNQ = homeEntry.minNQ;
          item.velocity = homeEntry.velocity;
        }
        const best = cheapestWorld(dc[String(item.itemId)]);
        if (best) {
          item.cheapestWorld = best.world;
          item.cheapestPrice = best.price;
        }
      }
    }
  } catch {
  }
  craftable.sort((a, b) => {
    if (b.completeness !== a.completeness) return b.completeness - a.completeness;
    const aVal = (a.minNQ ?? 0) * a.qty;
    const bVal = (b.minNQ ?? 0) * b.qty;
    return bVal - aVal;
  });
  return res.status(200).json({ craftable });
}
export {
  handler as default
};
