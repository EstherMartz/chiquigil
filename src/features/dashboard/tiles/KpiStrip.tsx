import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import type { PortfolioTotals, TopPick } from '../aggregate';

/** Top-of-dashboard KPI strip — the "is my watchlist worth my time?" answer. */
export function KpiStrip({ totals, applyMarketTax, pick }: {
  totals: PortfolioTotals;
  applyMarketTax: boolean;
  pick: TopPick | null;
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
      v: `${totals.alertCount}`,
      sub: 'spike · crash · stale',
      tone: totals.alertCount > 0 ? 'text-crimson' : 'text-text-low',
    },
  ];
  return (
    <div className="border border-border-base">
      {/* Top pick — the single best action right now, auto-calculated. */}
      {pick && (
        <Link
          to={`/item/${pick.row.id}`}
          className="flex items-baseline gap-3 flex-wrap px-3 py-2.5 bg-gold/10 border-b border-gold/30 hover:bg-gold/15 transition-colors"
        >
          <span className="font-mono text-[9px] tracking-widest uppercase text-gold">★ Top pick</span>
          <span className="font-display text-base text-text-cream">{pick.row.name}</span>
          <span className="font-mono text-[10px] text-text-low">{pick.row.crafter}</span>
          <span className="font-mono text-[11px] text-gold tabular-nums ml-auto">
            {fmtGil(Math.round(pick.gilPerDay))}/day
          </span>
          <span className="font-mono text-[10px] text-jade tabular-nums">
            {pick.margin != null ? `${Math.round(pick.margin * 100)}% margin` : ''}
          </span>
          <span className="font-mono text-[10px] text-text-low tabular-nums">{pick.row.dcSpd.toFixed(1)}/day</span>
        </Link>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5">
        {cells.map((s, i) => (
          <div key={s.k} className={`p-3 ${i < cells.length - 1 ? 'border-r border-border-base' : ''} bg-bg-card`}>
            <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{s.k}</div>
            <div className={`font-display text-xl tabular-nums leading-none mt-1.5 ${s.tone}`}>{s.v}</div>
            <div className="font-mono text-[9px] text-text-low mt-1.5">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
