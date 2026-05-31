import { useCallback, useMemo, useState } from 'react';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useQuestSnapshot } from '../queries/useQuestSnapshot';
import { useMarketData, type MarketBundle } from '../watchlist/useMarketData';
import { useUserStore } from '../user/userStore';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { AllaganPasteBox } from './AllaganPasteBox';
import { PluginInventoryButton } from '../plugin/PluginInventoryButton';
import { CleanupResults } from './CleanupResults';
import { CleanupProgressBar } from './CleanupProgressBar';
import { parseAllaganInventory } from './parseAllaganInventory';
import { findCraftOpportunities } from './findCraftOpportunities';
import { findInventoryUses } from './findInventoryUses';
import { runCleanup } from './runCleanup';
import { useCleanupStore } from './cleanupStore';
import type { CleanupResult, UsesEntry } from './types';

const EMPTY_MARKET: MarketBundle = { phantom: {}, dc: {}, region: {} };

function mergeMarkets(a: MarketBundle, b: MarketBundle): MarketBundle {
  return {
    phantom: { ...a.phantom, ...b.phantom },
    dc: { ...a.dc, ...b.dc },
    region: { ...a.region, ...b.region },
  };
}

export function CleanupView() {
  const itemSnap = useItemSnapshot();
  const recipeSnap = useRecipeSnapshot();
  const questSnap = useQuestSnapshot();
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

  // Pass 1: just the user's inventory items. Drives the Sell/Vendor/Discard
  // sections immediately so they don't have to wait on the bigger craft fetch.
  const inventoryIds = useMemo<number[]>(() => {
    if (!parsed) return [];
    const ids = new Set<number>();
    for (const e of parsed.entries) if (e.itemId > 0) ids.add(e.itemId);
    return [...ids];
  }, [parsed]);

  // GC supply item IDs — used to narrow the craft search to only recipes
  // whose output is a GC supply turn-in item (daily demand from players).
  const gcSupplyIds = useMemo<Set<number>>(() => {
    const ids = new Set<number>();
    for (const quest of questSnap.data?.snapshot ?? []) {
      for (const req of quest.requiredItems) ids.add(req.itemId);
    }
    return ids;
  }, [questSnap.data]);

  // Pass 2: only recipes whose output is a GC supply item + missing ingredients.
  // This is dramatically faster than the old "all recipes" approach because
  // the fetch set shrinks from thousands to ~200.
  const craftIds = useMemo<number[]>(() => {
    if (!parsed || !recipeSnap.data) return [];
    const invItemIds = new Set(parsed.entries.map((e) => e.itemId));
    const ids = new Set<number>();
    for (const recipe of recipeSnap.data.values()) {
      if (!gcSupplyIds.has(recipe.itemResultId)) continue;
      const usesInv = recipe.ingredients.some((ing) => invItemIds.has(ing.itemId));
      if (!usesInv) continue;
      ids.add(recipe.itemResultId);
      for (const ing of recipe.ingredients) {
        if (!invItemIds.has(ing.itemId)) ids.add(ing.itemId);
      }
    }
    return [...ids];
  }, [parsed, recipeSnap.data, gcSupplyIds]);

  const [invProgress, setInvProgress] = useState({ done: 0, total: 0 });
  const [craftProgress, setCraftProgress] = useState({ done: 0, total: 0 });
  const onInvProgress = useCallback(
    (done: number, total: number) => setInvProgress({ done, total }),
    [],
  );
  const onCraftProgress = useCallback(
    (done: number, total: number) => setCraftProgress({ done, total }),
    [],
  );

  const inventoryMarket = useMarketData(inventoryIds, world, dc, 'Europe', { onProgress: onInvProgress });
  // Gate the craft fetch on inventory market having landed so we don't double
  // up the throttle queue right out the gate.
  const craftMarket = useMarketData(craftIds, world, dc, 'Europe', {
    enabled: !!inventoryMarket.data && craftIds.length > 0,
    onProgress: onCraftProgress,
  });

  const inventoryReady = !!inventoryMarket.data;
  const craftReady = !!craftMarket.data || craftIds.length === 0;

  // Stage 1 result: just sell/vendor/discard, with empty craft opportunities.
  const partialResult = useMemo<CleanupResult | null>(() => {
    if (!parsed || !inventoryMarket.data) return null;
    return runCleanup({
      inventory: parsed.entries,
      market: inventoryMarket.data,
      items: itemsById,
      craftOpportunities: new Map(),
      unrecognized: parsed.unrecognized,
    });
  }, [parsed, inventoryMarket.data, itemsById]);

  // Stage 2 result: full cleanup with craft scoring + merged market data.
  const fullResult = useMemo<CleanupResult | null>(() => {
    if (!parsed || !recipeSnap.data || !inventoryMarket.data) return null;
    if (craftIds.length > 0 && !craftMarket.data) return null;
    const merged = craftMarket.data
      ? mergeMarkets(inventoryMarket.data, craftMarket.data)
      : inventoryMarket.data;
    const craftMap = findCraftOpportunities(parsed.entries, recipeSnap.data, merged, itemsById);
    return runCleanup({
      inventory: parsed.entries,
      market: merged,
      items: itemsById,
      craftOpportunities: craftMap,
      unrecognized: parsed.unrecognized,
    });
  }, [parsed, recipeSnap.data, inventoryMarket.data, craftMarket.data, itemsById, craftIds.length]);

  const usesByItemId = useMemo<Map<number, UsesEntry[]>>(() => {
    if (!parsed || !recipeSnap.data) return new Map();
    const merged = craftMarket.data
      ? mergeMarkets(inventoryMarket.data ?? EMPTY_MARKET, craftMarket.data)
      : (inventoryMarket.data ?? EMPTY_MARKET);
    return findInventoryUses(parsed.entries, recipeSnap.data, merged, itemsById);
  }, [parsed, recipeSnap.data, inventoryMarket.data, craftMarket.data, itemsById]);

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

  const showProgress = parsed && (!inventoryReady || !craftReady);
  const result = fullResult ?? partialResult;

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-8 pt-4">
      <PluginInventoryButton namesById={namesById} onLoaded={(r) => { setParseError(null); setParsed(r); }} />
      <AllaganPasteBox
        onParse={handleParse}
        onClear={handleClear}
        parseError={parseError}
        parsedSummary={summary}
      />
      {showProgress && (
        <CleanupProgressBar
          stages={[
            {
              label: 'Pricing your inventory…',
              done: invProgress.done,
              total: invProgress.total,
              status: inventoryReady ? 'done' : 'active',
            },
            {
              label: 'Scoring GC supply crafts…',
              done: craftProgress.done,
              total: craftProgress.total,
              status:
                !inventoryReady ? 'pending'
                : craftReady ? 'done'
                : 'active',
            },
          ]}
        />
      )}
      {result && <CleanupResults result={result} usesByItemId={usesByItemId} />}
    </div>
  );
}
