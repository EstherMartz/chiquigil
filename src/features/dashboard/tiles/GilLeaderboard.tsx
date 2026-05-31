import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import { rowMargin } from '../aggregate';
import type { WatchlistRow } from '../../watchlist/buildRows';
import type { Concentration } from '../aggregate';

/** Top gil/day earners on your watchlist, with the concentration headline. */
export function GilLeaderboard({ leaders, concentration }: { leaders: WatchlistRow[]; concentration: Concentration }) {
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] tracking-widest uppercase text-gold">✦ Top gil/day</div>
        {concentration.topN > 0 && concentration.total > 0 && (
          <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">
            top {concentration.topN} = {(concentration.topShare * 100).toFixed(0)}% of potential
          </div>
        )}
      </div>
      {leaders.length === 0 ? (
        <div className="text-text-low text-sm italic py-6 text-center">No earners with positive gil/day yet.</div>
      ) : (
        <ol className="space-y-0.5">
          {leaders.map((r, i) => {
            const m = rowMargin(r);
            const marginLabel = m != null ? `${m >= 0 ? '+' : ''}${(m * 100).toFixed(0)}%` : r.craftable === false ? 'sale' : '—';
            const marginColor = m != null ? (m >= 0.25 ? 'text-jade' : m >= 0 ? 'text-text-cream' : 'text-crimson') : 'text-text-low';
            return (
              <li key={r.id} className="grid grid-cols-[20px_1fr_70px_46px_44px] gap-2 items-center py-1 border-b border-border-base/40 last:border-b-0">
                <span className="font-mono text-[10px] text-text-low tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <Link
                  to={`/item/${r.id}`}
                  className="font-display text-[12px] text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 truncate"
                >
                  {r.name}
                </Link>
                <span className="font-mono text-[11px] text-gold tabular-nums text-right">{fmtGil(Math.round(r.gilPerDay ?? 0))}</span>
                <span className={`font-mono text-[11px] tabular-nums text-right ${marginColor}`}>{marginLabel}</span>
                <span className="font-mono text-[10px] text-text-low tabular-nums text-right">{r.dcSpd.toFixed(1)}/d</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
