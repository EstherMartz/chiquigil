import { useMemo } from 'react';
import type { MarketItem } from '../../lib/universalis';
import { fmtGil } from '../../lib/format';
import { prepare, dcClass, diffClass, formatDiff, crossWorldArbStats } from './crossWorld';

interface Props {
  region?: MarketItem;
  homeWorld: string;
  dcLabel: string;
  homeMinNQ: number | null;
  homeMinHQ: number | null;
  onSeeAll: () => void;
  expanded: boolean;
}

export function CrossWorldArbCard({
  region,
  homeWorld,
  dcLabel,
  homeMinNQ,
  homeMinHQ,
  onSeeAll,
  expanded,
}: Props) {
  const rows = useMemo(
    () => prepare(region?.worldListings ?? [], homeWorld, homeMinNQ, homeMinHQ),
    [region, homeWorld, homeMinNQ, homeMinHQ],
  );

  const stats = useMemo(
    () => crossWorldArbStats(rows, homeMinNQ ?? homeMinHQ),
    [rows, homeMinNQ, homeMinHQ],
  );

  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-4">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-3">
          Cross-world Arb
        </div>
        <div className="text-text-low text-sm italic">No cross-world listings.</div>
      </div>
    );
  }

  return (
    <div className="border border-border-base bg-bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
          Cross-world Arb
        </div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">
          {dcLabel} · {stats.worldCount} world{stats.worldCount === 1 ? '' : 's'}
        </div>
      </div>

      {/* Headline: cheapest diff */}
      {stats.top.length > 0 && (
        <div className="mb-3 pb-3 border-b border-border-base">
          {!stats.top[0].isHome && stats.bestDiffPct != null ? (
            <>
              <div className={`text-2xl font-display font-bold ${stats.bestDiffPct < 0 ? 'text-jade' : 'text-crimson'}`}>
                {formatDiff(stats.bestDiffPct)}
              </div>
              <div className="text-sm text-text-low font-mono">vs {homeWorld} home</div>
            </>
          ) : (
            <div className="text-text-low text-sm italic">Cheapest is home world</div>
          )}
        </div>
      )}

      {/* Top-4 rows */}
      <div className="space-y-2 mb-3">
        {stats.top.map((row) => {
          const listingCount = rows.filter((r) => r.world === row.world && r.hq === row.hq).length;
          const barWidth = stats.maxTopPrice > 0 ? (row.price / stats.maxTopPrice) * 100 : 0;
          return (
            <div key={`${row.world}-${row.hq ? 'hq' : 'nq'}`} className="flex items-center gap-2 text-sm">
              {/* World + DC tag + listing count */}
              <div className="flex-shrink-0 w-20">
                <div className="text-text-cream truncate">{row.world}</div>
                <div className={`font-mono text-[9px] ${dcClass(row.dc)}`}>
                  {row.dc ?? '—'} · {listingCount}
                </div>
              </div>

              {/* Price bar */}
              <div className="flex-1 h-4 bg-bg-card-hi rounded overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: row.hq ? '#e8c547' : '#4a7ca9',
                  }}
                />
              </div>

              {/* Price + delta */}
              <div className="flex-shrink-0 text-right min-w-24">
                <div className="font-mono text-text-cream">{fmtGil(row.price)}</div>
                <div className={`font-mono text-[9px] ${diffClass(row.diffPct)}`}>
                  {formatDiff(row.diffPct)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: See all button */}
      <button
        onClick={onSeeAll}
        className="w-full text-center font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether transition-colors py-2 border-t border-border-base"
      >
        See all {stats.worldCount} {expanded ? '↑' : '↓'}
      </button>
    </div>
  );
}
