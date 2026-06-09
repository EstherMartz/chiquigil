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

// src/lib/currencies.ts
var CURRENCIES = [
  { id: "poetics", label: "Allagan Tomestone of Poetics", shortLabel: "Poetics", itemId: 28 },
  { id: "mathematics", label: "Allagan Tomestone of Mathematics", shortLabel: "Mathematics", itemId: 48 },
  { id: "heliometry", label: "Allagan Tomestone of Heliometry", shortLabel: "Heliometry", itemId: 47 },
  { id: "mnemonics", label: "Allagan Tomestone of Mnemonics", shortLabel: "Mnemonics", itemId: 49 },
  { id: "whiteCrafter", label: "White Crafters' Scrip", shortLabel: "W-Craft", itemId: 25199 },
  { id: "purpleCrafter", label: "Purple Crafters' Scrip", shortLabel: "P-Craft", itemId: 33913 },
  { id: "orangeCrafter", label: "Orange Crafters' Scrip", shortLabel: "O-Craft", itemId: 41784 },
  { id: "whiteGatherer", label: "White Gatherers' Scrip", shortLabel: "W-Gather", itemId: 25200 },
  { id: "purpleGatherer", label: "Purple Gatherers' Scrip", shortLabel: "P-Gather", itemId: 33914 },
  { id: "orangeGatherer", label: "Orange Gatherers' Scrip", shortLabel: "O-Gather", itemId: 41785 },
  { id: "mgp", label: "MGP", shortLabel: "MGP", itemId: 29 },
  { id: "wolfMarks", label: "Wolf Marks", shortLabel: "Wolf", itemId: 25 },
  { id: "bicolor", label: "Bicolor Gemstone", shortLabel: "Bicolor", itemId: 26807 }
];
function getCurrencyById(id) {
  return CURRENCIES.find((c) => c.id === id);
}
var currencyByItemId = new Map(
  CURRENCIES.map((c) => [c.itemId, c.id])
);

// src/lib/europeWorlds.ts
var CHAOS_WORLDS = /* @__PURE__ */ new Set([
  "Cerberus",
  "Louisoix",
  "Moogle",
  "Omega",
  "Phantom",
  "Ragnarok",
  "Sagittarius",
  "Spriggan"
]);
var LIGHT_WORLDS = /* @__PURE__ */ new Set([
  "Alpha",
  "Lich",
  "Odin",
  "Phoenix",
  "Raiden",
  "Shiva",
  "Twintania",
  "Zodiark"
]);
var EU_WORLDS = /* @__PURE__ */ new Set([
  ...CHAOS_WORLDS,
  ...LIGHT_WORLDS
]);
function dcOf(world) {
  if (CHAOS_WORLDS.has(world)) return "Chaos";
  if (LIGHT_WORLDS.has(world)) return "Light";
  return null;
}

// src/features/shoppingList/shoppingListSurvey.ts
function cheapestEuNq(m) {
  if (!m) return null;
  let best = null;
  for (const l of m.worldListings) {
    if (l.hq) continue;
    if (!EU_WORLDS.has(l.world)) continue;
    if (!best || l.price < best.price) best = { world: l.world, price: l.price };
  }
  if (!best) return null;
  return { ...best, count: m.listingCount, isLightDc: dcOf(best.world) === "Light" };
}
function findCheapestCurrency(itemId, shopSnapshot) {
  let best = null;
  for (const [currencyId, entries] of shopSnapshot.byCurrency.entries()) {
    for (const entry of entries) {
      if (entry.itemId !== itemId) continue;
      if (!best || entry.costPerUnit < best.costPerUnit || entry.costPerUnit === best.costPerUnit && currencyId < best.id) {
        best = { id: currencyId, costPerUnit: entry.costPerUnit };
      }
    }
  }
  if (!best) return null;
  const def = getCurrencyById(best.id);
  if (!def) return null;
  return { id: best.id, label: def.label, shortLabel: def.shortLabel, costPerUnit: best.costPerUnit };
}
function surveyIngredients(demand, prices, vendorMap, shopSnapshot) {
  const out = [];
  const sortedIds = [...demand.keys()].sort((a, b) => a - b);
  for (const id of sortedIds) {
    const qty = demand.get(id);
    const mb = cheapestEuNq(prices[id]);
    const npcPrice = vendorMap.get(id);
    const npc = npcPrice != null ? { price: npcPrice } : null;
    const currency = findCheapestCurrency(id, shopSnapshot);
    let autoSource = null;
    if (mb && npc) autoSource = mb.price <= npc.price ? "mb" : "npc";
    else if (mb) autoSource = "mb";
    else if (npc) autoSource = "npc";
    out.push({ id, qty, mb, npc, currency, autoSource });
  }
  return out;
}

