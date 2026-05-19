import { useMemo } from 'react';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useMarketData } from '../watchlist/useMarketData';
import { useUserStore } from '../user/userStore';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { AllaganPasteBox } from './AllaganPasteBox';
import { CleanupResults } from './CleanupResults';
import { parseAllaganInventory } from './parseAllaganInventory';
import { findCraftOpportunities } from './findCraftOpportunities';
import { runCleanup } from './runCleanup';
import { useCleanupStore } from './cleanupStore';
import type { CleanupResult } from './types';

export function CleanupView() {
  const itemSnap = useItemSnapshot();
  const recipeSnap = useRecipeSnapshot();
  const world = useUserStore((s) => s.world);
  const dc = useUserStore((s) => s.dc);

  const itemsById = useMemo<Map<number, SnapshotItem>>(() => {
    const m = new Map<number, SnapshotItem>();
    for (const i of itemSnap.data?.items ?? []) m.set(i.id, i);
    return m;
  }, [itemSnap.data?.items]);

  const namesById = useMemo<Map<number, string>>(() => {
    const m = new Map<number, string>();
    itemsById.forEach((v, k) => m.set(k, v.name));
    return m;
  }, [itemsById]);

  const parsed = useCleanupStore((s) => s.parsed);
  const parseError = useCleanupStore((s) => s.parseError);
  const setParsed = useCleanupStore((s) => s.setParsed);
  const setParseError = useCleanupStore((s) => s.setParseError);
  const clearStore = useCleanupStore((s) => s.clear);

  // Collect every itemId we need market data for: every inventory item + every recipe-output the inventory could craft.
  const marketIds = useMemo<number[]>(() => {
    if (!parsed) return [];
    const ids = new Set<number>();
    for (const e of parsed.entries) if (e.itemId > 0) ids.add(e.itemId);
    // Also include recipe outputs whose ingredients overlap with inventory; one pass via recipeSnap.
    if (recipeSnap.data) {
      const invItemIds = new Set(parsed.entries.map((e) => e.itemId));
      for (const recipe of recipeSnap.data.values()) {
        const usesInv = recipe.ingredients.some((ing) => invItemIds.has(ing.itemId));
        if (usesInv) {
          ids.add(recipe.itemResultId);
          for (const ing of recipe.ingredients) ids.add(ing.itemId);
        }
      }
    }
    return [...ids];
  }, [parsed, recipeSnap.data]);

  // Region scope ('Europe' = Chaos + Light) catches items with zero listings on
  // the player's world but active cross-DC sellers, so the bucketer can still
  // route them to MB instead of vendor.
  const market = useMarketData(marketIds, world, dc, 'Europe');

  const result = useMemo<CleanupResult | null>(() => {
    if (!parsed || !recipeSnap.data || !market.data) return null;
    const craftMap = findCraftOpportunities(parsed.entries, recipeSnap.data, market.data, itemsById);
    return runCleanup({
      inventory: parsed.entries,
      market: market.data,
      items: itemsById,
      craftOpportunities: craftMap,
      unrecognized: parsed.unrecognized,
    });
  }, [parsed, recipeSnap.data, market.data, itemsById]);

  function handleParse(csv: string) {
    try {
      const out = parseAllaganInventory(csv, namesById);
      setParsed(out);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleClear() {
    clearStore();
  }

  const summary = parsed
    ? `Parsed ${parsed.entries.length + parsed.unrecognized.length} rows · ${parsed.entries.length} recognized`
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-8 pt-4">
      <AllaganPasteBox
        onParse={handleParse}
        onClear={handleClear}
        parseError={parseError}
        parsedSummary={summary}
      />
      {parsed && market.isLoading && (
        <p className="font-mono text-[11px] text-text-low">Fetching market data for {marketIds.length} items…</p>
      )}
      {result && <CleanupResults result={result} />}
    </div>
  );
}
