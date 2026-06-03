import { Link } from 'react-router-dom';
import { fmtGil } from '../../lib/format';
import { useWatchlistStore } from '../items/watchlistStore';
import type { Suggestion } from './suggestions';

const MODE_META: Record<Suggestion['mode'], { sub: (s: Suggestion) => string }> = {
  craft:  { sub: (s) => `${s.crafter} Lv${s.lvl} · mats ${fmtGil(s.acquireCost)}` },
  vendor: { sub: (s) => `vendor ${fmtGil(s.acquireCost)}` },
  gather: { sub: () => 'gather · no cost' },
};

/**
 * One suggestion row with + track / dismiss. Adds the item with its category
 * (so it lands in the right FilterBar bucket), or dismisses it into the
 * excluded set so it won't be suggested again.
 */
export function SuggestionRow({ s }: { s: Suggestion }) {
  const addCustomItem = useWatchlistStore((st) => st.addCustomItem);
  const toggleExcluded = useWatchlistStore((st) => st.toggleExcluded);

  const margin = s.unitPrice > 0 ? Math.round((s.profit / s.unitPrice) * 100) : null;

  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-border-base/40 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Link
          to={`/item/${s.id}`}
          className="font-display text-[12px] text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 truncate block"
        >
          {s.name}
        </Link>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low truncate">
          {MODE_META[s.mode].sub(s)}
        </div>
      </div>
      <span className="font-mono text-[11px] text-gold tabular-nums text-right w-16 shrink-0">
        {fmtGil(Math.round(s.gilPerDay))}/d
      </span>
      <span className="font-mono text-[10px] text-jade tabular-nums text-right w-10 shrink-0">
        {margin != null ? `${margin}%` : '—'}
      </span>
      <span className="font-mono text-[10px] text-text-low tabular-nums text-right w-12 shrink-0">
        {s.velocity.toFixed(1)}/d
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => addCustomItem({ id: s.id, name: s.name, crafter: s.crafter, lvl: s.lvl, cat: s.cat })}
          className="font-mono text-[10px] tracking-widest uppercase border border-jade/50 text-jade px-2 py-1 hover:bg-jade/10 transition-colors"
          title="Add to watchlist"
        >
          + track
        </button>
        <button
          type="button"
          onClick={() => toggleExcluded(s.id)}
          className="font-mono text-[11px] text-text-low hover:text-crimson border border-border-base hover:border-crimson/40 rounded-sm px-1.5 py-0.5 transition-colors"
          title="Dismiss — don't suggest again"
          aria-label="Dismiss suggestion"
        >
          ✕
        </button>
      </div>
    </li>
  );
}
