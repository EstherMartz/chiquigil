import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { ITEM_SEARCH_CATEGORIES, categoryLabel } from '../../lib/itemSearchCategories';
import type { HqMode, QueryFilter, QueryMode, QueryScope, QuerySort } from './types';
import { btnPrimary } from '../../components/buttonStyles';
import { CategorySelect } from '../../components/CategorySelect';

interface Props {
  value: QueryFilter;
  onChange: (next: QueryFilter) => void;
  onRun: () => void;
  busy?: boolean;
  /** True when the live filter differs from the last run — shows a refresh hint. */
  stale?: boolean;
}

const SORTS: { id: QuerySort; label: string }[] = [
  { id: 'discount',  label: 'Discount %' },
  { id: 'gilFlow',   label: 'Gil/day' },
  { id: 'velocity',  label: 'Velocity' },
  { id: 'unitPrice', label: 'Unit price' },
];

export function QueryBuilder({ value, onChange, onRun, busy, stale }: Props) {
  const [copied, setCopied] = useState(false);

  function patch(p: Partial<QueryFilter>) { onChange({ ...value, ...p }); }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
        <label className="font-mono text-[13px] tracking-widest text-text-low block mb-2">
          Categories ({value.searchCategories.length || 'all'})
        </label>
        <CategorySelect
          categories={ITEM_SEARCH_CATEGORIES.map((c) => ({ id: c.id, name: categoryLabel(c.id) }))}
          selected={value.searchCategories}
          onChange={(ids) => patch({ searchCategories: ids })}
          placeholder="Search categories…"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">HQ</span>
          <select
            value={value.hq}
            onChange={(e) => patch({ hq: e.target.value as HqMode })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          >
            <option value="hq">HQ</option>
            <option value="nq">NQ</option>
            <option value="either">Either</option>
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Min discount %</span>
          <input
            type="number" inputMode="decimal" min={0} max={99} value={value.minDealPct}
            onChange={(e) => patch({ minDealPct: Math.min(99, intInput(e)) })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Min velocity / day</span>
          <input
            type="number" inputMode="decimal" min={0} step={0.5} value={value.minVelocity}
            onChange={(e) => patch({ minVelocity: intInput(e) })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Sort by</span>
          <select
            value={value.sort}
            onChange={(e) => patch({ sort: e.target.value as QuerySort })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Min price (gil)</span>
          <input
            type="number" inputMode="decimal" min={0} step={1000}
            value={value.minPrice ?? ''}
            onChange={(e) => patch({ minPrice: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Max price (gil)</span>
          <input
            type="number" inputMode="decimal" min={0} step={1000}
            value={value.maxPrice ?? ''}
            onChange={(e) => patch({ maxPrice: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Limit</span>
          <input
            type="number" inputMode="decimal" min={1} max={1000} value={value.limit}
            onChange={(e) => patch({ limit: Math.max(1, Math.min(1000, intInput(e) || 100)) })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>

        <div className="flex items-end gap-2">
          <div className="flex-1 flex flex-col gap-1">
            {stale && !busy && (
              <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80">
                Filters changed — Run scan to refresh
              </span>
            )}
            <button
              onClick={onRun}
              disabled={busy}
              className={`${btnPrimary} w-full`}
            >
              {busy ? 'Running…' : 'Run scan'}
            </button>
          </div>
          <button
            onClick={handleCopyLink}
            className="font-mono text-[10px] tracking-widest uppercase border border-border-hi text-text-cream px-3 py-2 hover:border-aether hover:text-aether transition-colors whitespace-nowrap"
            title="Copy a shareable link to the current query"
          >
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Scope</span>
          <select
            value={value.scope}
            onChange={(e) => patch({ scope: e.target.value as QueryScope })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          >
            <option value="home">Home world</option>
            <option value="dc">DC</option>
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Max listings</span>
          <input
            type="number" inputMode="decimal" min={0} step={1}
            value={value.maxListings ?? ''}
            onChange={(e) => patch({ maxListings: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Min gap (gil)</span>
          <input
            type="number" inputMode="decimal" min={0} step={1000}
            value={value.minGap ?? ''}
            onChange={(e) => patch({ minGap: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
            title="Absolute gil floor for repost gap"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Mode</span>
          <select
            value={value.mode}
            onChange={(e) => patch({ mode: e.target.value as QueryMode })}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          >
            <option value="standard">Standard</option>
            <option value="craft">Craft-flip</option>
            <option value="repost">Reposts</option>
          </select>
        </label>

        {value.mode === 'craft' && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.trainedEye}
              onChange={(e) => patch({ trainedEye: e.target.checked })}
            />
            <span className="font-mono text-[10px] tracking-widest text-text-low" title="Recipes you can auto-HQ with the level 80 Trained Eye skill (recipe level ≤ crafter level − 10)">
              Trained Eye only
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
