import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCraftLists, useDeleteList } from '../features/craftLists/useCraftLists';
import { SectionHeader } from '../components/SectionHeader';
import { btnPrimary, btnDanger } from '../components/buttonStyles';

function modifiedAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function YourLists() {
  const { data, isLoading, isError } = useCraftLists();
  const del = useDeleteList();
  const [filter, setFilter] = useState('');

  const lists = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data ?? []).filter((l) => l.name.toLowerCase().includes(q));
  }, [data, filter]);

  return (
    <div className="max-w-[80rem] mx-auto px-4 space-y-4">
      <SectionHeader
        label="Your Lists"
        trailing={<Link to="/craft-lists" className={btnPrimary}>+ New list</Link>}
      />
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Every crafting list you've built. Open to edit, or export to pull into the in-game plugin.
      </p>

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter lists…"
        className="w-full bg-bg-card border border-border-base text-text-cream font-mono text-xs px-3 py-2 focus:outline-none focus:border-aether"
      />

      {isLoading && <div className="p-8 text-center text-text-low font-mono text-xs">Loading…</div>}
      {isError && <div className="p-8 text-center text-crimson font-mono text-xs">Could not load lists.</div>}
      {!isLoading && !isError && lists.length === 0 && (
        <div className="p-8 text-center text-text-low font-mono text-xs italic">
          No lists yet. <Link to="/craft-lists" className="text-aether hover:underline">Build one →</Link>
        </div>
      )}

      <ul className="space-y-2">
        {lists.map((l) => (
          <li key={l.id} className="flex items-center gap-3 border border-border-base bg-bg-card px-3 py-2.5 hover:bg-bg-card-hi">
            <Link to={`/craft-lists/${l.id}`} className="grow">
              <div className="text-text-cream font-display italic">{l.name}</div>
              <div className="font-mono text-[10px] text-text-low">
                {l.itemCount} recipe{l.itemCount === 1 ? '' : 's'} · modified {modifiedAgo(l.updatedAt)}
              </div>
            </Link>
            <button
              onClick={() => { if (window.confirm(`Delete "${l.name}"?`)) del.mutate(l.id); }}
              className={btnDanger}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
