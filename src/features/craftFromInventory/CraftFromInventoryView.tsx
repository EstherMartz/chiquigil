import { useMemo, useState } from 'react';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useSettingsStore } from '../settings/store';
import { useUserStore } from '../user/userStore';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { AllaganPasteBox } from '../cleanup/AllaganPasteBox';
import { parseAllaganInventory, type ParseResult } from '../cleanup/parseAllaganInventory';
import { PluginInventoryButton } from '../plugin/PluginInventoryButton';
import { findCraftableFromInventory, type CraftableRow } from './findCraftable';
import { useMarketData } from '../watchlist/useMarketData';
import { SectionHeader } from '../../components/SectionHeader';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { fmtGil } from '../../lib/format';

export function CraftFromInventoryView() {
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const vendors = useVendorShopSnapshot();
  const gathering = useGatheringCatalog();
  const hideCrystals = useSettingsStore((s) => s.hideCrystals);
  const world = useUserStore((s) => s.world);
  const dc = useUserStore((s) => s.dc);

  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [maxMissing, setMaxMissing] = useState(1);
  const [marketableOnly, setMarketableOnly] = useState(false);

  const namesById = useMemo(() => {
    const m = new Map<number, string>();
    for (const item of snapshot.data?.items ?? []) m.set(item.id, item.name);
    return m;
  }, [snapshot.data]);

  const inventory = useMemo(() => {
    if (!parsed) return null;
    const m = new Map<number, number>();
    for (const e of parsed.entries) {
      if (e.itemId === 0) continue;
      m.set(e.itemId, (m.get(e.itemId) ?? 0) + e.qty);
    }
    return m;
  }, [parsed]);

  const rows = useMemo(() => {
    if (!inventory || !recipes.data) return [];

    // Build velocity map from market cache for marketable filter
    let velocityMap: Map<number, number> | undefined;
    if (marketableOnly) {
      // We'll compute this from cached market data asynchronously — for now
      // use a simple check: any item in the recipe snapshot is considered marketable
      // unless we have velocity data showing otherwise.
      velocityMap = undefined; // Will be enhanced when cache is available
    }

    const vendorMap = vendors.data?.snapshot
      ? new Map([...vendors.data.snapshot.entries()].map(([id, price]) => [id, price as number]))
      : undefined;

    const gatheringSet = gathering.data
      ? new Set(gathering.data.keys())
      : undefined;

    const excludeIngredientIds = hideCrystals && snapshot.data
      ? new Set(snapshot.data.items.filter((i) => i.sc === CRYSTALS_SEARCH_CATEGORY).map((i) => i.id))
      : undefined;

    return findCraftableFromInventory(inventory, recipes.data, namesById, {
      maxMissing,
      marketableOnly,
      velocityMap,
      vendorMap,
      gatheringSet,
      excludeIngredientIds,
    });
  }, [inventory, recipes.data, namesById, maxMissing, marketableOnly, vendors.data, gathering.data, hideCrystals, snapshot.data]);

  const marketIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of rows) {
      ids.add(row.recipeItemId);
      for (const ing of row.ingredients) {
        if (!ing.fulfilled && ing.source === 'market') ids.add(ing.itemId);
      }
    }
    return [...ids];
  }, [rows]);

  const market = useMarketData(marketIds, world, dc, undefined, { enabled: marketIds.length > 0 });

  function getSalePrice(itemId: number): number | null {
    const m = market.data;
    if (!m) return null;
    return (m.phantom[itemId]?.minNQ ?? m.dc[itemId]?.minNQ) ?? null;
  }

  function getMaterialCost(row: CraftableRow): number {
    let total = 0;
    for (const ing of row.ingredients) {
      if (ing.fulfilled) continue;
      const qty = ing.needed - ing.have;
      if (ing.source === 'gather') continue;
      if (ing.source === 'vendor' && ing.unitPrice != null) {
        total += ing.unitPrice * qty;
      } else if (ing.source === 'market') {
        const price = getSalePrice(ing.itemId);
        if (price != null) total += price * qty;
      }
    }
    return total;
  }

  function handleParse(csv: string) {
    setParseError(null);
    try {
      const result = parseAllaganInventory(csv, namesById);
      setParsed(result);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleClear() {
    setParsed(null);
    setParseError(null);
  }

  const parsedSummary = parsed ? `${parsed.entries.length} items parsed` : null;
  const ready = snapshot.data != null && recipes.data != null;

  return (
    <div className="max-w-[100rem] mx-auto space-y-6 px-4 pt-4">
      <div>
        <SectionHeader label="Craft From Inventory" />
        <p className="font-mono text-[11px] text-text-low max-w-prose mt-1">
          Upload your Allagan Tools inventory CSV to see what you can craft with items you already own.
        </p>
      </div>

      {!ready && <Spinner label="Loading snapshots..." />}

      {ready && (
        <>
          <PluginInventoryButton namesById={namesById} onLoaded={(r) => { setParseError(null); setParsed(r); }} />
          <AllaganPasteBox
            onParse={handleParse}
            onClear={handleClear}
            parseError={parseError}
            parsedSummary={parsedSummary}
          />
        </>
      )}

      {parsed && (
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 font-mono text-[11px] text-text-low">
            Max missing:
            <select
              value={maxMissing}
              onChange={(e) => setMaxMissing(Number(e.target.value))}
              className="bg-bg-card-hi border border-border-base text-text-cream px-2 py-1 text-xs"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n === 0 ? 'None (100% ready)' : `${n} ingredient${n > 1 ? 's' : ''}`}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 font-mono text-[11px] text-text-low cursor-pointer">
            <input
              type="checkbox"
              checked={marketableOnly}
              onChange={(e) => setMarketableOnly(e.target.checked)}
              className="accent-gold"
            />
            Marketable only
          </label>
          <span className="font-mono text-[11px] text-text-dim">
            {rows.length} recipe{rows.length !== 1 ? 's' : ''} found
          </span>
        </div>
      )}

      {parsed && rows.length === 0 && (
        <EmptyState
          icon="📭"
          message="No craftable recipes found with current filters."
        />
      )}

      {rows.length > 0 && (
        <div className="border border-border-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase bg-bg-card-hi">
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-center px-3 py-2">Ready</th>
                <th className="text-right px-3 py-2">Verdict</th>
                <th className="text-left px-3 py-2">Ingredients</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((row) => (
                <tr key={row.recipeItemId} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                  <td className="px-3 py-2">
                    <ItemNameLinks id={row.recipeItemId} name={row.name} crafter={row.classJob} />
                    <div className="font-mono text-[10px] text-text-dim mt-0.5">Lv {row.recipeLevel}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`font-mono text-xs ${row.completeness === 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {Math.round(row.completeness * 100)}%
                    </span>
                    <div className="font-mono text-[10px] text-text-dim">
                      {row.totalIngredients - row.missingCount}/{row.totalIngredients}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                    {(() => {
                      const sale = getSalePrice(row.recipeItemId);
                      if (sale == null) return <span className="text-[10px] text-text-dim">no data</span>;
                      const cost = getMaterialCost(row);
                      const profit = sale - cost;
                      const isCraft = profit > 0;
                      return (
                        <div className="space-y-1">
                          <span className={`inline-block px-1.5 py-px text-[9px] font-bold tracking-widest uppercase border ${
                            isCraft
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-700'
                              : 'bg-crimson/10 text-crimson border-crimson/40'
                          }`}>
                            {isCraft ? 'craft' : 'pass'}
                          </span>
                          <div className={`text-xs font-bold ${isCraft ? 'text-emerald-400' : 'text-crimson'}`}>
                            {isCraft ? '+' : ''}{fmtGil(profit)}
                          </div>
                          <div className="text-[10px] text-text-dim leading-tight">
                            sell {fmtGil(sale)}
                            {cost > 0 && <><br />spend {fmtGil(cost)}</>}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {row.ingredients.map((ing) => (
                        <span key={ing.itemId} className={`font-mono text-[11px] ${ing.fulfilled ? 'text-emerald-400' : 'text-crimson'}`}>
                          {ing.fulfilled ? '\u2713' : '\u2717'} {ing.name} {ing.have}/{ing.needed}
                          {!ing.fulfilled && ing.unitPrice != null && (
                            <span className="text-text-dim"> ({ing.source} {fmtGil(ing.unitPrice)})</span>
                          )}
                          {!ing.fulfilled && ing.source === 'gather' && (
                            <span className="text-text-dim"> (gather)</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
