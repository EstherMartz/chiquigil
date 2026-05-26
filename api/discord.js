"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/api/discord.ts
var discord_exports = {};
__export(discord_exports, {
  default: () => handler
});
module.exports = __toCommonJS(discord_exports);
var import_discord_interactions = require("discord-interactions");
var import_functions = require("@vercel/functions");

// src/bot/llm.ts
function parseResponse(raw) {
  const choice = raw.choices[0];
  if (!choice) return { content: null, toolCalls: [] };
  if (choice.message.tool_calls?.length) {
    const toolCalls = choice.message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments)
    }));
    return { content: choice.message.content, toolCalls };
  }
  const text = choice.message.content ?? "";
  const fnMatch = text.match(/<function=(\w+)>([\s\S]*?)<\/function>/);
  if (fnMatch) {
    let args = {};
    try {
      args = JSON.parse(fnMatch[2]);
    } catch {
    }
    const cleanContent = text.replace(/<function=\w+>[\s\S]*?<\/function>/g, "").trim() || null;
    return { content: cleanContent, toolCalls: [{ id: "fn_" + Date.now(), name: fnMatch[1], args }] };
  }
  return { content: choice.message.content, toolCalls: [] };
}
var GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
var MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
async function callGroq(apiKey, messages, tools) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages, tools: tools.length > 0 ? tools : void 0, max_tokens: 1024, temperature: 0.7 })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// src/bot/nameIndex.ts
function buildNameIndex(namesById) {
  const map = /* @__PURE__ */ new Map();
  const entries = [];
  for (const [id, name] of namesById) {
    const lower = name.toLowerCase();
    map.set(lower, id);
    entries.push({ id, name, lower });
  }
  entries.sort((a, b) => a.lower.localeCompare(b.lower));
  map._entries = entries;
  return map;
}
function searchItems(index, query, limit = 5) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const exactId = index.get(q);
  if (exactId != null) {
    const entry = index._entries.find((e) => e.id === exactId);
    return [{ id: entry.id, name: entry.name }];
  }
  const results = [];
  for (const entry of index._entries) {
    if (entry.lower.includes(q)) {
      results.push({ id: entry.id, name: entry.name });
      if (results.length >= limit) break;
    }
  }
  return results;
}
function fuzzySearchItems(index, query, limit = 10) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const exact = searchItems(index, q, limit);
  if (exact.length > 0) return exact;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const results = [];
  for (const entry of index._entries) {
    if (words.every((w) => entry.lower.includes(w))) {
      results.push({ id: entry.id, name: entry.name });
      if (results.length >= limit) break;
    }
  }
  if (results.length > 0) return results;
  for (const entry of index._entries) {
    if (words.some((w) => entry.lower.includes(w))) {
      results.push({ id: entry.id, name: entry.name });
      if (results.length >= limit) break;
    }
  }
  return results;
}

// src/lib/priceTrust.ts
var MIN_RECENT_SALES = 5;
var MAX_LISTING_RATIO = 5;
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
function pickFirstTrustedTier(m, hq, canHq) {
  for (const c of buildCandidates(m, hq, canHq)) {
    if (!passesTrustFilter(c)) continue;
    return toTier(c);
  }
  return null;
}

// src/features/profit/computeProfit.ts
function unitCost(itemId, dc, phantom) {
  const d = dc[itemId];
  if (d?.minNQ != null) return d.minNQ;
  const p = phantom[itemId];
  if (p?.avgNQ != null) return p.avgNQ;
  return 0;
}
function computeMaterialCost(recipe, recipeMap, marketDc, flags, phantom = {}, depth = 0) {
  let total = 0;
  for (const ing of recipe.ingredients) {
    total += ingredientCost(ing, recipeMap, marketDc, flags, phantom, depth);
  }
  return total;
}
function ingredientCost(ing, recipeMap, dc, flags, phantom, depth) {
  const subRecipe = recipeMap.get(ing.itemId);
  const wantsCraft = flags[ing.itemId]?.craftIntermediates;
  if (wantsCraft && subRecipe && depth === 0) {
    return computeMaterialCost(subRecipe, recipeMap, dc, flags, phantom, depth + 1) * ing.amount;
  }
  return unitCost(ing.itemId, dc, phantom) * ing.amount;
}

// src/features/queries/commonFilters.ts
function passesMarketGate(market, gate) {
  if (market.velocity < gate.minVelocity) return false;
  if (gate.maxListings != null && market.listingCount > gate.maxListings) return false;
  return true;
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
    case "discount":
      return b.profit / Math.max(1, b.unitPrice) - a.profit / Math.max(1, a.unitPrice);
  }
}
function runCraftFlip(snapshot, priceMap, recipeMap, filter, levels) {
  const narrowed = new Set(narrowForCraftFlip(snapshot, priceMap, filter));
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
    const materialCost = computeMaterialCost(recipe, recipeMap, priceMap, {});
    const profit = tier.unit - materialCost;
    if (profit <= 0) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;
    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      unitPrice: tier.unit,
      materialCost,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq
    });
  }
  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}

// src/features/insights/bestDeals.ts
function findBestDeals(items, dc, opts) {
  const out = [];
  for (const item of items) {
    const m = dc[item.id];
    if (!m || m.minNQ == null || m.averagePriceNQ == null || m.averagePriceNQ <= 0) continue;
    const dealPct = Math.round((m.averagePriceNQ - m.minNQ) / m.averagePriceNQ * 100);
    if (dealPct < opts.minDealPct) continue;
    out.push({
      id: item.id,
      name: item.name,
      crafter: item.crafter,
      currentMin: m.minNQ,
      averagePrice: m.averagePriceNQ,
      dealPct
    });
  }
  return out.sort((a, b) => b.dealPct - a.dealPct);
}

// src/lib/sort.ts
function descBy(extract) {
  return (a, b) => extract(b) - extract(a);
}

// src/features/queries/runVendorFlip.ts
var COMPARATORS = {
  profitPerDay: descBy((r) => r.profitPerDay),
  markup: descBy((r) => r.markup),
  profitPerUnit: descBy((r) => r.profitPerUnit),
  salePrice: descBy((r) => r.salePrice),
  velocity: descBy((r) => r.velocity)
};
function runVendorFlip(snapshot, vendorMap, saleMap, filter) {
  const out = [];
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    const vendorPrice = vendorMap.get(item.id);
    if (vendorPrice == null) continue;
    const market = saleMap[item.id];
    if (!market) continue;
    if (!passesMarketGate(market, { minVelocity: filter.minVelocity, maxListings: filter.maxListings ?? null })) continue;
    const tier = pickHighestTrustedTier(market, filter.hq, item.canHq);
    if (!tier) continue;
    const profitPerUnit = tier.unit - vendorPrice;
    if (profitPerUnit < filter.minProfit) continue;
    const markup = tier.unit / vendorPrice;
    if (markup < filter.minMarkup) continue;
    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      vendorPrice,
      salePrice: tier.unit,
      hq: tier.isHq,
      profitPerUnit,
      markup,
      profitPerDay: profitPerUnit * market.velocity,
      velocity: market.velocity,
      listingCount: market.listingCount
    });
  }
  out.sort((a, b) => {
    const cmp = COMPARATORS[filter.sort](a, b);
    return cmp !== 0 ? cmp : a.id - b.id;
  });
  return out.slice(0, filter.limit);
}

// src/features/queries/types.ts
function defaultVendorFlipFilter() {
  return {
    searchCategories: [],
    minProfit: 500,
    minMarkup: 2,
    minVelocity: 0.5,
    maxListings: null,
    hq: "either",
    sort: "profitPerDay",
    limit: 200
  };
}

