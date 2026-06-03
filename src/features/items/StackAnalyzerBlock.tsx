import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { QualityTab } from './QualityTab';
import { fmtGil, fmtRelative } from '../../lib/format';
import { soldByStack, listedByStack, isStackable, mergeStacks, type MergedStackRow } from './stackAnalysis';

const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;

interface BlockProps { itemId: number; scope: string; listings: WorldListing[]; canHq: boolean }

/** Query wrapper: fetches 90-day home-world history, delegates to the pure view. */
export function StackAnalyzerBlock({ itemId, scope, listings, canHq }: BlockProps) {
  const q = useQuery({
    queryKey: ['item-history', scope, itemId, 90],
    enabled: Number.isFinite(itemId) && itemId > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => (await fetchHistoryWithin(scope, [itemId], NINETY_DAYS_SEC)).get(itemId) ?? [],
  });
  const entries: HistoryEntry[] = q.data ?? [];

  return (
    <section>
      <SectionHeader label="Stack size analyzer" compact />
      {q.isLoading
        ? <Spinner label="Loading 90-day sale history…" />
        : <StackAnalyzerView entries={entries} listings={listings} canHq={canHq} />}
    </section>
  );
}

interface ViewProps { entries: HistoryEntry[]; listings: WorldListing[]; canHq: boolean }

/** Pure presentation: NQ/HQ toggle + demand and supply panels. Exported for tests. */
export function StackAnalyzerView({ entries, listings, canHq }: ViewProps) {
  const [hq, setHq] = useState(false);
  const sold = soldByStack(entries, hq);
  const listed = listedByStack(listings, hq);
  const stackable = isStackable(sold, listed);
  const rows = mergeStacks(sold, listed);

  return (
    <div>
      {canHq && (
        <div className="flex gap-1 mb-2">
          <QualityTab active={!hq} onClick={() => setHq(false)}>NQ</QualityTab>
          <QualityTab active={hq} onClick={() => setHq(true)}>HQ</QualityTab>
        </div>
      )}

      {!stackable ? (
        <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
          Always sold as single units — stack analysis doesn't apply.
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
          No {hq ? 'HQ' : 'NQ'} data in the last 90 days.
        </div>
      ) : (
        <StackDemandSupplyChart rows={rows} />
      )}
    </div>
  );
}

/** Diverging per-stack chart: demand (90-day sales) grows left, supply (live listings) grows right. */
export function StackDemandSupplyChart({ rows }: { rows: MergedStackRow[] }) {
  const maxSales = Math.max(1, ...rows.map((r) => r.sales));
  const maxListed = Math.max(1, ...rows.map((r) => r.listedCount));

  return (
    <div className="border border-border-base bg-bg-card overflow-x-auto">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-3 py-2 font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base">
        <div className="text-right">Sold · 90d</div>
        <div className="text-center">Stack</div>
        <div className="text-left">Listed now</div>
      </div>
      {rows.map((r) => (
        <div
          key={r.stack}
          className={`grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-3 py-1.5 border-t border-border-base ${r.isGap ? 'bg-jade/10' : ''}`}
        >
          {/* Demand — right-aligned, bar grows left */}
          <div className="flex items-center justify-end gap-2 min-w-0">
            {r.sales > 0 ? (
              <>
                <span className="font-mono text-text-low text-[11px] shrink-0">{fmtGil(r.medianUnitPrice)}/u</span>
                <span className="font-mono text-sm shrink-0">{r.sales}</span>
                <div
                  className="bg-jade/40 h-3 shrink-0"
                  style={{ width: `${(r.sales / maxSales) * 100}%` }}
                  title={`Last sold ${fmtRelative(r.lastSoldMs)}`}
                  aria-hidden
                />
              </>
            ) : (
              <span className="font-mono text-text-low text-sm">—</span>
            )}
          </div>

          {/* Center axis — stack size */}
          <div className="text-center font-mono text-text-cream whitespace-nowrap px-1">
            {r.stack}
            {r.isGap && <span className="text-jade ml-1" title="High demand, thin supply">✓ gap</span>}
          </div>

          {/* Supply — left-aligned, bar grows right */}
          <div className="flex items-center justify-start gap-2 min-w-0">
            {r.listedCount > 0 ? (
              <>
                <div
                  className="bg-aether/40 h-3 shrink-0"
                  style={{ width: `${(r.listedCount / maxListed) * 100}%` }}
                  aria-hidden
                />
                <span className="font-mono text-sm shrink-0">{r.listedCount}</span>
              </>
            ) : (
              <span className="font-mono text-text-low text-sm">—</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