// src/bot/craftExplode.ts
function explode(targetId, targetQty, recipes, opts = {}) {
  const craftIntermediates = opts.craftIntermediates ?? true;
  const maxDepth = opts.maxDepth ?? 20;
  const crafts = /* @__PURE__ */ new Map();
  const leaves = /* @__PURE__ */ new Map();
  function walk(id, qty, depth, path) {
    if (depth > maxDepth) {
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
      return;
    }
    if (path.has(id)) {
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
      return;
    }
    const recipe = recipes.get(id);
    const forcedLeaf = id !== targetId && (opts.forceLeaf?.(id) ?? false);
    if (recipe && !forcedLeaf && (id === targetId || craftIntermediates)) {
      const yieldPerCraft = recipe.amountResult ?? 1;
      const craftCount = Math.ceil(qty / yieldPerCraft);
      const existing = crafts.get(id);
      if (existing) {
        existing.outputQty += qty;
        existing.craftCount += craftCount;
      } else {
        crafts.set(id, { outputQty: qty, craftCount, job: recipe.classJob });
      }
      path.add(id);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, depth + 1, path);
      }
      path.delete(id);
    } else {
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
    }
  }
  walk(targetId, targetQty, 0, /* @__PURE__ */ new Set());
  return { crafts, leaves };
}

// src/bot/craftSourcing.ts
function sourceLeaves(leaves, market, deps, cheapVendorThreshold) {
  const survey = surveyIngredients(leaves, market.dc, deps.vendorMap, deps.specialShop);
  const acquire = [];
  for (const s of survey) {
    const name = deps.namesById.get(s.id) ?? `Item #${s.id}`;
    const gatherInfo = deps.gatheringCatalog.get(s.id);
    const vendorPrice = deps.vendorMap.get(s.id);
    if (gatherInfo && !(vendorPrice != null && vendorPrice <= cheapVendorThreshold) && !s.currency) {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: "gather",
        meta: { gatherLevel: gatherInfo.level, timed: gatherInfo.timed }
      });
    } else if (s.currency) {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: "currency",
        meta: { currency: s.currency.shortLabel, currencyId: s.currency.id, costPerUnit: s.currency.costPerUnit }
      });
    } else if (s.npc && s.autoSource === "npc") {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: "vendor",
        meta: { price: s.npc.price }
      });
    } else {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: "market",
        meta: s.mb ? { world: s.mb.world, price: s.mb.price } : {}
      });
    }
  }
  return acquire;
}
function buildBreakdown(targetId, targetQty, market, deps, opts = {}) {
  const cheapVendorThreshold = opts.cheapVendorThreshold ?? 100;
  if (deps.recipes.get(targetId)) {
    const { crafts: craftMap, leaves } = explode(targetId, targetQty, deps.recipes, opts);
    const acquire = sourceLeaves(leaves, market, deps, cheapVendorThreshold);
    const crafts = [];
    for (const [itemId, info] of craftMap) {
      const name = deps.namesById.get(itemId) ?? `Item #${itemId}`;
      crafts.push({
        itemId,
        itemName: name,
        qtyNeeded: info.outputQty,
        source: "craft",
        meta: { job: info.job }
      });
    }
    return { crafts, acquire };
  }
  const cc = deps.companyCraft.get(targetId);
  if (cc) {
    const craftIntermediates = opts.craftIntermediates ?? true;
    const crafts = [{
      itemId: cc.resultItemId,
      itemName: deps.namesById.get(cc.resultItemId) ?? cc.resultName,
      qtyNeeded: targetQty,
      source: "workshop",
      meta: {}
    }];
    const acquire = [];
    for (const part of cc.parts) {
      const partKey = part.name || void 0;
      for (let phaseIndex = 0; phaseIndex < part.phases.length; phaseIndex++) {
        const phase = part.phases[phaseIndex];
        const phaseCrafts = /* @__PURE__ */ new Map();
        const phaseLeaves = /* @__PURE__ */ new Map();
        for (const ing of phase.ingredients) {
          const qty = ing.qty * targetQty;
          if (craftIntermediates && deps.recipes.has(ing.itemId)) {
            const result = explode(ing.itemId, qty, deps.recipes, opts);
            for (const [id, c] of result.crafts) {
              const existing = phaseCrafts.get(id);
              if (existing) {
                existing.outputQty += c.outputQty;
                existing.craftCount += c.craftCount;
              } else {
                phaseCrafts.set(id, { ...c });
              }
            }
            for (const [id, q] of result.leaves) {
              phaseLeaves.set(id, (phaseLeaves.get(id) ?? 0) + q);
            }
          } else {
            phaseLeaves.set(ing.itemId, (phaseLeaves.get(ing.itemId) ?? 0) + qty);
          }
        }
        const phaseTag = { ...partKey ? { partKey } : {}, phaseIndex };
        for (const t of sourceLeaves(phaseLeaves, market, deps, cheapVendorThreshold)) {
          acquire.push({ ...t, meta: { ...t.meta, ...phaseTag } });
        }
        for (const [itemId, info] of phaseCrafts) {
          crafts.push({
            itemId,
            itemName: deps.namesById.get(itemId) ?? `Item #${itemId}`,
            qtyNeeded: info.outputQty,
            source: "craft",
            meta: { job: info.job, ...phaseTag }
          });
        }
      }
    }
    return { crafts, acquire };
  }
  return { crafts: [], acquire: [] };
}