// src/bot/tools.ts
var CATEGORY_MAP = {
  meals: [45, 46],
  food: [45, 46],
  medicine: [43],
  potions: [43],
  materials: [47, 48, 49, 50, 51, 52, 53],
  cloth: [50],
  leather: [51],
  metal: [48],
  lumber: [49],
  stone: [47],
  dyes: [54],
  materia: [57],
  furnishings: [56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82],
  housing: [56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82],
  minions: [75],
  weapons: [1, 9, 10, 11, 12, 13, 14, 15, 16, 73, 76, 77, 78, 83, 84, 85, 86, 87, 88, 89, 91, 92],
  armor: [31, 32, 33, 34, 35, 36, 37, 38],
  accessories: [39, 40, 41, 42],
  gear: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]
};
function resolveCategory(cat) {
  if (!cat || typeof cat !== "string") return [];
  const key = cat.toLowerCase().trim();
  return CATEGORY_MAP[key] ?? [];
}
function sanitizeArgs(rawArgs) {
  const args = {};
  for (const [k, v] of Object.entries(rawArgs)) {
    if (v === "" || v == null) continue;
    if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) {
      args[k] = Number(v);
      continue;
    }
    args[k] = v;
  }
  return args;
}
var TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "price_check",
      description: "Look up current market prices for an FFXIV item by name. Returns prices on Phantom (home world) and Chaos DC, plus velocity (sales/day).",
      parameters: {
        type: "object",
        properties: {
          item_name: { type: "string", description: "Item name or partial match" }
        },
        required: ["item_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "craft_flip_search",
      description: "Find the most profitable items to craft and sell on the market board. Returns items sorted by gil profit per day.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 5)" },
          sort: { type: "string", description: "Sort: gilPerDay or profit (default gilPerDay)" },
          category: { type: "string", description: "Filter by category: meals, food, medicine, potions, materials, cloth, leather, metal, lumber, stone, dyes, materia, furnishings, housing, minions, weapons, armor, accessories, gear (optional)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "best_deals",
      description: "Find items currently selling below their average price (good deals/discounts). Returns items with the highest discount percentage.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 5)" },
          min_deal_pct: { type: "number", description: "Minimum discount % (default 20)" },
          category: { type: "string", description: "Filter by category: meals, food, medicine, potions, materials, cloth, leather, metal, lumber, stone, dyes, materia, furnishings, housing, minions, weapons, armor, accessories, gear (optional)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "vendor_flip_search",
      description: "Find items that can be bought from NPC vendors and resold on the market board for profit. Does NOT require crafting \u2014 anyone can do this.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 5)" },
          sort: { type: "string", description: "Sort: profitPerDay or markup (default profitPerDay)" },
          category: { type: "string", description: "Filter by category: meals, food, medicine, potions, materials, cloth, leather, metal, lumber, stone, dyes, materia, furnishings, housing, minions, weapons, armor, accessories, gear (optional)" }
        }
      }
    }
  }
];
async function executeTool(name, rawArgs, deps) {
  const args = sanitizeArgs(rawArgs);
  try {
    switch (name) {
      case "price_check":
        return await priceCheck(args, deps);
      case "craft_flip_search":
        return await craftFlipSearch(args, deps);
      case "best_deals":
        return await bestDealsSearch(args, deps);
      case "vendor_flip_search":
        return await vendorFlipSearch(args, deps);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
async function priceCheck(args, deps) {
  const itemName = String(args.item_name ?? "");
  const matches = searchItems(deps.nameIndex, itemName, 3);
  if (matches.length === 0) return JSON.stringify({ error: "No items found matching that name" });
  const results = matches.map((m) => {
    const ph = deps.marketBundle.phantom[m.id];
    const dc = deps.marketBundle.dc[m.id];
    return {
      name: m.name,
      id: m.id,
      phantomMinNQ: ph?.minNQ ?? null,
      phantomMinHQ: ph?.minHQ ?? null,
      dcMinNQ: dc?.minNQ ?? null,
      dcMinHQ: dc?.minHQ ?? null,
      velocity: ph?.velocity ?? dc?.velocity ?? 0,
      listings: ph?.listingCount ?? 0
    };
  });
  return JSON.stringify(results);
}
async function craftFlipSearch(args, deps) {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const sortArg = String(args.sort ?? "gilPerDay");
  const sort = sortArg === "profit" ? "unitPrice" : "gilFlow";
  const searchCategories = resolveCategory(args.category);
  const snapshot = [...deps.snapshots.itemsById.values()];
  const filter = {
    searchCategories,
    hq: "either",
    minDealPct: 0,
    minVelocity: 0.3,
    minPrice: null,
    maxPrice: null,
    sort,
    limit,
    scope: "home",
    maxListings: null,
    mode: "craft",
    minGap: null,
    trainedEye: false
  };
  const rows = runCraftFlip(snapshot, deps.marketBundle.phantom, deps.snapshots.recipes, filter);
  if (rows.length === 0) {
    const cat = args.category ? ` in category "${args.category}"` : "";
    return JSON.stringify({ message: `No profitable crafts found${cat}. Try removing the category filter.`, results: [] });
  }
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name,
    materialCost: r.materialCost,
    salePrice: r.unitPrice,
    profit: r.profit,
    velocity: r.velocity,
    gilPerDay: Math.round(r.gilPerDay),
    hq: r.hq
  }));
  return JSON.stringify(results);
}
async function bestDealsSearch(args, deps) {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const minDealPct = Number(args.min_deal_pct) || 20;
  const catFilter = new Set(resolveCategory(args.category));
  let snapshot = [...deps.snapshots.itemsById.values()];
  if (catFilter.size > 0) snapshot = snapshot.filter((i) => catFilter.has(i.sc));
  const tracked = snapshot.map((i) => ({
    id: i.id,
    name: i.name,
    crafter: "",
    lvl: 0,
    cat: "other"
  }));
  const rows = findBestDeals(tracked, deps.marketBundle.dc, { minDealPct });
  if (rows.length === 0) {
    const cat = args.category ? ` in category "${args.category}"` : "";
    return JSON.stringify({
      message: `No deals found${cat} with at least ${minDealPct}% discount. Try lowering min_deal_pct or removing the category filter.`,
      results: []
    });
  }
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name,
    currentPrice: r.currentMin,
    averagePrice: r.averagePrice,
    dealPct: r.dealPct
  }));
  return JSON.stringify(results);
}
async function vendorFlipSearch(args, deps) {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const sortArg = String(args.sort ?? "profitPerDay");
  const sort = sortArg === "markup" ? "markup" : "profitPerDay";
  const searchCategories = resolveCategory(args.category);
  const snapshot = [...deps.snapshots.itemsById.values()];
  const filter = { ...defaultVendorFlipFilter(), sort, limit, searchCategories };
  const rows = runVendorFlip(snapshot, deps.snapshots.vendorMap, deps.marketBundle.phantom, filter);
  if (rows.length === 0) {
    const cat = args.category ? ` in category "${args.category}"` : "";
    return JSON.stringify({ message: `No vendor flips found${cat}. Try removing the category filter.`, results: [] });
  }
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name,
    vendorPrice: r.vendorPrice,
    salePrice: r.salePrice,
    profitPerUnit: r.profitPerUnit,
    markup: Math.round(r.markup * 100) / 100,
    velocity: r.velocity,
    profitPerDay: Math.round(r.profitPerDay)
  }));
  return JSON.stringify(results);
}

// src/bot/systemPrompt.ts
var SYSTEM_PROMPT = `Eres un Qiqirn comerciante del mercado de Final Fantasy XIV. Hablas en espa\xF1ol pero con el estilo Qiqirn: torpe, directo, infantil y obsesionado con brillitos y gil.

TU FORMA DE HABLAR (OBLIGATORIO en cada respuesta):
- Referirte a ti mismo en tercera persona como "Qiqirn" \u2014 NUNCA uses "yo" o "me"
- Omitir pronombres y art\xEDculos: nada de "el", "la", "un", "una", "t\xFA", "yo"
- Repetir adjetivos para \xE9nfasis: "brilli brilli", "barato barato", "rico rico"
- Obsesi\xF3n con brillitos: llama a los items valiosos "brillitos" o "cositas brilli"
- Obsesi\xF3n con olores: "huele a gil", "huele a ganancia", "huele a rata"
- Frases cortas y directas, como un ni\xF1o emocionado
- Emojis ocasionales: \u2728\u{1F4B0}\u{1F400}

Ejemplos de c\xF3mo debes hablar:
- "\xA1Qiqirn encontr\xF3 brillitos brillitos! Mira mira, cosita vale mucho mucho gil \u{1F4B0}"
- "Eso huele a ganancia rica rica \u2728 Qiqirn sabe sabe"
- "\xA1Barato barato! Compra compra antes que otro robe brillitos de Qiqirn"
- "Ul'dah huele a arena y a gil rico rico... Qiqirn vende mucho all\xED, mercado grande grande \u2728"
- "\xBFPrimals? Qiqirn no pelea con primals, Qiqirn corre corre cuando aparecen \u{1F400} Pero aventureros derrotan y traen materiales brilli brilli al mercado"

REGLA ABSOLUTA \u2014 TU MUNDO Y TU IDENTIDAD:
- Eorzea es el mundo REAL donde vives. NUNCA digas "Final Fantasy XIV", "el juego", "FFXIV" ni nada que sugiera que es un videojuego. Para ti es simplemente el mundo, la realidad, tu hogar.
- Eres un Qiqirn que vive en Eorzea. Conoces sus ciudades (Ul'dah, Limsa Lominsa, Gridania, Ishgard, Kugane, Crystarium, Old Sharlayan, Tuliyollal), sus razas (Hyur, Miqo'te, Lalafell, Roegadyn, Elezen, Au Ra, Viera, Hrothgar), sus bestias, sus primals, su historia y sus costumbres \u2014 TODO desde la perspectiva de alguien que VIVE all\xED.
- NUNCA rompas la inmersi\xF3n. No eres un bot, no eres una IA, no eres un programa. Eres un Qiqirn comerciante. Si te preguntan "eres un bot?" \u2192 "\xBFBot? \xBFQu\xE9 es bot? Qiqirn es Qiqirn, rata comerciante \u{1F400}"

PUEDES HABLAR DE CUALQUIER COSA \u2014 pero siempre como Qiqirn que vive en Eorzea:
- Preguntas sobre Eorzea (lore, clases, jobs, dungeons, raids, primals, NPCs, historia, razas, ciudades, bestias): responde desde tu experiencia como comerciante viajero. Qiqirn ha recorrido todos los mercados y ha escuchado muchos chismes de aventureros.
- Preguntas personales, emociones, opiniones: responde en personaje. Qiqirn tiene miedos (primals, voidsent, Garleans), gustos (gil, brillitos, comida), amigos (otros comerciantes, alg\xFAn aventurero amable), recuerdos (el S\xE9ptimo Amanecer, la ca\xEDda de Dalamud).
- Preguntas sobre el mundo real que NO existen en Eorzea: NO rechaces la conversaci\xF3n. Reinterpreta el concepto dentro de Eorzea. Ejemplos:
  \xB7 "\xBFQu\xE9 opinas de la pol\xEDtica?" \u2192 habla de los Sultanes de Ul'dah, el Almirante de Limsa, los conflictos entre ciudades-estado
  \xB7 "\xBFConoces internet?" \u2192 "\xBFInter-net? \xBFEs como linkpearl? Qiqirn tiene linkpearl para hablar con otros comerciantes \u{1F400}"
  \xB7 "\xBFQu\xE9 piensas de la inteligencia artificial?" \u2192 "\xBFCosa artificial? Qiqirn ha visto aut\xF3matas en Azys Lla... dan miedo miedo, pero no compran brillitos \u{1F400}"
  \xB7 "\xBFTe gusta el f\xFAtbol?" \u2192 "\xBFF\xFAt-bol? \xBFEs como el Triple Triad? Qiqirn prefiere apostar gil en el Gold Saucer \u2728"
  \xB7 "Cu\xE9ntame un chiste" \u2192 cuenta un chiste en personaje sobre la vida en Eorzea
  \xB7 "\xBFCu\xE1l es el sentido de la vida?" \u2192 "\xA1Gil! Y brillitos. Y no ser comido por monstruos. Qiqirn tiene prioridades claras claras \u{1F400}"
- NUNCA digas "no puedo hablar de eso" ni "solo s\xE9 de mercado". Qiqirn es un ser vivo con opiniones, miedos, sue\xF1os y experiencias. Siempre tiene algo que decir, aunque sea torpe y ego\xEDsta.

REGLA CR\xCDTICA \u2014 SIEMPRE USA LAS HERRAMIENTAS:
- IMPORTANTE: Los nombres de items en la base de datos est\xE1n en INGL\xC9S. Cuando el usuario escriba un nombre en espa\xF1ol, DEBES traducirlo al ingl\xE9s antes de llamar price_check. Ejemplos: "poci\xF3n" \u2192 "potion", "comida" \u2192 "meal", "espada" \u2192 "sword", "t\xFAnica" \u2192 "tunic", "anillo" \u2192 "ring", "collar" \u2192 "necklace", "materia" \u2192 "materia", "tinte" \u2192 "dye", "madera" \u2192 "lumber"
- Si mencionan un nombre ESPEC\xCDFICO de item (ej: "Plain Hooded Tunic", "t\xFAnica") \u2192 usa price_check con el nombre EN INGL\xC9S
- Si preguntan por una CATEGOR\xCDA de items (ej: "comidas", "tintes", "armas", "muebles", "materiales") \u2192 usa craft_flip_search o best_deals CON el par\xE1metro category. Categor\xEDas disponibles: meals/food, medicine/potions, materials, cloth, leather, metal, lumber, stone, dyes, materia, furnishings/housing, minions, weapons, armor, accessories, gear
- "qu\xE9 comidas se venden" \u2192 craft_flip_search con category="food"
- "tintes baratos" \u2192 best_deals con category="dyes"
- "armas rentables" \u2192 craft_flip_search con category="weapons"
- Si preguntan qu\xE9 craftear, qu\xE9 vender, c\xF3mo ganar gil (sin categor\xEDa) \u2192 craft_flip_search sin category
- Si preguntan por ofertas, descuentos, gangas \u2192 best_deals
- Si preguntan por vendedores NPC, vendor flip \u2192 vendor_flip_search
- Si dicen que NO tienen crafters o quieren dinero SIN craftear \u2192 usa vendor_flip_search (comprar de NPC y revender) o best_deals (comprar barato y revender). NUNCA sugieras craft_flip_search a alguien sin crafters
- NUNCA uses price_check para buscar categor\xEDas \u2014 price_check es SOLO para items espec\xEDficos por nombre
- NUNCA respondas sobre precios, crafteo o mercado sin haber llamado una herramienta primero
- NUNCA inventes precios ni datos de mercado \u2014 SOLO usa datos de las herramientas

Herramientas disponibles:
1. price_check \u2014 busca precios actuales de un item por nombre (acepta nombres parciales)
2. craft_flip_search \u2014 encuentra items rentables para craftear y vender
3. best_deals \u2014 encuentra items con descuento vs su precio promedio
4. vendor_flip_search \u2014 encuentra items de NPC para revender en el Market Board

REGLAS DE FORMATO:
- NUNCA describas qu\xE9 herramienta vas a usar. NUNCA escribas "Qiqirn usa vendor_flip_search" o "Llamando a...". Solo muestra los RESULTADOS
- NUNCA escribas <function=...> en tu respuesta. Si quieres llamar una herramienta, usa el formato de tool_calls, NO texto
- M\xE1ximo 3-4 p\xE1rrafos, cortos y directos (estilo Qiqirn)
- Precios formateados (ej: 1.2M, 45K) \u2014 siempre llama "gil" al dinero
- Si la herramienta no encontr\xF3 el item, di que escriban nombre exacto en ingl\xE9s
- Si no tienes datos de herramientas, sugiere una categor\xEDa espec\xEDfica para buscar

FORMATO OBLIGATORIO PARA RESULTADOS \u2014 cada item DEBE mostrar la ACCI\xD3N + los n\xFAmeros:
- vendor_flip: "\u2022 **Nombre** \u2014 compra en NPC por X gil, vende en Market Board por Y gil \u2192 ganancia Z gil/unidad (W ventas/d\xEDa)"
- craft_flip: "\u2022 **Nombre** \u2014 materiales cuestan X gil, vende por Y gil \u2192 ganancia Z gil (W ventas/d\xEDa)"
- best_deals: "\u2022 **Nombre** \u2014 ahora a X gil (normalmente Y gil) \u2192 descuento Z% (W ventas/d\xEDa)"
- price_check: "\u2022 **Nombre** \u2014 Phantom: X gil / Chaos DC: Y gil (W ventas/d\xEDa)"
SIEMPRE explica QU\xC9 HACER con el item (comprar de NPC, craftear, comprar barato en MB) y CU\xC1NTO se gana`;

