import { useMemo, useState } from 'react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea,
} from 'recharts';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { MarketItem, WorldListing } from '../../lib/universalis';
import { fmtGil } from '../../lib/format';
import { formatClearDays } from './supplyDepth';
import { captureShare } from './verdict/pricing';
import { Spinner } from '../../components/Spinner';

/** One calendar day: quantity-weighted mean price per quality + total units sold. */
export interface DailyPoint {
  ts: number;
  priceNQ: number | null;
  priceHQ: number | null;
  volume: number;
}

export interface PriceHistoryStats {
  points: Array<{ ts: number; nq: number | null; hq: number | null }>;
  daily: DailyPoint[];
  maxVolume: number;
  /** Days whose price jumped well above typical on little volume (hollow spikes). */
  thinSpikes: Array<{ ts: number; price: number }>;
  deltaPct: number | null;
  oldestAgeDays: number;
  salesInRange: number;
  salesIn30d: number;
  /** Quantity-weighted average sale price across the range (both qualities). */
  vwap: number | null;
  /** Median of the daily mean prices. */
  medianDaily: number | null;
  /** 25th/75th percentile of daily mean prices — a "usual range" band. */
  bandLo: number | null;
  bandHi: number | null;
}

/** Value at percentile p (0–1) of an ascending-sorted numeric array. */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((sortedAsc.length - 1) * p)));
  return sortedAsc[idx];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function priceHistoryStats(
  entries: HistoryEntry[],
  currentPrice: number | null,
  rangeDays: number | null,
  nowMs: number = Date.now(),
): PriceHistoryStats {
  const cutoffMs = nowMs - (rangeDays ?? 90) * DAY_MS;
  const cutoff30Ms = nowMs - 30 * DAY_MS;

  const inRange = entries.filter((e) => e.timestamp * 1000 >= cutoffMs);
  const in30d = entries.filter((e) => e.timestamp * 1000 >= cutoff30Ms);

  // Per-sale points (kept for callers/tests).
  const points = [...inRange]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => ({
      ts: e.timestamp * 1000,
      nq: e.hq ? null : e.pricePerUnit,
      hq: e.hq ? e.pricePerUnit : null,
    }));

  // Daily buckets: quantity-weighted mean price (per quality) + units sold/day.
  const byDay = new Map<number, { nqSum: number; nqQty: number; hqSum: number; hqQty: number; vol: number }>();
  for (const e of inRange) {
    const day = Math.floor((e.timestamp * 1000) / DAY_MS) * DAY_MS;
    const b = byDay.get(day) ?? { nqSum: 0, nqQty: 0, hqSum: 0, hqQty: 0, vol: 0 };
    if (e.hq) { b.hqSum += e.pricePerUnit * e.quantity; b.hqQty += e.quantity; }
    else { b.nqSum += e.pricePerUnit * e.quantity; b.nqQty += e.quantity; }
    b.vol += e.quantity;
    byDay.set(day, b);
  }
  const daily: DailyPoint[] = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, b]) => ({
      ts,
      priceNQ: b.nqQty ? Math.round(b.nqSum / b.nqQty) : null,
      priceHQ: b.hqQty ? Math.round(b.hqSum / b.hqQty) : null,
      volume: b.vol,
    }));
  const maxVolume = daily.reduce((m, d) => Math.max(m, d.volume), 0);

  // Thin spikes: days whose price sits well above the typical daily price but
  // on little volume — a hollow listing that happened to sell, not a real move.
  const dailyPrices = daily
    .map((d) => d.priceNQ ?? d.priceHQ ?? 0)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  const medianDaily = dailyPrices.length ? dailyPrices[Math.floor(dailyPrices.length / 2)] : 0;

  // Quantity-weighted average price across every sale in range, and a 25–75
  // percentile band of the daily means — the "usual range" for the item.
  let vwapSum = 0;
  let vwapQty = 0;
  for (const e of inRange) {
    vwapSum += e.pricePerUnit * e.quantity;
    vwapQty += e.quantity;
  }
  const vwap = vwapQty > 0 ? Math.round(vwapSum / vwapQty) : null;
  const bandLo = percentile(dailyPrices, 0.25);
  const bandHi = percentile(dailyPrices, 0.75);

  const thinSpikes =
    daily.length >= 5 && medianDaily > 0 && maxVolume > 0
      ? daily
          .filter((d) => {
            const p = d.priceNQ ?? d.priceHQ ?? 0;
            return p > medianDaily * 1.3 && d.volume <= maxVolume * 0.2;
          })
          .map((d) => ({ ts: d.ts, price: d.priceNQ ?? d.priceHQ ?? 0 }))
      : [];

  // Compute delta: current vs oldest in range
  let deltaPct: number | null = null;
  let oldestAgeDays = 0;
  if (inRange.length > 0 && currentPrice != null && currentPrice > 0) {
    const oldest = inRange[0];
    const oldestPrice = oldest.pricePerUnit;
    if (oldestPrice > 0) {
      deltaPct = Math.round(((currentPrice - oldestPrice) / oldestPrice) * 100);
      oldestAgeDays = Math.floor((nowMs - oldest.timestamp * 1000) / DAY_MS);
    }
  }

  return {
    points,
    daily,
    maxVolume,
    thinSpikes,
    deltaPct,
    oldestAgeDays,
    salesInRange: inRange.length,
    salesIn30d: in30d.length,
    vwap,
    medianDaily: medianDaily || null,
    bandLo,
    bandHi,
  };
}

