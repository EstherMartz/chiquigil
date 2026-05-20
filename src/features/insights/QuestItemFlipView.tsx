import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useQuestSnapshot } from '../queries/useQuestSnapshot';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useMarketData } from '../watchlist/useMarketData';
import {
  runQuestItemFlip,
  DEFAULT_SORT_DIR,
  type HqMode,
  type QuestItemSort,
  type SortDir,
} from '../queries/runQuestItemFlip';
import { QuestItemFlipResults } from '../queries/QuestItemFlipResults';

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

  // Parse URL params into filter state
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

  // Sync filter state to URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (categorySearch) params.set('cat', categorySearch);
    if (hq !== 'hq') params.set('hq', hq);
    if (minListings > 0) params.set('min', minListings.toString());
    if (sortBy !== 'revenue' || sortDir !== 'desc') params.set('sort', `${sortBy}:${sortDir}`);
    setSearchParams(params, { replace: true });
  }, [search, categorySearch, hq, minListings, sortBy, sortDir, setSearchParams]);

  // Fetch data
  const questsQuery = useQuestSnapshot();
  const itemsQuery = useItemSnapshot();
  const quests = questsQuery.data?.snapshot ?? [];
  const items = itemsQuery.data?.items ?? [];

  // Build distinct category options sorted by quest count DESC then name ASC
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

  // Extract all item IDs from quests
  const allItemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const quest of quests) {
      for (const required of quest.requiredItems) {
        ids.add(required.itemId);
      }
    }
    return Array.from(ids);
  }, [quests]);

  // Fetch market data
  const marketQuery = useMarketData(allItemIds, world, dc);
  const market = marketQuery.data?.phantom ?? {};

  // Build items map
  const itemsById = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  // Run the flip analysis
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

  // Loading states
  const isLoading = questsQuery.isLoading || itemsQuery.isLoading || marketQuery.isLoading;

  if (isLoading) {
    return (
      <div className="font-mono text-xs text-text-low py-8 text-center">
        Loading quest data...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search item name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-2 py-1 bg-bg-input border border-border-low text-text-high placeholder-text-low text-xs rounded focus:outline-none focus:border-text-high"
          />
          <select
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            className="px-2 py-1 bg-bg-input border border-border-low text-text-high text-xs rounded focus:outline-none focus:border-text-high"
          >
            <option value="">All categories</option>
            {categoryOptions.map((opt) => (
              <option key={opt.name} value={opt.name}>
                {opt.name} ({opt.count})
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Min listings"
            value={minListings}
            onChange={(e) => setMinListings(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="px-2 py-1 bg-bg-input border border-border-low text-text-high placeholder-text-low text-xs rounded focus:outline-none focus:border-text-high w-24"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setHq('hq')}
            className={`px-3 py-1 text-xs rounded font-mono transition-colors ${
              hq === 'hq'
                ? 'bg-gold text-bg-base'
                : 'bg-bg-input border border-border-low text-text-high hover:border-text-high'
            }`}
          >
            HQ
          </button>
          <button
            onClick={() => setHq('nq')}
            className={`px-3 py-1 text-xs rounded font-mono transition-colors ${
              hq === 'nq'
                ? 'bg-gold text-bg-base'
                : 'bg-bg-input border border-border-low text-text-high hover:border-text-high'
            }`}
          >
            NQ
          </button>
          <button
            onClick={() => setHq('either')}
            className={`px-3 py-1 text-xs rounded font-mono transition-colors ${
              hq === 'either'
                ? 'bg-gold text-bg-base'
                : 'bg-bg-input border border-border-low text-text-high hover:border-text-high'
            }`}
          >
            Either
          </button>
        </div>
      </div>
      <QuestItemFlipResults
        rows={rows}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
      />
    </div>
  );
}
