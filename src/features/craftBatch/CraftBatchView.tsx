import { useMemo, useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { scoreCraftPool, buildDiversifiedBatch } from './buildBatch';
import { useShoppingListStore } from '../shoppingList/shoppingListStore';
import { useBatchTrackerStore } from '../batchTracker/batchTrackerStore';
import { batchItemToSaved } from '../batchTracker/types';
import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HqStar } from '../../components/HqStar';
import { Spinner } from '../../components/Spinner';
import { ExportCsvButton } from '../../components/ExportCsvButton';
import { ExportTeamcraftButton } from '../../components/ExportTeamcraftButton';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import { EmptyState } from '../../components/EmptyState';
import type { BatchItem, BatchResult } from './types';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import type { CsvColumn } from '../../lib/csv';

const CSV_COLUMNS: CsvColumn<BatchItem>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'materialCost', label: 'Material Cost' },
  { key: 'salePrice', label: 'Sale Price' },
  { key: 'profit', label: 'Profit' },
  { key: 'velocity', label: 'Velocity' },
  { key: 'gilPerDay', label: 'Gil/day' },
  { key: 'hq', label: 'HQ' },
];

const BUDGET_PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000, 8_000_000, 15_000_000, 30_000_000];
const DEFAULT_BUDGET = 5_000_000;
const DEFAULT_BATCH_SIZE = 8;

interface RunResult {
  priceMap: MarketData;
  skipped: number;
}

