import { parseAllaganInventory, type ParseResult } from '../../src/features/cleanup/parseAllaganInventory';
import { findCraftOpportunities } from '../../src/features/cleanup/findCraftOpportunities';
import { findInventoryUses } from '../../src/features/cleanup/findInventoryUses';
import { runCleanup } from '../../src/features/cleanup/runCleanup';
import { fetchMarketForOutputs } from './fetchMarketForOutputs';
import { formatCleanupReply, type FormatOutput } from './formatDiscord';
import type { BotSnapshots } from './loadSnapshots';
import type { CleanupResult, UsesEntry } from '../../src/features/cleanup/types';

interface Cfg {
  world: string;
  dc: string;
  region: string;
}

export interface HandleCsvOutput {
  reply: FormatOutput;
  parsed: ParseResult;
  marketIds: number[];
  result: CleanupResult;
  usesByItemId: Map<number, UsesEntry[]>;
}

export async function handleCsv(
  csv: string,
  snapshots: BotSnapshots,
  cfg: Cfg,
  buttons?: { ownerId: string; cacheId: string },
): Promise<HandleCsvOutput> {
  const parsed = parseAllaganInventory(csv, snapshots.namesById);

  const invItemIds = new Set<number>();
  for (const e of parsed.entries) if (e.itemId > 0) invItemIds.add(e.itemId);

  const marketIdSet = new Set<number>(invItemIds);
  for (const recipe of snapshots.recipes.values()) {
    const usesInv = recipe.ingredients.some((ing) => invItemIds.has(ing.itemId));
    if (!usesInv) continue;
    marketIdSet.add(recipe.itemResultId);
    for (const ing of recipe.ingredients) {
      if (!invItemIds.has(ing.itemId)) marketIdSet.add(ing.itemId);
    }
  }
  const marketIds = [...marketIdSet];

  const market = await fetchMarketForOutputs(marketIds, cfg);

  const craftMap = findCraftOpportunities(parsed.entries, snapshots.recipes, market, snapshots.itemsById);
  const result = runCleanup({
    inventory: parsed.entries,
    market,
    items: snapshots.itemsById,
    craftOpportunities: craftMap,
    unrecognized: parsed.unrecognized,
  });
  const usesByItemId = findInventoryUses(parsed.entries, snapshots.recipes, market, snapshots.itemsById);

  const reply = formatCleanupReply(
    {
      result,
      usesByItemId,
      totalRows: parsed.entries.length + parsed.unrecognized.length,
    },
    buttons,
  );

  return { reply, parsed, marketIds, result, usesByItemId };
}
