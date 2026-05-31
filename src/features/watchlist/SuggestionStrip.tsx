import { useState } from 'react';
import { useCategorySuggestions } from './useCategorySuggestions';
import { categorySupportsSuggestions } from './categorySearchCats';
import { SuggestionRow } from './SuggestionRow';
import { Spinner } from '../../components/Spinner';
import type { ItemCategory } from '../items/types';

/**
 * Collapsed "suggest items for {cat}" affordance shown above the watchlist when
 * a specific (supported) category is selected. Expanding fires the on-demand
 * scan and lists the top untracked craftables to add. Hidden for "All" and
 * categories with no clean search-category analogue.
 */
export function SuggestionStrip({ category }: { category: string }) {
  const [open, setOpen] = useState(false);
  const { run, notReady } = useCategorySuggestions();

  // Only supported watchlist categories get suggestions.
  if (category === 'All' || !categorySupportsSuggestions(category as ItemCategory)) return null;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !run.data && !run.isPending) run.mutate(category as ItemCategory);
  }

  return (
    <div className="border border-border-base bg-bg-card mb-3">
      <button
        type="button"
        onClick={toggle}
        disabled={notReady}
        className="w-full flex items-center justify-between px-3 py-2 text-left disabled:opacity-50"
        title={notReady ? 'Loading catalogs…' : undefined}
      >
        <span className="font-mono text-[10px] tracking-widest uppercase text-gold">
          ✦ Suggest items to track · {category}
        </span>
        <span className="font-mono text-[10px] text-text-low">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-border-base">
          {run.isPending && <div className="py-3"><Spinner label={`Scanning ${category} crafts…`} /></div>}
          {run.isError && (
            <div className="font-mono text-[11px] text-crimson py-2">{run.error.message}</div>
          )}
          {run.data && run.data.length === 0 && (
            <div className="font-mono text-[11px] text-text-low italic py-3">
              No untracked {category.toLowerCase()} crafts worth suggesting right now.
            </div>
          )}
          {run.data && run.data.length > 0 && (
            <>
              <div className="flex items-center justify-between mt-2 mb-1">
                <span className="font-mono text-[9px] tracking-widest uppercase text-text-low">
                  top untracked · by gil/day
                </span>
                <button
                  type="button"
                  onClick={() => run.mutate(category as ItemCategory)}
                  disabled={run.isPending}
                  className="font-mono text-[9px] tracking-widest uppercase text-aether hover:text-gold transition-colors"
                >
                  ↻ refresh
                </button>
              </div>
              <ul>
                {run.data.map((s) => <SuggestionRow key={s.id} s={s} />)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
