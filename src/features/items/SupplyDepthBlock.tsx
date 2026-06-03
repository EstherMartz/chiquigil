import type { WorldListing } from '../../lib/universalis';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';
import { QualityTab } from './QualityTab';
import { useQualityStore } from './qualityStore';
import { depthBuckets } from './depth';

interface Props { listings: WorldListing[]; canHq: boolean }

/** Home-world order-book depth as a CSS-bar histogram over price tiers. */
export function SupplyDepthBlock({ listings, canHq }: Props) {
  const setHq = useQualityStore((s) => s.setHq);
  const hq = useQualityStore((s) => s.hq) && canHq;
  const buckets = depthBuckets(listings, hq);
  const maxUnits = buckets.reduce((m, b) => Math.max(m, b.units), 0);

  return (
    <section>
      <SectionHeader label="Supply depth" compact />
      {canHq && (
        <div className="flex gap-1 mb-2">
          <QualityTab active={!hq} onClick={() => setHq(false)}>NQ</QualityTab>
          <QualityTab active={hq} onClick={() => setHq(true)}>HQ</QualityTab>
        </div>
      )}
      <div className="border border-border-base bg-bg-card p-4">
        {buckets.length === 0 ? (
          <div className="text-text-low text-sm italic">No {hq ? 'HQ' : 'NQ'} listings to chart.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-2 py-1">Price tier</th>
                <th className="text-left px-2 py-1 w-1/2">Depth</th>
                <th className="text-right px-2 py-1">Units</th>
                <th className="text-right px-2 py-1">Sellers</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={i} className="border-t border-border-base">
                  <td className="px-2 py-2 font-mono text-text-cream whitespace-nowrap">
                    {fmtGil(b.priceLow)}{b.priceHigh > b.priceLow ? `–${fmtGil(b.priceHigh)}` : ''}
                  </td>
                  <td className="px-2 py-2">
                    <div
                      className="bg-aether/40 h-3"
                      style={{ width: `${maxUnits ? (b.units / maxUnits) * 100 : 0}%` }}
                      aria-hidden
                    />
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{b.units}</td>
                  <td className="px-2 py-2 text-right font-mono text-text-low">{b.sellers || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