export function CraftBatchView() {
  const navigate = useNavigate();
  const { world, hideCrystals } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const addItem = useShoppingListStore((s) => s.addItem);
  const saveBatch = useBatchTrackerStore((s) => s.saveBatch);
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);

  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());

  const candidateIds = useMemo(() => {
    if (!snapshot.data || !recipes.data) return [];
    const ids: number[] = [];
    for (const item of snapshot.data.items) {
      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;
      if (recipes.data.get(item.id)) ids.push(item.id);
    }
    return ids;
  }, [snapshot.data, recipes.data, hideCrystals]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !recipes.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { priceMap: sale.data, skipped: sale.errors.length };
    },
    onSuccess: (data) => {
      if (!snapshot.data || !recipes.data) return;
      const pool = scoreCraftPool(snapshot.data.items, data.priceMap, recipes.data);
      const result = buildDiversifiedBatch(pool, { budget, batchSize });
      setBatch(result);
      setRemovedIds(new Set());
    },
  });

  const handleGenerate = useCallback(() => {
    run.reset();
    run.mutate();
  }, [run]);

  const handleRemove = useCallback((itemId: number) => {
    if (!batch || !run.data || !snapshot.data || !recipes.data) return;
    const next = new Set(removedIds).add(itemId);
    setRemovedIds(next);

    const pool = scoreCraftPool(snapshot.data.items, run.data.priceMap, recipes.data)
      .filter((p) => !next.has(p.id));
    const currentIds = new Set(batch.items.filter((i) => i.id !== itemId).map((i) => i.id));
    const availablePool = pool.filter((p) => !currentIds.has(p.id));

    // Rebuild with remaining items locked + 1 open slot for replacement
    const remaining = batch.items.filter((i) => i.id !== itemId);
    const usedBudget = remaining.reduce((s, i) => s + i.materialCost, 0);
    const replacement = buildDiversifiedBatch(
      availablePool,
      { budget: budget - usedBudget, batchSize: 1 },
    );

    const newItems = [...remaining, ...replacement.items];
    const totalCost = newItems.reduce((s, i) => s + i.materialCost, 0);
    const expectedRevenue = newItems.reduce(
      (s, i) => s + i.salePrice * Math.min(i.velocity, 1), 0,
    );
    const categoryBreakdown: Record<number, number> = {};
    for (const i of newItems) {
      categoryBreakdown[i.sc] = (categoryBreakdown[i.sc] ?? 0) + 1;
    }

    setBatch({
      items: newItems,
      totalCost,
      expectedRevenue,
      expectedProfit: expectedRevenue - totalCost,
      roi: totalCost > 0 ? (expectedRevenue - totalCost) / totalCost : 0,
      budgetRemaining: budget - totalCost,
      categoryBreakdown,
    });
  }, [batch, run.data, snapshot.data, recipes.data, removedIds, budget]);

  const handleSendToShoppingList = useCallback(() => {
    if (!batch) return;
    for (const item of batch.items) {
      addItem(item.id, 1);
    }
    navigate('/shopping-list');
  }, [batch, addItem, navigate]);

  const handleSaveAndTrack = useCallback(() => {
    if (!batch) return;
    saveBatch(budget, batch.items.map(batchItemToSaved));
    navigate('/batch-history');
  }, [batch, budget, saveBatch, navigate]);

  const notReady = !snapshot.data || !recipes.data;

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-4 p-3 bg-bg-card rounded-lg border border-border-base">
        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">Budget</span>
          <select
            className="bg-bg-base border border-border-base rounded px-2 py-1 text-sm font-mono"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          >
            {BUDGET_PRESETS.map((v) => (
              <option key={v} value={v}>{fmtGil(v)}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">Batch size</span>
          <input
            type="number"
            className="bg-bg-base border border-border-base rounded px-2 py-1 text-sm font-mono w-16 text-center"
            value={batchSize}
            min={3}
            max={15}
            onChange={(e) => setBatchSize(Math.max(3, Math.min(15, Number(e.target.value))))}
          />
        </label>

        <button
          className="ml-auto bg-aether text-bg-base px-4 py-1.5 rounded font-mono text-xs uppercase tracking-wider disabled:opacity-50"
          onClick={handleGenerate}
          disabled={notReady || run.isPending}
        >
          {run.isPending ? 'Scanning…' : 'Generate Batch'}
        </button>
      </div>

      {/* Loading state */}
      {run.isPending && (
        <Spinner label={`Fetching market data for ${candidateIds.length} craftable items…`} />
      )}

      {/* Error state */}
      {run.isError && (
        <div className="text-crimson text-sm font-mono">
          Error: {run.error instanceof Error ? run.error.message : 'Unknown error'}
        </div>
      )}

      {/* Results */}
      {batch && (
        <>
          {/* Summary Cards */}
          <SummaryCards batch={batch} budget={budget} />

          <p className="text-text-dim font-mono text-[11px] text-right">
            Estimates for ranking — see Shopping List for final costs
          </p>

          {/* Batch Table */}
          <div className="border border-border-base rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-3 py-2 hidden md:table-cell">
                    <InfoTooltip label="Sum of ingredient prices on the home world.">Mat Cost</InfoTooltip>
                  </th>
                  <th className="text-right px-3 py-2">
                    <InfoTooltip label="Trusted sale price (min listing capped at median).">Sale</InfoTooltip>
                  </th>
                  <th className="text-right px-3 py-2">
                    <InfoTooltip label="Sale price minus material cost.">Profit</InfoTooltip>
                  </th>
                  <th className="text-right px-3 py-2 hidden md:table-cell">
                    <InfoTooltip label="Sales per day on the home world.">Vel/day</InfoTooltip>
                  </th>
                  <th className="text-right px-3 py-2">
                    <InfoTooltip label="Profit × velocity. Diversity-penalized score in parentheses.">Gil/day</InfoTooltip>
                  </th>
                  <th className="text-center px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {batch.items.map((item, i) => (
                  <tr key={item.id} className="border-t border-border-base hover:bg-bg-card-hi">
                    <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                    <td className={`px-3 ${rowY}`}>
                      <ItemNameLinks
                        id={item.id}
                        name={item.name}
                        suffix={item.hq && <HqStar leading />}
                        sub={categoryLabel(item.sc)}
                      />
                    </td>
                    <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>
                      {fmtGil(item.materialCost)}
                    </td>
                    <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(item.salePrice)}</td>
                    <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(item.profit)}</td>
                    <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>
                      {item.velocity.toFixed(1)}
                    </td>
                    <td className={`px-3 ${rowY} text-right font-mono text-gold-hi`}>
                      {fmtGil(Math.round(item.gilPerDay))}
                    </td>
                    <td className={`px-3 ${rowY} text-center`}>
                      <button
                        className="text-crimson hover:text-crimson/80 text-lg leading-none"
                        onClick={() => handleRemove(item.id)}
                        title="Remove and suggest replacement"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {batch.items.length === 0 && (
            <EmptyState icon="◇" message="No profitable items found within budget. Try increasing your budget." />
          )}

          {/* Action Bar */}
          {batch.items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                className="bg-jade/20 text-jade border border-jade/30 px-4 py-1.5 rounded font-mono text-xs uppercase tracking-wider hover:bg-jade/30"
                onClick={handleSendToShoppingList}
              >
                Send to Shopping List
              </button>
              <ExportCsvButton
                rows={batch.items}
                columns={CSV_COLUMNS}
                filename={`craft-batch-${new Date().toISOString().slice(0, 10)}.csv`}
              />
              <ExportTeamcraftButton items={batch.items} />
              <button
                className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-gold hover:text-gold transition-colors"
                onClick={handleSaveAndTrack}
              >
                Save &amp; Track
              </button>
              <span className="ml-auto font-mono text-xs text-text-dim">
                Budget remaining: <span className="text-aether">{fmtGil(batch.budgetRemaining)}</span>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Summary Cards ---------- */

function SummaryCards({ batch, budget }: { batch: BatchResult; budget: number }) {
  const categories = Object.entries(batch.categoryBreakdown);
  const colors = ['bg-aether', 'bg-jade', 'bg-gold', 'bg-crimson', 'bg-purple-400', 'bg-sky-400', 'bg-amber-400'];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        label="Material Cost"
        value={fmtGil(batch.totalCost)}
        valueClass="text-crimson"
        sub={`${Math.round((batch.totalCost / budget) * 100)}% of budget`}
      />
      <Card
        label="Expected Revenue"
        value={fmtGil(Math.round(batch.expectedRevenue))}
        valueClass="text-jade"
        sub="if all sell within 1 day"
      />
      <Card
        label="Expected Profit"
        value={fmtGil(Math.round(batch.expectedProfit))}
        valueClass="text-jade"
        sub={`${Math.round(batch.roi * 100)}% ROI`}
      />
      <div className="bg-bg-card rounded-lg border border-border-base p-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-dim">Category Spread</div>
        <div className="flex gap-0.5 mt-2 rounded overflow-hidden">
          {categories.map(([sc, count], i) => (
            <div
              key={sc}
              className={`${colors[i % colors.length]} h-4 text-[9px] flex items-center justify-center text-bg-base font-mono`}
              style={{ flex: count }}
              title={`${categoryLabel(Number(sc))}: ${count}`}
            >
              {count > 0 ? categoryLabel(Number(sc)).slice(0, 6) : ''}
            </div>
          ))}
        </div>
        <div className="text-text-low text-[11px] mt-1 font-mono">
          {categories.length} categories across {batch.items.length} items
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, valueClass, sub }: {
  label: string; value: string; valueClass: string; sub: string;
}) {
  return (
    <div className="bg-bg-card rounded-lg border border-border-base p-3">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-dim">{label}</div>
      <div className={`text-xl font-semibold font-mono mt-1 ${valueClass}`}>{value}</div>
      <div className="text-text-low text-[11px] font-mono">{sub}</div>
    </div>
  );
}
