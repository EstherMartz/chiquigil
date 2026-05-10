import { useState } from 'react';
import { useItemSearch } from '../items/useItemSearch';
import { useWatchlistStore } from '../items/watchlistStore';
import type { TrackedItem, CrafterCode, ItemCategory } from '../items/types';
import { Spinner } from '../../components/Spinner';

const CRAFTERS: CrafterCode[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL', 'ANY'];
const CATS: ItemCategory[] = ['Raid', 'Tincture', 'Food', 'Dye', 'Glamour', 'Housing', 'Materia', 'Minion'];

export function AddItemSearch() {
  const [q, setQ] = useState('');
  const [pendingCrafter, setPendingCrafter] = useState<CrafterCode>('LTW');
  const [pendingCat, setPendingCat] = useState<ItemCategory>('Glamour');
  const search = useItemSearch(q);
  const { customItems, addCustomItem, removeCustomItem } = useWatchlistStore();

  function add(row: { id: number; name: string; level: number }) {
    const item: TrackedItem = {
      id: row.id, name: row.name, lvl: row.level, crafter: pendingCrafter, cat: pendingCat,
    };
    addCustomItem(item);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-3 gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search XIVAPI… (min 2 chars)"
          className="col-span-3 sm:col-span-1 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm focus:outline-none focus:border-aether"
        />
        <select
          value={pendingCrafter}
          onChange={(e) => setPendingCrafter(e.target.value as CrafterCode)}
          className="bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          title="Tag added items with this crafter"
        >
          {CRAFTERS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={pendingCat}
          onChange={(e) => setPendingCat(e.target.value as ItemCategory)}
          className="bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          title="Tag added items with this category"
        >
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {search.isFetching && <Spinner label="Searching XIVAPI…" />}
      {search.isError && <div className="text-crimson font-mono text-xs">XIVAPI error: {(search.error as Error).message}</div>}

      <ul className="divide-y divide-border-base">
        {(search.data ?? []).map((row) => (
          <li key={row.id} className="py-2 flex justify-between items-center">
            <div>
              <div className="text-text-cream">{row.name}</div>
              <div className="font-mono text-[10px] text-text-low">id {row.id} · ilvl {row.level}</div>
            </div>
            <button
              onClick={() => add(row)}
              className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-1 hover:bg-aether hover:text-bg-deep"
            >
              + Add
            </button>
          </li>
        ))}
      </ul>

      <div>
        <h3 className="font-mono text-[10px] tracking-widest text-text-low uppercase mb-2">Your custom items</h3>
        {customItems.length === 0 ? (
          <div className="text-text-low text-sm italic">None yet.</div>
        ) : (
          <ul className="divide-y divide-border-base">
            {customItems.map((i) => (
              <li key={i.id} className="py-2 flex justify-between items-center">
                <div>
                  <div className="text-text-cream">{i.name}</div>
                  <div className="font-mono text-[10px] text-text-low">{i.crafter} · lvl {i.lvl} · {i.cat}</div>
                </div>
                <button
                  onClick={() => removeCustomItem(i.id)}
                  className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-3 py-1 hover:bg-crimson hover:text-bg-deep"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