// src/features/queries/commonFilters.ts
var CRYSTALS_SEARCH_CATEGORY = 58;

// src/features/craftLists/resolveList.ts
var MAX_DEPTH = 20;
function classifyLeaf(itemId, deps) {
  if (deps.itemsById.get(itemId)?.sc === CRYSTALS_SEARCH_CATEGORY) return "Crystal";
  const g = deps.gathering.get(itemId);
  if (g) return g.timed ? "TimedGather" : "Gathered";
  for (const entries of deps.specialShop.byCurrency.values()) {
    if (entries.some((e) => e.itemId === itemId)) return "Tome";
  }
  if (deps.vendorMap.has(itemId)) return "Vendor";
  return "MonsterDrop";
}
function resolveList(inputs, deps) {
  const nodes = /* @__PURE__ */ new Map();
  function touch(id, qty, depth, root) {
    let n = nodes.get(id);
    if (!n) {
      n = { qty: 0, minDepth: depth, roots: /* @__PURE__ */ new Set(), isCraft: false };
      nodes.set(id, n);
    }
    n.qty += qty;
    if (depth < n.minDepth) n.minDepth = depth;
    n.roots.add(root);
    return n;
  }
  function walk(id, qty, depth, root, path) {
    const recipe = depth > MAX_DEPTH || path.has(id) ? null : deps.recipes.get(id);
    const node = touch(id, qty, depth, root);
    if (recipe) {
      node.isCraft = true;
      node.job = recipe.classJob;
      node.recipeLevel = recipe.recipeLevel;
      const craftCount = Math.ceil(qty / (recipe.amountResult ?? 1));
      path.add(id);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, depth + 1, root, path);
      }
      path.delete(id);
    }
  }
  const finalItems = [];
  for (const input of inputs) {
    const recipe = deps.recipes.get(input.itemId) ?? void 0;
    const meta = deps.itemsById.get(input.itemId);
    const rootName = meta?.name ?? `Item #${input.itemId}`;
    finalItems.push({
      itemId: input.itemId,
      itemName: rootName,
      qty: input.qty,
      isHq: !!input.isHq,
      job: recipe?.classJob,
      recipeLevel: recipe?.recipeLevel,
      stars: recipe?.stats?.stars
    });
    if (recipe) {
      const craftCount = Math.ceil(input.qty / (recipe.amountResult ?? 1));
      const path = /* @__PURE__ */ new Set([input.itemId]);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, 1, rootName, path);
      }
    }
  }
  const subCraftsByDepth = /* @__PURE__ */ new Map();
  const gathered = [];
  const otherAcquired = [];
  const crystals = [];
  const all = [];
  for (const [id, n] of nodes) {
    const meta = deps.itemsById.get(id);
    const name = meta?.name ?? `Item #${id}`;
    const usedToCraft = [...n.roots].sort((a, b) => a.localeCompare(b));
    const base = {
      itemId: id,
      itemName: name,
      requiredQty: n.qty,
      usedToCraft,
      canHq: meta?.canHq,
      source: "MonsterDrop"
    };
    if (n.isCraft) {
      const row = {
        ...base,
        source: "Crafted",
        depth: n.minDepth,
        craftedByJob: n.job,
        recipeLevel: n.recipeLevel
      };
      const bucket = subCraftsByDepth.get(n.minDepth) ?? [];
      bucket.push(row);
      subCraftsByDepth.set(n.minDepth, bucket);
      all.push(row);
    } else {
      const source = classifyLeaf(id, deps);
      const row = { ...base, source };
      if (source === "Crystal") crystals.push(row);
      else if (source === "Gathered" || source === "TimedGather") gathered.push(row);
      else otherAcquired.push(row);
      all.push(row);
    }
  }
  const byName = (a, b) => a.itemName.localeCompare(b.itemName);
  for (const rows of subCraftsByDepth.values()) rows.sort(byName);
  gathered.sort(byName);
  otherAcquired.sort(byName);
  crystals.sort(byName);
  all.sort(byName);
  return { finalItems, subCraftsByDepth, gathered, otherAcquired, crystals, all };
}

