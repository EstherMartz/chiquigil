import { useUiStore, type SortKey } from '../ui/uiStore';
import type { WatchlistRow } from './buildRows';
import { CraftTag } from './CraftTag';
import { ScoreBar } from './ScoreBar';
import { fmtGil } from '../../lib/format';

const COLS: { key: SortKey; label: string; align?: 'right'; hideOnMobile?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Craft' },
  { key: 'lvl', label: 'Lvl', align: 'right', hideOnMobile: true },
  { key: 'phantom', label: 'Phantom', align: 'right', hideOnMobile: true },
  { key: 'dc', label: 'Chaos DC min', align: 'right' },
  { key: 'spd', label: 'DC sales/day', align: 'right', hideOnMobile: true },
  { key: 'score', label: 'Score', align: 'right' },
];

export function WatchlistTable({ rows }: { rows: WatchlistRow[] }) {
  const { sortKey, sortDir, setSort } = useUiStore();

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
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
              <td className="px-3 py-2.5">
                <a
                  href={`https://universalis.app/market/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-cream hover:border-b hover:border-aether border-b border-transparent"
                >
                  {r.name}
                </a>
                <div className="font-mono text-[10px] text-text-low mt-0.5">
                  {r.cat}{r.subcat ? ` · ${r.subcat}` : ''}
                  {r.staleDays != null && r.staleDays > 3 && (
                    <span className="text-crimson ml-2">{r.staleDays.toFixed(0)}d stale</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5"><CraftTag crafter={r.crafter} status={r.craftStatus} /></td>
              <td className="px-3 py-2.5 font-mono text-right text-text-low hidden md:table-cell">{r.lvl}</td>
              <td className="px-3 py-2.5 font-mono text-right hidden md:table-cell">
                {r.pAvgHQ ? <>{fmtGil(r.pAvgHQ)} <span className="text-text-low text-[10px]">avg HQ</span></>
                  : r.pAvgNQ ? <>{fmtGil(r.pAvgNQ)} <span className="text-text-low text-[10px]">avg NQ</span></>
                  : r.pMinNQ ? <>{fmtGil(r.pMinNQ)} <span className="text-text-low text-[10px]">list NQ</span></>
                  : <span className="text-text-low">—</span>}
              </td>
              <td className="px-3 py-2.5 font-mono text-right">
                {r.dcMinHQ ? <>{fmtGil(r.dcMinHQ)} <span className="text-text-low text-[10px]">HQ</span></>
                  : r.dcMinNQ ? <>{fmtGil(r.dcMinNQ)} <span className="text-text-low text-[10px]">NQ</span></>
                  : <span className="text-text-low">—</span>}
              </td>
              <td className="px-3 py-2.5 font-mono text-right hidden md:table-cell">{r.dcSpd.toFixed(1)}</td>
              <td className="px-3 py-2.5 text-right"><ScoreBar score={r.score} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
