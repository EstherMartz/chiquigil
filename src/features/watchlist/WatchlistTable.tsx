import { useUiStore, type SortKey } from '../ui/uiStore';
import type { WatchlistRow } from './buildRows';
import { CraftTag } from './CraftTag';
import { fmtGil } from '../../lib/format';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';

const COLS: { key: SortKey; label: string; align?: 'right'; hideOnMobile?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Craft' },
  { key: 'lvl', label: 'Lvl', align: 'right', hideOnMobile: true },
  { key: 'dc', label: 'Sale', align: 'right' },
  { key: 'profit', label: 'Profit', align: 'right' },
  { key: 'gilDay', label: 'Gil/day', align: 'right' },
  { key: 'spd', label: 'Velocity', align: 'right', hideOnMobile: true },
];

export function WatchlistTable({ rows, onSelect }: { rows: WatchlistRow[]; onSelect: (id: number) => void }) {
  const { sortKey, sortDir, setSort } = useUiStore();
  const lm = useLoadMore(rows, 25);

  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-12 text-center text-text-low italic">
        No items match those filters.
      </div>
    );
  }

  return (
    <div className="border border-border-base bg-bg-card overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {COLS.map((c) => {
              const sorted = sortKey === c.key;
              const arrow = sorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
              return (
                <th
                  key={c.key}
                  onClick={() => setSort(c.key)}
                  className={`px-3 py-2 bg-bg-card-hi font-mono text-[10px] tracking-widest uppercase cursor-pointer select-none whitespace-nowrap sticky top-0 z-10 ${
                    sorted ? 'text-gold' : 'text-text-dim hover:text-aether'
                  } ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                >
                  {c.label}{arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {lm.visible.map((r) => (
            <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
              <td className="px-3 py-2.5">
                <button
                  onClick={() => onSelect(r.id)}
                  className="text-text-cream hover:text-aether text-left"
                >
                  {r.name}
                </button>
                <div className="font-mono text-[10px] text-text-low mt-0.5">
                  {r.cat}{r.subcat ? ` · ${r.subcat}` : ''}
                  {r.staleDays != null && r.staleDays > 3 && (
                    <span className="text-crimson ml-2">{r.staleDays.toFixed(0)}d stale</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5"><CraftTag crafter={r.crafter} status={r.craftStatus} /></td>
              <td className="px-3 py-2.5 font-mono text-right text-text-low hidden md:table-cell">{r.lvl}</td>
              <td className="px-3 py-2.5 font-mono text-right">
                {r.craftable === false
                  ? <span className="text-text-low text-[10px] tracking-widest uppercase">sale-only</span>
                  : r.dcMinHQ ? <>{fmtGil(r.dcMinHQ)} <span className="text-text-low text-[10px]">HQ</span></>
                  : r.dcMinNQ ? <>{fmtGil(r.dcMinNQ)} <span className="text-text-low text-[10px]">NQ</span></>
                  : <span className="text-text-low">—</span>}
              </td>
              <td className="px-3 py-2.5 font-mono text-right">
                {r.craftable === false
                  ? <span className="text-text-low">—</span>
                  : r.craftable === null
                    ? <span className="text-text-low">…</span>
                    : r.profit != null
                      ? <span className={r.profit > 0 ? 'text-jade' : 'text-crimson'}>{fmtGil(r.profit)}</span>
                      : <span className="text-text-low">—</span>}
              </td>
              <td className="px-3 py-2.5 font-mono text-right">
                {r.gilPerDay != null ? fmtGil(Math.round(r.gilPerDay)) : <span className="text-text-low">—</span>}
              </td>
              <td className="px-3 py-2.5 font-mono text-right hidden md:table-cell">{r.dcSpd.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <LoadMoreFooter
        hasMore={lm.hasMore}
        total={lm.total}
        shown={lm.shown}
        onLoadMore={lm.loadMore}
      />
    </div>
  );
}
