import type { WatchlistRow } from './buildRows';
import type { SortKey, SortDir } from '../ui/uiStore';

export interface FilterSortOpts {
  catFilter: string;
  craftFilter: string;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
}

function getSortValue(r: WatchlistRow, key: SortKey): string | number {
  switch (key) {
    case 'name': return r.name;
    case 'crafter': return r.crafter;
    case 'lvl': return r.lvl;
    case 'phantom': return r.pAvgHQ ?? r.pAvgNQ ?? r.pMinNQ ?? 0;
    case 'dc': return r.dcMinHQ ?? r.dcMinNQ ?? 0;
    case 'spd': return r.dcSpd;
    case 'score':
    default: return r.rawScore;
  }
}

export function filterAndSort(rows: WatchlistRow[], opts: FilterSortOpts): WatchlistRow[] {
  let out = rows;
  if (opts.catFilter !== 'All') out = out.filter((r) => r.cat === opts.catFilter);
  if (opts.craftFilter !== 'All') out = out.filter((r) => r.crafter === opts.craftFilter);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    out = out.filter((r) => r.name.toLowerCase().includes(q));
  }
  const dir = opts.sortDir === 'asc' ? 1 : -1;
  return [...out].sort((a, b) => {
    const av = getSortValue(a, opts.sortKey);
    const bv = getSortValue(b, opts.sortKey);
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
    return ((av as number) - (bv as number)) * dir;
  });
}
