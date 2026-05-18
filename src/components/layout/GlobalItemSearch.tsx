import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useItemSnapshot } from '../../features/queries/useItemSnapshot';
import { categoryLabel } from '../../lib/itemSearchCategories';

const MAX_RESULTS = 8;
const MIN_QUERY_LEN = 2;

/**
 * Friendly aliases the user might type that don't appear in item names but
 * map cleanly to an ItemSearchCategory. e.g. typing "fish" should surface
 * Seafood items (Salmon, Tuna, …) rather than only items literally named
 * "Goldfish" / "Fishhook Cricket".
 */
const CATEGORY_ALIASES: Record<string, number> = {
  fish: 46, seafood: 46, fishing: 46,
  food: 45, meal: 45, meals: 45,
  tincture: 43, potion: 43, medicine: 43,
  dye: 54, dyes: 54,
  materia: 57,
  minion: 75, minions: 75,
  reagent: 53, reagents: 53,
  crystal: 58, crystals: 58, shard: 58, shards: 58,
};

/**
 * Header-mounted combobox: search any item in the local snapshot and jump to
 * its detail page. Bounded to 8 results — no infinite stack of full-row cards.
 */
export function GlobalItemSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const snapshot = useItemSnapshot();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const blurTimer = useRef<number | undefined>(undefined);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < MIN_QUERY_LEN || !snapshot.data) return [];
    const aliasSc = CATEGORY_ALIASES[query];
    const out: typeof snapshot.data.items = [];
    const seen = new Set<number>();
    // Pass 1: name substring matches.
    for (const item of snapshot.data.items) {
      if (item.name.toLowerCase().includes(query)) {
        out.push(item);
        seen.add(item.id);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    // Pass 2: category alias matches (e.g. "fish" → SC 46 Seafood). Backfills
    // when the user typed a category word that isn't in any item name.
    if (out.length < MAX_RESULTS && aliasSc != null) {
      for (const item of snapshot.data.items) {
        if (seen.has(item.id)) continue;
        if (item.sc === aliasSc) {
          out.push(item);
          if (out.length >= MAX_RESULTS) break;
        }
      }
    }
    return out;
  }, [q, snapshot.data]);

  // Close dropdown on route change.
  useEffect(() => {
    setOpen(false);
    setQ('');
  }, [location.pathname]);

  // Keep the cursor in range when results change.
  useEffect(() => {
    if (cursor >= results.length) setCursor(0);
  }, [results.length, cursor]);

  function pick(id: number) {
    setOpen(false);
    setQ('');
    navigate(`/item/${id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick0 = results[cursor];
      if (pick0) pick(pick0.id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const tooShort = q.trim().length > 0 && q.trim().length < MIN_QUERY_LEN;
  const showDropdown = open && (results.length > 0 || tooShort || snapshot.isLoading || (q.trim().length >= MIN_QUERY_LEN && snapshot.data));

  return (
    <div className="relative w-full sm:w-72">
      <input
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setCursor(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Defer so clicks on dropdown rows register before close.
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search items…"
        aria-label="Search items"
        className="w-full bg-bg-card border border-border-base text-text-cream font-mono text-xs px-3 py-2 focus:outline-none focus:border-aether"
      />
      {showDropdown && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-40 border border-border-hi bg-bg-card-hi shadow-lg max-h-80 overflow-y-auto"
        >
          {tooShort && (
            <li className="px-3 py-2 font-mono text-[10px] text-text-low italic">Type at least {MIN_QUERY_LEN} characters…</li>
          )}
          {!tooShort && snapshot.isLoading && (
            <li className="px-3 py-2 font-mono text-[10px] text-text-low italic">Loading item catalog…</li>
          )}
          {!tooShort && !snapshot.isLoading && results.length === 0 && q.trim().length >= MIN_QUERY_LEN && (
            <li className="px-3 py-2 font-mono text-[10px] text-text-low italic">No matches.</li>
          )}
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === cursor}
              onMouseDown={(e) => { e.preventDefault(); pick(r.id); }}
              onMouseEnter={() => setCursor(i)}
              className={`px-3 py-2 cursor-pointer flex items-baseline gap-3 ${
                i === cursor ? 'bg-bg-card text-gold' : 'text-text-cream hover:bg-bg-card'
              }`}
            >
              {r.ilvl > 1 && (
                <span className="font-mono text-[10px] tracking-widest text-gold tabular-nums shrink-0">i{r.ilvl}</span>
              )}
              <span className="truncate flex-1">{r.name}</span>
              <span className="font-mono text-[10px] text-text-low shrink-0">{categoryLabel(r.sc)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