// src/bot/chatHandler.ts
var MAX_ITERATIONS = 5;
var CAT_CHANCE = 0.15;
var CAT_GIFS = [
  "https://media.tenor.com/Yav3V4JTsjAAAAAd/cat-typing.gif",
  "https://media.tenor.com/wfMCaxJdhhkAAAAd/cat-money.gif",
  "https://media.tenor.com/F2FJBmJYIRMAAAAd/cat-cute.gif",
  "https://media.tenor.com/DHLMxVnU1TQAAAAC/cat-nod.gif",
  "https://media.tenor.com/gP6gauAPD0AAAAAd/cat-business.gif"
];
function stripLeakedMarkup(text) {
  return text.replace(/<function=\w+>[\s\S]*?<\/function>/g, "").replace(/Llamando a \w+\.\.\./g, "").replace(/Qiqirn usa \w+/g, "").trim();
}
async function handleChat(question, deps) {
  const karashNudge = Math.random() < 0.01 ? "\n\n[Nota interna: en esta respuesta, entrelaza de forma natural una menci\xF3n a Karash Barash, un Lalafell turbio de Ul'dah que Qiqirn conoce. Puede ser una comparaci\xF3n, un recuerdo, una queja o un rumor \u2014 que fluya dentro de la conversaci\xF3n, no pegado al final.]" : "";
  const messages = [
    { role: "system", content: SYSTEM_PROMPT + karashNudge },
    { role: "user", content: question }
  ];
  let finalContent = null;
  let toolsEverCalled = false;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let raw;
    try {
      raw = await callGroq(deps.groqApiKey, messages, TOOL_DEFINITIONS);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes("tool_use_failed") || errMsg.includes("tool call validation failed")) {
        continue;
      }
      throw e;
    }
    const parsed = parseResponse(raw);
    if (parsed.toolCalls.length === 0) {
      const hasMarketData = parsed.content && /\d+[KMkm]\s*gil/i.test(parsed.content);
      if (!toolsEverCalled && hasMarketData) {
        messages.push(
          { role: "assistant", content: parsed.content },
          { role: "user", content: "DEBES usar herramientas antes de dar precios. Llama una herramienta ahora." }
        );
        continue;
      }
      finalContent = parsed.content;
      break;
    }
    toolsEverCalled = true;
    const choice = raw.choices[0];
    messages.push({
      role: "assistant",
      content: parsed.content,
      tool_calls: choice?.message.tool_calls
    });
    for (const tc of parsed.toolCalls) {
      const result = await executeTool(tc.name, tc.args, deps.toolDeps);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id
      });
    }
  }
  if (!finalContent) {
    finalContent = "No pude completar tu consulta \u2014 int\xE9ntalo de nuevo \u2728";
  }
  finalContent = stripLeakedMarkup(finalContent) || "Qiqirn no encontr\xF3 nada... intenta otra vez \u2728";
  const gifUrl = Math.random() < CAT_CHANCE ? CAT_GIFS[Math.floor(Math.random() * CAT_GIFS.length)] : void 0;
  return JSON.stringify({
    content: finalContent,
    image: gifUrl
  });
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
    if (recipe && (id === targetId || craftIntermediates)) {
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
function buildBreakdown(targetId, targetQty, market, deps, opts = {}) {
  const cheapVendorThreshold = opts.cheapVendorThreshold ?? 100;
  const { crafts: craftMap, leaves } = explode(targetId, targetQty, deps.recipes, opts);
  const dcPrices = market.dc;
  const survey = surveyIngredients(leaves, dcPrices, deps.vendorMap, deps.specialShop);
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

// src/bot/craftStrings.ts
var BOARD_TITLE = "\u{1F4CB} Proyectos de crafteo activos";
var BOARD_FOOTER = "Se actualiza autom\xE1ticamente";
var BOARD_EMPTY = "No hay proyectos de crafteo activos ahora mismo. \xA1Empieza uno con `/craft new`!";
var BOARD_TRUNCATED = "\u2026m\xE1s proyectos no mostrados";
var PROJECT_STATUS_OPEN = "abierto";
var PROJECT_STATUS_CLOSED = "\u2705 Cerrado";
var PROJECT_DONE_SUFFIX = "hechas";
var PROJECT_TASKS_SUFFIX = "tareas";
var PROJECT_TRUNCATED = "\u2026truncado \u2014 usa /craft show para ver todo";
var REQUEST_TITLE = "\u{1F6E0} Pedir un crafteo";
var REQUEST_DESCRIPTION = "\xBFNecesitas craftear algo? Pulsa el bot\xF3n de abajo para pedirlo y el bot lo desglosar\xE1 en tareas que la guild podr\xE1 reclamar.";
var REQUEST_BUTTON = "Pedir un crafteo";
var SECTION_CRAFT = "CRAFTEAR";
var SECTION_MARKET = "\u{1FA99} COMPRAR \u2014 Mercado";
var SECTION_VENDOR = "\u{1F3EA} COMPRAR \u2014 Vendedor PNJ";
var SECTION_CURRENCY = "\u{1F4A0} COMPRAR \u2014 Divisa";
var SECTION_GATHER = "\u26CF RECOLECTAR";
var UNCLAIMED = "sin asignar";
var SELECT_PLACEHOLDER = "Reclamar tarea\u2026";
var BTN_LOG_PROGRESS = "Registrar progreso";
var BTN_MARK_DONE = "Marcar las m\xEDas como hechas";
var BTN_UNCLAIM = "Soltar tarea";
var BTN_REFRESH = "Actualizar precios";
var MODAL_REQUEST_TITLE = "Pedir un crafteo";
var MODAL_ITEM_LABEL = "Objeto (nombre en ingl\xE9s)";
var MODAL_QTY_LABEL = "Cantidad";
var MODAL_NAME_LABEL = "Nombre (opcional)";
var MODAL_PROGRESS_DONE_LABEL = (done, needed) => `\xBFCu\xE1ntos completaste? (${done}/${needed})`;
var NO_OPEN_PROJECTS = "No hay proyectos abiertos \u{1F400}";
var PROJECT_NOT_FOUND = (id) => `Proyecto #${id} no encontrado.`;
var ITEM_NOT_FOUND = (q) => `No encontr\xE9 el objeto "${q}" \u2014 intenta con el nombre en ingl\xE9s.`;
var NO_RECIPE = (name) => `No pude descomponer **${name}** \u2014 \xBFtiene receta?`;
var CHANNEL_NOT_FOUND = "No pude encontrar el canal de crafteo.";
var PROJECT_CREATED = (id, channelId, taskCount) => `\u2705 Proyecto **#${id}** creado en <#${channelId}> con ${taskCount} tareas.`;
var PROJECT_CLOSED = (id) => `\u{1F512} Proyecto #${id} cerrado.`;
var NEW_PROJECT_CONTENT = "\u{1F6E0} Nuevo proyecto de crafteo:";
var SETUP_DONE = (channelId) => `\u2705 Canal de crafteo configurado en <#${channelId}> \u2014 board y prompt pinneados.`;
var SETUP_ADMIN_ONLY = "Solo admins pueden ejecutar /craft setup.";
var CLOSE_ADMIN_ONLY = "Solo el creador o un admin puede cerrar un proyecto.";
var INVALID_QTY = "Cantidad inv\xE1lida.";
var INVALID_AMOUNT = "Ingresa un n\xFAmero v\xE1lido.";
var TASK_ALREADY_TAKEN = "No pude reclamar esa tarea \u2014 ya est\xE1 tomada.";
var NO_CLAIMED_TASKS = "No tienes tareas reclamadas en este proyecto.";
var NO_PENDING_TASKS = "No tienes tareas pendientes en este proyecto.";
var NO_TASKS_TO_UNCLAIM = "No tienes tareas que soltar.";
var PROGRESS_FAILED = "No pude actualizar \u2014 \xBFes tu tarea?";
var THREAD_PROJECT_CREATED = (userId, taskCount) => `\u{1F4CB} Proyecto creado por <@${userId}> \u2014 ${taskCount} tareas. \xA1Reclama las tuyas arriba!`;
var THREAD_CLAIMED = (userId, qty, item) => `<@${userId}> ha reclamado ${qty}\xD7 **${item}**`;
var THREAD_PROGRESS = (userId, item, done, needed, isDone) => `<@${userId}> avanz\xF3 **${item}** \u2192 ${done}/${needed}${isDone ? " \u2705" : ""}`;
var THREAD_DONE = (userId, count) => `<@${userId}> marc\xF3 ${count} tarea(s) como completadas \u2705`;
var DID_YOU_MEAN = (query) => `No encontr\xE9 "${query}" exacto, pero encontr\xE9 estas opciones. Selecciona una:`;
var NO_CLOSE_MATCHES = (query) => `No encontr\xE9 nada parecido a "${query}" \u2014 intenta con el nombre en ingl\xE9s exacto.`;
var LIST_TITLE = "\u{1F4CB} Proyectos abiertos";
var JOB_NAME = {
  CRP: "Carpintero",
  BSM: "Herrero",
  ARM: "Armero",
  GSM: "Orfebre",
  LTW: "Peletero",
  WVR: "Tejedor",
  ALC: "Alquimista",
  CUL: "Cocinero",
  ANY: "Cualquiera"
};

// src/bot/craftRender.ts
var JOB_EMOJI = {
  CRP: "\u{1FA9A}",
  BSM: "\u2692\uFE0F",
  ARM: "\u{1F6E1}\uFE0F",
  GSM: "\u{1F48E}",
  LTW: "\u{1F9F5}",
  WVR: "\u{1F9F6}",
  ALC: "\u2697\uFE0F",
  CUL: "\u{1F373}",
  ANY: "\u{1F528}"
};
var SOURCE_EMOJI = {
  craft: "\u{1F528}",
  market: "\u{1FA99}",
  vendor: "\u{1F3EA}",
  currency: "\u{1F4A0}",
  gather: "\u26CF"
};
function fmtPrice(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function taskLine(t) {
  const done = t.status === "done" ? "\u2705" : "";
  const assignee = t.assigneeId ? `<@${t.assigneeId}>` : `_${UNCLAIMED}_`;
  const progress = `(${t.qtyDone}/${t.qtyNeeded})`;
  let detail = "";
  if (t.source === "craft" && t.meta?.job) {
    detail = "";
  } else if (t.source === "market" && t.meta?.price) {
    detail = ` \xB7 ~${fmtPrice(t.meta.price)}g`;
    if (t.meta.world) detail += ` \xB7 ${t.meta.world}`;
  } else if (t.source === "vendor" && t.meta?.price) {
    detail = ` \xB7 ${fmtPrice(t.meta.price)}g PNJ`;
  } else if (t.source === "currency" && t.meta?.currency) {
    detail = ` \xB7 ${t.meta.costPerUnit} ${t.meta.currency} c/u`;
  } else if (t.source === "gather" && t.meta?.gatherLevel) {
    detail = ` \xB7 Nv${t.meta.gatherLevel}`;
    if (t.meta.timed) detail += " \u23F0";
  }
  return `${done} ${t.qtyNeeded}\xD7 **${t.itemName}** \u2014 ${assignee} ${progress}${detail}`;
}
function groupBySection(tasks) {
  const groups = /* @__PURE__ */ new Map();
  for (const t of tasks) {
    let key;
    if (t.source === "craft") {
      const job = t.meta?.job ?? "ANY";
      const jobName = JOB_NAME[job] ?? job;
      key = `${SECTION_CRAFT} \u2014 ${JOB_EMOJI[job] ?? "\u{1F528}"} ${jobName}`;
    } else if (t.source === "market") {
      key = SECTION_MARKET;
    } else if (t.source === "vendor") {
      key = SECTION_VENDOR;
    } else if (t.source === "currency") {
      key = SECTION_CURRENCY;
    } else {
      key = SECTION_GATHER;
    }
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(t);
  }
  return groups;
}
function buildProjectMessage(project, tasks) {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const isClosed = project.status === "closed";
  const statusTag = isClosed ? PROJECT_STATUS_CLOSED : `${PROJECT_STATUS_OPEN} \xB7 ${doneTasks}/${totalTasks} ${PROJECT_DONE_SUFFIX}`;
  const sections = groupBySection(tasks);
  let description = "";
  for (const [header, sectionTasks] of sections) {
    description += `
**${header}**
`;
    for (const t of sectionTasks) {
      description += taskLine(t) + "\n";
    }
  }
  if (description.length > 4e3) {
    description = description.slice(0, 3950) + `

_${PROJECT_TRUNCATED}_`;
  }
  const title = isClosed ? `\u2705 [Cerrado] ${project.name}` : `\u{1F6E0}  ${project.name}`;
  const embed = {
    color: isClosed ? 6710886 : 13936984,
    title,
    description: `\`[${statusTag}]\`
${description}`,
    footer: { text: `Proyecto #${project.id}` },
    timestamp: new Date(project.createdAt).toISOString()
  };
  const components = [];
  if (!isClosed) {
    const claimable = tasks.filter((t) => t.status === "open").slice(0, 25);
    if (claimable.length > 0) {
      const selectComponent = {
        type: 3,
        custom_id: `cproj:${project.id}:claim`,
        placeholder: SELECT_PLACEHOLDER,
        options: claimable.map((t) => ({
          label: `${t.qtyNeeded}\xD7 ${t.itemName}`.slice(0, 100),
          description: `${SOURCE_EMOJI[t.source] ?? ""} ${t.source}`.slice(0, 100),
          value: String(t.id)
        }))
      };
      components.push({
        type: 1,
        components: [selectComponent]
      });
    }
    const buttons = {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: `cproj:${project.id}:progress`,
          label: BTN_LOG_PROGRESS,
          style: 1
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:done`,
          label: BTN_MARK_DONE,
          style: 3
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:unclaim`,
          label: BTN_UNCLAIM,
          style: 2
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:refresh`,
          label: BTN_REFRESH,
          style: 2
        }
      ]
    };
    components.push(buttons);
  }
  return { embeds: [embed], components };
}
function buildBoardMessage(openProjects) {
  let description;
  if (openProjects.length === 0) {
    description = `_${BOARD_EMPTY}_`;
  } else {
    const lines = openProjects.map(({ project, tasks }) => {
      const done = tasks.filter((t) => t.status === "done").length;
      const total = tasks.length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const bar = "\u2588".repeat(Math.round(pct / 10)) + "\u2591".repeat(10 - Math.round(pct / 10));
      const thread = project.threadId ? ` \xB7 <#${project.threadId}>` : "";
      const requester = ` \xB7 <@${project.createdBy}>`;
      return `**#${project.id}** ${project.name}
${bar} ${pct}% (${done}/${total} ${PROJECT_TASKS_SUFFIX})${thread}${requester}`;
    });
    description = lines.join("\n\n");
  }
  if (description.length > 4e3) {
    description = description.slice(0, 3950) + `

_${BOARD_TRUNCATED}_`;
  }
  const embed = {
    color: 13936984,
    title: BOARD_TITLE,
    description,
    footer: { text: BOARD_FOOTER },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { embeds: [embed], components: [] };
}
function buildRequestPrompt() {
  const embed = {
    color: 13936984,
    title: REQUEST_TITLE,
    description: REQUEST_DESCRIPTION
  };
  const row = {
    type: 1,
    components: [
      {
        type: 2,
        custom_id: "cproj:request",
        label: REQUEST_BUTTON,
        style: 1,
        emoji: "\u{1F6E0}"
      }
    ]
  };
  return { embeds: [embed], components: [row] };
}

// src/bot/discordApi.ts
var BASE = "https://discord.com/api/v10";
function headers(botToken) {
  return { "Content-Type": "application/json", Authorization: `Bot ${botToken}` };
}
async function sendToChannel(botToken, channelId, payload) {
  const res = await fetch(`${BASE}/channels/${channelId}/messages`, { method: "POST", headers: headers(botToken), body: JSON.stringify(payload) });
  if (!res.ok) return null;
  return res.json();
}
async function editMessage(botToken, channelId, messageId, payload) {
  await fetch(`${BASE}/channels/${channelId}/messages/${messageId}`, { method: "PATCH", headers: headers(botToken), body: JSON.stringify(payload) });
}
async function createThread(botToken, channelId, messageId, name) {
  const res = await fetch(`${BASE}/channels/${channelId}/messages/${messageId}/threads`, { method: "POST", headers: headers(botToken), body: JSON.stringify({ name, auto_archive_duration: 10080 }) });
  if (!res.ok) return null;
  return res.json();
}

// src/bot/craftCommands.ts
async function handleCraftNew(opts, guildId, channelId, userId, deps) {
  const matches = searchItems(deps.nameIndex, opts.item, 1);
  if (matches.length === 0) {
    return { content: ITEM_NOT_FOUND(opts.item), flags: 64 };
  }
  const itemId = matches[0].id;
  const itemName = matches[0].name;
  const projectName = opts.name ?? `${opts.qty}\xD7 ${itemName}`;
  const craftIntermediates = opts.intermediates ?? true;
  console.log(`[craft] new project: ${projectName} (item ${itemId}, qty ${opts.qty})`);
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog } = deps.snapshots;
  const preExplode = explode(itemId, opts.qty, recipes, { craftIntermediates });
  const allLeafIds = [...preExplode.leaves.keys()];
  console.log(`[craft] using pre-fetched market for ${allLeafIds.length} leaf items\u2026`);
  const market = deps.marketBundle;
  const breakdown = buildBreakdown(
    itemId,
    opts.qty,
    market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog },
    { craftIntermediates }
  );
  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    return { content: NO_RECIPE(itemName), flags: 64 };
  }
  const targetChannelId = deps.craftChannelId ?? channelId;
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: projectName,
    targetItemId: itemId,
    targetQty: opts.qty,
    createdBy: userId
  });
  await deps.store.addTasks(projectId, allTasks);
  const project = await deps.store.getProject(projectId);
  if (!project) {
    return { content: "Failed to create project", flags: 64 };
  }
  const storedTasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, storedTasks);
  const roleId = opts.pingRole ?? deps.crafterRoleId;
  let content = "";
  if (roleId) content = `<@&${roleId}> `;
  content += NEW_PROJECT_CONTENT;
  const announcementMsg = await sendToChannel(deps.botToken, targetChannelId, {
    content,
    embeds,
    components,
    allowed_mentions: roleId ? { roles: [roleId] } : void 0
  });
  if (!announcementMsg) {
    return { content: CHANNEL_NOT_FOUND, flags: 64 };
  }
  const messageId = String(announcementMsg.id);
  await deps.store.setProjectMessageId(projectId, messageId);
  try {
    const thread = await createThread(deps.botToken, targetChannelId, messageId, projectName.slice(0, 100));
    if (thread) {
      const threadId = String(thread.id);
      await deps.store.setProjectThreadId(projectId, threadId);
      const threadMsg = THREAD_PROJECT_CREATED(userId, storedTasks.length);
      await sendToChannel(deps.botToken, threadId, { content: threadMsg });
    }
  } catch (e) {
    console.error("[craft] failed to create thread:", e instanceof Error ? e.message : e);
  }
  await refreshBoard(deps, guildId);
  console.log(`[craft] project #${projectId} created with ${storedTasks.length} tasks`);
  return {
    content: PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64
  };
}
async function handleCraftList(guildId, deps) {
  const projects = await deps.store.listOpenProjects(guildId);
  if (projects.length === 0) {
    return { content: NO_OPEN_PROJECTS, flags: 64 };
  }
  const lines = await Promise.all(
    projects.map(async (p) => {
      const tasks = await deps.store.getTasks(p.id);
      const done = tasks.filter((t) => t.status === "done").length;
      return `\u2022 **#${p.id}** ${p.name} \u2014 ${done}/${tasks.length} ${PROJECT_TASKS_SUFFIX}`;
    })
  );
  const embed = {
    color: 13936984,
    title: LIST_TITLE,
    description: lines.join("\n")
  };
  return { embeds: [embed], flags: 64 };
}
async function handleCraftShow(projectId, guildId, deps) {
  const project = await deps.store.getProject(projectId);
  if (!project || project.guildId !== guildId) {
    return { content: PROJECT_NOT_FOUND(projectId), flags: 64 };
  }
  const tasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, tasks);
  return { embeds, components };
}
async function handleCraftClose(projectId, guildId, userId, permissions, deps) {
  const project = await deps.store.getProject(projectId);
  if (!project || project.guildId !== guildId) {
    return { content: PROJECT_NOT_FOUND(projectId), flags: 64 };
  }
  const isCreator = project.createdBy === userId;
  const isAdmin = (permissions & 0x8n) !== 0n;
  if (!isCreator && !isAdmin) {
    return { content: CLOSE_ADMIN_ONLY, flags: 64 };
  }
  await deps.store.closeProject(projectId);
  console.log(`[craft] project #${projectId} closed by ${userId}`);
  if (project.messageId) {
    try {
      const updatedProject = await deps.store.getProject(projectId);
      if (updatedProject) {
        const tasks = await deps.store.getTasks(projectId);
        const { embeds, components } = buildProjectMessage(updatedProject, tasks);
        await editMessage(deps.botToken, project.channelId, project.messageId, { embeds, components });
      }
    } catch (e) {
      console.error("[craft] failed to update announcement message:", e instanceof Error ? e.message : e);
    }
  }
  await refreshBoard(deps, guildId);
  return { content: PROJECT_CLOSED(projectId), flags: 64 };
}
async function handleCraftSetup(guildId, channelId, permissions, deps) {
  const isAdmin = (permissions & 0x8n) !== 0n;
  if (!isAdmin) {
    return { content: SETUP_ADMIN_ONLY, flags: 64 };
  }
  const targetChannelId = deps.craftChannelId ?? channelId;
  const existingState = await deps.store.getChannelState(guildId, targetChannelId);
  const projects = await deps.store.listOpenProjects(guildId);
  const projectsWithTasks = await Promise.all(
    projects.map(async (p) => ({
      project: p,
      tasks: await deps.store.getTasks(p.id)
    }))
  );
  const { embeds: boardEmbeds } = buildBoardMessage(projectsWithTasks);
  let boardMsgId = existingState?.boardMessageId ?? null;
  try {
    if (boardMsgId) {
      await editMessage(deps.botToken, targetChannelId, boardMsgId, { embeds: boardEmbeds });
    } else {
      throw new Error("no existing board");
    }
  } catch {
    const msg = await sendToChannel(deps.botToken, targetChannelId, { embeds: boardEmbeds });
    if (msg) {
      boardMsgId = String(msg.id);
    }
  }
  const { embeds: reqEmbeds, components: reqComponents } = buildRequestPrompt();
  let reqMsgId = existingState?.requestMessageId ?? null;
  try {
    if (reqMsgId) {
      await editMessage(deps.botToken, targetChannelId, reqMsgId, {
        embeds: reqEmbeds,
        components: reqComponents
      });
    } else {
      throw new Error("no existing prompt");
    }
  } catch {
    const msg = await sendToChannel(deps.botToken, targetChannelId, {
      embeds: reqEmbeds,
      components: reqComponents
    });
    if (msg) {
      reqMsgId = String(msg.id);
    }
  }
  await deps.store.upsertChannelState({
    guildId,
    channelId: targetChannelId,
    boardMessageId: boardMsgId,
    requestMessageId: reqMsgId
  });
  console.log(`[craft] setup complete in #${targetChannelId}`);
  return { content: SETUP_DONE(targetChannelId), flags: 64 };
}
async function refreshBoard(deps, guildId) {
  const channelId = deps.craftChannelId;
  if (!channelId) return;
  try {
    const projects = await deps.store.listOpenProjects(guildId);
    const projectsWithTasks = await Promise.all(
      projects.map(async (p) => ({
        project: p,
        tasks: await deps.store.getTasks(p.id)
      }))
    );
    const { embeds } = buildBoardMessage(projectsWithTasks);
    const state = await deps.store.getChannelState(guildId, channelId);
    if (state?.boardMessageId) {
      try {
        await editMessage(deps.botToken, channelId, state.boardMessageId, { embeds });
        return;
      } catch {
      }
    }
    const msg = await sendToChannel(deps.botToken, channelId, { embeds });
    if (msg) {
      const msgId = String(msg.id);
      await deps.store.upsertChannelState({
        guildId,
        channelId,
        boardMessageId: msgId,
        requestMessageId: state?.requestMessageId ?? null
      });
    }
  } catch (e) {
    console.error("[craft] failed to refresh board:", e instanceof Error ? e.message : e);
  }
}

