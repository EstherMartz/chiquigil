import type { CraftRisk } from './craftListingAnalysis';
import type { RiskLevel } from '../items/concentration';

// PRD palette. Centralized so the table, mobile cards, and popover stay consistent.
export const RISK_TEXT: Record<CraftRisk, string> = {
  EMPTY:     'text-[#a0e080]',
  OPEN:      'text-[#a0e080]',
  HEALTHY:   'text-[#60c060]',
  CROWDED:   'text-[#c0a030]',
  DOMINATED: 'text-[#c04040]',
};

export const RISK_DOT: Record<CraftRisk, string> = {
  EMPTY:     'bg-[#a0e080]',
  OPEN:      'bg-[#a0e080]',
  HEALTHY:   'bg-[#60c060]',
  CROWDED:   'bg-[#c0a030]',
  DOMINATED: 'bg-[#c04040]',
};

/** One-line explanation shown under the label in COMFY mode. */
export function riskExplanation(r: {
  risk: CraftRisk; sellerCount: number; topSellerShare: number; clearDays: number | null;
}): string {
  switch (r.risk) {
    case 'EMPTY':     return 'no listings — list at your price';
    case 'DOMINATED': return `1 seller holds ${Math.round(r.topSellerShare * 100)}%`;
    case 'CROWDED':   return r.clearDays != null && r.clearDays > 5 ? 'listings sitting — slow to clear' : `${r.sellerCount} sellers competing`;
    case 'OPEN':      return r.sellerCount <= 1 ? 'open market — no competition' : 'room to undercut';
    case 'HEALTHY':   return 'workable market';
  }
}

export function RiskBadge({ risk, compact }: { risk: CraftRisk; compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${RISK_DOT[risk]}`} />
        <span className={`font-mono text-[10px] tracking-widest uppercase ${RISK_TEXT[risk]}`}>{risk}</span>
      </span>
    );
  }
  return <span className={`font-mono text-[11px] tracking-widest uppercase ${RISK_TEXT[risk]}`}>{risk}</span>;
}

// Seller-concentration dot color (FR-2): >60% red, 40–60% amber, else green.
function sellerDot(topSellerShare: number, sellerCount: number): string {
  if (sellerCount <= 1) return 'bg-[#a0e080]';
  if (topSellerShare > 0.60) return 'bg-[#c04040]';
  if (topSellerShare >= 0.40) return 'bg-[#c0a030]';
  return 'bg-[#60c060]';
}

export function SellersBadge({
  sellerCount, topSellerShare, concentrationRisk, dotOnly,
}: {
  sellerCount: number; topSellerShare: number; concentrationRisk: RiskLevel; dotOnly?: boolean;
}) {
  if (sellerCount === 0) return null;
  const dot = sellerDot(topSellerShare, sellerCount);
  const label =
    concentrationRisk === 'thin' ? 'Concentrated, risky'
    : concentrationRisk === 'moderate' ? 'Watch'
    : 'Healthy';
  const title = `${sellerCount} seller${sellerCount === 1 ? '' : 's'} · top holds ${Math.round(topSellerShare * 100)}% — ${label}.`;
  if (dotOnly) {
    return <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} title={title} />;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-low" title={title}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
      {sellerCount} seller{sellerCount === 1 ? '' : 's'}
    </span>
  );
}
