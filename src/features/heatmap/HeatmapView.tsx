import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketItem } from '../../lib/universalis';
import { buildHeatmapCells, CURATED_VIEWS, type HeatmapCell, type CellKind } from './buildHeatmapData';
import { HeatmapChart, KIND_BASE, KIND_LABEL } from './HeatmapChart';
import { isItemHidden } from '../queries/commonFilters';
import { useIgnoredItemSet } from '../settings/useIgnoredItems';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { fmtGil } from '../../lib/format';

// How many tiles the chart renders. A readability cap on the treemap only —
// presets filter the full population first, so low-velocity kinds (crafts) are
// never starved by this limit.
const CHART_CELL_LIMIT = 200;

interface RunResult {
  cells: HeatmapCell[];
  skipped: number;
  scannedAt: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatAgo(ts: number, now: number): string {
  const diffMin = Math.max(0, Math.floor((now - ts) / 60_000));
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1m ago';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hr = Math.floor(diffMin / 60);
  return hr === 1 ? '1h ago' : `${hr}h ago`;
}

function freshnessTone(ageMin: number): { dot: string; text: string; label: string } {
  if (ageMin < 15) return { dot: 'bg-jade', text: 'text-jade', label: 'Fresh' };
  if (ageMin < 60) return { dot: 'bg-gold', text: 'text-gold', label: 'OK' };
  return { dot: 'bg-crimson', text: 'text-crimson', label: 'Stale' };
}

export function HeatmapView() {
  const { world, hideCrystals } = useSettingsStore();
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const ignored = useIgnoredItemSet();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const vendorSnap = useVendorShopSnapshot();
  const shopSnap = useSpecialShopSnapshot();
  const gatherSnap = useGatheringCatalog();

  const [viewId, setViewId] = useState<string>('hot-crafts');

  const sourceSets = useMemo(() => {
    const gatherableIds = gatherSnap.data ? new Set(gatherSnap.data.keys()) : undefined;
    const vendorIds = vendorSnap.data ? new Set(vendorSnap.data.snapshot.keys()) : undefined;
    const currencyIds = shopSnap.data ? (() => {
      const ids = new Set<number>();
      for (const entries of shopSnap.data.snapshot.byCurrency.values()) {
        for (const e of entries) ids.add(e.itemId);
      }
      return ids;
    })() : undefined;
    return { gatherableIds, vendorIds, currencyIds };
  }, [gatherSnap.data, vendorSnap.data, shopSnap.data]);

  const candidateItems = useMemo(() => {
    if (!snapshot.data) return [];
    return snapshot.data.items.filter((item) => {
      if (item.sc === 0) return false;
      if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) return false;
      return true;
    });
  }, [snapshot.data, hideCrystals, hideIgnored, ignored]);

  const candidateIds = useMemo(() => candidateItems.map((i) => i.id), [candidateItems]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !recipes.data) throw new Error('Snapshots not ready');
      const sale = await fetchInBatches<MarketItem>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      const ingredientIds = new Set<number>();
      for (const item of candidateItems) {
        const recipe = recipes.data.get(item.id);
        if (recipe) {
          for (const ing of recipe.ingredients) {
            if (!(String(ing.itemId) in sale.data)) ingredientIds.add(ing.itemId);
          }
        }
      }
      let skipped = sale.errors.length;
      if (ingredientIds.size > 0) {
        const ingResult = await fetchInBatches<MarketItem>(
          [...ingredientIds],
          (chunk) => fetchMarketData(world, chunk),
          { chunkSize: 100, concurrency: 4 },
        );
        Object.assign(sale.data, ingResult.data);
        skipped += ingResult.errors.length;
      }

