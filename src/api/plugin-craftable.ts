import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadSnapshots } from '../bot/loadSnapshots';
import { findCraftableFromInventory } from '../features/craftFromInventory/findCraftable';
import { cheapestWorld } from '../lib/cheapestWorld';
import type { MarketData } from '../lib/universalis';
import { loadMarketBundle } from '../lib/marketBundle';

interface InventoryEntry { id: number; qty: number }

interface CraftIngredientOut {
  itemId: number;
  name: string;
  needed: number;
  have: number;
}

interface CraftableResult {
  itemId: number;
  name: string;
  qty: number;            // how many you can fully craft right now (0 if missing any)
  missingCount: number;   // # ingredient types not fully owned
  completeness: number;   // 0..1
  minNQ: number | null;   // home-world cheapest NQ listing (output)
  velocity: number;       // sales/day (output)
  cheapestWorld: string | null;  // DC-wide cheapest world for the output
  cheapestPrice: number | null;
  ingredients: CraftIngredientOut[];
}

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse inventory from ?inv= query param (URL-encoded JSON array)
  let inventory: InventoryEntry[];
  try {
    const raw = req.query.inv;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'Missing inv query param' });
    }
    inventory = JSON.parse(raw) as InventoryEntry[];
    if (!Array.isArray(inventory)) throw new Error('Not an array');
  } catch {
    return res.status(400).json({ error: 'inv must be a URL-encoded JSON array of {id, qty} objects' });
  }

  // 0 = fully craftable only (legacy behavior); higher = show near-complete crafts.
  const maxMissing = Math.min(5, Math.max(0, parseInt(String(req.query.maxMissing)) || 0));

  // Build a lookup map: itemId → qty in inventory
  const invMap = new Map<number, number>();
  for (const entry of inventory) {
    invMap.set(entry.id, (invMap.get(entry.id) ?? 0) + entry.qty);
  }

  // Load recipe snapshot
  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const snapshots = await loadSnapshots(baseUrl);

  // Reuse the same pure function the web uses, so plugin + web stay in lockstep.
  const rows = findCraftableFromInventory(invMap, snapshots.recipes, snapshots.namesById, { maxMissing });

  const craftable: CraftableResult[] = rows.map((r) => {
    // How many full batches can we make right now (0 when any ingredient is missing)?
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
        itemId: i.itemId, name: i.name, needed: i.needed, have: i.have,
      })),
    };
  });

  if (craftable.length === 0) {
    return res.status(200).json({ craftable: [] });
  }

  // Fetch market prices via the shared cold+hot loader (hourly cold + ~5-min hot,
  // hot wins; resolves R2 URLs from env). See src/lib/marketBundle.ts.
  try {
    const cache: SharedCache | null = await loadMarketBundle(process.env, {
      defaultColdUrl: `${baseUrl}/data/market-cache-cold.json`,
      defaultHotUrl: `${baseUrl}/data/market-cache-hot.json`,
    });
    if (cache) {
      const home = cache.phantom ?? {};
      const dc = cache.dc ?? {};
      for (const item of craftable) {
        const homeEntry = home[String(item.itemId)];
        if (homeEntry) {
          item.minNQ = homeEntry.minNQ;
          item.velocity = homeEntry.velocity;
        }
        // DC-wide cheapest world: where to buy the output cheapest.
        const best = cheapestWorld(dc[String(item.itemId)]);
        if (best) {
          item.cheapestWorld = best.world;
          item.cheapestPrice = best.price;
        }
      }
    }
  } catch {
    // Cache unavailable — return items without prices rather than failing
  }

  // Sort by completeness first (fully craftable on top), then gil opportunity.
  craftable.sort((a, b) => {
    if (b.completeness !== a.completeness) return b.completeness - a.completeness;
    const aVal = (a.minNQ ?? 0) * a.qty;
    const bVal = (b.minNQ ?? 0) * b.qty;
    return bVal - aVal;
  });

  return res.status(200).json({ craftable });
}
