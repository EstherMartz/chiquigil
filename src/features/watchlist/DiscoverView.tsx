import { useEffect, useState, useRef } from 'react';
import { useCategorySuggestions } from './useCategorySuggestions';
import { categorySupportsSuggestions } from './categorySearchCats';
import { SuggestionRow } from './SuggestionRow';
import { ModeToggle } from './ModeToggle';
import { Spinner } from '../../components/Spinner';
import { useSelectedItems } from '../items/useSelectedItems';
import type { ItemCategory } from '../items/types';
import type { SuggestionMode } from './suggestions';

const CATEGORIES: ItemCategory[] = ['Tincture', 'Food', 'Dye', 'Glamour', 'Housing', 'Materia', 'Minion'];

/**
 * Discover panel — the best untracked items to add, by category. Each section
 * runs the on-demand scan only when expanded, so opening Discover isn't a giant
 * fetch. One-click + track / dismiss per row, same as the watchlist strip.
 *
 * Supports URL deep-linking:
 * - ?category=CategoryName — auto-opens the given category (case-insensitive) and scrolls it into view
 * - ?focus=gaps — auto-opens categories with < 3 tracked items
 */
export function DiscoverView({ category, focus }: { category?: string | null; focus?: string | null }) {
  const supported = CATEGORIES.filter(categorySupportsSuggestions);
  const selectedItems = useSelectedItems();
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute which categories should auto-open
  const autoOpen = new Set<ItemCategory>();
  if (category) {
    const normalized = category.toLowerCase();
    const match = supported.find((cat) => cat.toLowerCase() === normalized);
    if (match) {
      autoOpen.add(match);
    }
  }
  if (focus === 'gaps') {
    const countPerCategory = new Map<ItemCategory, number>();
    for (const cat of supported) {
      countPerCategory.set(cat, 0);
    }
    for (const item of selectedItems) {
      if (supported.includes(item.cat)) {
        countPerCategory.set(item.cat, (countPerCategory.get(item.cat) ?? 0) + 1);
      }
    }
    // <3 is intentional and matches the concentration banner's CTA (PRD FR-1.2:
    // "categories the user has fewer than 3 items tracked in"). The concentration
    // widget's own diversification list uses a stricter <2 (FR-1.3) — the two
    // thresholds serve different entry points by design; do not "reconcile" them.
    for (const cat of supported) {
      if ((countPerCategory.get(cat) ?? 0) < 3) {
        autoOpen.add(cat);
      }
    }
  }

  // Scroll to the target category if it was specified and matched
  useEffect(() => {
    if (category && containerRef.current) {
      const normalized = category.toLowerCase();
      const match = supported.find((cat) => cat.toLowerCase() === normalized);
      if (match) {
        const el = containerRef.current.querySelector(`#discover-${match}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [category, supported]);

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-2xl text-gold tracking-wide">Discover</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          The best untracked craftables to add to your watchlist, ranked by gil/day per category.
          Expand a category to scan it.
        </p>
      </div>
      {supported.map((cat) => (
        <DiscoverSection key={cat} category={cat} autoOpen={autoOpen.has(cat)} />
      ))}
    </div>
  );
}

function DiscoverSection({ category, autoOpen }: { category: ItemCategory; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [mode, setMode] = useState<SuggestionMode>('craft');
  const { run, notReady } = useCategorySuggestions();

  // Fire the scan the first time the section opens.
  useEffect(() => {
    if (open && !run.data && !run.isPending && !run.isError) run.mutate({ cat: category, mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function changeMode(m: SuggestionMode) {
    setMode(m);
    if (open) run.mutate({ cat: category, mode: m });
  }

  return (
    <div id={`discover-${category}`} className="border border-border-base bg-bg-card">
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
          <div className="mt-2 mb-1">
            <ModeToggle mode={mode} onChange={changeMode} />
          </div>
          {run.isPending && <div className="py-3"><Spinner label={`Scanning ${category} ${mode} plays…`} /></div>}
          {run.isError && <div className="font-mono text-[11px] text-crimson py-2">{run.error.message}</div>}
          {run.data && run.data.length === 0 && (
            <div className="font-mono text-[11px] text-text-low italic py-3">
              No untracked {category.toLowerCase()} {mode} plays worth suggesting right now.
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
