import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useSettingsStore } from '../features/settings/store';
import { fetchInBatches } from '../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../lib/universalis';
import { runGcSeals } from '../features/gcSeals/runGcSeals';
import { EQUIPPABLE_SC } from '../lib/gcSealsYield';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';
import { SectionHeader } from '../components/SectionHeader';
import { ItemNameLinks } from '../components/ItemNameLinks';
import { EmptyState } from '../components/EmptyState';
import { fmtGil } from '../lib/format';

interface RunResult {
  rows: ReturnType<typeof runGcSeals>;
  skipped: number;
}

export default function GcSeals() {
  const snapshot = useItemSnapshot();
  const { world, dc } = useSettingsStore();
  const [maxPrice, setMaxPrice] = useState(2000);
  const [scope, setScope] = useState<'home' | 'dc'>('home');

  // Collect candidate IDs (equippable items with ilvl >= 45)
  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    return snapshot.data.items
      .filter((item) => EQUIPPABLE_SC.has(item.sc) && item.ilvl >= 45)
      .map((item) => item.id);
  }, [snapshot.data]);

  const mutation = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      if (candidateIds.length === 0) throw new Error('No equippable items found');

      // Fetch market data for candidates. Use the appropriate scope.
      const fetchScope = scope === 'home' ? world : dc;
      const result = await fetchInBatches<MarketData[string]>(
        candidateIds,
        async (chunk) => fetchMarketData(fetchScope, chunk),
        { chunkSize: 100, concurrency: 4 },
      );

      // Compute rows using the runner
      const rows = runGcSeals(snapshot.data.items, result.data, world, {
        maxPrice,
        scope,
      });

      return { rows, skipped: result.errors.length };
    },
  });

  const ready = snapshot.data != null && candidateIds.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-gold tracking-wide">GC Seals</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Equippable gear ranked by seals per gil, best deals first.
          </p>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={!ready || mutation.isPending}
          className="font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold text-gold disabled:border-border-base disabled:text-text-low"
        >
          {ready ? (mutation.isPending ? 'Running…' : 'Run query') : 'Loading data…'}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="flex flex-col gap-2">
          <label className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            Max Price
          </label>
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Math.max(0, parseInt(e.target.value) || 0))}
            className="font-mono text-xs px-2 py-1 bg-bg-card-lo border border-border-base text-text-cream w-32"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            Scope
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setScope('home')}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-1 border transition-colors ${
                scope === 'home'
                  ? 'border-gold text-gold'
                  : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => setScope('dc')}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-1 border transition-colors ${
                scope === 'dc'
                  ? 'border-gold text-gold'
                  : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              DC
            </button>
          </div>
        </div>
      </div>

      {mutation.isPending && <Spinner label="Fetching gear market data…" />}
      {mutation.isError && (
        <StatusBanner kind="error">Query failed: {(mutation.error as Error).message}</StatusBanner>
      )}
      {mutation.data && mutation.data.skipped > 0 && (
        <StatusBanner kind="error">
          {mutation.data.skipped} batch(es) skipped (Universalis error)
        </StatusBanner>
      )}

      {!mutation.data && !mutation.isPending && (
        <EmptyState icon="❖" message="Find equippable gear to buy cheaply and trade in for Grand Company seals." />
      )}

      {mutation.data && mutation.data.rows.length > 0 && (
        <div className="space-y-3">
          <SectionHeader label={`Results (${mutation.data.rows.length} items)`} />
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border-base">
                <th className="text-left px-2 py-1 text-text-low font-normal">#</th>
                <th className="text-left px-2 py-1 text-text-low font-normal">Item</th>
                <th className="text-right px-2 py-1 text-text-low font-normal">Lvl</th>
                <th className="text-left px-2 py-1 text-text-low font-normal">World</th>
                <th className="text-right px-2 py-1 text-text-low font-normal">Price</th>
                <th className="text-right px-2 py-1 text-text-low font-normal">Seals</th>
                <th className="text-right px-2 py-1 text-text-low font-normal">Seals/Gil</th>
              </tr>
            </thead>
            <tbody>
              {mutation.data.rows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border-base hover:bg-bg-card-hi/50 transition-colors">
                  <td className="px-2 py-1.5 text-text-low">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <ItemNameLinks id={row.id} name={row.name} />
                  </td>
                  <td className="text-right px-2 py-1.5 tabular-nums">i{row.ilvl}</td>
                  <td className="px-2 py-1.5 text-text-low">{row.world}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums text-gold">{fmtGil(row.price)}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums">{row.seals.toLocaleString()}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums text-aether">
                    {row.sealsPerGil.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mutation.data && mutation.data.rows.length === 0 && (
        <StatusBanner kind="info">No results match the current filters.</StatusBanner>
      )}
    </div>
  );
}
