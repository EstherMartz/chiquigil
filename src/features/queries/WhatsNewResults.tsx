import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { WhatsNewRow, WhatsNewSort, WhatsNewTab } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: WhatsNewRow[];
  totalCandidates: number;
  skippedChunks: number;
  tab: WhatsNewTab;
  sort: WhatsNewSort;
  onSortChange: (next: WhatsNewSort) => void;
}

const CSV_COLUMNS: CsvColumn<WhatsNewRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'craftable', label: 'Craftable', value: (r) => (r.craftable ? 'yes' : '') },
  { key: 'price', label: 'Price', value: (r) => r.price ?? '' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'recentSales', label: 'Recent sales' },
  { key: 'lastSaleMs', label: 'Days since last sale', value: (r) => (r.daysSinceLastSale == null ? '' : Math.round(r.daysSinceLastSale)) },
];

function lastSold(r: WhatsNewRow): string {
  if (r.daysSinceLastSale == null) return '—';
  const d = Math.round(r.daysSinceLastSale);
  return d <= 0 ? 'today' : `${d}d ago`;
}

function SortableHeader({ active, onClick, children, hideOnMobile = false }: {
  active: boolean; onClick: () => void; children: React.ReactNode; hideOnMobile?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-right ${hideOnMobile ? 'hidden md:table-cell' : ''} ${active ? 'text-aether' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
      aria-sort={active ? 'descending' : 'none'}
    >
      {children}{active ? ' ▼' : ''}
    </th>
  );
}

export function WhatsNewResults({ rows, totalCandidates, skippedChunks, tab, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  const showCraftable = tab === 'items';
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={<EmptyResults>No new {tab === 'items' ? 'items' : 'recipes'} are selling yet. Turn off "Tradeable only" to see every new entry, or lower Min sales/day.</EmptyResults>}
      csvColumns={CSV_COLUMNS}
      csvFilename={`whats-new-${tab}-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <SortableHeader active={sort === 'price'} onClick={() => onSortChange('price')}>Price</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')}>Sales/day</SortableHeader>
              <SortableHeader active={false} onClick={() => onSortChange('velocity')} hideOnMobile>Recent</SortableHeader>
              <SortableHeader active={sort === 'freshness'} onClick={() => onSortChange('freshness')}>Last sold</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks id={r.id} name={r.name} />
                  {showCraftable && r.craftable && (
                    <span className="ml-2 font-mono text-[9px] tracking-widest uppercase text-aether border border-aether/40 px-1 py-0.5 align-middle">craft</span>
                  )}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {r.price == null ? <span className="text-text-low">—</span> : fmtGil(r.price)}
                  {r.hq && <span className="text-gold ml-1 inline-flex items-baseline"><HqStar /></span>}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-text-low hidden md:table-cell`}>{r.recentSales}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-text-low`}>{lastSold(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
