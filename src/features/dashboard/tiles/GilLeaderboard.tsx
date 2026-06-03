import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import { rowMargin, gilPerDayLeaders, concentration } from '../aggregate';
import type { WatchlistRow } from '../../watchlist/buildRows';

type Tab = 'craft' | 'flip';

/**
 * Top gil/day earners, split into Craft (recipes — your craft decisions) and
 * Flip (sale-only holds/resells) so high-gil dyes don't crowd out the craftable
 * items where you actually decide what to make.
 */
export function GilLeaderboard({ rows }: { rows: WatchlistRow[] }) {
  const [tab, setTab] = useState<Tab>('craft');

  const { craft, flip } = useMemo(() => ({
    craft: rows.filter((r) => r.craftable === true),
    flip: rows.filter((r) => r.craftable === false),
  }), [rows]);

  const active = tab === 'craft' ? craft : flip;
  const leaders = useMemo(() => gilPerDayLeaders(active, 8), [active]);
  const conc = useMemo(() => concentration(active, 3), [active]);

  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="font-mono text-[10px] tracking-widest uppercase text-gold">✦ Top gil/day</div>
        <div className="flex items-center gap-3">
          {conc.topN > 0 && conc.total > 0 && (
            <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">
              top {conc.topN} = {(conc.topShare * 100).toFixed(0)}%
            </div>
          )}
          <div className="flex gap-1">
            {([['craft', 'Craft'], ['flip', 'Flip']] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 transition-colors ${
                  tab === id ? 'text-aether' : 'text-text-dim hover:text-aether'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {leaders.length === 0 ? (
        <div className="text-text-low text-sm italic py-6 text-center">
          {tab === 'craft' ? 'No craftable earners yet.' : 'No sale-only items moving yet.'}
        </div>
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
