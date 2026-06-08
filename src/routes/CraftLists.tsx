import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useRecipeSnapshot } from '../features/queries/useRecipeSnapshot';
import { useCreateList, useCraftLists } from '../features/craftLists/useCraftLists';
import { SectionHeader } from '../components/SectionHeader';
import { HqStar } from '../components/HqStar';
import { crafterBeadClass } from '../features/items/crafterColors';
import { btnPrimary, btnSecondary, btnGhost } from '../components/buttonStyles';
import type { CraftListItem } from '../features/craftLists/types';

const MAX_RESULTS = 50;

interface Selected { qty: number; isHq: boolean; name: string }

export default function CraftLists() {
  const navigate = useNavigate();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot(true);
  const createList = useCreateList();
  const savedLists = useCraftLists();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Map<number, Selected>>(new Map());

  // Show saved lists on the builder page when the user isn't mid-search or
  // mid-selection (mirrors Projects) — so landing here surfaces existing work
  // rather than a lone search box. Most-recent first, capped to a preview.
  const idle = query.trim().length < 2 && selected.size === 0;
  const recentLists = useMemo(
    () => [...(savedLists.data ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [savedLists.data],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !snapshot.data) return { rows: [] as { id: number; name: string; canHq: boolean }[], total: 0 };
    const rows: { id: number; name: string; canHq: boolean }[] = [];
    let total = 0;
    for (const it of snapshot.data.items) {
      if (!it.name.toLowerCase().includes(q)) continue;
      total++;
      if (rows.length < MAX_RESULTS) rows.push({ id: it.id, name: it.name, canHq: it.canHq });
    }
    return { rows, total };
  }, [query, snapshot.data]);

  const recipeFor = (id: number) => recipes.data?.get(id) ?? null;

  function toggle(id: number, name: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { qty: 1, isHq: false, name });
      return next;
    });
  }
  function setQty(id: number, qty: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, qty: Math.max(1, qty) });
      return next;
    });
  }
  function selectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of results.rows) if (!next.has(r.id)) next.set(r.id, { qty: 1, isHq: false, name: r.name });
      return next;
    });
  }
  function clearAll() { setSelected(new Map()); }

  async function createFromSelection() {
    if (selected.size === 0) return;
    const name = window.prompt('Name this list:')?.trim();
    if (!name) return;
    const items: CraftListItem[] = [...selected.entries()].map(([itemId, s]) => ({
      itemId, itemName: s.name, qty: s.qty, isHq: s.isHq,
    }));
    const id = await createList.mutateAsync({ name, items });
    navigate(`/craft-lists/${id}`);
  }

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <SectionHeader
        label="Craft Lists"
        trailing={<Link to="/craft-lists/saved" className={btnGhost}>All lists →</Link>}
      />
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Search items, check what you want to make, then build a list — no node timers, just the items.
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search items…"
        className="w-full bg-bg-card border border-border-base text-text-cream font-mono text-sm px-3 py-2.5 focus:outline-none focus:border-aether"
      />

      {/* Saved lists — shown on landing so existing work is one click away. */}
      {idle && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Your lists</span>
            {(savedLists.data?.length ?? 0) > recentLists.length && (
              <Link to="/craft-lists/saved" className="font-mono text-[10px] text-aether hover:underline">
                View all {savedLists.data!.length} →
              </Link>
            )}
          </div>
          {savedLists.isLoading && (
            <div className="p-6 text-center text-text-low font-mono text-xs">Loading lists…</div>
          )}
          {savedLists.isError && (
            <div className="border border-border-base bg-bg-card p-6 text-center text-crimson font-mono text-xs">
              Couldn't load saved lists — the Discord bot may be down.
            </div>
          )}
          {!savedLists.isLoading && !savedLists.isError && recentLists.length === 0 && (
            <div className="border border-border-base bg-bg-card p-8 text-center text-text-low font-mono text-xs italic">
              No saved lists yet — search for items above and build your first one.
            </div>
          )}
          {recentLists.length > 0 && (
            <ul className="space-y-2">
              {recentLists.map((l) => (
                <li key={l.id} className="border border-border-base bg-bg-card hover:bg-bg-card-hi">
                  <Link to={`/craft-lists/${l.id}`} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-text-cream font-display italic">{l.name}</span>
                    <span className="font-mono text-[10px] text-text-low">
                      {l.itemCount} recipe{l.itemCount === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Selected tray */}
      {selected.size > 0 && (
        <div className="border border-gold/60 bg-bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-widest uppercase text-gold">
              {selected.size} item{selected.size === 1 ? '' : 's'} selected
            </span>
            <div className="flex gap-2">
              <button onClick={clearAll} className={btnGhost}>Clear all</button>
              <button onClick={createFromSelection} disabled={createList.isPending} className={btnPrimary}>
                Create list from selection →
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...selected.entries()].map(([id, s]) => (
              <div key={id} className="flex items-center gap-1.5 border border-border-base bg-bg-card-hi px-2 py-1">
                <span className="text-text-cream text-xs">{s.name}</span>
                <input
                  type="number" min={1} value={s.qty}
                  aria-label={`Qty for ${s.name}`}
                  onChange={(e) => setQty(id, parseInt(e.target.value) || 1)}
                  className="w-12 bg-bg-card border border-border-base text-text-cream font-mono text-xs px-1 py-0.5"
                />
                <button onClick={() => toggle(id, s.name)} aria-label={`Remove ${s.name}`} className="text-text-low hover:text-crimson px-1">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results.rows.length > 0 && (
        <div className="border border-border-base bg-bg-card">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-base">
            <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">
              {results.total} match{results.total === 1 ? '' : 'es'}
              {results.total > MAX_RESULTS && ` — showing first ${MAX_RESULTS}, refine to narrow`}
            </span>
            <button onClick={selectAll} className={btnSecondary}>Select all results</button>
          </div>
          <ul>
            {results.rows.map((r) => {
              const recipe = recipeFor(r.id);
              const checked = selected.has(r.id);
              return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-border-base hover:bg-bg-card-hi first:border-t-0">
                  <input type="checkbox" checked={checked} onChange={() => toggle(r.id, r.name)} aria-label={`Select ${r.name}`} />
                  <span className="text-text-cream grow">{r.name}{r.canHq && <HqStar leading />}</span>
                  {recipe && (
                    <span className="font-mono text-[10px] text-text-low flex items-center gap-2">
                      <span className={`${crafterBeadClass(recipe.classJob)}`}>●</span>
                      Lv{recipe.recipeLevel}
                      {recipe.stats?.stars ? <span className="text-gold">{'★'.repeat(recipe.stats.stars)}</span> : null}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {query.trim().length >= 2 && results.rows.length === 0 && (
        <div className="p-8 text-center text-text-low font-mono text-xs italic">No items match "{query}".</div>
      )}
    </div>
  );
}