      const cells = buildHeatmapCells(candidateItems, sale.data, recipes.data, sourceSets);
      cells.sort((a, b) => b.velocity - a.velocity);
      return { cells, skipped, scannedAt: Date.now() };
    },
  });

  const notReady = !snapshot.data || !recipes.data;

  // Auto-fire on first ready — matches the design's "decision tool, not data art"
  // brief. Empty heatmap on landing was the loudest finding.
  const [autoRanOnce, setAutoRanOnce] = useState(false);
  useEffect(() => {
    if (!notReady && !autoRanOnce && !run.isPending && !run.data && !run.isError) {
      setAutoRanOnce(true);
      run.mutate();
    }
  }, [notReady, autoRanOnce, run.isPending, run.data, run.isError, run]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const currentView = CURATED_VIEWS.find((v) => v.id === viewId) ?? CURATED_VIEWS[CURATED_VIEWS.length - 1];

  const filteredCells = useMemo(() => {
    if (!run.data) return [];
    return currentView.apply(run.data.cells);
  }, [run.data, currentView]);

  // The treemap caps at CHART_CELL_LIMIT tiles for readability; stats and the
  // leaderboard still reflect the full filtered population. filteredCells is
  // velocity-sorted (cells are pre-sorted, .filter preserves order), so this is
  // the busiest N in the current view.
  const chartCells = useMemo(() => filteredCells.slice(0, CHART_CELL_LIMIT), [filteredCells]);

  const viewCount = useMemo(() => {
    if (!run.data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const v of CURATED_VIEWS) m.set(v.id, v.apply(run.data.cells).length);
    return m;
  }, [run.data]);

  // Stat strip metrics — computed from the currently filtered cells.
  const stats = useMemo(() => {
    const total = run.data?.cells.length ?? 0;
    if (filteredCells.length === 0) {
      return { total, viewSize: 0, medianMargin: null as number | null, medianVelocity: 0, hottest: null as HeatmapCell | null, stale: 0 };
    }
    const margins = filteredCells.map((c) => c.margin).filter((m): m is number => m != null);
    const medianMargin = margins.length > 0 ? median(margins) : null;
    const medianVelocity = median(filteredCells.map((c) => c.velocity));
    const hottest = filteredCells.reduce((a, b) =>
      (a.salePrice * a.velocity) >= (b.salePrice * b.velocity) ? a : b,
    );
    const stale = filteredCells.filter((c) => c.velocity < 0.5).length;
    return { total, viewSize: filteredCells.length, medianMargin, medianVelocity, hottest, stale };
  }, [filteredCells, run.data]);

  const leaderboard = useMemo(() => {
    const copy = [...filteredCells];
    copy.sort((a, b) => (b.salePrice * b.velocity) - (a.salePrice * a.velocity));
    return copy.slice(0, 8);
  }, [filteredCells]);

  const staleItems = useMemo(() => filteredCells.filter((c) => c.velocity < 0.5), [filteredCells]);

  const ageMin = run.data ? Math.max(0, Math.floor((now - run.data.scannedAt) / 60_000)) : 0;
  const fresh = freshnessTone(ageMin);

  return (
    <div className="space-y-4">
      {/* Header row with title, freshness, refresh */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl text-gold tracking-wide">Market Heatmap</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Color = play type. Brightness = margin tier. Size = sales velocity. Click a tile to see why.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {run.data && (
            <div className={`flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase ${fresh.text}`}>
              <span aria-hidden className={`inline-block w-1.5 h-1.5 rounded-full ${fresh.dot}`} />
              <span>{fresh.label} · {formatAgo(run.data.scannedAt, now)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => run.mutate()}
            disabled={run.isPending || notReady}
            title={notReady ? 'Loading catalogs…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {run.isPending ? 'Scanning…' : (run.data ? '↻ Refresh' : 'Run scan →')}
          </button>
        </div>
      </div>

      {/* Curated view presets */}
      <div className="flex gap-2 flex-wrap border-b border-border-base pb-3">
        {CURATED_VIEWS.map((v) => {
          const count = viewCount.get(v.id);
          const active = v.id === viewId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewId(v.id)}
              className={`flex-1 min-w-[160px] px-3 py-2 border-l-[3px] text-left transition-colors ${
                active
                  ? 'border-l-gold bg-bg-card border border-gold/40 border-l-gold'
                  : 'border-l-transparent border border-border-base hover:border-aether/40 hover:bg-bg-card-hi/30'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-display text-sm tracking-wide ${active ? 'text-gold' : 'text-text-cream'}`}>
                  {v.label}
                </span>
                {count != null && run.data && (
                  <span className="font-mono text-[10px] text-text-low tabular-nums">{count}</span>
                )}
              </div>
              <div className="font-mono text-[9px] tracking-widest uppercase text-text-low mt-0.5">
                {v.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stat strip */}
      {run.data && (
        <div className="grid grid-cols-2 md:grid-cols-5 border border-border-base">
          {[
            { k: 'In view', v: `${stats.viewSize}`, sub: `of ${stats.total} scanned`, tone: 'text-text-cream' },
            {
              k: 'Median margin',
              v: stats.medianMargin != null ? `${(stats.medianMargin * 100).toFixed(0)}%` : '—',
              sub: 'craftables only',
              tone: 'text-gold',
            },
            {
              k: 'Median velocity',
              v: `${stats.medianVelocity.toFixed(1)}/day`,
              sub: 'this view',
              tone: 'text-text-cream',
            },
            {
              k: 'Hottest play',
              v: stats.hottest ? stats.hottest.name : '—',
              sub: stats.hottest ? `${fmtGil(Math.round(stats.hottest.salePrice * stats.hottest.velocity))} gil/day` : '',
              tone: 'text-jade',
              small: true,
            },
            {
              k: 'Stale items',
              v: `${stats.stale}`,
              sub: 'vel < 0.5/day',
              tone: stats.stale > 0 ? 'text-crimson' : 'text-text-low',
            },
          ].map((s, i) => (
            <div key={s.k} className={`p-3 ${i < 4 ? 'border-r border-border-base' : ''} bg-bg-card`}>
              <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{s.k}</div>
              <div className={`font-display ${s.small ? 'text-sm leading-tight mt-1' : 'text-xl tabular-nums leading-none mt-1.5'} ${s.tone}`}>
                {s.v}
              </div>
              {s.sub && <div className="font-mono text-[9px] text-text-low mt-1.5">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {notReady && !run.data && (
        <div className="font-mono text-[10px] text-text-low">Loading catalogs…</div>
      )}
      {run.isPending && <Spinner label={`Fetching ${world} prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {/* Main grid: heatmap + leaderboard sidebar */}
      {run.data && filteredCells.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <HeatmapChart cells={chartCells} />
          <aside className="space-y-3">
            <div className="border border-border-base bg-bg-card p-3">
              <h3 className="font-mono text-[10px] tracking-widest uppercase text-gold mb-2">
                ✦ Top moves · this view
              </h3>
              <ol className="space-y-1">
                {leaderboard.map((c, i) => (
                  <LeaderboardRow key={c.id} cell={c} rank={i + 1} />
                ))}
              </ol>
              {filteredCells.length > leaderboard.length && (
                <div className="font-mono text-[10px] tracking-widest uppercase text-aether text-center mt-2">
                  {filteredCells.length - leaderboard.length} more in view
                </div>
              )}
            </div>

            {stats.stale > 0 && (
              <div className="border border-crimson/40 border-l-[3px] border-l-crimson bg-bg-card p-3">
                <div className="font-mono text-[9px] tracking-widest uppercase text-crimson mb-1">
                  ⚠ Stale items
                </div>
                <p className="text-[12px] text-text-dim leading-snug">
                  {stats.stale} item{stats.stale === 1 ? '' : 's'} in this view sells below 0.5/day. Listed but not moving — listed prices may be fiction.
                </p>
                <details className="mt-2">
                  <summary className="font-mono text-[10px] tracking-widest uppercase text-aether cursor-pointer hover:underline">
                    Review {stats.stale}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {staleItems.slice(0, 12).map((c) => (
                      <li key={c.id} className="text-[12px]">
                        <Link to={`/item/${c.id}`} target="_blank" className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                          {c.name}
                        </Link>{' '}
                        <span className="font-mono text-[10px] text-text-low tabular-nums">
                          · {c.velocity.toFixed(2)}/day · {fmtGil(c.salePrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </aside>
        </div>
      )}

      {run.data && filteredCells.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-center text-text-low text-sm italic">
          No items match this view. Try a different curated preset.
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ cell, rank }: { cell: HeatmapCell; rank: number }) {
  const rev = Math.round(cell.salePrice * cell.velocity);
  const marginLabel = cell.margin != null ? `${cell.margin >= 0 ? '+' : ''}${(cell.margin * 100).toFixed(0)}%` : '—';
  const marginColor = cell.margin != null ? (cell.margin >= 0.25 ? 'text-jade' : cell.margin >= 0 ? 'text-text-cream' : 'text-crimson') : 'text-text-low';
  const rankStr = String(rank).padStart(2, '0');
  return (
    <li className="grid grid-cols-[20px_1fr_60px_50px] gap-2 items-center py-1 border-b border-border-base/40 last:border-b-0">
      <span className="font-mono text-[10px] text-text-low tabular-nums">{rankStr}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden className="w-[3px] h-3 flex-shrink-0" style={{ background: KIND_BASE[cell.kind as CellKind] }} title={KIND_LABEL[cell.kind as CellKind]} />
        <Link
          to={`/item/${cell.id}`}
          target="_blank"
          className="font-display text-[12px] text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 truncate"
        >
          {cell.name}
        </Link>
      </div>
      <span className="font-mono text-[11px] text-gold tabular-nums text-right">{fmtGil(rev)}</span>
      <span className={`font-mono text-[11px] tabular-nums text-right ${marginColor}`}>{marginLabel}</span>
    </li>
  );
}