// src/api/_list-breakdown-core.ts
var MAX_ITEMS = 200;
function validateBreakdownItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;
  const out = [];
  for (const r of raw) {
    const o = r;
    const itemId = Number(o.itemId);
    const qty = Number(o.qty);
    if (!Number.isInteger(itemId) || itemId <= 0) return null;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99999) return null;
    out.push({ itemId, qty, isHq: !!o.hq });
  }
  return out;
}
function buildListBreakdown(items, deps) {
  const r = resolveList(items, deps);
  return {
    finalItems: r.finalItems.map((f) => ({
      itemId: f.itemId,
      itemName: f.itemName,
      qty: f.qty,
      isHq: f.isHq,
      job: f.job,
      recipeLevel: f.recipeLevel,
      stars: f.stars
    })),
    ingredients: r.all.map((i) => ({
      itemId: i.itemId,
      itemName: i.itemName,
      requiredQty: i.requiredQty,
      source: i.source,
      craftedByJob: i.craftedByJob,
      recipeLevel: i.recipeLevel,
      usedToCraft: i.usedToCraft,
      depth: i.depth,
      canHq: i.canHq
    }))
  };
}

// src/api/plugin-craft-breakdown.ts
async function handler(req, res) {
  if (req.method === "POST") {
    const items = validateBreakdownItems((req.body ?? {}).items);
    if (!items) {
      return res.status(400).json({ error: "items must be a 1\u2013200 entry array of { itemId, qty, hq? }" });
    }
    const baseUrl2 = process.env.VITE_APP_URL ?? "https://qiqirn.tools";
    const snapshots2 = await loadSnapshots(baseUrl2);
    const deps = {
      recipes: snapshots2.recipes,
      gathering: snapshots2.gatheringCatalog,
      vendorMap: snapshots2.vendorMap,
      specialShop: snapshots2.specialShop,
      itemsById: snapshots2.itemsById
    };
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(buildListBreakdown(items, deps));
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const itemIdStr = req.query.id;
  const qtyStr = req.query.qty;
  if (!itemIdStr || !qtyStr) {
    return res.status(400).json({ error: "Missing id or qty query params" });
  }
  const itemId = parseInt(itemIdStr);
  const qty = parseInt(qtyStr);
  if (isNaN(itemId) || isNaN(qty) || qty < 1) {
    return res.status(400).json({ error: "Invalid item id or qty" });
  }
  if (qty > 99999) {
    return res.status(400).json({ error: "Quantity too large (max 99999)" });
  }
  const baseUrl = process.env.VITE_APP_URL ?? "https://qiqirn.tools";
  const snapshots = await loadSnapshots(baseUrl);
  const itemName = snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const market = {
    dc: "Unknown",
    world: "Unknown",
    updated: Date.now(),
    prices: /* @__PURE__ */ new Map()
  };
  try {
    const cacheUrl = process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
    const cacheRes = await fetch(cacheUrl, { cache: "no-store" });
    if (cacheRes.ok) {
      const cache = await cacheRes.json();
      const marketData = cache.phantom;
      for (const [itemIdStr2, entry] of Object.entries(marketData)) {
        const id = parseInt(itemIdStr2);
        market.prices.set(id, {
          minNQ: entry.minNQ,
          velocity: entry.velocity
        });
      }
    }
  } catch {
  }
  const breakdown = buildBreakdown(itemId, qty, market, {
    recipes: snapshots.recipes,
    namesById: snapshots.namesById,
    vendorMap: snapshots.vendorMap,
    specialShop: snapshots.specialShop,
    gatheringCatalog: snapshots.gatheringCatalog,
    companyCraft: snapshots.companyCraft
  });
  let totalCost = 0;
  for (const acquire of breakdown.acquire) {
    const price = market.prices.get(acquire.itemId);
    if (price) {
      totalCost += (price.minNQ || 0) * acquire.qtyNeeded;
    } else if (acquire.meta.price) {
      totalCost += acquire.meta.price * acquire.qtyNeeded;
    }
  }
  res.setHeader("Cache-Control", "public, max-age=600");
  return res.status(200).json({
    itemId,
    itemName,
    quantity: qty,
    crafts: breakdown.crafts.map((c) => ({
      itemId: c.itemId,
      itemName: c.itemName,
      qty: c.qtyNeeded,
      source: c.source
    })),
    acquire: breakdown.acquire.map((a) => ({
      itemId: a.itemId,
      itemName: a.itemName,
      qtyNeeded: a.qtyNeeded,
      source: a.source,
      meta: a.meta || {}
    })),
    totalCost: totalCost > 0 ? totalCost : void 0
  });
}
export {
  handler as default
};
