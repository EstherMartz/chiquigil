import type { Sector, RouteSummary as RouteSummaryType, SectorValueRow } from './submarineTypes';
import type { MarketData } from '../../lib/universalis';
import { DROP_RATES, DROP_RATE_DISCLAIMER, expectedGil } from './dropRates';
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';

/** Pure computation — exported for testing. */
export function computeRouteSummary(sectors: Sector[], market: MarketData): RouteSummaryType {
  const sectorSummaries = sectors.map((s) => {
    const subtotal = s.loot.reduce((sum, item) => {
      const m = market[String(item.itemId)];
      return sum + expectedGil(item.tier, m?.minNQ ?? null);
    }, 0);
    return { id: s.id, letter: s.letter, name: s.name, subtotal };
  });

  const totalGilPerVoyage = sectorSummaries.reduce((sum, s) => sum + s.subtotal, 0);
  const totalDurationMin = sectors.reduce((sum, s) => sum + s.durationMin, 0);
  const gilPerHour = totalDurationMin > 0 ? totalGilPerVoyage / (totalDurationMin / 60) : 0;

  return { sectors: sectorSummaries, totalGilPerVoyage, totalDurationMin, gilPerHour };
}

/** Build detailed per-item rows for the breakdown table. */
function buildDetailRows(sectors: Sector[], market: MarketData): SectorValueRow[] {
  const rows: SectorValueRow[] = [];
  for (const s of sectors) {
    for (const item of s.loot) {
      const m = market[String(item.itemId)];
      const price = m?.minNQ ?? null;
      rows.push({
        sectorId: s.id,
        sectorName: s.name,
        sectorLetter: s.letter,
        itemId: item.itemId,
        itemName: item.name,
        tier: item.tier,
        dropRate: DROP_RATES[item.tier],
        price,
        expected: expectedGil(item.tier, price),
      });
    }
  }
  return rows;
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  sectors: Sector[];
  market: MarketData;
}

export function RouteSummary({ sectors, market }: Props) {
  const summary = computeRouteSummary(sectors, market);
  const detailRows = buildDetailRows(sectors, market);

  return (
    <div className="space-y-4">
      {/* Totals banner */}
      <div className="flex flex-wrap items-center gap-6 p-4 border border-border-base bg-bg-card">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Voyage duration</div>
          <div className="font-mono text-sm text-text-cream">{fmtDuration(summary.totalDurationMin)}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Expected gil / voyage</div>
          <div className="font-mono text-sm text-gold">{fmtGil(Math.round(summary.totalGilPerVoyage))}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low flex items-center gap-1">
            Expected gil / hour
            <InfoTooltip label={DROP_RATE_DISCLAIMER}>
              <span className="text-text-low cursor-help">(?)</span>
            </InfoTooltip>
          </div>
          <div className="font-display text-lg text-gold">{fmtGil(Math.round(summary.gilPerHour))}</div>
        </div>
      </div>

      {/* Per-sector breakdown */}
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
              <th className="px-3 py-2 text-left">Sector</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">Tier</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">Drop rate</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Expected</th>
            </tr>
          </thead>
          <tbody>
            {summary.sectors.map((sec) => {
              const sectorRows = detailRows.filter((r) => r.sectorId === sec.id);
              return sectorRows.map((r, i) => (
                <tr key={`${r.sectorId}-${r.itemId}`} className="border-t border-border-base">
                  {i === 0 && (
                    <td
                      className="px-3 py-1.5 font-mono text-gold align-top"
                      rowSpan={sectorRows.length}
                    >
                      {r.sectorLetter}
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <ItemNameLinks id={r.itemId} name={r.itemName} />
                  </td>
                  <td className="px-3 py-1.5 text-right text-text-low capitalize hidden sm:table-cell">{r.tier}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums hidden sm:table-cell">
                    {(r.dropRate * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtGil(r.price)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gold">{fmtGil(Math.round(r.expected))}</td>
                </tr>
              ));
            })}
            {/* Sector subtotal rows */}
            {summary.sectors.map((sec) => (
              <tr key={`total-${sec.id}`} className="border-t-2 border-border-base bg-bg-card-hi">
                <td className="px-3 py-1.5 font-mono text-gold">{sec.letter}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] tracking-widest uppercase text-text-low" colSpan={3}>
                  Sector total
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gold font-semibold">
                  {fmtGil(Math.round(sec.subtotal))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
