import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from '../queries/ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { TravelRow, TravelSort } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: TravelRow[];
  totalCandidates: number;
  skippedChunks: number;
  sort: TravelSort;
  onSortChange: (next: TravelSort) => void;
}

function SortableHeader({
  active, onClick, children, hideOnMobile = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  hideOnMobile?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-right ${
        hideOnMobile ? 'hidden md:table-cell' : ''
      } ${active ? 'text-aether' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
      aria-sort={active ? 'descending' : 'none'}
    >
      {children}{active ? ' ▼' : ''}
    </th>
  );
}

const CSV_COLUMNS: CsvColumn<TravelRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'units', label: 'Units' },
  { key: 'avgBuyPrice', label: 'Avg buy' },
  { key: 'homeSell', label: 'Home sell (net)' },
  { key: 'cost', label: 'Cost' },
  { key: 'profit', label: 'Profit' },
  { key: 'roi', label: 'ROI %', value: (r) => Math.round(r.roi * 100) },
  { key: 'velocity', label: 'Velocity (sales/day)' },
];

export function TravelResults({ rows, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={<EmptyResults>Nothing profitable to haul back under these settings. Try a different destination, raise the budget, or lower Min sales/day.</EmptyResults>}
      csvColumns={CSV_COLUMNS}
      csvFilename={`travel-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Item</th>
              <SortableHeader active={sort === 'units'} onClick={() => onSortChange('units')}>Units</SortableHeader>
              <SortableHeader active={sort === 'avgBuyPrice'} onClick={() => onSortChange('avgBuyPrice')}>Avg buy</SortableHeader>
              <SortableHeader active={sort === 'homeSell'} onClick={() => onSortChange('homeSell')}>Home sell</SortableHeader>
              <SortableHeader active={sort === 'cost'} onClick={() => onSortChange('cost')} hideOnMobile>Cost</SortableHeader>
              <SortableHeader active={sort === 'profit'} onClick={() => onSortChange('profit')}>Profit</SortableHeader>
              <SortableHeader active={sort === 'roi'} onClick={() => onSortChange('roi')}>ROI</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')} hideOnMobile>Vel</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <span className="inline-flex items-center gap-1">
                    <ItemNameLinks id={r.id} name={r.name} />
                    {r.hq && <span className="text-gold"><HqStar /></span>}
                  </span>
                </td>
                <td className={`px-3 ${rowY} font-mono text-right tabular-nums`}>{r.units}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{fmtGil(r.avgBuyPrice)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{fmtGil(r.homeSell)}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell text-text-low`}>{fmtGil(r.cost)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>+{fmtGil(r.profit)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-aether`}>{Math.round(r.roi * 100)}%</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
