import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import { Skeleton } from '../../../components/Skeleton';
import { useDashboardStore } from '../dashboardStore';
import type { PortfolioTotals, TopPick } from '../aggregate';

/**
 * Top-of-dashboard KPI strip — the "is my watchlist worth my time?" answer.
 * `alertsReady` gates the "Alerts firing" cell: that count depends on the
 * 7-day deltas (history fetch), so until those land it shows a shimmer instead
 * of an incomplete count that would silently jump when history arrives.
 */
export function KpiStrip({ totals, applyMarketTax, picks, alertsReady = true }: {
  totals: PortfolioTotals;
  applyMarketTax: boolean;
  picks: TopPick[];
  alertsReady?: boolean;
}) {
  const cells = [
    {
      k: 'Daily gil potential',
      v: fmtGil(totals.totalGilPerDay),
      sub: applyMarketTax ? 'net of tax · Σ gil/day' : 'gross · Σ gil/day',
      tone: 'text-gold',
    },
    {
      k: 'Profit / full sweep',
      v: fmtGil(totals.totalProfitPerUnit),
      sub: 'one of each craftable',
      tone: 'text-jade',
    },
    {
      k: 'Tracked',
      v: `${totals.trackedCount}`,
      sub: `${totals.craftableCount} craft · ${totals.saleOnlyCount} sale-only`,
      tone: 'text-text-cream',
    },
    {
      k: 'Median margin',
      v: totals.medianMargin != null ? `${(totals.medianMargin * 100).toFixed(0)}%` : '—',
      sub: 'craftables',
      tone: 'text-text-cream',
    },
    {
      k: 'Alerts firing',
      v: alertsReady ? `${totals.alertCount}` : <Skeleton height={20} width={32} className="mt-1.5" />,
      sub: 'spike · crash · stale',
      tone: alertsReady && totals.alertCount > 0 ? 'text-crimson' : 'text-text-low',
    },
  ];
  return (
    <div className="border border-border-base">
      <TopPickBanner picks={picks} />
      <div className="grid grid-cols-2 md:grid-cols-5">
        {cells.map((s, i) => (
          <div key={s.k} className={`p-3 ${i < cells.length - 1 ? 'border-r border-border-base' : ''} bg-bg-card`}>
            <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{s.k}</div>
            <div className={`font-mono text-xl tabular-nums leading-none mt-1.5 ${s.tone}`}>{s.v}</div>
            <div className="font-mono text-[9px] text-text-low mt-1.5">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The single best action right now. ‹ › cycle the top few; "got it" permanently
 * dismisses a pick (persisted) so something already in rotation stops being the
 * headline — the banner then falls through to the next-best. Clamps the index
 * if the live list shrinks.
 */
function TopPickBanner({ picks }: { picks: TopPick[] }) {
  const [idx, setIdx] = useState(0);
  const dismissedPickIds = useDashboardStore((s) => s.dismissedPickIds);
  const dismissPick = useDashboardStore((s) => s.dismissPick);
  const resetDismissedPicks = useDashboardStore((s) => s.resetDismissedPicks);

  const dismissed = new Set(dismissedPickIds);
  const visible = picks.filter((p) => !dismissed.has(p.row.id));

  // All current picks waved off — offer a one-tap reset instead of an empty bar.
  if (picks.length > 0 && visible.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gold/5 border-b border-gold/20">
        <span className="font-mono text-[10px] text-text-low">All top picks dismissed.</span>
        <button
          type="button"
          onClick={resetDismissedPicks}
          className="font-mono text-[9px] tracking-widest uppercase text-aether hover:text-gold transition-colors"
        >
          ↺ reset
        </button>
      </div>
    );
  }
  if (visible.length === 0) return null;

  const i = Math.min(idx, visible.length - 1);
  const pick = visible[i];

  return (
    <div className="flex items-baseline gap-3 flex-wrap px-3 py-2.5 bg-gold/10 border-b border-gold/30">
      <span className="font-mono text-[9px] tracking-widest uppercase text-gold">★ Top pick</span>
      <Link to={`/item/${pick.row.id}`} className="font-display text-base text-text-cream hover:text-gold transition-colors">
        {pick.row.name}
      </Link>
      <span className="font-mono text-[10px] text-text-low">{pick.row.crafter}</span>
      {visible.length > 1 && (
        <span className="flex items-center gap-1.5">
          <button
            type="button" aria-label="Previous pick"
            onClick={() => setIdx((i + visible.length - 1) % visible.length)}
            className="font-mono text-[11px] text-text-low hover:text-gold transition-colors px-1"
          >‹</button>
          <span className="font-mono text-[9px] text-text-low tabular-nums">{i + 1}/{visible.length}</span>
          <button
            type="button" aria-label="Next pick"
            onClick={() => setIdx((i + 1) % visible.length)}
            className="font-mono text-[11px] text-text-low hover:text-gold transition-colors px-1"
          >›</button>
        </span>
      )}
      <button
        type="button"
        onClick={() => { dismissPick(pick.row.id); setIdx(0); }}
        title="Got it — stop suggesting this pick"
        className="font-mono text-[9px] tracking-widest uppercase text-text-low hover:text-crimson border border-border-base hover:border-crimson/40 rounded-sm px-1.5 py-0.5 transition-colors"
      >
        got it ✕
      </button>
      <span className="font-mono text-[11px] text-gold tabular-nums ml-auto">
        {fmtGil(Math.round(pick.gilPerDay))}/day
      </span>
      <span className="font-mono text-[10px] text-jade tabular-nums">
        {pick.margin != null ? `${Math.round(pick.margin * 100)}% margin` : ''}
      </span>
      <span className="font-mono text-[10px] text-text-low tabular-nums">{pick.row.dcSpd.toFixed(1)}/day</span>
    </div>
  );
}
