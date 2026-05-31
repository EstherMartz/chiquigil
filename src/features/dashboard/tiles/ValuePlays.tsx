import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import type { ValuePlay } from '../aggregate';

/** Watched items trading below fair value — a mean-reversion "buy low" list. */
export function ValuePlays({ plays }: { plays: ValuePlay[] }) {
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] tracking-widest uppercase text-jade">↓ Value plays</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">under fair value</div>
      </div>
      {plays.length === 0 ? (
        <div className="text-text-low text-sm italic py-6 text-center">
          Nothing trading clearly under fair value (with enough sales to be sure).
        </div>
      ) : (
        <ol className="space-y-0.5">
          {plays.map((p, i) => {
            const pct = p.signal.pctVsFair != null ? Math.round(Math.abs(p.signal.pctVsFair) * 100) : null;
            return (
              <li key={p.row.id} className="grid grid-cols-[20px_1fr_70px_52px] gap-2 items-center py-1 border-b border-border-base/40 last:border-b-0">
                <span className="font-mono text-[10px] text-text-low tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <Link
                    to={`/item/${p.row.id}`}
                    className="font-display text-[12px] text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 truncate block"
                  >
                    {p.row.name}
                  </Link>
                  {p.signal.belowFloor && (
                    <span className="font-mono text-[9px] tracking-widest uppercase text-aether/80">below craft cost</span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-text-cream tabular-nums text-right">{fmtGil(p.current)}</span>
                <span className="font-mono text-[11px] text-jade tabular-nums text-right">
                  {pct != null ? `−${pct}%` : '—'}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
