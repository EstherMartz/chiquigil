import type { WorldListing } from '../../lib/universalis';
import { SectionHeader } from '../../components/SectionHeader';
import { QualityTab } from './QualityTab';
import { useQualityStore } from './qualityStore';
import { concentrationHHI, type RiskLevel } from './concentration';

interface Props { listings: WorldListing[]; canHq: boolean }

const RISK_META: Record<RiskLevel, { label: string; cls: string }> = {
  thin:     { label: 'Concentrated · risky', cls: 'text-crimson border-crimson/40' },
  moderate: { label: 'Moderately spread',    cls: 'text-gold border-gold/40' },
  deep:     { label: 'Well-distributed',     cls: 'text-jade border-jade/40' },
};

/** Home-world seller-concentration (HHI) as a supply-structure risk indicator. */
export function ConcentrationBlock({ listings, canHq }: Props) {
  const setHq = useQualityStore((s) => s.setHq);
  const hq = useQualityStore((s) => s.hq) && canHq;
  const c = concentrationHHI(listings, hq);

  return (
    <section>
      <SectionHeader label="Seller concentration" compact />
      {canHq && (
        <div className="flex gap-1 mb-2">
          <QualityTab active={!hq} onClick={() => setHq(false)}>NQ</QualityTab>
          <QualityTab active={hq} onClick={() => setHq(true)}>HQ</QualityTab>
        </div>
      )}
      <div className="border border-border-base bg-bg-card p-4">
        {c == null ? (
          <div className="text-text-low text-sm italic">Limited data — seller info refreshing.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Supply risk</span>
              <span className={`font-mono text-[10px] tracking-widest uppercase border px-2 py-0.5 ${RISK_META[c.risk].cls}`}>
                {RISK_META[c.risk].label}
              </span>
            </div>
            <div className="bg-bg-deep h-3 border border-border-base">
              <div className="bg-aether h-full" style={{ width: `${Math.round(c.hhi * 100)}%` }} aria-hidden />
            </div>
            <p className="text-[12.5px] text-text-dim">
              Top seller holds <span className="text-text-cream font-mono">{Math.round(c.topSellerShare * 100)}%</span>{' '}
              across <span className="text-text-cream font-mono">{c.sellerCount}</span> seller{c.sellerCount === 1 ? '' : 's'}.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
