import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { QualityTab } from './QualityTab';
import { fmtGil, fmtRelative } from '../../lib/format';
import { soldByStack, listedByStack, isStackable, type SoldStackRow } from './stackAnalysis';

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

  const totalSales = sold.reduce((s, r) => s + r.sales, 0);
  const listedCountByStack = new Map(listed.map((r) => [r.stack, r.count]));
  const gapThreshold = Math.max(2, totalSales * 0.15);
  const isGap = (r: SoldStackRow) =>
    r.sales >= gapThreshold && (listedCountByStack.get(r.stack) ?? 0) <= 1;
  const maxListed = listed.reduce((m, r) => Math.max(m, r.count), 0);

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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-border-base bg-bg-card overflow-x-auto">
            <div className="px-3 py-2 font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base">
              Sold · last 90d {hq ? '(HQ)' : '(NQ)'}
            </div>
            {sold.length === 0 ? (
              <div className="p-4 text-text-low text-sm italic">No {hq ? 'HQ' : 'NQ'} sales in the last 90 days.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
                    <th className="text-right px-3 py-2">Stack</th>
                    <th className="text-right px-3 py-2">Sales</th>
                    <th className="text-right px-3 py-2">Units</th>
                    <th className="text-right px-3 py-2">~/unit</th>
                    <th className="text-right px-3 py-2">Last sold</th>
                  </tr>
                </thead>
                <tbody>
                  {sold.map((r) => {
                    const gap = isGap(r);
                    return (
                      <tr key={r.stack} className={`border-t border-border-base ${gap ? 'bg-jade/10' : ''}`}>
                        <td className="px-3 py-2 text-right font-mono text-text-cream">
                          {r.stack}
                          {gap && <span className="text-jade ml-1" title="High demand, thin supply">↙ gap</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{r.sales}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-low">{r.units}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtGil(r.medianUnitPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-low">{fmtRelative(r.lastSoldMs)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="border border-border-base bg-bg-card overflow-x-auto">
            <div className="px-3 py-2 font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base">
              Listed now {hq ? '(HQ)' : '(NQ)'}
            </div>
            {listed.length === 0 ? (
              <div className="p-4 text-text-low text-sm italic">No {hq ? 'HQ' : 'NQ'} listings.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
                    <th className="text-right px-3 py-2">Stack</th>
                    <th className="text-left px-3 py-2 w-1/2">Depth</th>
                    <th className="text-right px-3 py-2">Listings</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((r) => (
                    <tr key={r.stack} className="border-t border-border-base">
                      <td className="px-3 py-2 text-right font-mono text-text-cream">{r.stack}</td>
                      <td className="px-3 py-2">
                        <div className="bg-aether/40 h-3" style={{ width: `${maxListed ? (r.count / maxListed) * 100 : 0}%` }} aria-hidden />
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
