import { useMemo, useState } from 'react';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { categoryLabel } from '../lib/itemSearchCategories';
import { ComparePathsSection } from '../features/compare/ComparePathsSection';

const MAX_RESULTS = 8;
const MIN_QUERY_LEN = 2;

export default function Compare() {
  const snapshot = useItemSnapshot();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < MIN_QUERY_LEN || !snapshot.data) return [];
    const out: typeof snapshot.data.items = [];
    for (const item of snapshot.data.items) {
      if (item.name.toLowerCase().includes(query)) {
        out.push(item);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [q, snapshot.data]);

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-text-cream mb-1">Compare Paths</h1>
        <p className="text-text-low text-sm">
          Look up an item to see whether to sell it raw, vendor it, or craft it — side by side.
        </p>
      </div>

      <div className="relative w-full sm:w-96">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items…"
          aria-label="Search items to compare"
          className="w-full bg-bg-card border border-border-base text-text-cream font-mono text-sm px-3 py-2 focus:outline-none focus:border-aether"
        />
        {results.length > 0 && q.trim().length >= MIN_QUERY_LEN && (
          <ul className="absolute left-0 right-0 top-full mt-1 z-40 border border-border-hi bg-bg-card-hi shadow-lg max-h-80 overflow-y-auto">
            {results.map((r) => (
              <li
                key={r.id}
                onMouseDown={(e) => { e.preventDefault(); setSelected({ id: r.id, name: r.name }); setQ(r.name); }}
                className="px-3 py-2 cursor-pointer flex items-baseline gap-3 text-text-cream hover:bg-bg-card hover:text-gold"
              >
                {r.ilvl > 1 && <span className="font-mono text-[10px] tracking-widest text-gold tabular-nums shrink-0">i{r.ilvl}</span>}
                <span className="truncate flex-1">{r.name}</span>
                <span className="font-mono text-[10px] text-text-low shrink-0">{categoryLabel(r.sc)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ComparePathsSection itemId={selected?.id ?? null} />
    </div>
  );
}
