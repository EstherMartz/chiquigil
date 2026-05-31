import { useState } from 'react';
import { useCategorySuggestions } from './useCategorySuggestions';
import { categorySupportsSuggestions } from './categorySearchCats';
import { SuggestionRow } from './SuggestionRow';
import { ModeToggle } from './ModeToggle';
import { Spinner } from '../../components/Spinner';
import type { ItemCategory } from '../items/types';
import type { SuggestionMode } from './suggestions';

/**
 * Collapsed "suggest items for {cat}" affordance shown above the watchlist when
 * a specific (supported) category is selected. Expanding fires the on-demand
 * scan for the chosen source (craft / vendor / gather). Hidden for "All" and
 * categories with no clean search-category analogue.
 */
export function SuggestionStrip({ category }: { category: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SuggestionMode>('craft');
  const { run, notReady } = useCategorySuggestions();

  if (category === 'All' || !categorySupportsSuggestions(category as ItemCategory)) return null;

  function scan(m: SuggestionMode) {
    run.mutate({ cat: category as ItemCategory, mode: m });
  }
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !run.data && !run.isPending) scan(mode);
  }
  function changeMode(m: SuggestionMode) {
    setMode(m);
    if (open) scan(m);
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
          <div className="flex items-center justify-between mt-2 mb-1 gap-3 flex-wrap">
            <ModeToggle mode={mode} onChange={changeMode} />
            <button
              type="button"
              onClick={() => scan(mode)}
              disabled={run.isPending}
              className="font-mono text-[9px] tracking-widest uppercase text-aether hover:text-gold transition-colors"
            >
              ↻ refresh
            </button>
          </div>
          {run.isPending && <div className="py-3"><Spinner label={`Scanning ${category} ${mode} plays…`} /></div>}
          {run.isError && <div className="font-mono text-[11px] text-crimson py-2">{run.error.message}</div>}
          {run.data && run.data.length === 0 && (
            <div className="font-mono text-[11px] text-text-low italic py-3">
              No untracked {category.toLowerCase()} {mode} plays worth suggesting right now.
            </div>
          )}
          {run.data && run.data.length > 0 && (
            <ul>{run.data.map((s) => <SuggestionRow key={s.id} s={s} />)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
