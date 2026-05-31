import { useEffect, useState } from 'react';
import { useCategorySuggestions } from './useCategorySuggestions';
import { categorySupportsSuggestions } from './categorySearchCats';
import { SuggestionRow } from './SuggestionRow';
import { Spinner } from '../../components/Spinner';
import type { ItemCategory } from '../items/types';

const CATEGORIES: ItemCategory[] = ['Tincture', 'Food', 'Dye', 'Glamour', 'Housing', 'Materia', 'Minion'];

/**
 * Discover panel — the best untracked items to add, by category. Each section
 * runs the on-demand scan only when expanded, so opening Discover isn't a giant
 * fetch. One-click + track / dismiss per row, same as the watchlist strip.
 */
export function DiscoverView() {
  const supported = CATEGORIES.filter(categorySupportsSuggestions);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-2xl text-gold tracking-wide">Discover</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          The best untracked craftables to add to your watchlist, ranked by gil/day per category.
          Expand a category to scan it.
        </p>
      </div>
      {supported.map((cat) => <DiscoverSection key={cat} category={cat} />)}
    </div>
  );
}

function DiscoverSection({ category }: { category: ItemCategory }) {
  const [open, setOpen] = useState(false);
  const { run, notReady } = useCategorySuggestions();

  // Fire the scan the first time the section opens.
  useEffect(() => {
    if (open && !run.data && !run.isPending && !run.isError) run.mutate(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="border border-border-base bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={notReady}
        className="w-full flex items-center justify-between px-4 py-3 text-left disabled:opacity-50"
        title={notReady ? 'Loading catalogs…' : undefined}
      >
        <span className="font-display text-base text-text-cream tracking-wide">{category}</span>
        <span className="font-mono text-[10px] text-text-low">
          {run.data ? `${run.data.length} found` : ''} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-border-base">
          {run.isPending && <div className="py-3"><Spinner label={`Scanning ${category} crafts…`} /></div>}
          {run.isError && <div className="font-mono text-[11px] text-crimson py-2">{run.error.message}</div>}
          {run.data && run.data.length === 0 && (
            <div className="font-mono text-[11px] text-text-low italic py-3">
              No untracked {category.toLowerCase()} crafts worth suggesting right now.
            </div>
          )}
          {run.data && run.data.length > 0 && (
            <ul className="mt-1">{run.data.map((s) => <SuggestionRow key={s.id} s={s} />)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
