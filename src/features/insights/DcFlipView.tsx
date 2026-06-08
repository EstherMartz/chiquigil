import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useSelectedItems } from '../items/useSelectedItems';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runDcFlip } from './dcFlip';
import { groupByWorld } from './dcFlipGroups';
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { CopyButton } from '../../components/CopyButton';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import { Spinner } from '../../components/Spinner';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import { useInitialScan } from '../queries/useInitialScan';
import { useSpreadHistory } from '../queries/useSpreadHistory';
import { deriveWindow, spreadKey, type WindowTone } from '../../lib/spreadHistory';

type SortKey = 'name' | 'buyWorld' | 'dcPrice' | 'phantomPrice' | 'spread' | 'velocity';
type SortDir = 'asc' | 'desc';

const MAX_CANDIDATES = 500;

const TONE_TEXT: Record<WindowTone, string> = {
  green: 'text-jade',
  amber: 'text-gold',
  grey: 'text-text-low',
};
const TONE_DOT: Record<WindowTone, string> = {
  green: 'bg-jade',
  amber: 'bg-gold',
  grey: 'bg-text-low',
};

function WorldGroupCard({
  group, collapsed, onToggle, children,
}: {
  group: import('./dcFlipGroups').DcFlipGroup;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const overBudget = group.fitCount < group.itemCount;
  return (
    <div className="border border-border-base bg-bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-card-hi transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="text-text-dim">{collapsed ? '▸' : '▾'}</span>
          <span className="font-display text-[15px] text-text-cream uppercase tracking-wide truncate">{group.world}</span>
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low shrink-0">
            {group.itemCount} item{group.itemCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="font-mono text-[11px] text-text-low tabular-nums shrink-0 hidden sm:block">
          Capital <span className="text-text-cream">{fmtGil(group.totalCapital)}</span>
          {' · '}Spread <span className="text-jade">+{fmtGil(group.totalNetSpread)}</span>
          {' · '}<span className="text-aether">{Math.round(group.gilPerMillion)}</span> gil/M
        </div>
      </button>
      {overBudget && !collapsed && (
        <div className="px-4 py-1.5 border-t border-border-base font-mono text-[10px] tracking-widest uppercase text-gold/80">
          {group.fitCount} of {group.itemCount} items fit your budget — showing top {group.fitCount} by spread
        </div>
      )}
      {!collapsed && (
        <div className="border-t border-border-base overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

interface RunResult {
  dcMarket: MarketData;
  homeMarket: MarketData;
  skipped: number;
  ranWith: { minSpread: number; minVelocity: number; maxCapital: number };
}

export function DcFlipView() {
  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const watchlistItems = useSelectedItems();
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);

  const [searchParams, setSearchParams] = useSearchParams();
  const numParam = (key: string, dflt: number) => {
    const v = Number(searchParams.get(key));
    return Number.isFinite(v) && v > 0 ? v : dflt;
  };
  const worldFilter = searchParams.get('world'); // destination deep-link from dashboard

  const [minSpread, setMinSpread] = useState(() => numParam('minSpread', 10_000));
  const [minVelocity, setMinVelocity] = useState(() => numParam('minVelocity', 1));
  const [maxCapital, setMaxCapital] = useState(() => {
    const v = Number(searchParams.get('maxCapital'));
    return Number.isFinite(v) && v > 0 ? v : 0; // 0 = no cap
  });
  const [sortKey, setSortKey] = useState<SortKey>('spread');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  // Build candidate IDs: watchlist first, then top-ilvl catalog items
  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const ids = new Set<number>();
    // Watchlist items first
    for (const item of watchlistItems) ids.add(item.id);
    // Fill with catalog items (tradeable, sorted by ilvl desc)
    const catalog = [...snapshot.data.items]
      .filter((i) => i.sc > 0)
      .sort((a, b) => b.ilvl - a.ilvl);
    for (const item of catalog) {
      if (ids.size >= MAX_CANDIDATES) break;
      ids.add(item.id);
    }
    return [...ids];
  }, [snapshot.data, watchlistItems]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      setProgress({ current: 0, total: candidateIds.length });

      // Fetch DC and home market in parallel
      const [dcResult, homeResult] = await Promise.all([
        fetchInBatches<MarketData[string]>(
          candidateIds,
          (chunk) => fetchMarketData(dc, chunk),
          {
            chunkSize: 100, concurrency: 4,
            onProgress: (done) => setProgress({ current: Math.min(done * 100, candidateIds.length), total: candidateIds.length }),
          },
        ),
        fetchInBatches<MarketData[string]>(
          candidateIds,
          (chunk) => fetchMarketData(world, chunk),
          { chunkSize: 100, concurrency: 4 },
        ),
      ]);

      setProgress(null);
      return {
        dcMarket: dcResult.data,
        homeMarket: homeResult.data,
        skipped: dcResult.errors.length + homeResult.errors.length,
        ranWith: { minSpread, minVelocity, maxCapital },
      };
    },
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !run.data) return [];
    return runDcFlip(
      snapshot.data.items,
      run.data.dcMarket,
      run.data.homeMarket,
      { homeWorld: world, minSpread, minVelocity },
    );
  }, [snapshot.data, run.data, world, minSpread, minVelocity]);

  const sortedRows = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * mul;
      if (sortKey === 'buyWorld') return a.buyWorld.localeCompare(b.buyWorld) * mul;
      return (a[sortKey] - b[sortKey]) * mul;
    });
  }, [rows, sortKey, sortDir]);

  const groups = useMemo(() => {
    const base = worldFilter ? sortedRows.filter((r) => r.buyWorld === worldFilter) : sortedRows;
    return groupByWorld(base, { maxCapital });
  }, [sortedRows, worldFilter, maxCapital]);

  // Flat fallback ONLY when exactly one world AND that world has exactly one item.
  const isFlat = groups.length === 1 && groups[0].itemCount === 1;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleGroup(world: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(world)) next.delete(world);
      else next.add(world);
      return next;
    });
  }
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.world));
  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.world)));
  }

  // For flat fallback only: paginate the single group's rows
  const flatRows = isFlat && groups.length > 0 ? groups[0].rows : [];
  const lm = useLoadMore(flatRows, 25);

  const spreadHistory = useSpreadHistory();
  const nowMs = run.data ? Date.now() : 0; // stamped per scan render

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'buyWorld' ? 'asc' : 'desc');
    }
  }

  const notReady = !snapshot.data;

  useInitialScan(!notReady, () => { run.reset(); run.mutate(); });

  function renderGroupTable(group: import('./dcFlipGroups').DcFlipGroup): React.ReactNode {
    const histMap = spreadHistory.data ?? {};
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
            <th className="px-3 py-2 text-right w-8">#</th>
            <th className="px-3 py-2 text-left">Item</th>
            <th className="px-3 py-2 text-left">Buy on</th>
            <th className="px-3 py-2 text-right">DC</th>
            <th className="px-3 py-2 text-right">{world}</th>
            <th className="px-3 py-2 text-right">Spread</th>
            <th className="px-3 py-2 text-right hidden md:table-cell">Vel</th>
            <th className="px-3 py-2 text-left">Window</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r, i) => {
            const w = deriveWindow(histMap[spreadKey(r.id, r.buyWorld)], nowMs);
            const dim = r.withinBudget ? '' : 'opacity-40';
            return (
              <tr key={r.id} className={`border-t border-border-base hover:bg-bg-card-hi transition-colors ${dim}`}>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <div className="flex items-center gap-2">
                    <ItemNameLinks id={r.id} name={r.name} />
                    <CopyButton text={r.name} />
                  </div>
                </td>
                <td className={`px-3 ${rowY} text-aether`}>{r.buyWorld}</td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.dcPrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.phantomPrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(r.netSpread)}</td>
                <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}/d</td>
                <td className={`px-3 ${rowY}`} title={w.tooltip}>
                  {density === 'compact' ? (
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${TONE_DOT[w.tone]}`} aria-label={w.tooltip} />
                  ) : (
                    <span className={`font-mono text-[11px] ${TONE_TEXT[w.tone]}`}>{w.ageText.replace(' ago', '')} · {w.label}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const stale = run.data != null &&
    (run.data.ranWith.minSpread !== minSpread || run.data.ranWith.minVelocity !== minVelocity || run.data.ranWith.maxCapital !== maxCapital);

  function syncParam(key: string, value: number) {
    setSearchParams((p) => {
      if (value > 0) p.set(key, String(value));
      else p.delete(key);
      return p;
    }, { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low">Min spread (gil)</span>
            <input
              type="number" inputMode="decimal" min={0} step={1000}
              value={minSpread}
              onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setMinSpread(v); syncParam('minSpread', v); }}
              className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low">Min velocity / day</span>
            <input
              type="number" inputMode="decimal" min={0} step={0.5}
              value={minVelocity}
              onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setMinVelocity(v); syncParam('minVelocity', v); }}
              className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low">Max trip capital (gil)</span>
            <input
              type="number" inputMode="decimal" min={0} step={10000}
              value={maxCapital || ''}
              placeholder="no cap"
              onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setMaxCapital(v); syncParam('maxCapital', v); }}
              className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
            />
          </label>
        </div>
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          {stale && !run.isPending && (
            <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80">
              Filters changed — Run scan to refresh
            </span>
          )}
          <button
            type="button"
            onClick={() => { run.reset(); run.mutate(); }}
            disabled={run.isPending || notReady}
            title={notReady ? 'Loading item catalog…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity w-full sm:w-auto"
          >
            {run.isPending ? <>Scanning…<span aria-hidden className="ml-1 inline-block animate-spin">❖</span></> : 'Run scan'}
          </button>
        </div>
      </div>

      <p className="font-mono text-[10px] text-text-low">
        Finds items cheaper on other {dc} worlds than on {world}. Travel to buy, relist at home.
      </p>

      {run.isPending && (
        progress
          ? <ProgressBar current={progress.current} total={progress.total} label={`Scanning ${dc} market…`} />
          : <Spinner label={`Scanning ${dc} market…`} />
      )}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {!run.data && !run.isPending && (
        <EmptyState
          icon="⇄"
          message={notReady
            ? 'Loading item catalog…'
            : `Scan ${dc} for items you can buy cheap and flip on ${world}.`}
        />
      )}

      {run.data && sortedRows.length === 0 && (
        <EmptyState icon="⇄" message={`No items found with a spread above ${fmtGil(minSpread)}. Try lowering the threshold or running again after the market updates.`} />
      )}

      {run.data && groups.length > 0 && !isFlat && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            {groups.length} destination world{groups.length === 1 ? '' : 's'}
            {worldFilter ? ` · filtered to ${worldFilter}` : ''}
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether transition-colors"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      )}

      {run.data && groups.length > 0 && isFlat && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono text-[10px] tracking-widest uppercase">
                {([
                  { key: 'name' as SortKey, label: 'Item', align: 'left' },
                  { key: 'buyWorld' as SortKey, label: 'Buy on', align: 'left' },
                  { key: 'dcPrice' as SortKey, label: 'DC Price', align: 'right' },
                  { key: 'phantomPrice' as SortKey, label: `${world} Price`, align: 'right' },
                  { key: 'spread' as SortKey, label: 'Spread', align: 'right' },
                  { key: 'velocity' as SortKey, label: 'Velocity', align: 'right', hideOnMobile: true },
                ] as const).map((c) => {
                  const sorted = sortKey === c.key;
                  const arrow = sorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`px-3 py-2 cursor-pointer select-none ${
                        c.align === 'right' ? 'text-right' : 'text-left'
                      } ${sorted ? 'text-gold' : 'text-text-dim hover:text-aether'} ${
                        'hideOnMobile' in c && c.hideOnMobile ? 'hidden md:table-cell' : ''
                      }`}
                    >
                      {c.label}{arrow}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lm.visible.map((r) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                  <td className={`px-3 ${rowY}`}>
                    <div className="flex items-center gap-2">
                      <ItemNameLinks id={r.id} name={r.name} />
                      <CopyButton text={r.name} />
                    </div>
                  </td>
                  <td className={`px-3 ${rowY} text-aether`}>{r.buyWorld}</td>
                  <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.dcPrice)}</td>
                  <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.phantomPrice)}</td>
                  <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(r.netSpread)}</td>
                  <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}/day</td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMoreFooter
            hasMore={lm.hasMore}
            total={lm.total}
            shown={lm.shown}
            onLoadMore={lm.loadMore}
          />
        </div>
      )}

      {run.data && groups.length > 0 && !isFlat && (
        <div className="space-y-3">
          {groups.map((g) => (
            <WorldGroupCard
              key={g.world}
              group={g}
              collapsed={collapsed.has(g.world)}
              onToggle={() => toggleGroup(g.world)}
            >
              {renderGroupTable(g)}
            </WorldGroupCard>
          ))}
        </div>
      )}

      {run.data && groups.length > 0 && (
        <p className="font-mono text-[10px] text-text-low">
          Prices refresh every ~5 minutes. Verify listings on the destination MB before buying.
        </p>
      )}
    </div>
  );
}