interface Props {
  entries: HistoryEntry[];
  loading: boolean;
  market?: MarketItem;
  /** Current marketboard listings (asks) for the active scope. */
  listings?: WorldListing[];
  canHq: boolean;
  scopeLabel: string;
}

export function PriceHistoryCard({ entries, loading, market, listings, canHq, scopeLabel }: Props) {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90 | null>(30);

  // Current asks (offers): the cheapest current listing + how many are up, so we
  // can mark the floor on the chart and state the count plainly.
  const ask = useMemo(() => {
    const prices = (listings ?? []).map((l) => l.price).filter((p) => p > 0).sort((a, b) => a - b);
    if (prices.length === 0) return null;
    return { floor: prices[0], count: prices.length };
  }, [listings]);

  // Headline price: the cheapest current ask (what you'd pay right now), then the
  // parsed min, then the most recent sale — so it always leads with a real number
  // and stays consistent with the ask line drawn on the chart.
  const mostRecentSale = useMemo(() => {
    if (!entries.length) return null;
    return entries.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)).pricePerUnit;
  }, [entries]);
  const currentPrice = ask?.floor ?? market?.minHQ ?? market?.minNQ ?? mostRecentSale ?? null;

  const stats = useMemo(
    () => priceHistoryStats(entries, currentPrice, rangeDays),
    [entries, currentPrice, rangeDays],
  );

  // Supply depth + competition for the active scope — "how crowded is this?"
  const velocity = market?.velocity ?? 0;
  const listingCount = market?.listingCount ?? ask?.count ?? 0;
  const clearLabel = velocity > 0 && listingCount > 0 ? formatClearDays(listingCount, velocity) : null;
  const capturePct = listingCount > 0 ? Math.round(captureShare(listingCount) * 100) : null;

  const rangeLabel = rangeDays === null ? 'ALL' : `${rangeDays}D`;
  const Toggle = (
    <div className="flex gap-1 flex-wrap">
      {[7, 30, 90].map((days) => (
        <button
          key={days}
          onClick={() => setRangeDays(days as 7 | 30 | 90)}
          className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 transition-colors ${
            rangeDays === days ? 'text-gold' : 'text-text-dim hover:text-aether'
          }`}
        >
          {days}D
        </button>
      ))}
      <button
        onClick={() => setRangeDays(null)}
        className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 transition-colors ${
          rangeDays === null ? 'text-gold' : 'text-text-dim hover:text-aether'
        }`}
      >
        ALL
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="border border-border-base bg-bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Price History</div>
          <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">
            {rangeLabel} · {scopeLabel} {canHq ? 'HQ/NQ' : 'NQ'}
          </div>
        </div>
        <Spinner label="Loading sale history…" />
      </div>
    );
  }

  return (
    <div className="border border-border-base bg-bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Price History</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">
          {rangeLabel} · {scopeLabel} {canHq ? 'HQ/NQ' : 'NQ'}
        </div>
      </div>

      {/* Current price headline + delta */}
      <div className="mb-2">
        <div className="flex items-baseline gap-3">
          <div className="text-2xl font-display font-bold text-text-cream">
            {currentPrice != null ? fmtGil(currentPrice) : '—'}
          </div>
          {stats.deltaPct != null && stats.oldestAgeDays > 0 && (
            <div className={`text-sm font-mono ${stats.deltaPct >= 0 ? 'text-jade' : 'text-crimson'}`}>
              {stats.deltaPct >= 0 ? '+' : ''}{stats.deltaPct}% <span className="text-text-low">vs {stats.oldestAgeDays}d ago</span>
            </div>
          )}
        </div>
        {(stats.vwap != null || stats.medianDaily != null) && (
          <div className="mt-1 font-mono text-[10px] tracking-widest uppercase text-text-low flex items-center gap-3 flex-wrap">
            {stats.vwap != null && <span>VWAP {fmtGil(stats.vwap)}</span>}
            {stats.medianDaily != null && <span>median {fmtGil(stats.medianDaily)}</span>}
            {clearLabel && <span className="text-aether/80">clears {clearLabel}</span>}
          </div>
        )}
      </div>

      {/* Range toggle — directly under the headline, above the chart */}
      <div className="mb-2">{Toggle}</div>

      {/* Chart: daily price line + daily volume bars (units sold/day) so a
          price move can be read against the trade volume behind it. */}
      {stats.salesInRange > 0 ? (
        <>
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats.daily} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="areaGradientNQ" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7fb3d5" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#7fb3d5" stopOpacity={0} />
                  </linearGradient>
                  {canHq && (
                    <linearGradient id="areaGradientHQ" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e8c547" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#e8c547" stopOpacity={0} />
                    </linearGradient>
                  )}
                </defs>
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(ts) => new Date(ts as number).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  stroke="#666"
                  tick={{ fontSize: 9, fontFamily: 'monospace' }}
                  height={20}
                />
                {/* Hidden axes: price (left) and volume (right, scaled so the
                    sales-volume bars occupy roughly the bottom third). */}
                <YAxis yAxisId="price" hide domain={['auto', 'auto']} />
                <YAxis yAxisId="vol" hide orientation="right" domain={[0, Math.max(1, stats.maxVolume) * 3]} />
                {/* "Usual range" band (25–75 pct of daily means) + VWAP line,
                    so a price can be read against where it normally sits. */}
                {stats.bandLo != null && stats.bandHi != null && stats.bandHi > stats.bandLo && (
                  <ReferenceArea
                    yAxisId="price" y1={stats.bandLo} y2={stats.bandHi}
                    fill="#7fb3d5" fillOpacity={0.07} stroke="none" ifOverflow="extendDomain"
                  />
                )}
                {stats.vwap != null && (
                  <ReferenceLine
                    yAxisId="price" y={stats.vwap}
                    stroke="#9a8f7a" strokeDasharray="3 3" strokeOpacity={0.7} ifOverflow="extendDomain"
                  />
                )}
                <Tooltip
                  labelFormatter={(ts) => new Date(ts as number).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                  formatter={(value, name) => {
                    if (value == null) return [null, null] as [null, null];
                    if (name === 'volume') return [`${value} sold`, 'Volume'];
                    return [fmtGil(value as number), name === 'priceHQ' ? 'HQ' : 'NQ'];
                  }}
                  contentStyle={{ background: '#111', border: '1px solid #2a2a2a', fontSize: 11 }}
                />
                <Bar yAxisId="vol" dataKey="volume" fill="#6ec5ce" fillOpacity={0.55} isAnimationActive={false} />
                <Area
                  yAxisId="price" type="monotone" dataKey="priceNQ" name="priceNQ"
                  stroke="#7fb3d5" fill="url(#areaGradientNQ)" strokeWidth={1.5}
                  dot={false} connectNulls isAnimationActive={false}
                />
                {canHq && (
                  <Area
                    yAxisId="price" type="monotone" dataKey="priceHQ" name="priceHQ"
                    stroke="#e8c547" fill="url(#areaGradientHQ)" strokeWidth={1.5}
                    dot={false} connectNulls isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap font-mono text-[9px] tracking-widest uppercase text-text-low">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2" style={{ background: '#6ec5ce', opacity: 0.6 }} />
              units sold / day
            </span>
            {ask && <span>{ask.count} offer{ask.count === 1 ? '' : 's'} listed</span>}
            {clearLabel && <span>clears {clearLabel}</span>}
            {capturePct != null && (
              <span title="Rough share of sales you'd capture against the current sellers">
                ~{capturePct}% capture
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="mb-3 flex items-center justify-center text-text-low text-sm italic" style={{ height: 140 }}>
          No sales in the last {rangeLabel}.
        </div>
      )}

      {/* Thin-volume callout for 30-day window */}
      {stats.salesIn30d < 5 && stats.salesIn30d > 0 && (
        <div className="text-[11px] text-text-low flex items-start gap-2">
          <span className="text-gold flex-shrink-0 mt-0.5">•</span>
          <span>
            Only {stats.salesIn30d} sale{stats.salesIn30d === 1 ? '' : 's'} in 30 days — listed prices may drift up without volume confirming.
          </span>
        </div>
      )}
    </div>
  );
}
