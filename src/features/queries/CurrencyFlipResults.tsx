import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { CurrencyFlipRow, CurrencyFlipSort } from './types';
import type { CurrencyDef } from '../../lib/currencies';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: CurrencyFlipRow[];
  currency: CurrencyDef;
  totalCandidates: number;
  skippedChunks: number;
  sort: CurrencyFlipSort;
  onSortChange: (next: CurrencyFlipSort) => void;
}

const CSV_COLUMNS: CsvColumn<CurrencyFlipRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'costPerUnit', label: 'Cost (currency/unit)', value: (r) => Number(r.costPerUnit.toFixed(2)) },
  { key: 'salePrice', label: 'Sale Price' },
  { key: 'hq', label: 'HQ' },
  { key: 'gilPerUnit', label: 'Gil/currency-unit', value: (r) => Number(r.gilPerUnit.toFixed(2)) },
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
      aria-sort={active ? 'descending' : 'none'}
    >
      {children}{tail}
    </th>
  );
}

export function CurrencyFlipResults({ rows, currency, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          No items match these filters for {currency.label}. Try lowering the gil/unit floor or switching currencies.
        </EmptyResults>
      }
      csvColumns={CSV_COLUMNS}
      csvFilename={`currency-flip-${currency.id}-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <SortableHeader active={sort === 'costPerUnit'} onClick={() => onSortChange('costPerUnit')}>Cost</SortableHeader>
              <SortableHeader active={sort === 'salePrice'} onClick={() => onSortChange('salePrice')}>Sale</SortableHeader>
              <SortableHeader active={sort === 'gilPerUnit'} onClick={() => onSortChange('gilPerUnit')}>Gil/unit</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')} hideOnMobile>Sales/day</SortableHeader>
              <th className="text-right px-3 py-2 text-text-dim hidden md:table-cell">Listings</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks id={r.id} name={r.name} />
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {r.costPerUnit.toFixed(r.costPerUnit < 10 ? 2 : 0)} {currency.shortLabel}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {fmtGil(r.salePrice)}
                  {r.hq && <span aria-label="HQ" className="text-gold ml-1 inline-flex items-baseline"><HqStar /></span>}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>{fmtGil(Math.round(r.gilPerUnit))}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.listingCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
