import { fmtGil } from '../../lib/format';
import type { CraftFlipRow } from './types';

interface Props {
  row: CraftFlipRow;
  /** Home-world scope shows clear/capture; DC scope hides them (less meaningful). */
  homeScope: boolean;
}

const BAR_WIDTH = 16;

/** Read-only listing-depth + seller-concentration breakdown for the hover popover. */
export function CompetitorPopover({ row, homeScope }: Props) {
  const maxUnits = row.depth.reduce((m, b) => Math.max(m, b.units), 0) || 1;
  const concLabel =
    row.concentrationRisk === 'thin' ? 'CONCENTRATED · RISKY'
    : row.concentrationRisk === 'moderate' ? 'WATCH'
    : 'HEALTHY';

  return (
    <div className="font-mono text-[10px] leading-relaxed text-text-cream min-w-[260px]">
      <div className="tracking-widest uppercase text-text-low mb-1">Listing depth</div>
      <div className="border-t border-border-base pt-1">
        {row.depth.length === 0 && <div className="text-text-low italic">no listings</div>}
        {row.depth.map((b) => {
          const filled = Math.max(1, Math.round((b.units / maxUnits) * BAR_WIDTH));
          return (
            <div key={`${b.priceLow}-${b.priceHigh}`} className="flex items-center gap-2 whitespace-pre">
              <span className="text-text-dim w-24">{fmtGil(b.priceLow)}–{fmtGil(b.priceHigh)}</span>
              <span className="text-aether">{'█'.repeat(filled)}{' '.repeat(BAR_WIDTH - filled)}</span>
              <span className="text-text-low">{b.units}u · {b.sellers} seller{b.sellers === 1 ? '' : 's'}</span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border-base mt-1 pt-1 text-text-low">
        Total: {row.totalUnits} units · {row.sellerCount} seller{row.sellerCount === 1 ? '' : 's'}
        {homeScope && row.clearDays != null && (
          <> · {row.clearNote} · ~{Math.round(row.captureRate * 100)}% capture</>
        )}
        {!homeScope && <> · clear/capture: home-world scope only</>}
      </div>
      <div className="mt-2">
        <span className="tracking-widest uppercase text-text-low">Seller concentration</span>
        <div className="mt-0.5">
          Top seller: {Math.round(row.topSellerShare * 100)}% of supply
          <span className="ml-2 text-text-dim">[{concLabel}]</span>
        </div>
      </div>
    </div>
  );
}
