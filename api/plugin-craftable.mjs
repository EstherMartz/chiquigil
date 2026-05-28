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
  const invMap = /* @__PURE__ */ new Map();
  for (const entry of inventory) {
    invMap.set(entry.id, (invMap.get(entry.id) ?? 0) + entry.qty);
  }
  const baseUrl = process.env.VITE_APP_URL ?? "https://qiqirn.tools";
  const snapshots = await loadSnapshots(baseUrl);
  const craftable = [];
  for (const [outputItemId, recipe] of snapshots.recipes) {
    const amountResult = recipe.amountResult ?? 1;
    let canMake = Infinity;
    for (const ing of recipe.ingredients) {
      const have = invMap.get(ing.itemId) ?? 0;
      const batchesFromThis = Math.floor(have / ing.amount);
      if (batchesFromThis < canMake) canMake = batchesFromThis;
    }
    if (!isFinite(canMake) || canMake === 0) continue;
    const totalQty = canMake * amountResult;
    const name = snapshots.namesById.get(outputItemId) ?? `Item #${outputItemId}`;
    craftable.push({
      itemId: outputItemId,
      name,
      qty: totalQty,
      minNQ: null,
      velocity: 0
    });
  }
  if (craftable.length === 0) {
    return res.status(200).json({ craftable: [] });
  }
  try {
    const cacheUrl = process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
    const cacheRes = await fetch(cacheUrl, { cache: "no-store" });
    if (cacheRes.ok) {
      const cache = await cacheRes.json();
      const market = cache.phantom;
      for (const item of craftable) {
        const entry = market[String(item.itemId)];
        if (entry) {
          item.minNQ = entry.minNQ;
          item.velocity = entry.velocity;
        }
      }
    }
  } catch {
  }
  craftable.sort((a, b) => {
    const aVal = (a.minNQ ?? 0) * a.qty;
    const bVal = (b.minNQ ?? 0) * b.qty;
    return bVal - aVal;
  });
  return res.status(200).json({ craftable });
}
export {
  handler as default
};
