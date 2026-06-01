import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { EmptyShelfRow, EmptyShelfSort } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: EmptyShelfRow[];
  totalCandidates: number;
  skippedChunks: number;
  sort: EmptyShelfSort;
  onSortChange: (next: EmptyShelfSort) => void;
}

const CSV_COLUMNS: CsvColumn<EmptyShelfRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'hq', label: 'HQ' },
  { key: 'daysSinceLastSale', label: 'Days since last sale', value: (r) => r.daysSinceLastSale == null ? '' : Math.round(r.daysSinceLastSale) },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'suggestedPrice', label: 'Suggested price' },
  { key: 'estGilPerDay', label: 'Est gil/day' },
];

function lastSold(r: EmptyShelfRow): string {
  if (r.daysSinceLastSale == null) return '—';
  const d = Math.round(r.daysSinceLastSale);
  return d <= 0 ? 'today' : `${d}d ago`;
}

function SortableHeader({ active, onClick, children, hideOnMobile = false }: {
  active: boolean; onClick: () => void; children: React.ReactNode; hideOnMobile?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-right ${hideOnMobile ? 'hidden md:table-cell' : ''} ${active ? 'text-gold' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
      aria-sort={active ? 'descending' : 'none'}
    >
      {children}{active ? ' ▼' : ''}
    </th>
  );
}

export function EmptyShelfResults({ rows, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={<EmptyResults>No empty shelves match these filters. Try lowering Min sales/day, widening Sold within, or raising the empty threshold.</EmptyResults>}
      csvColumns={CSV_COLUMNS}
      csvFilename={`empty-shelf-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <SortableHeader active={sort === 'freshness'} onClick={() => onSortChange('freshness')}>Last sold</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')} hideOnMobile>Vel</SortableHeader>
              <SortableHeader active={sort === 'suggestedPrice'} onClick={() => onSortChange('suggestedPrice')}>Suggested</SortableHeader>
              <SortableHeader active={sort === 'estGilPerDay'} onClick={() => onSortChange('estGilPerDay')}>Est gil/day</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}><ItemNameLinks id={r.id} name={r.name} /></td>
                <td className={`px-3 ${rowY} font-mono text-right text-text-low`}>{lastSold(r)}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {fmtGil(r.suggestedPrice)}
                  {r.hq && <span className="text-gold ml-1 inline-flex items-baseline"><HqStar /></span>}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>{fmtGil(r.estGilPerDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
