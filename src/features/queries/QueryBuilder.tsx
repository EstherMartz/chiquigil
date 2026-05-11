import type { ChangeEvent } from 'react';
import { ITEM_SEARCH_CATEGORIES, categoryLabel } from '../../lib/itemSearchCategories';
import type { HqMode, QueryFilter, QueryMode, QueryScope, QuerySort } from './types';

interface Props {
  value: QueryFilter;
  onChange: (next: QueryFilter) => void;
  onRun: () => void;
  busy?: boolean;
}

const SORTS: { id: QuerySort; label: string }[] = [
  { id: 'discount',  label: 'Discount %' },
  { id: 'gilFlow',   label: 'Gil / day' },
  { id: 'velocity',  label: 'Velocity' },
  { id: 'unitPrice', label: 'Unit price' },
];

export function QueryBuilder({ value, onChange, onRun, busy }: Props) {
  function patch(p: Partial<QueryFilter>) { onChange({ ...value, ...p }); }

  function toggleCat(id: number) {
    const set = new Set(value.searchCategories);
    set.has(id) ? set.delete(id) : set.add(id);
    patch({ searchCategories: [...set] });
  }

  function intInput(e: ChangeEvent<HTMLInputElement>): number {
    return Math.max(0, Number(e.target.value) || 0);
  }
  function nullableIntInput(e: ChangeEvent<HTMLInputElement>): number | null {
    const v = e.target.value.trim();
    return v === '' ? null : Math.max(0, Number(v) || 0);
  }

  return (
    <div className="border border-border-base bg-bg-card p-4 space-y-4">
      <div>
        <label className="font-mono text-[10px] tracking-widest text-text-low uppercase block mb-2">
          Categories ({value.searchCategories.length || 'all'})
        </label>
        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
          {ITEM_SEARCH_CATEGORIES.map((c) => {
            const on = value.searchCategories.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className={`font-mono text-[10px] px-2 py-1 border ${
                  on ? 'border-gold text-gold' : 'border-border-base text-text-low hover:text-aether'
                }`}
              >
                {categoryLabel(c.id)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">HQ</span>
          <select
            value={value.hq}
            onChange={(e) => patch({ hq: e.target.value as HqMode })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="hq">HQ</option>
            <option value="nq">NQ</option>
            <option value="either">Either</option>
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min discount %</span>
          <input
            type="number" min={0} max={99} value={value.minDealPct}
            onChange={(e) => patch({ minDealPct: Math.min(99, intInput(e)) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min velocity / day</span>
          <input
            type="number" min={0} step={0.5} value={value.minVelocity}
            onChange={(e) => patch({ minVelocity: intInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Sort by</span>
          <select
            value={value.sort}
            onChange={(e) => patch({ sort: e.target.value as QuerySort })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min price (gil)</span>
          <input
            type="number" min={0} step={1000}
            value={value.minPrice ?? ''}
            onChange={(e) => patch({ minPrice: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Max price (gil)</span>
          <input
            type="number" min={0} step={1000}
            value={value.maxPrice ?? ''}
            onChange={(e) => patch({ maxPrice: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Limit</span>
          <input
            type="number" min={1} max={1000} value={value.limit}
            onChange={(e) => patch({ limit: Math.max(1, Math.min(1000, intInput(e) || 100)) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <div className="flex items-end">
          <button
            onClick={onRun}
            disabled={busy}
            className="w-full font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50"
          >
            {busy ? 'Running…' : 'Run query'}
          </button>
        </div>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Scope</span>
          <select
            value={value.scope}
            onChange={(e) => patch({ scope: e.target.value as QueryScope })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="home">Home world</option>
            <option value="dc">DC</option>
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Max listings</span>
          <input
            type="number" min={0} step={1}
            value={value.maxListings ?? ''}
            onChange={(e) => patch({ maxListings: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Mode</span>
          <select
            value={value.mode}
            onChange={(e) => patch({ mode: e.target.value as QueryMode })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="standard">Standard</option>
            <option value="craft">Craft-flip</option>
            <option value="repost">Reposts</option>
          </select>
        </label>
      </div>
    </div>
  );
}
