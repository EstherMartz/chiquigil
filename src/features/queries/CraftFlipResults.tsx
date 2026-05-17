import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { CraftFlipRow } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: CraftFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
}

const CSV_COLUMNS: CsvColumn<CraftFlipRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'unitPrice', label: 'Sale Price' },
  { key: 'materialCost', label: 'Material Cost' },
  { key: 'profit', label: 'Profit' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'gilPerDay', label: 'Gil/day' },
  { key: 'hq', label: 'HQ' },
];

export function CraftFlipResults({ rows, totalCandidates, skippedChunks }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          No craft-flips tonight. Try lowering Min velocity, raising Max listings, or casting a wider net of categories.
        </EmptyResults>
      }
      csvColumns={CSV_COLUMNS}
      csvFilename={`craft-flip-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">
                <InfoTooltip label="Cheapest current listing on the home world. The price you'd sell at.">
                  Sale
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 hidden md:table-cell">
                <InfoTooltip label="Sum of ingredient prices on the home world. Sub-crafts use raw materials when toggled.">
                  Materials
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2">
                <InfoTooltip label="Sale price minus material cost. Net gil per item crafted.">
                  Profit
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 hidden md:table-cell">
                <InfoTooltip label="Sales per day on the home world.">
                  Velocity
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2">
                <InfoTooltip label="Profit × velocity. Expected daily gil from crafting this item at current prices.">
                  Gil / day
                </InfoTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={r.hq && <HqStar leading />}
                    sub={categoryLabel(r.sc)}
                  />
                </td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.unitPrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{fmtGil(r.materialCost)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(r.profit)}</td>
                <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-gold-hi`}>{fmtGil(Math.round(r.gilPerDay))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
