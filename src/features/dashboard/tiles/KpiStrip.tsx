import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import type { PortfolioTotals, TopPick } from '../aggregate';

/** Top-of-dashboard KPI strip — the "is my watchlist worth my time?" answer. */
export function KpiStrip({ totals, applyMarketTax, picks }: {
  totals: PortfolioTotals;
  applyMarketTax: boolean;
  picks: TopPick[];
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
      <TopPickBanner picks={picks} />
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

/**
 * The single best action right now, with ‹ › to cycle through the top few so a
 * pick already in rotation isn't permanent noise. Clamps the index if the picks
 * list shrinks between renders.
 */
function TopPickBanner({ picks }: { picks: TopPick[] }) {
  const [idx, setIdx] = useState(0);
  if (picks.length === 0) return null;
  const i = Math.min(idx, picks.length - 1);
  const pick = picks[i];

  return (
    <div className="flex items-baseline gap-3 flex-wrap px-3 py-2.5 bg-gold/10 border-b border-gold/30">
      <span className="font-mono text-[9px] tracking-widest uppercase text-gold">★ Top pick</span>
      <Link to={`/item/${pick.row.id}`} className="font-display text-base text-text-cream hover:text-gold transition-colors">
        {pick.row.name}
      </Link>
      <span className="font-mono text-[10px] text-text-low">{pick.row.crafter}</span>
      {picks.length > 1 && (
        <span className="flex items-center gap-1.5">
          <button
            type="button" aria-label="Previous pick"
            onClick={() => setIdx((i + picks.length - 1) % picks.length)}
            className="font-mono text-[11px] text-text-low hover:text-gold transition-colors px-1"
          >‹</button>
          <span className="font-mono text-[9px] text-text-low tabular-nums">{i + 1}/{picks.length}</span>
          <button
            type="button" aria-label="Next pick"
            onClick={() => setIdx((i + 1) % picks.length)}
            className="font-mono text-[11px] text-text-low hover:text-gold transition-colors px-1"
          >›</button>
        </span>
      )}
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
