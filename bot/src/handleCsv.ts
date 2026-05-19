import { parseAllaganInventory } from '../../src/features/cleanup/parseAllaganInventory';
import { findInventoryUses } from '../../src/features/cleanup/findInventoryUses';
import { fetchMarketForOutputs } from './fetchMarketForOutputs';
import { formatUsesReply, type FormatOutput } from './formatDiscord';
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

  // First pass: discover which recipe outputs we need MB prices for. Pass an
  // empty market so prices come back as 0 — we only care about the output ids.
  const emptyMarket = { phantom: {}, dc: {}, region: {} } as Parameters<typeof findInventoryUses>[2];
  const usesNoPrice = findInventoryUses(parsed.entries, snapshots.recipes, emptyMarket, snapshots.itemsById);
  const outputIds = new Set<number>();
  for (const arr of usesNoPrice.values()) {
    for (const u of arr) outputIds.add(u.outputItemId);
  }

  // Second pass: now fetch MB for just those outputs and re-rank.
  const market = await fetchMarketForOutputs([...outputIds], cfg);
  const usesByItemId = findInventoryUses(parsed.entries, snapshots.recipes, market, snapshots.itemsById);

  return formatUsesReply({
    entries: parsed.entries,
    usesByItemId,
    unrecognized: parsed.unrecognized,
  });
}
