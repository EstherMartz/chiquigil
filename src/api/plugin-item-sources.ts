import { loadSnapshots } from '../bot/loadSnapshots';
import type { Recipe } from '../lib/recipes';

interface RecipeSource {
  type: 'recipe';
  jobId: number;
  jobName: string;
  level: number;
  ingredients: Array<{ itemId: number; itemName: string; qty: number }>;
  outputQty: number;
}

interface VendorSource {
  type: 'vendor';
  npcId: number;
  npcName: string;
  price: number;
}

interface GatheringSource {
  type: 'gather';
  level: number;
  timed: boolean;
}

interface SpecialShopSource {
  type: 'special_shop';
  currency: string;
  currencyId: number;
  cost: number;
}

interface CompanyCraftSource {
  type: 'company_craft';
  craftName: string;
  ingredients: Array<{ itemId: number; itemName: string; qty: number }>;
}

interface ItemSourcesResponse {
  itemId: number;
  itemName: string;
  sources: (RecipeSource | VendorSource | GatheringSource | SpecialShopSource | CompanyCraftSource)[];
}

async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const itemIdStr = req.query.id;
  if (!itemIdStr) {
    return res.status(400).json({ error: 'Missing id query param' });
  }

  const itemId = parseInt(itemIdStr);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }

  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const snapshots = await loadSnapshots(baseUrl);

  const itemName = snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const sources: any[] = [];

  // Recipes (all recipes that output this item)
  const jobNames: Record<number, string> = {
    8: 'Carpenter', 9: 'Blacksmith', 10: 'Armorer', 11: 'Goldsmith',
    12: 'Weaver', 13: 'Leatherworker', 14: 'Carpenter', 15: 'Alchemist',
    16: 'Culinarian'
  };

  for (const [outputId, recipe] of snapshots.recipes) {
    if (outputId === itemId) {
      const jobName = jobNames[recipe.classJobId] || `Job #${recipe.classJobId}`;
      sources.push({
        type: 'recipe',
        jobId: recipe.classJobId,
        jobName,
        level: recipe.recipeLevel?.stars || 1,
        ingredients: recipe.ingredients.map(ing => ({
          itemId: ing.itemId,
          itemName: snapshots.namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
          qty: ing.amount,
        })),
        outputQty: recipe.amountResult ?? 1,
      });
    }
  }

  // Vendors
  const vendorPrice = snapshots.vendorMap.get(itemId);
  if (vendorPrice != null) {
    sources.push({
      type: 'vendor',
      npcId: 0, // We don't have NPC ID in the snapshot
      npcName: 'NPC Vendor',
      price: vendorPrice,
    });
  }

  // Gathering
  const gatherInfo = snapshots.gatheringCatalog.get(itemId);
  if (gatherInfo) {
    sources.push({
      type: 'gather',
      level: gatherInfo.level,
      timed: gatherInfo.timed,
    });
  }

  // Special shop
  for (const [currency, entries] of snapshots.specialShop.byCurrency) {
    for (const entry of entries) {
      if (entry.itemId === itemId) {
        sources.push({
          type: 'special_shop',
          currency,
          currencyId: 0, // Would need extended data
          cost: entry.cost,
        });
        break;
      }
    }
  }

  // Company craft
  for (const [craftId, companyCraft] of snapshots.companyCraft) {
    for (const phase of companyCraft.phases || []) {
      for (const ingredient of phase.ingredients || []) {
        if (ingredient.itemId === itemId) {
          sources.push({
            type: 'company_craft',
            craftName: companyCraft.name || `Company Craft #${craftId}`,
            ingredients: phase.ingredients.map(ing => ({
              itemId: ing.itemId,
              itemName: snapshots.namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
              qty: ing.amount,
            })),
          });
          break;
        }
      }
    }
  }

  if (sources.length === 0) {
    sources.push({ type: 'unknown' });
  }

  return res.status(200).json({
    itemId,
    itemName,
    sources,
  });
}

export { handler as default };
