import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { RepostRow } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: RepostRow[];
  totalCandidates: number;
  skippedChunks: number;
}

const CSV_COLUMNS: CsvColumn<RepostRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'wall', label: 'Wall' },
  { key: 'gap', label: 'Gap' },
  { key: 'gapPct', label: 'Gap %' },
  { key: 'taxedProfit', label: 'Profit (after tax)' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'gilPerDay', label: 'Gil/day' },
  { key: 'hq', label: 'HQ' },
];

export function RepostResults({ rows, totalCandidates, skippedChunks }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          No walls to leap tonight. Lower Min gap, ease the Min discount %, or open the categories wider.
        </EmptyResults>
      }
      csvColumns={CSV_COLUMNS}
      csvFilename={`repost-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">
                <InfoTooltip label="Lowest current listing on the home world. The price you'd buy at.">
                  Cheapest
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 hidden md:table-cell">
                <InfoTooltip label="Next distinct price tier above the floor. Relist just below this to undercut.">
                  Wall
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 hidden md:table-cell">
                <InfoTooltip label="Wall minus cheapest. The headroom available for relisting.">
                  Gap
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2">
                <InfoTooltip label="Gap as a percentage of the wall price.">
                  %
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2">
                <InfoTooltip label="Estimated net per item after the 5% marketboard tax on the relisted sale.">
                  Profit (after tax)
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 hidden md:table-cell">
                <InfoTooltip label="Sales per day on the home world.">
                  Vel
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2">
                <InfoTooltip label="Profit × velocity. Expected daily gil if the gap keeps reappearing.">
                  Gil / day
                </InfoTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={r.hq && <HqStar leading />}
                    sub={categoryLabel(r.sc)}
                  />
                </td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.cheapest)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{fmtGil(r.wall)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade hidden md:table-cell`}>+{fmtGil(r.gap)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>{r.gapPct}%</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(r.taxedProfit)}</td>
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
