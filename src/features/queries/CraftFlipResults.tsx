import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HqStar } from '../../components/HqStar';
import { Sparkline } from '../../components/Sparkline';
import { SparklineShimmer } from '../../components/SparklineShimmer';
import { colorFromPoints } from '../../features/sparklines/sparklineColor';
import { formatSparklineTooltip } from '../../features/sparklines/sparklineTooltip';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { CraftFlipRow } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: CraftFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
  sparklineMap?: Map<number, (number | null)[]>;
  sparklineLoading?: boolean;
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

export function CraftFlipResults({ rows, totalCandidates, skippedChunks, sparklineMap, sparklineLoading }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  const showSparkline = sparklineMap != null;
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
      renderMobile={(visible) => (
        <>
          {visible.map((r, i) => (
            <div key={r.id} className="p-3 active:bg-bg-card-hi transition-colors">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-text-low w-6 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={r.hq && <HqStar leading />}
                    sub={categoryLabel(r.sc)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 pl-8 font-mono text-[12px]">
                <MobileMetric label="Sale">{fmtGil(r.unitPrice)}</MobileMetric>
                <MobileMetric label="Profit"><span className="text-jade">+{fmtGil(r.profit)}</span></MobileMetric>
                <MobileMetric label="Gil/day"><span className="text-gold-hi">{fmtGil(Math.round(r.gilPerDay))}</span></MobileMetric>
              </div>
            </div>
          ))}
        </>
      )}
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
              {showSparkline && <th className="px-3 py-2 hidden md:table-cell"></th>}
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
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.unitPrice)}</td>
                {showSparkline && (
                  <td className={`px-3 ${rowY} hidden md:table-cell`}>
                    {(() => {
                      const buckets = sparklineMap!.get(r.id);
                      if (!buckets) return sparklineLoading ? <SparklineShimmer /> : null;
                      return (
                        <InfoTooltip label={<pre className="font-mono text-[10px] whitespace-pre">{formatSparklineTooltip(buckets)}</pre>}>
                          <Sparkline points={buckets} color={colorFromPoints(buckets)} />
                        </InfoTooltip>
                      );
                    })()}
                  </td>
                )}
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

function MobileMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{label}</div>
      <div className="mt-0.5 truncate">{children}</div>
    </div>
  );
}
