import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useMarketData } from '../watchlist/useMarketData';
import { useWatchlistHistory } from '../watchlist/useWatchlistHistory';
import { useRecipes } from '../profit/useRecipes';
import { useSelectedItems } from '../items/useSelectedItems';
import { buildRows } from '../watchlist/buildRows';
import type { WorldListing } from '../../lib/universalis';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { FreshnessChip } from '../../components/FreshnessChip';
import {
  portfolioTotals, marginBuckets, gilPerDayLeaders, concentration,
  moversDigest, spreadByWorld,
} from './aggregate';
import { KpiStrip } from './tiles/KpiStrip';
import { MarginHistogram } from './tiles/MarginHistogram';
import { GilLeaderboard } from './tiles/GilLeaderboard';
import { ChangedDigest } from './tiles/ChangedDigest';
import { SpreadBars } from './tiles/SpreadBars';

export function DashboardView() {
  const { world, dc, retainerLevels, applyMarketTax } = useSettingsStore();
  const items = useSelectedItems();

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);
  const history = useWatchlistHistory(ids, dc);
  const recipes = useRecipes(ids);

  const rows = useMemo(() => {
    if (!market.data || !recipes.data) return [];
    return buildRows(
      items, market.data.phantom, market.data.dc,
      retainerLevels, recipes.data, {}, Date.now(), applyMarketTax,
    );
  }, [items, market.data, recipes.data, retainerLevels, applyMarketTax]);

  const rowsWithDelta = useMemo(
    () => rows.map((r) => ({ ...r, delta: history.data?.get(r.id) ?? null })),
    [rows, history.data],
  );

  // DC-scope per-item listings (carry world names for cross-world spread).
  const listingsById = useMemo(() => {
    const m = new Map<number, WorldListing[]>();
    if (market.data) {
      for (const id of ids) {
        const entry = market.data.dc[String(id)];
        if (entry) m.set(id, entry.worldListings);
      }
    }
    return m;
  }, [market.data, ids]);

  const agg = useMemo(() => ({
    totals: portfolioTotals(rowsWithDelta),
    buckets: marginBuckets(rowsWithDelta),
    leaders: gilPerDayLeaders(rowsWithDelta, 8),
    conc: concentration(rowsWithDelta, 3),
    movers: moversDigest(rowsWithDelta),
    spreads: spreadByWorld(rowsWithDelta, listingsById, world, 6),
  }), [rowsWithDelta, listingsById, world]);

  // Live "now" tick so the freshness stamp updates without a refetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const loading = market.isLoading || recipes.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl text-gold tracking-wide">Dashboard</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Your whole watchlist at a glance — daily gil potential, margin spread, top earners, and what moved.
            Pulled live from {world} / {dc} prices. {applyMarketTax ? 'Net of the 5% marketboard tax.' : 'Gross (tax off).'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {market.data && <FreshnessChip ts={market.dataUpdatedAt} now={now} />}
          <button
            type="button"
            onClick={() => { market.refetch(); history.refetch(); recipes.refetch(); }}
            disabled={market.isFetching || recipes.isFetching}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {market.isError && (
        <StatusBanner kind="error">Market fetch failed: {(market.error as Error).message}</StatusBanner>
      )}
      {recipes.isError && (
        <StatusBanner kind="error">Recipe fetch failed: {(recipes.error as Error).message}</StatusBanner>
      )}

      {loading && <div className="py-6"><Spinner label="Building your dashboard…" /></div>}

      {!loading && items.length === 0 && (
        <div className="border border-border-base bg-bg-card p-12 text-center text-text-low italic">
          <div className="text-aether/70 mb-1 text-[18px]" aria-hidden>❖</div>
          <div>Your watchlist is empty.</div>
          <Link
            to="/home"
            className="not-italic mt-3 inline-block font-mono text-[11px] tracking-widest uppercase text-aether hover:text-gold transition-colors"
          >
            Add items from a starter pack on Home →
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <KpiStrip totals={agg.totals} applyMarketTax={applyMarketTax} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MarginHistogram buckets={agg.buckets} />
            <GilLeaderboard leaders={agg.leaders} concentration={agg.conc} />
            <ChangedDigest digest={agg.movers} />
            <SpreadBars spreads={agg.spreads} homeWorld={world} />
          </div>
        </>
      )}
    </div>
  );
}
