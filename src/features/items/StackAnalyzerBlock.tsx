import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { QualityTab } from './QualityTab';
import { fmtGil, fmtRelative } from '../../lib/format';
import {
  soldByStack, listedByStack, isStackable, mergeStacks, suggestStack,
  type MergedStackRow, type StackSuggestion,
} from './stackAnalysis';

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
  const suggestion = suggestStack(sold, listed);

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
        <StackDemandSupplyChart rows={rows} suggestion={suggestion} />
      )}
    </div>
  );
}

/** One-line summary of a stack size, surfaced as the column's hover title. */
function columnTitle(r: MergedStackRow): string {
  const parts: string[] = [`Stack ${r.stack}`];
  if (r.sales > 0) {
    parts.push(`${r.sales} sold`, `${fmtGil(r.medianUnitPrice)}/u`, `last sold ${fmtRelative(r.lastSoldMs)}`);
  } else {
    parts.push('no sales');
  }
  parts.push(r.listedCount > 0 ? `${r.listedCount} listed` : 'none listed');
  return parts.join(' · ');
}

/** The actionable "list at" caption, derived from suggestStack. */
function suggestionCaption(suggestion: StackSuggestion, rows: MergedStackRow[]): string {
  const row = rows.find((r) => r.stack === suggestion.stack);
  const sales = row?.sales ?? 0;
  const listed = row?.listedCount ?? 0;
  const price = `~${fmtGil(suggestion.unitPrice)}/u`;
  return suggestion.kind === 'gap'
    ? `◆ Supply gap at stack ${suggestion.stack} — ${sales} sold/90d, ${price}, ${listed} listed now.`
    : `◆ Most liquid at stack ${suggestion.stack} — ${sales} sold/90d, ${price}.`;
}

/**
 * Vertical diverging column chart: demand (90-day sales) grows up, supply (live listings)
 * grows down from a shared stack-size baseline. Per-column detail is in the hover title;
 * the actionable size is captioned below via suggestStack.
 */
export function StackDemandSupplyChart({
  rows, suggestion,
}: { rows: MergedStackRow[]; suggestion: StackSuggestion | null }) {
  const maxSales = Math.max(1, ...rows.map((r) => r.sales));
  const maxListed = Math.max(1, ...rows.map((r) => r.listedCount));

  return (
    <div className="border border-border-base bg-bg-card">
      <div className="flex justify-between px-3 pt-2 font-mono text-[10px] tracking-widest uppercase">
        <span className="text-jade/80">▲ sold (90d)</span>
        <span className="text-aether/80">▼ listed now</span>
      </div>

      <div className="overflow-x-auto px-3 pb-2 pt-1">
        <div className="flex items-stretch gap-1">
          {rows.map((r) => {
            const title = columnTitle(r);
            return (
              <div
                key={r.stack}
                title={title}
                aria-label={title}
                className={`flex flex-col items-center min-w-[2.25rem] flex-1 ${r.isGap ? 'bg-jade/10' : ''}`}
              >
                {/* Demand — grows up from the baseline */}
                <div className="flex items-end justify-center h-16 w-full">
                  {r.sales > 0 && (
                    <div
                      className={`w-3 ${r.isGap ? 'bg-jade' : 'bg-jade/40'}`}
                      style={{ height: `${(r.sales / maxSales) * 100}%` }}
                      aria-hidden
                    />
                  )}
                </div>
                {/* Axis label */}
                <div className="py-1 font-mono text-[11px] text-text-cream whitespace-nowrap">
                  {r.stack}
                  {r.isGap && <span className="text-jade ml-0.5" aria-hidden>✓</span>}
                </div>
                {/* Supply — grows down from the baseline */}
                <div className="flex items-start justify-center h-12 w-full">
                  {r.listedCount > 0 && (
                    <div
                      className="w-3 bg-aether/40"
                      style={{ height: `${(r.listedCount / maxListed) * 100}%` }}
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {suggestion && (
        <div className="border-t border-border-base px-3 py-2 font-mono text-[11px] text-jade">
          {suggestionCaption(suggestion, rows)}
        </div>
      )}
    </div>
  );
}
