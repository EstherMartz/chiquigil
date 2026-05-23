import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useQuestSnapshot } from '../queries/useQuestSnapshot';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useMarketData } from '../watchlist/useMarketData';
import {
  runQuestItemFlip,
  countQuestItemCandidates,
  DEFAULT_SORT_DIR,
  type QuestItemSort,
  type SortDir,
} from '../queries/runQuestItemFlip';
import type { HqMode } from '../queries/types';
import { QuestItemFlipResults } from '../queries/QuestItemFlipResults';
import { Spinner } from '../../components/Spinner';

const SORT_KEYS: ReadonlySet<QuestItemSort> = new Set([
  'level', 'category', 'quest', 'item', 'qty', 'nq', 'hq', 'listings', 'velocity', 'revenue',
]);

function parseSortParam(raw: string | null): { sortBy: QuestItemSort; sortDir: SortDir } {
  if (!raw) return { sortBy: 'revenue', sortDir: 'desc' };
  const [keyPart, dirPart] = raw.split(':');
  const sortBy: QuestItemSort = SORT_KEYS.has(keyPart as QuestItemSort)
    ? (keyPart as QuestItemSort)
    : 'revenue';
  const sortDir: SortDir = dirPart === 'asc' || dirPart === 'desc'
    ? dirPart
    : DEFAULT_SORT_DIR[sortBy];
  return { sortBy, sortDir };
}

export function QuestItemFlipView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { world, dc } = useSettingsStore();

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [categorySearch, setCategorySearch] = useState(() => searchParams.get('cat') ?? '');
  const [hq, setHq] = useState<HqMode>(() => {
    const param = searchParams.get('hq');
    return param === 'nq' || param === 'either' ? param : 'hq';
  });
  const [minListings, setMinListings] = useState(() => {
    const param = searchParams.get('min');
    return param ? parseInt(param, 10) : 0;
  });
  const initialSort = parseSortParam(searchParams.get('sort'));
  const [sortBy, setSortBy] = useState<QuestItemSort>(initialSort.sortBy);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort.sortDir);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (categorySearch) params.set('cat', categorySearch);
    if (hq !== 'hq') params.set('hq', hq);
    if (minListings > 0) params.set('min', minListings.toString());
    if (sortBy !== 'revenue' || sortDir !== 'desc') params.set('sort', `${sortBy}:${sortDir}`);
    setSearchParams(params, { replace: true });
  }, [search, categorySearch, hq, minListings, sortBy, sortDir, setSearchParams]);

  const questsQuery = useQuestSnapshot();
  const itemsQuery = useItemSnapshot();
  const quests = questsQuery.data?.snapshot ?? [];
  const items = itemsQuery.data?.items ?? [];

  const itemsById = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const quest of quests) {
      if (!quest.categoryName) continue;
      counts.set(quest.categoryName, (counts.get(quest.categoryName) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [quests]);

  const allItemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const quest of quests) {
      for (const required of quest.requiredItems) {
        ids.add(required.itemId);
      }
    }
    return Array.from(ids);
  }, [quests]);

  const marketQuery = useMarketData(allItemIds, world, dc);
  const market = marketQuery.data?.phantom ?? {};

  const totalCandidates = useMemo(
    () => countQuestItemCandidates(quests, itemsById),
    [quests, itemsById],
  );

  const rows = useMemo(() => {
    return runQuestItemFlip(quests, itemsById, market, {
      hq,
      minListings,
      search,
      categorySearch,
      sortBy,
      sortDir,
    });
  }, [quests, itemsById, market, hq, minListings, search, categorySearch, sortBy, sortDir]);

  function handleSort(key: QuestItemSort) {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir(DEFAULT_SORT_DIR[key]);
    }
  }

  const isLoading = questsQuery.isLoading || itemsQuery.isLoading || marketQuery.isLoading;

  return (
    <div className="space-y-4">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        categorySearch={categorySearch}
        onCategoryChange={setCategorySearch}
        categoryOptions={categoryOptions}
        minListings={minListings}
        onMinListingsChange={setMinListings}
        hq={hq}
        onHqChange={setHq}
        sortBy={sortBy}
        onSortByChange={(key) => {
          setSortBy(key);
          setSortDir(DEFAULT_SORT_DIR[key]);
        }}
      />

      {isLoading && <Spinner label="Loading quest data…" />}

      {!isLoading && (
        <QuestItemFlipResults
          rows={rows}
          totalCandidates={totalCandidates}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
        />
      )}
    </div>
  );
}

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  categorySearch: string;
  onCategoryChange: (v: string) => void;
  categoryOptions: { name: string; count: number }[];
  minListings: number;
  onMinListingsChange: (n: number) => void;
  hq: HqMode;
  onHqChange: (m: HqMode) => void;
  sortBy: QuestItemSort;
  onSortByChange: (k: QuestItemSort) => void;
}

function FilterBar({
  search, onSearchChange,
  categorySearch, onCategoryChange, categoryOptions,
  minListings, onMinListingsChange,
  hq, onHqChange,
  sortBy, onSortByChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low">Item search</span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Maple, Linseed…"
          className="mt-1 block w-48 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm placeholder:text-text-low"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low">Category</span>
        <select
          value={categorySearch}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="mt-1 block w-56 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        >
          <option value="">All categories</option>
          {categoryOptions.map((opt) => (
            <option key={opt.name} value={opt.name}>
              {opt.name} ({opt.count})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low">Min listings</span>
        <input
          type="number" min={0} step={1} value={minListings}
          onChange={(e) => onMinListingsChange(Math.max(0, Number(e.target.value) || 0))}
          className="mt-1 block w-24 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-widest text-text-low">HQ mode</span>
        <div className="flex gap-2">
          {(['nq', 'hq', 'either'] as HqMode[]).map((mode) => (
            <button
              key={mode} type="button"
              onClick={() => onHqChange(mode)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
                hq === mode ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              {mode === 'either' ? 'Either' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low">Sort by</span>
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as QuestItemSort)}
          className="mt-1 block bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        >
          <option value="revenue">Revenue</option>
          <option value="velocity">Sales/day</option>
          <option value="listings">Listings</option>
          <option value="hq">HQ price</option>
          <option value="nq">NQ price</option>
          <option value="qty">Quantity</option>
          <option value="level">Level</option>
          <option value="category">Category</option>
          <option value="quest">Quest</option>
          <option value="item">Item</option>
        </select>
      </label>
    </div>
  );
}
