import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { MarketItem } from '../../lib/universalis';
import { fmtGil } from '../../lib/format';
import { Spinner } from '../../components/Spinner';

export interface PriceHistoryStats {
  points: Array<{ ts: number; nq: number | null; hq: number | null }>;
  deltaPct: number | null;
  oldestAgeDays: number;
  salesInRange: number;
  salesIn30d: number;
}

export function priceHistoryStats(
  entries: HistoryEntry[],
  currentPrice: number | null,
  rangeDays: number | null,
  nowMs: number = Date.now(),
): PriceHistoryStats {
  const cutoffMs = nowMs - (rangeDays ?? 90) * 24 * 60 * 60 * 1000;
  const cutoff30Ms = nowMs - 30 * 24 * 60 * 60 * 1000;

  const inRange = entries.filter((e) => e.timestamp * 1000 >= cutoffMs);
  const in30d = entries.filter((e) => e.timestamp * 1000 >= cutoff30Ms);

  // Build chart points sorted by timestamp
  const points = [...inRange]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => ({
      ts: e.timestamp * 1000,
      nq: e.hq ? null : e.pricePerUnit,
      hq: e.hq ? e.pricePerUnit : null,
    }));

  // Compute delta: current vs oldest in range
  let deltaPct: number | null = null;
  let oldestAgeDays = 0;
  if (inRange.length > 0 && currentPrice != null && currentPrice > 0) {
    const oldest = inRange[0];
    const oldestPrice = oldest.pricePerUnit;
    if (oldestPrice > 0) {
      deltaPct = Math.round(((currentPrice - oldestPrice) / oldestPrice) * 100);
      oldestAgeDays = Math.floor((nowMs - oldest.timestamp * 1000) / (24 * 60 * 60 * 1000));
    }
  }

  return {
    points,
    deltaPct,
    oldestAgeDays,
    salesInRange: inRange.length,
    salesIn30d: in30d.length,
  };
}

interface Props {
  entries: HistoryEntry[];
  loading: boolean;
  phantom?: MarketItem;
  canHq: boolean;
  scopeLabel: string;
}

export function PriceHistoryCard({ entries, loading, phantom, canHq, scopeLabel }: Props) {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90 | null>(30);

  const stats = useMemo(
    () => priceHistoryStats(entries, phantom?.minHQ ?? phantom?.minNQ ?? null, rangeDays),
    [entries, phantom, rangeDays],
  );

  const currentPrice = phantom?.minHQ ?? phantom?.minNQ ?? null;
  const rangeLabel = rangeDays === null ? 'ALL' : `${rangeDays}D`;

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
      {currentPrice != null ? (
        <div className="mb-3 pb-3 border-b border-border-base">
          <div className="text-2xl font-display font-bold text-text-cream mb-1">
            {fmtGil(currentPrice)}
          </div>
          {stats.deltaPct != null && stats.oldestAgeDays > 0 ? (
            <div className={`text-sm font-mono ${stats.deltaPct >= 0 ? 'text-jade' : 'text-crimson'}`}>
              {stats.deltaPct >= 0 ? '+' : ''}{stats.deltaPct}% vs {stats.oldestAgeDays}d ago
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Chart */}
      {stats.salesInRange > 0 ? (
        <div className="mb-3" style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
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
                domain={['dataMin', 'dataMax']}
                tickFormatter={(ts) => new Date(ts as number).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                stroke="#666"
                tick={{ fontSize: 9, fontFamily: 'monospace' }}
                height={20}
              />
              <Tooltip
                labelFormatter={(ts) => new Date(ts as number).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                formatter={(value) => (value != null ? fmtGil(value as number) : null)}
                contentStyle={{ background: '#111', border: '1px solid #2a2a2a', fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="nq"
                stroke="#7fb3d5"
                fill="url(#areaGradientNQ)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              {canHq && (
                <Area
                  type="monotone"
                  dataKey="hq"
                  stroke="#e8c547"
                  fill="url(#areaGradientHQ)"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mb-3 py-6 text-center text-text-low text-sm italic">
          No sales in the last {rangeLabel}.
        </div>
      )}

      {/* Range toggle pills */}
      <div className="flex gap-2 mb-3 flex-wrap">
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
