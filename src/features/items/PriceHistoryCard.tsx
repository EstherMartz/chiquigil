import { useMemo, useState } from 'react';
import {
  ComposedChart, Area, Bar, Scatter, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { MarketItem, WorldListing } from '../../lib/universalis';
import { fmtGil } from '../../lib/format';
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

  // Current asks (offers): floor + a "typical" upper bound (median of listings)
  // so we can shade where current offers sit against what actually sold.
  const askBand = useMemo(() => {
    const all = listings ?? [];
    // Prefer NQ asks (what the price line tracks); fall back to HQ-only books.
    let prices = all.filter((l) => !l.hq).map((l) => l.price).sort((a, b) => a - b);
    if (prices.length === 0) prices = all.map((l) => l.price).sort((a, b) => a - b);
    if (prices.length === 0) return null;
    const floor = prices[0];
    const typical = prices[Math.floor(prices.length / 2)];
    return { floor, typical, count: prices.length };
  }, [listings]);

  // Headline price: current cheapest listing, falling back to the most recent
  // recorded sale so the card always leads with a number.
  const mostRecentSale = useMemo(() => {
    if (!entries.length) return null;
    return entries.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)).pricePerUnit;
  }, [entries]);
  const currentPrice = market?.minHQ ?? market?.minNQ ?? mostRecentSale ?? null;

  const stats = useMemo(
    () => priceHistoryStats(entries, currentPrice, rangeDays),
    [entries, currentPrice, rangeDays],
  );

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
                {/* Hidden axes: price (left) and volume (right, scaled so bars
                    occupy only the bottom quarter of the plot). */}
                <YAxis yAxisId="price" hide domain={['auto', 'auto']} />
                <YAxis yAxisId="vol" hide orientation="right" domain={[0, Math.max(1, stats.maxVolume) * 4]} />
                {/* Current asks: shade the band from the cheapest offer up to the
                    typical (median) offer, so it's clear where sellers are pricing
                    relative to what actually sold. */}
                {askBand && (
                  <ReferenceArea
                    yAxisId="price"
                    y1={askBand.floor}
                    y2={Math.max(askBand.typical, askBand.floor)}
                    fill="#b98cc4"
                    fillOpacity={0.1}
                    stroke="#b98cc4"
                    strokeOpacity={0.35}
                    strokeDasharray="3 3"
                    ifOverflow="hidden"
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
                <Bar yAxisId="vol" dataKey="volume" fill="#6ec5ce" fillOpacity={0.22} isAnimationActive={false} />
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
                {/* Thin spikes: high price on low volume — flag, don't trust. */}
                {stats.thinSpikes.length > 0 && (
                  <Scatter
                    yAxisId="price" data={stats.thinSpikes} dataKey="price"
                    fill="#d9534f" shape="diamond" isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap font-mono text-[9px] tracking-widest uppercase text-text-low">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2" style={{ background: '#6ec5ce', opacity: 0.4 }} />
              units sold / day
            </span>
            {askBand && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2" style={{ background: '#b98cc4', opacity: 0.5 }} />
                current asks
              </span>
            )}
            {stats.thinSpikes.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span style={{ color: '#d9534f' }}>◆</span>
                thin spike
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
