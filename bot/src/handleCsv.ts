import { parseAllaganInventory } from '../../src/features/cleanup/parseAllaganInventory';
import { findCraftOpportunities } from '../../src/features/cleanup/findCraftOpportunities';
import { findInventoryUses } from '../../src/features/cleanup/findInventoryUses';
import { runCleanup } from '../../src/features/cleanup/runCleanup';
import { fetchMarketForOutputs } from './fetchMarketForOutputs';
import { formatCleanupReply, type FormatOutput } from './formatDiscord';
import type { BotSnapshots } from './loadSnapshots';

interface Cfg {
  world: string;
  dc: string;
  region: string;
}

export async function handleCsv(
  csv: string,
  snapshots: BotSnapshots,
  cfg: Cfg,
): Promise<FormatOutput> {
  const parsed = parseAllaganInventory(csv, snapshots.namesById);

  // Build the same marketIds set the web cleanup view uses:
  //   inventory items + outputs of overlap-recipes + their non-inventory
  //   ingredients (potentially-missing). In-inventory ingredients fall back
  //   to priceLow as the opportunity-cost floor in findCraftOpportunities,
  //   so we skip them to keep the fetch volume sane.
  const invItemIds = new Set<number>();
  for (const e of parsed.entries) if (e.itemId > 0) invItemIds.add(e.itemId);

  const marketIds = new Set<number>(invItemIds);
  for (const recipe of snapshots.recipes.values()) {
    const usesInv = recipe.ingredients.some((ing) => invItemIds.has(ing.itemId));
    if (!usesInv) continue;
    marketIds.add(recipe.itemResultId);
    for (const ing of recipe.ingredients) {
      if (!invItemIds.has(ing.itemId)) marketIds.add(ing.itemId);
    }
  }

  const market = await fetchMarketForOutputs([...marketIds], cfg);

  const craftMap = findCraftOpportunities(parsed.entries, snapshots.recipes, market, snapshots.itemsById);
  const result = runCleanup({
    inventory: parsed.entries,
    market,
    items: snapshots.itemsById,
    craftOpportunities: craftMap,
    unrecognized: parsed.unrecognized,
  });
  const usesByItemId = findInventoryUses(parsed.entries, snapshots.recipes, market, snapshots.itemsById);

  return formatCleanupReply({
    result,
    usesByItemId,
    totalRows: parsed.entries.length + parsed.unrecognized.length,
  });
}