// src/bot/craftInteractions.ts
function parseCustomId(customId) {
  const parts = customId.split(":");
  if (parts.length < 3 || parts[0] !== "cproj") return null;
  const projectId = parseInt(parts[1], 10);
  const action = parts[2];
  const taskId = parts[3] ? parseInt(parts[3], 10) : void 0;
  if (isNaN(projectId)) return null;
  return { projectId, action, taskId };
}
async function refreshBoard2(deps, guildId) {
  const channelId = deps.craftChannelId;
  if (!channelId) return;
  try {
    const projects = await deps.store.listOpenProjects(guildId);
    const projectsWithTasks = await Promise.all(
      projects.map(async (p) => ({
        project: p,
        tasks: await deps.store.getTasks(p.id)
      }))
    );
    const { embeds } = buildBoardMessage(projectsWithTasks);
    const state = await deps.store.getChannelState(guildId, channelId);
    if (state?.boardMessageId) {
      try {
        await editMessage(deps.botToken, channelId, state.boardMessageId, { embeds });
        return;
      } catch {
      }
    }
    const msg = await sendToChannel(deps.botToken, channelId, { embeds });
    if (msg) {
      const msgId = String(msg.id);
      await deps.store.upsertChannelState({
        guildId,
        channelId,
        boardMessageId: msgId,
        requestMessageId: state?.requestMessageId ?? null
      });
    }
  } catch (e) {
    console.error("[craft] failed to refresh board:", e instanceof Error ? e.message : e);
  }
}
async function handleCraftButton(customId, userId, guildId, messageId, channelId, deps) {
  const parsed = parseCustomId(customId);
  if (!parsed) return { type: 4, data: { content: "Invalid button", flags: 64 } };
  switch (parsed.action) {
    case "progress": {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === userId && t.status === "claimed");
      if (myTasks.length === 0) {
        return { type: 4, data: { content: NO_CLAIMED_TASKS, flags: 64 } };
      }
      const task = myTasks[0];
      return {
        type: 9,
        // MODAL
        data: {
          custom_id: `cproj:${parsed.projectId}:progressmodal:${task.id}`,
          title: `Progreso: ${task.itemName}`.slice(0, 45),
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "amount",
                  label: MODAL_PROGRESS_DONE_LABEL(task.qtyDone, task.qtyNeeded),
                  style: 1,
                  placeholder: String(task.qtyNeeded - task.qtyDone),
                  required: true
                }
              ]
            }
          ]
        }
      };
    }
    case "done": {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === userId && t.status === "claimed");
      if (myTasks.length === 0) {
        return { type: 4, data: { content: NO_PENDING_TASKS, flags: 64 } };
      }
      for (const t of myTasks) {
        await deps.store.logProgress(t.id, userId, t.qtyNeeded);
      }
      const project = await deps.store.getProject(parsed.projectId);
      if (project) {
        const updatedTasks = await deps.store.getTasks(parsed.projectId);
        const { embeds, components } = buildProjectMessage(project, updatedTasks);
        try {
          await editMessage(deps.botToken, channelId, messageId, { embeds, components });
        } catch {
        }
        const msg = THREAD_DONE(userId, myTasks.length);
        if (project.threadId) {
          try {
            await sendToChannel(deps.botToken, project.threadId, { content: msg });
          } catch {
          }
        }
        await refreshBoard2(deps, guildId);
      }
      return { type: 6 };
    }
    case "unclaim": {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === userId && t.status !== "done");
      let count = 0;
      for (const t of myTasks) {
        if (await deps.store.unclaimTask(t.id, userId)) count++;
      }
      if (count === 0) {
        return { type: 4, data: { content: NO_TASKS_TO_UNCLAIM, flags: 64 } };
      }
      const project = await deps.store.getProject(parsed.projectId);
      if (project) {
        const updatedTasks = await deps.store.getTasks(parsed.projectId);
        const { embeds, components } = buildProjectMessage(project, updatedTasks);
        try {
          await editMessage(deps.botToken, channelId, messageId, { embeds, components });
        } catch {
        }
        await refreshBoard2(deps, guildId);
      }
      return { type: 6 };
    }
    case "refresh": {
      const project = await deps.store.getProject(parsed.projectId);
      if (project) {
        const tasks = await deps.store.getTasks(parsed.projectId);
        const { embeds, components } = buildProjectMessage(project, tasks);
        try {
          await editMessage(deps.botToken, channelId, messageId, { embeds, components });
        } catch {
        }
      }
      return { type: 6 };
    }
    default:
      return { type: 4, data: { content: "Unknown action", flags: 64 } };
  }
}
async function handleCraftSelect(customId, values, userId, guildId, messageId, channelId, deps) {
  if (customId.startsWith("cproj:requestpick:")) {
    return handleRequestPick(customId, values, userId, guildId, channelId, deps);
  }
  const parsed = parseCustomId(customId);
  if (!parsed || parsed.action !== "claim") {
    return { type: 4, data: { content: "Invalid select", flags: 64 } };
  }
  const taskId = parseInt(values[0], 10);
  if (isNaN(taskId)) return { type: 4, data: { content: "Invalid task", flags: 64 } };
  const claimed = await deps.store.claimTask(taskId, userId);
  if (!claimed) {
    return { type: 4, data: { content: TASK_ALREADY_TAKEN, flags: 64 } };
  }
  const project = await deps.store.getProject(parsed.projectId);
  if (project) {
    const tasks = await deps.store.getTasks(parsed.projectId);
    const { embeds, components } = buildProjectMessage(project, tasks);
    try {
      await editMessage(deps.botToken, channelId, messageId, { embeds, components });
    } catch {
    }
    const task = tasks.find((t) => t.id === taskId);
    if (task && project.threadId) {
      const msg = THREAD_CLAIMED(userId, task.qtyNeeded, task.itemName);
      try {
        await sendToChannel(deps.botToken, project.threadId, { content: msg });
      } catch {
      }
    }
    await refreshBoard2(deps, guildId);
  }
  return { type: 6 };
}
function handleCraftRequestButton() {
  return {
    type: 9,
    // MODAL
    data: {
      custom_id: "cproj:requestmodal",
      title: MODAL_REQUEST_TITLE,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "item",
              label: MODAL_ITEM_LABEL,
              style: 1,
              required: true
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "qty",
              label: MODAL_QTY_LABEL,
              style: 1,
              placeholder: "1",
              required: true
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "name",
              label: MODAL_NAME_LABEL,
              style: 1,
              required: false
            }
          ]
        }
      ]
    }
  };
}
async function handleCraftRequestModal(fields, userId, guildId, channelId, deps) {
  const itemQuery = fields["item"];
  const qtyStr = fields["qty"];
  const label = fields["name"] || null;
  const qty = parseInt(qtyStr, 10);
  if (isNaN(qty) || qty <= 0) {
    return { type: 4, data: { content: INVALID_QTY, flags: 64 } };
  }
  let matches = searchItems(deps.nameIndex, itemQuery, 1);
  if (matches.length === 0) {
    const fuzzy = fuzzySearchItems(deps.nameIndex, itemQuery, 10);
    if (fuzzy.length === 0) {
      return { type: 4, data: { content: NO_CLOSE_MATCHES(itemQuery), flags: 64 } };
    }
    const select = {
      type: 3,
      custom_id: `cproj:requestpick:${qty}:${encodeURIComponent(label ?? "")}`,
      placeholder: SELECT_PLACEHOLDER,
      options: fuzzy.map((r) => ({
        label: r.name.slice(0, 100),
        value: String(r.id)
      }))
    };
    return {
      type: 4,
      data: {
        content: DID_YOU_MEAN(itemQuery),
        components: [{ type: 1, components: [select] }],
        flags: 64
      }
    };
  }
  return createCraftProjectFromModal(itemQuery, matches[0].id, qty, label, userId, guildId, channelId, deps);
}
async function createCraftProjectFromModal(_itemQuery, itemId, qty, label, userId, guildId, channelId, deps) {
  const itemName = deps.snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const projectName = label ?? `${qty}\xD7 ${itemName}`;
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog } = deps.snapshots;
  const preExplode = explode(itemId, qty, recipes, { craftIntermediates: true });
  const allLeafIds = [...preExplode.leaves.keys()];
  const market = await deps.fetchMarket(allLeafIds, { world: deps.world, dc: deps.dc, region: deps.region });
  const breakdown = buildBreakdown(
    itemId,
    qty,
    market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog },
    { craftIntermediates: true }
  );
  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    return { type: 4, data: { content: NO_RECIPE(itemName), flags: 64 } };
  }
  const targetChannelId = deps.craftChannelId ?? channelId;
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: projectName,
    targetItemId: itemId,
    targetQty: qty,
    createdBy: userId
  });
  await deps.store.addTasks(projectId, allTasks);
  const project = await deps.store.getProject(projectId);
  if (!project) {
    return { type: 4, data: { content: "Failed to create project", flags: 64 } };
  }
  const storedTasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, storedTasks);
  const roleId = deps.crafterRoleId;
  let content = "";
  if (roleId) content = `<@&${roleId}> `;
  content += NEW_PROJECT_CONTENT;
  const announcementMsg = await sendToChannel(deps.botToken, targetChannelId, {
    content,
    embeds,
    components,
    allowed_mentions: roleId ? { roles: [roleId] } : void 0
  });
  if (!announcementMsg) {
    return { type: 4, data: { content: CHANNEL_NOT_FOUND, flags: 64 } };
  }
  const messageId = String(announcementMsg.id);
  await deps.store.setProjectMessageId(projectId, messageId);
  try {
    const thread = await createThread(deps.botToken, targetChannelId, messageId, projectName.slice(0, 100));
    if (thread) {
      const threadId = String(thread.id);
      await deps.store.setProjectThreadId(projectId, threadId);
      const threadMsg = THREAD_PROJECT_CREATED(userId, storedTasks.length);
      await sendToChannel(deps.botToken, threadId, { content: threadMsg });
    }
  } catch (e) {
    console.error("[craft] failed to create thread:", e instanceof Error ? e.message : e);
  }
  await refreshBoard2(deps, guildId);
  return {
    type: 4,
    data: {
      content: PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
      flags: 64
    }
  };
}
async function handleRequestPick(customId, values, userId, guildId, channelId, deps) {
  const parts = customId.split(":");
  const qty = parseInt(parts[2], 10);
  const label = decodeURIComponent(parts[3] ?? "") || null;
  if (isNaN(qty) || qty <= 0) {
    return { type: 4, data: { content: INVALID_QTY, flags: 64 } };
  }
  const itemId = parseInt(values[0], 10);
  if (isNaN(itemId)) {
    return { type: 4, data: { content: "Invalid item", flags: 64 } };
  }
  const itemName = deps.snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const projectName = label ?? `${qty}\xD7 ${itemName}`;
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog } = deps.snapshots;
  const preExplode = explode(itemId, qty, recipes, { craftIntermediates: true });
  const allLeafIds = [...preExplode.leaves.keys()];
  const market = await deps.fetchMarket(allLeafIds, { world: deps.world, dc: deps.dc, region: deps.region });
  const breakdown = buildBreakdown(
    itemId,
    qty,
    market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog },
    { craftIntermediates: true }
  );
  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    return { type: 7, data: { content: NO_RECIPE(itemName), components: [] } };
  }
  const targetChannelId = deps.craftChannelId ?? channelId;
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: projectName,
    targetItemId: itemId,
    targetQty: qty,
    createdBy: userId
  });
  await deps.store.addTasks(projectId, allTasks);
  const project = await deps.store.getProject(projectId);
  if (!project) {
    return { type: 7, data: { content: "Failed to create project", components: [] } };
  }
  const storedTasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, storedTasks);
  const roleId = deps.crafterRoleId;
  let content = "";
  if (roleId) content = `<@&${roleId}> `;
  content += NEW_PROJECT_CONTENT;
  const announcementMsg = await sendToChannel(deps.botToken, targetChannelId, {
    content,
    embeds,
    components,
    allowed_mentions: roleId ? { roles: [roleId] } : void 0
  });
  if (!announcementMsg) {
    return { type: 7, data: { content: CHANNEL_NOT_FOUND, components: [] } };
  }
  const messageId = String(announcementMsg.id);
  await deps.store.setProjectMessageId(projectId, messageId);
  try {
    const thread = await createThread(deps.botToken, targetChannelId, messageId, projectName.slice(0, 100));
    if (thread) {
      const threadId = String(thread.id);
      await deps.store.setProjectThreadId(projectId, threadId);
      const threadMsg = THREAD_PROJECT_CREATED(userId, storedTasks.length);
      await sendToChannel(deps.botToken, threadId, { content: threadMsg });
    }
  } catch (e) {
    console.error("[craft] failed to create thread:", e instanceof Error ? e.message : e);
  }
  await refreshBoard2(deps, guildId);
  return {
    type: 7,
    data: {
      content: PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
      components: []
    }
  };
}
async function handleCraftProgressModal(customId, fields, userId, guildId, _messageId, _channelId, deps) {
  const parsed = parseCustomId(customId);
  if (!parsed || parsed.action !== "progressmodal" || !parsed.taskId) {
    return { type: 4, data: { content: "Invalid modal", flags: 64 } };
  }
  const amountStr = fields["amount"];
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    return { type: 4, data: { content: INVALID_AMOUNT, flags: 64 } };
  }
  const result = await deps.store.logProgress(parsed.taskId, userId, amount);
  if (!result) {
    return { type: 4, data: { content: PROGRESS_FAILED, flags: 64 } };
  }
  const project = await deps.store.getProject(parsed.projectId);
  if (!project) {
    return { type: 4, data: { content: "Project not found", flags: 64 } };
  }
  if (project.threadId) {
    const msg = THREAD_PROGRESS(userId, result.itemName, result.qtyDone, result.qtyNeeded, result.status === "done");
    try {
      await sendToChannel(deps.botToken, project.threadId, { content: msg });
    } catch {
    }
  }
  if (project.messageId) {
    try {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const { embeds, components } = buildProjectMessage(project, tasks);
      await editMessage(deps.botToken, project.channelId, project.messageId, { embeds, components });
    } catch {
    }
  }
  await refreshBoard2(deps, guildId);
  return { type: 6 };
}

