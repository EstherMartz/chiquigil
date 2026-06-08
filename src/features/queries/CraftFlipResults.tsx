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
import { RiskBadge, SellersBadge, riskExplanation } from './craftRiskBadges';
import { CompetitorPopover } from './CompetitorPopover';
import { GAP_GREEN, GAP_AMBER } from './craftListingAnalysis';
import { GatherableTag } from './GatherableTag';
import { MaterialSourcingPopover } from './MaterialSourcingPopover';
import type { CraftFlipRow, QueryScope } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: CraftFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
  scope: QueryScope;
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
  { key: 'risk', label: 'Risk' },
  { key: 'gap', label: 'Gap to next tier' },
  { key: 'sellerCount', label: 'Sellers' },
  { key: 'topSellerShare', label: 'Top seller share' },
  { key: 'clearDays', label: 'Days to clear' },
  { key: 'sourcing', label: 'Gatherable Cost', value: (r) => r.sourcing?.gatherableCost ?? '' },
  { key: 'sourcing', label: 'Gatherable %', value: (r) => r.sourcing ? Math.round(r.sourcing.gatherablePct) : '' },
  { key: 'sourcing', label: 'Self-source Profit', value: (r) => r.sourcing?.selfSourceProfit ?? '' },
  { key: 'hq', label: 'HQ' },
];

export function CraftFlipResults({ rows, totalCandidates, skippedChunks, scope, sparklineMap, sparklineLoading }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  const compact = density === 'compact';
  const comfy = density === 'comfortable';
  const homeScope = scope === 'home';
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
                  <div className="mt-0.5">
                    <SellersBadge
                      sellerCount={r.sellerCount}
                      topSellerShare={r.topSellerShare}
                      concentrationRisk={r.concentrationRisk}
                    />
                  </div>
                </div>
                {r.sourcing && r.sourcing.gatherablePct >= 80 && <GatherableTag />}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 pl-8 font-mono text-[12px]">
                <MobileMetric label="Sale">{fmtGil(r.unitPrice)}</MobileMetric>
                <MobileMetric label="Profit"><span className="text-jade">+{fmtGil(r.profit)}</span></MobileMetric>
                <MobileMetric label="Gil/day"><span className="text-gold-hi">{fmtGil(Math.round(r.gilPerDay))}</span></MobileMetric>
                <MobileMetric label="Gap"><GapLine row={r} /></MobileMetric>
                <MobileMetric label="Risk"><RiskBadge risk={r.risk} compact /></MobileMetric>
                <MobileMetric label="Clears"><ClearsLine row={r} homeScope={homeScope} /></MobileMetric>
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
              <th className="text-left px-3 py-2">
                <InfoTooltip label="Competitive safety of entering this market: gap to the next listing, seller concentration, and how fast stock clears.">
                  Risk
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 whitespace-nowrap">
                <InfoTooltip label="Profit × velocity. Expected daily gil from crafting this item at current prices.">
                  Gil/day
                </InfoTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0">
                      <ItemNameLinks
                        id={r.id}
                        name={r.name}
                        suffix={r.hq && <HqStar leading />}
                        sub={categoryLabel(r.sc)}
                      />
                      <div className="mt-0.5">
                        <SellersBadge
                          sellerCount={r.sellerCount}
                          topSellerShare={r.topSellerShare}
                          concentrationRisk={r.concentrationRisk}
                          dotOnly={compact}
                        />
                      </div>
                    </div>
                    {r.sourcing && r.sourcing.gatherablePct >= 80 && <GatherableTag />}
                  </div>
                </td>
                <td className={`px-3 ${rowY} text-right font-mono align-top`}>
                  <InfoTooltip label={<CompetitorPopover row={r} homeScope={homeScope} />}>
                    <span className="cursor-help">{fmtGil(r.unitPrice)}</span>
                  </InfoTooltip>
                  {!compact && (
                    <div className="mt-0.5 flex flex-col items-end">
                      <GapLine row={r} />
                      <ClearsLine row={r} homeScope={homeScope} />
                    </div>
                  )}
                </td>
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
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>
                  {r.sourcing && r.materialCost > 0 ? (
                    <MaterialSourcingPopover sourcing={r.sourcing}>
                      <span className="inline-flex flex-col items-end cursor-help">
                        <span>{fmtGil(r.materialCost)}</span>
                        {comfy && r.sourcing.gatherableCost > 0 && (
                          <span className="text-[10px] text-jade/70">↓ {fmtGil(r.sourcing.gatherableCost)} self</span>
                        )}
                      </span>
                    </MaterialSourcingPopover>
                  ) : (
                    fmtGil(r.materialCost)
                  )}
                </td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>
                  <span className="inline-flex flex-col items-end">
                    <span>+{fmtGil(r.profit)}</span>
                    {comfy && r.sourcing && r.sourcing.selfSourceProfit > r.profit && (
                      <span className="text-[10px] text-jade font-semibold">↑ +{fmtGil(r.sourcing.selfSourceProfit)} self</span>
                    )}
                  </span>
                </td>
                <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} align-top`}>
                  <InfoTooltip label={<CompetitorPopover row={r} homeScope={homeScope} />}>
                    <span className="cursor-help"><RiskBadge risk={r.risk} compact={compact} /></span>
                  </InfoTooltip>
                  {!compact && (
                    <div className="mt-0.5 font-mono text-[10px] text-text-low max-w-[14rem]">
                      {riskExplanation(r)}
                    </div>
                  )}
                </td>
                <td className={`px-3 ${rowY} text-right font-mono text-gold-hi`}>{fmtGil(Math.round(r.gilPerDay))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

function gapColor(gapPct: number): string {
  if (gapPct >= GAP_GREEN) return 'text-[#a0e080]';
  if (gapPct >= GAP_AMBER) return 'text-[#c0a030]';
  return 'text-[#c04040]';
}

/** "+Xk gap" / "+0 gap" / "only listing" line under the sale price. */
function GapLine({ row }: { row: CraftFlipRow }) {
  if (row.onlyListing) {
    return <span className="font-mono text-[10px] text-[#60c060]">only listing</span>;
  }
  if (!row.hasSecondTier) {
    return <span className="font-mono text-[10px] text-[#c04040]">+0 gap</span>;
  }
  return <span className={`font-mono text-[10px] ${gapColor(row.gapPct)}`}>+{fmtGil(row.gap)} gap</span>;
}

/** "~2d to clear · 9% capture" line (home scope only). */
function ClearsLine({ row, homeScope }: { row: CraftFlipRow; homeScope: boolean }) {
  if (!homeScope) {
    return (
      <span className="font-mono text-[10px] text-text-low" title="Capture rate only available for home world scope.">
        clear/capture: home only
      </span>
    );
  }
  if (row.clearDays == null) return null;
  const color = row.clearDays < 1 ? 'text-[#a0e080]' : row.clearDays <= 5 ? 'text-[#c0a030]' : 'text-[#c04040]';
  return (
    <span className={`font-mono text-[10px] ${color}`}>
      {row.clearNote} · {Math.round(row.captureRate * 100)}% cap
    </span>
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
