import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { VendorFlipRow, VendorFlipSort } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: VendorFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
  sort: VendorFlipSort;
  onSortChange: (next: VendorFlipSort) => void;
}

const CSV_COLUMNS: CsvColumn<VendorFlipRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'vendorPrice', label: 'Vendor Cost' },
  { key: 'salePrice', label: 'Sale Price' },
  { key: 'hq', label: 'HQ' },
  { key: 'profitPerUnit', label: 'Profit/unit' },
  { key: 'markup', label: 'Markup', value: (r) => Number(r.markup.toFixed(2)) },
  { key: 'profitPerDay', label: 'Profit/day' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'listingCount', label: 'Listings' },
];

function SortableHeader({
  active, onClick, children, align = 'right', hideOnMobile = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
}) {
  const tail = active ? ' ▼' : '';
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-${align} ${
        hideOnMobile ? 'hidden md:table-cell' : ''
      } ${active ? 'text-gold' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
    >
      {children}{tail}
    </th>
  );
}

export function VendorFlipResults({ rows, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          No vendor flips match these filters. Try lowering Min profit, lowering Min markup, or loosening velocity.
        </EmptyResults>
      }
      csvColumns={CSV_COLUMNS}
      csvFilename={`vendor-flip-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <th className="text-right px-3 py-2 text-text-dim">Vendor cost</th>
              <SortableHeader active={sort === 'salePrice'} onClick={() => onSortChange('salePrice')}>Sale</SortableHeader>
              <SortableHeader active={sort === 'profitPerUnit'} onClick={() => onSortChange('profitPerUnit')}>Profit/u</SortableHeader>
              <SortableHeader active={sort === 'markup'} onClick={() => onSortChange('markup')}>Markup ×</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')} hideOnMobile>Sales/day</SortableHeader>
              <SortableHeader active={sort === 'profitPerDay'} onClick={() => onSortChange('profitPerDay')}>Profit/day</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks id={r.id} name={r.name} />
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{fmtGil(r.vendorPrice)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {fmtGil(r.salePrice)}
                  {r.hq && <span className="text-gold ml-1 inline-flex items-baseline"><HqStar /></span>}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>{fmtGil(r.profitPerUnit)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{r.markup.toFixed(2)}×</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>{fmtGil(Math.round(r.profitPerDay))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