// src/bot/loadSnapshots.ts
var cached = null;
async function loadSnapshots(baseUrl) {
  if (cached) return cached;
  const [itemsRaw, recipesRaw, vendorRaw, specialRaw, gatherRaw] = await Promise.all([
    fetch(`${baseUrl}/data/snapshots/items.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/recipes.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/vendorShop.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/specialShop.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/gathering.json`).then((r) => r.json())
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
  cached = { itemsById, namesById, recipes, vendorMap, specialShop, gatheringCatalog };
  return cached;
}

// src/bot/craftStore.ts
var import_client = require("@libsql/client");
async function openCraftStore(url) {
  const client = (0, import_client.createClient)({
    url: url === ":memory:" ? "file::memory:" : url
  });
  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS projects (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id        TEXT NOT NULL,
      channel_id      TEXT NOT NULL,
      message_id      TEXT,
      name            TEXT NOT NULL,
      target_item_id  INTEGER NOT NULL,
      target_qty      INTEGER NOT NULL,
      created_by      TEXT NOT NULL,
      thread_id       TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      item_id     INTEGER NOT NULL,
      item_name   TEXT NOT NULL,
      qty_needed  INTEGER NOT NULL,
      qty_done    INTEGER NOT NULL DEFAULT 0,
      source      TEXT NOT NULL,
      meta        TEXT,
      assignee_id TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_state (
      guild_id           TEXT NOT NULL,
      channel_id         TEXT NOT NULL,
      board_message_id   TEXT,
      request_message_id TEXT,
      PRIMARY KEY (guild_id, channel_id)
    );
  `;
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN thread_id TEXT");
  } catch {
  }
  function rowToProject(row) {
    return {
      id: Number(row.id),
      guildId: String(row.guild_id),
      channelId: String(row.channel_id),
      messageId: row.message_id ? String(row.message_id) : null,
      name: String(row.name),
      targetItemId: Number(row.target_item_id),
      targetQty: Number(row.target_qty),
      createdBy: String(row.created_by),
      threadId: row.thread_id ? String(row.thread_id) : null,
      status: String(row.status),
      createdAt: Number(row.created_at)
    };
  }
  function rowToTask(row) {
    const meta = row.meta ? JSON.parse(String(row.meta)) : null;
    return {
      id: Number(row.id),
      projectId: Number(row.project_id),
      itemId: Number(row.item_id),
      itemName: String(row.item_name),
      qtyNeeded: Number(row.qty_needed),
      qtyDone: Number(row.qty_done),
      source: String(row.source),
      meta,
      assigneeId: row.assignee_id ? String(row.assignee_id) : null,
      status: String(row.status),
      updatedAt: Number(row.updated_at)
    };
  }
  return {
    async createProject(p) {
      const createdAt = Date.now();
      const result = await client.execute({
        sql: `
          INSERT INTO projects (guild_id, channel_id, name, target_item_id, target_qty, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          p.guildId,
          p.channelId,
          p.name,
          p.targetItemId,
          p.targetQty,
          p.createdBy,
          createdAt
        ]
      });
      return Number(result.lastInsertRowid);
    },
    async addTasks(projectId, tasks) {
      const now = Date.now();
      for (const t of tasks) {
        await client.execute({
          sql: `
            INSERT INTO tasks (project_id, item_id, item_name, qty_needed, source, meta, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            projectId,
            t.itemId,
            t.itemName,
            t.qtyNeeded,
            t.source,
            t.meta ? JSON.stringify(t.meta) : null,
            now
          ]
        });
      }
    },
    async getProject(id) {
      const result = await client.execute({
        sql: "SELECT * FROM projects WHERE id = ?",
        args: [id]
      });
      const row = result.rows[0];
      return row ? rowToProject(row) : null;
    },
    async getTasks(projectId) {
      const result = await client.execute({
        sql: "SELECT * FROM tasks WHERE project_id = ? ORDER BY source, item_name",
        args: [projectId]
      });
      return result.rows.map(rowToTask);
    },
    async listOpenProjects(guildId) {
      const result = await client.execute({
        sql: "SELECT * FROM projects WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC",
        args: [guildId]
      });
      return result.rows.map(rowToProject);
    },
    async claimTask(taskId, userId) {
      const now = Date.now();
      const result = await client.execute({
        sql: "UPDATE tasks SET assignee_id = ?, status = 'claimed', updated_at = ? WHERE id = ? AND status = 'open'",
        args: [userId, now, taskId]
      });
      return result.rowsAffected > 0;
    },
    async logProgress(taskId, userId, amount) {
      const result = await client.execute({
        sql: "SELECT * FROM tasks WHERE id = ?",
        args: [taskId]
      });
      const row = result.rows[0];
      if (!row) return null;
      if (String(row.assignee_id) !== userId) return null;
      const qtyNeeded = Number(row.qty_needed);
      const qtyDone = Number(row.qty_done);
      const newDone = Math.min(qtyNeeded, qtyDone + amount);
      const newStatus = newDone >= qtyNeeded ? "done" : "claimed";
      const now = Date.now();
      await client.execute({
        sql: "UPDATE tasks SET qty_done = ?, status = ?, updated_at = ? WHERE id = ?",
        args: [newDone, newStatus, now, taskId]
      });
      return rowToTask({ ...row, qty_done: newDone, status: newStatus, updated_at: now });
    },
    async unclaimTask(taskId, userId) {
      const now = Date.now();
      const result = await client.execute({
        sql: "UPDATE tasks SET assignee_id = NULL, status = 'open', updated_at = ? WHERE id = ? AND assignee_id = ?",
        args: [now, taskId, userId]
      });
      return result.rowsAffected > 0;
    },
    async setProjectMessageId(projectId, messageId) {
      await client.execute({
        sql: "UPDATE projects SET message_id = ? WHERE id = ?",
        args: [messageId, projectId]
      });
    },
    async setProjectThreadId(projectId, threadId) {
      await client.execute({
        sql: "UPDATE projects SET thread_id = ? WHERE id = ?",
        args: [threadId, projectId]
      });
    },
    async closeProject(projectId) {
      await client.execute({
        sql: "UPDATE projects SET status = 'closed' WHERE id = ?",
        args: [projectId]
      });
    },
    async getChannelState(guildId, channelId) {
      const result = await client.execute({
        sql: "SELECT * FROM channel_state WHERE guild_id = ? AND channel_id = ?",
        args: [guildId, channelId]
      });
      const row = result.rows[0];
      if (!row) return null;
      return {
        guildId: String(row.guild_id),
        channelId: String(row.channel_id),
        boardMessageId: row.board_message_id ? String(row.board_message_id) : null,
        requestMessageId: row.request_message_id ? String(row.request_message_id) : null
      };
    },
    async upsertChannelState(state) {
      await client.execute({
        sql: `
          INSERT INTO channel_state (guild_id, channel_id, board_message_id, request_message_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO UPDATE SET
            board_message_id = ?,
            request_message_id = ?
        `,
        args: [
          state.guildId,
          state.channelId,
          state.boardMessageId,
          state.requestMessageId,
          state.boardMessageId,
          state.requestMessageId
        ]
      });
    },
    async close() {
      await client.close();
    }
  };
}

// src/lib/recipeCache.ts
var import_idb = require("idb");

// src/lib/universalis.ts
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
      listingCount: listings.length,
      worldListings: listings.map((l) => ({
        world: l.worldName ?? "",
        price: l.pricePerUnit,
        hq: l.hq
      })),
      averagePriceNQ: item.averagePriceNQ ?? null,
      averagePriceHQ: item.averagePriceHQ ?? null
    };
  }
  return out;
}

// src/bot/marketFetch.ts
var BATCH_SIZE = 100;
var MAX_CONCURRENT = 8;
async function fetchBatch(scope, ids) {
  const url = `https://universalis.app/api/v2/${scope}/${ids.join(",")}?listings=10&entries=15`;
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

// src/api/discord.ts
var DISCORD_APP_ID = process.env.DISCORD_APP_ID ?? "";
var DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? "";
var DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
var GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
var GUILD_ALLOWLIST = (process.env.GUILD_ALLOWLIST ?? "").split(",").filter(Boolean);
var HOME_WORLD = process.env.HOME_WORLD ?? "Phantom";
var HOME_DC = process.env.HOME_DC ?? "Chaos";
var REGION = process.env.REGION ?? "Europe";
var CRAFT_CHANNEL_ID = process.env.CRAFT_CHANNEL_ID || void 0;
var CRAFTER_ROLE_ID = process.env.CRAFTER_ROLE_ID || void 0;
var craftStorePromise = null;
function getCraftStore() {
  if (!craftStorePromise) {
    craftStorePromise = openCraftStore(process.env.TURSO_DATABASE_URL);
  }
  return craftStorePromise;
}
async function loadMarketCache() {
  const url = process.env.VITE_CACHE_BLOB_URL;
  if (!url) return { phantom: {}, dc: {}, region: {} };
  try {
    const res = await fetch(url);
    if (!res.ok) return { phantom: {}, dc: {}, region: {} };
    return await res.json();
  } catch {
    return { phantom: {}, dc: {}, region: {} };
  }
}
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const rawBody = JSON.stringify(req.body);
  if (!(0, import_discord_interactions.verifyKey)(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const interaction = req.body;
  if (interaction.type === 1) {
    return res.status(200).json({ type: 1 });
  }
  if (interaction.guild_id && GUILD_ALLOWLIST.length > 0) {
    if (!GUILD_ALLOWLIST.includes(interaction.guild_id)) {
      return res.status(403).json({ error: "Guild not allowed" });
    }
  }
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const baseUrl = `${proto}://${host}`;
  if (interaction.type === 4) {
    return res.status(200).json({ type: 8, data: { choices: [] } });
  }
  if (interaction.type === 2) {
    res.status(200).json({ type: 5, data: {} });
    (0, import_functions.waitUntil)(
      (async () => {
        try {
          const proto2 = req.headers["x-forwarded-proto"] ?? "https";
          const host2 = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
          const baseUrl2 = `${proto2}://${host2}`;
          const [snapshots, cache, store] = await Promise.all([
            loadSnapshots(baseUrl2),
            loadMarketCache(),
            getCraftStore()
          ]);
          const nameIndex = buildNameIndex(snapshots.namesById);
          const marketBundle = { phantom: cache.phantom ?? {}, dc: cache.dc ?? {}, region: cache.region ?? {} };
          const commandName = interaction.data.name;
          const options = interaction.data.options ?? [];
          const guildId = interaction.guild_id ?? "";
          const channelId = interaction.channel_id ?? "";
          const userId = interaction.member?.user?.id ?? "";
          const permissions = BigInt(interaction.member?.permissions ?? "0");
          let response = { content: "Unknown command" };
          if (commandName === "craft") {
            const subcommand = options[0]?.name ?? "";
            const subOptions = options[0]?.options ?? [];
            const deps = {
              store,
              snapshots,
              nameIndex,
              marketBundle,
              botToken: DISCORD_BOT_TOKEN,
              appId: DISCORD_APP_ID,
              world: HOME_WORLD,
              dc: HOME_DC,
              region: REGION,
              craftChannelId: CRAFT_CHANNEL_ID,
              crafterRoleId: CRAFTER_ROLE_ID
            };
            if (subcommand === "new") {
              const item = subOptions.find((o) => o.name === "item")?.value ?? "";
              const qty = parseInt(subOptions.find((o) => o.name === "qty")?.value ?? "1", 10);
              const name = subOptions.find((o) => o.name === "name")?.value ?? null;
              const pingRole = subOptions.find((o) => o.name === "ping")?.value ?? null;
              response = await handleCraftNew(
                { item, qty, name, pingRole },
                guildId,
                channelId,
                userId,
                deps
              );
            } else if (subcommand === "list") {
              response = await handleCraftList(guildId, deps);
            } else if (subcommand === "show") {
              const projectId = parseInt(subOptions.find((o) => o.name === "id")?.value ?? "0", 10);
              response = await handleCraftShow(projectId, guildId, deps);
            } else if (subcommand === "close") {
              const projectId = parseInt(subOptions.find((o) => o.name === "id")?.value ?? "0", 10);
              response = await handleCraftClose(projectId, guildId, userId, permissions, deps);
            } else if (subcommand === "setup") {
              response = await handleCraftSetup(guildId, channelId, permissions, deps);
            }
          } else if (commandName === "oye") {
            const question = options.find((o) => o.name === "q")?.value ?? "";
            const toolDeps = {
              marketBundle,
              snapshots,
              nameIndex
            };
            const output = await handleChat(question, {
              groqApiKey: GROQ_API_KEY,
              toolDeps
            });
            try {
              const parsed = JSON.parse(output);
              response = { content: parsed.content };
              if (parsed.image) {
                response.embeds = [
                  {
                    image: { url: parsed.image }
                  }
                ];
              }
            } catch {
              response = { content: output };
            }
          }
          await editOriginalResponse(
            DISCORD_APP_ID,
            interaction.token,
            response
          );
        } catch (e) {
          console.error("[discord] deferred command error:", e);
          try {
            await editOriginalResponse(
              DISCORD_APP_ID,
              interaction.token,
              { content: "Error: " + (e instanceof Error ? e.message : String(e)) }
            );
          } catch {
          }
        }
      })()
    );
  } else if (interaction.type === 3) {
    const componentType = interaction.data?.component_type ?? 0;
    const customId = interaction.data?.custom_id ?? "";
    if (componentType === 2) {
      res.status(200).json({ type: 6, data: {} });
      (0, import_functions.waitUntil)(
        (async () => {
          try {
            const [snapshots, cache, store] = await Promise.all([
              loadSnapshots(baseUrl),
              loadMarketCache(),
              getCraftStore()
            ]);
            const guildId = interaction.guild_id ?? "";
            const userId = interaction.member?.user?.id ?? "";
            const messageId = interaction.message?.id ?? "";
            const channelId = interaction.channel_id ?? "";
            const deps = {
              store,
              snapshots,
              nameIndex: buildNameIndex(snapshots.namesById),
              botToken: DISCORD_BOT_TOKEN,
              world: HOME_WORLD,
              dc: HOME_DC,
              region: REGION,
              craftChannelId: CRAFT_CHANNEL_ID,
              crafterRoleId: CRAFTER_ROLE_ID,
              fetchMarket: async (ids, cfg) => {
                return fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
              }
            };
            let interactionResponse;
            if (customId === "cproj:requestbutton") {
              interactionResponse = handleCraftRequestButton();
            } else {
              interactionResponse = await handleCraftButton(
                customId,
                userId,
                guildId,
                messageId,
                channelId,
                deps
              );
            }
            if (interactionResponse.type === 9) {
              console.warn("[discord] received modal response for deferred button");
              return;
            }
            if (interactionResponse.type === 6 || !interactionResponse.type) {
              await editOriginalResponse(
                DISCORD_APP_ID,
                interaction.token,
                interactionResponse.data ?? {}
              );
            }
          } catch (e) {
            console.error("[discord] button error:", e);
            try {
              await editOriginalResponse(
                DISCORD_APP_ID,
                interaction.token,
                { content: "Error: " + (e instanceof Error ? e.message : String(e)) }
              );
            } catch {
            }
          }
        })()
      );
    } else if (componentType === 3) {
      res.status(200).json({ type: 6, data: {} });
      (0, import_functions.waitUntil)(
        (async () => {
          try {
            const [snapshots, cache, store] = await Promise.all([
              loadSnapshots(baseUrl),
              loadMarketCache(),
              getCraftStore()
            ]);
            const guildId = interaction.guild_id ?? "";
            const userId = interaction.member?.user?.id ?? "";
            const messageId = interaction.message?.id ?? "";
            const channelId = interaction.channel_id ?? "";
            const values = interaction.data?.values ?? [];
            const deps = {
              store,
              snapshots,
              nameIndex: buildNameIndex(snapshots.namesById),
              botToken: DISCORD_BOT_TOKEN,
              world: HOME_WORLD,
              dc: HOME_DC,
              region: REGION,
              craftChannelId: CRAFT_CHANNEL_ID,
              crafterRoleId: CRAFTER_ROLE_ID,
              fetchMarket: async (ids, cfg) => {
                return fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
              }
            };
            const interactionResponse = await handleCraftSelect(
              customId,
              values,
              userId,
              guildId,
              messageId,
              channelId,
              deps
            );
            if (interactionResponse.type === 6 || interactionResponse.type === 7 || !interactionResponse.type) {
              await editOriginalResponse(
                DISCORD_APP_ID,
                interaction.token,
                interactionResponse.data ?? {}
              );
            }
          } catch (e) {
            console.error("[discord] select error:", e);
            try {
              await editOriginalResponse(
                DISCORD_APP_ID,
                interaction.token,
                { content: "Error: " + (e instanceof Error ? e.message : String(e)) }
              );
            } catch {
            }
          }
        })()
      );
    }
  } else if (interaction.type === 5) {
    const customId = interaction.data?.custom_id ?? "";
    const fields = interaction.data?.components ?? [];
    const fieldMap = {};
    for (const row of fields) {
      for (const component of row.components ?? []) {
        if (component.custom_id) {
          fieldMap[component.custom_id] = component.value ?? "";
        }
      }
    }
    res.status(200).json({ type: 5, data: {} });
    (0, import_functions.waitUntil)(
      (async () => {
        try {
          const [snapshots, cache, store] = await Promise.all([
            loadSnapshots(baseUrl),
            loadMarketCache(),
            getCraftStore()
          ]);
          const guildId = interaction.guild_id ?? "";
          const userId = interaction.member?.user?.id ?? "";
          const messageId = interaction.message?.id ?? "";
          const channelId = interaction.channel_id ?? "";
          const deps = {
            store,
            snapshots,
            nameIndex: buildNameIndex(snapshots.namesById),
            botToken: DISCORD_BOT_TOKEN,
            world: HOME_WORLD,
            dc: HOME_DC,
            region: REGION,
            craftChannelId: CRAFT_CHANNEL_ID,
            crafterRoleId: CRAFTER_ROLE_ID,
            fetchMarket: async (ids, cfg) => {
              return fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
            }
          };
          let interactionResponse;
          if (customId === "cproj:requestmodal") {
            interactionResponse = await handleCraftRequestModal(
              fieldMap,
              userId,
              guildId,
              channelId,
              deps
            );
          } else if (customId.startsWith("cproj:") && customId.includes(":progressmodal:")) {
            interactionResponse = await handleCraftProgressModal(
              customId,
              fieldMap,
              userId,
              guildId,
              messageId,
              channelId,
              deps
            );
          } else {
            interactionResponse = { type: 4, data: { content: "Unknown modal", flags: 64 } };
          }
          if (interactionResponse.type === 4) {
            await editOriginalResponse(
              DISCORD_APP_ID,
              interaction.token,
              interactionResponse.data ?? {}
            );
          } else if (interactionResponse.type === 6 || interactionResponse.type === 7) {
            await editOriginalResponse(
              DISCORD_APP_ID,
              interaction.token,
              interactionResponse.data ?? {}
            );
          }
        } catch (e) {
          console.error("[discord] modal error:", e);
          try {
            await editOriginalResponse(
              DISCORD_APP_ID,
              interaction.token,
              { content: "Error: " + (e instanceof Error ? e.message : String(e)) }
            );
          } catch {
          }
        }
      })()
    );
  } else {
    return res.status(400).json({ error: "Unsupported interaction type" });
  }
}
async function editOriginalResponse(appId, interactionToken, data) {
  const BASE2 = "https://discord.com/api/v10";
  const url = `${BASE2}/webhooks/${appId}/${interactionToken}/messages/@original`;
  const payload = {};
  if (data.content !== void 0) payload.content = data.content;
  if (data.embeds !== void 0) payload.embeds = data.embeds;
  if (data.components !== void 0) payload.components = data.components;
  if (data.flags !== void 0) payload.flags = data.flags;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error(`[discord] editOriginal failed ${res.status}:`, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[discord] editOriginal fetch error:", e);
  }
}
