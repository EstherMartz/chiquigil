import { Link } from 'react-router-dom';
import { useUiStore, rowPadClass, type SortKey } from '../ui/uiStore';
import type { WatchlistRow } from './buildRows';
import { CraftTag } from './CraftTag';
import { fmtGil } from '../../lib/format';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import { CATEGORY_TO_TRADING_PRESET } from './categoryPresetMap';
import { MarketStateBadge } from '../../components/MarketStateBadge';
import { ExportCsvButton } from '../../components/ExportCsvButton';
import { CopyButton } from '../../components/CopyButton';
import type { CsvColumn } from '../../lib/csv';

const COLS: { key: SortKey; label: string; align?: 'right'; hideOnMobile?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Craft' },
  { key: 'lvl', label: 'Lvl', align: 'right', hideOnMobile: true },
  { key: 'dc', label: 'Sale', align: 'right' },
  { key: 'trend', label: 'Trend', hideOnMobile: true },
  { key: 'profit', label: 'Profit', align: 'right' },
  { key: 'gilDay', label: 'Gil/day', align: 'right' },
  { key: 'spd', label: 'Velocity', align: 'right', hideOnMobile: true },
];

const WATCHLIST_CSV_COLUMNS: CsvColumn<WatchlistRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Crafter' },
  { key: 'lvl', label: 'Level' },
  { key: 'cat', label: 'Category' },
  { key: 'dcMinNQ', label: 'DC Min NQ', value: (r) => r.dcMinNQ ?? 'N/A' },
  { key: 'dcMinHQ', label: 'DC Min HQ', value: (r) => r.dcMinHQ ?? 'N/A' },
  { key: 'pMinNQ', label: 'Phantom Min NQ', value: (r) => r.pMinNQ ?? 'N/A' },
  { key: 'pMinHQ', label: 'Phantom Min HQ', value: (r) => r.pMinHQ ?? 'N/A' },
  { key: 'pAvgNQ', label: 'Phantom Avg NQ', value: (r) => r.pAvgNQ ?? 'N/A' },
  { key: 'pAvgHQ', label: 'Phantom Avg HQ', value: (r) => r.pAvgHQ ?? 'N/A' },
  { key: 'dcSpd', label: 'DC Velocity' },
  { key: 'delta', label: 'Trend', value: (r) => r.delta ?? 'N/A' },
  { key: 'materialCost', label: 'Material Cost', value: (r) => r.materialCost ?? 'N/A' },
  { key: 'profit', label: 'Profit', value: (r) => r.profit ?? 'N/A' },
  { key: 'gilPerDay', label: 'Gil/day', value: (r) => r.gilPerDay ?? 'N/A' },
];

export function WatchlistTable({ rows, onSelect }: { rows: WatchlistRow[]; onSelect: (id: number) => void }) {
  const { catFilter, sortKey, sortDir, setSort, density } = useUiStore();
  const lm = useLoadMore(rows, 25);
  const rowY = rowPadClass(density);

  if (rows.length === 0) {
    const presetId = CATEGORY_TO_TRADING_PRESET[catFilter];
    return (
      <div className="border border-border-base bg-bg-card p-12 text-center text-text-low italic">
        <div className="text-aether/70 mb-1 text-[18px]" aria-hidden>❖</div>
        <div>The page is blank for this filter.</div>
        {presetId && (
          <Link
            to={`/trading?preset=${presetId}`}
            className="not-italic mt-3 inline-block font-mono text-[11px] tracking-widest uppercase text-aether hover:text-gold transition-colors"
          >
            Scry the market for top {catFilter.toLowerCase()} →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="border border-border-base bg-bg-card">
      <div className="flex justify-between items-center px-3 py-2 border-b border-border-base">
        <div className="text-text-low font-mono text-[11px]">
          {lm.shown} of {lm.total}
        </div>
        <ExportCsvButton rows={rows} columns={WATCHLIST_CSV_COLUMNS} filename={`watchlist-${new Date().toISOString().slice(0, 10)}.csv`} />
      </div>
      <div className="overflow-x-auto">
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
              <td className={`px-3 ${rowY}`}>
                <div className="flex items-baseline gap-2">
                  <Link
                    to={`/item/${r.id}`}
                    className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 text-left"
                  >
                    {r.name}
                  </Link>
                  <CopyButton text={r.name} />
                  <button
                    onClick={() => onSelect(r.id)}
                    className="font-mono text-[10px] text-text-low hover:text-aether transition-colors shrink-0"
                    title="Per-item recipe settings (craft intermediates, craft time, history)"
                    aria-label="Open per-item settings"
                  >
                    ⚙
                  </button>
                </div>
                <div className="font-mono text-[10px] text-text-low mt-0.5">
                  {r.cat}{r.subcat ? ` · ${r.subcat}` : ''}
                  {r.staleDays != null && r.staleDays > 3 && (
                    <span className="text-crimson ml-2">{r.staleDays.toFixed(0)}d stale</span>
                  )}
                </div>
              </td>
              <td className={`px-3 ${rowY}`}><CraftTag crafter={r.crafter} status={r.craftStatus} /></td>
              <td className={`px-3 ${rowY} font-mono text-right text-text-low hidden md:table-cell`}>{r.lvl}</td>
              <td className={`px-3 ${rowY} font-mono text-right`}>
                {r.craftable === false
                  ? <span className="text-text-low text-[10px] tracking-widest uppercase">sale-only</span>
                  : r.dcMinHQ ? <>{fmtGil(r.dcMinHQ)} <span className="text-text-low text-[10px]">HQ</span></>
                  : r.dcMinNQ ? <>{fmtGil(r.dcMinNQ)} <span className="text-text-low text-[10px]">NQ</span></>
                  : <span className="text-text-low">—</span>}
              </td>
              <td className={`px-3 ${rowY} hidden md:table-cell`}>
                <MarketStateBadge delta={r.delta} listings={r.pListings} />
              </td>
              <td className={`px-3 ${rowY} font-mono text-right`}>
                {r.craftable === false
                  ? <span className="text-text-low">—</span>
                  : r.craftable === null
                    ? <span className="text-text-low">…</span>
                    : r.profit != null
                      ? <span className={r.profit > 0 ? 'text-jade' : 'text-crimson'}>{fmtGil(r.profit)}</span>
                      : <span className="text-text-low">—</span>}
              </td>
              <td className={`px-3 ${rowY} font-mono text-right`}>
                {r.gilPerDay != null ? fmtGil(Math.round(r.gilPerDay)) : <span className="text-text-low">—</span>}
              </td>
              <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.dcSpd.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <LoadMoreFooter
        hasMore={lm.hasMore}
        total={lm.total}
        shown={lm.shown}
        onLoadMore={lm.loadMore}
      />
    </div>
  );
}
