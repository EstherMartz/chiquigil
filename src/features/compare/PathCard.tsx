import { Link } from 'react-router-dom';
import { Gil } from '../../components/Gil';
import { quantityWarnings, daysToClear, type PathCard } from './comparePaths';

const EFFORT_LABEL: Record<PathCard['effort'], string> = {
  none: 'None',
  craft: 'Craft only',
  'gather-craft': 'Gather + Craft',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">{label}</span>
      <span className="font-mono text-sm text-text-cream">{children}</span>
    </div>
  );
}

function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return '—';
  if (h < 24) return `~${Math.round(h)}h`;
  return `~${(h / 24).toFixed(1)}d`;
}

export function PathCardView({ card, isWinner, quantity }: {
  card: PathCard;
  isWinner: boolean;
  quantity: number;
}) {
  const warnings = quantityWarnings(card, quantity);
  const days = daysToClear(card, quantity);
  const border = isWinner ? 'border-l-[3px] border-l-aether' : 'border-l border-l-border-base';

  return (
    <div className={`flex-shrink-0 w-[260px] border border-border-base ${border} bg-bg-card p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] tracking-widest uppercase text-aether">{card.label}</span>
        {isWinner && (
          <span className="font-mono text-[9px] tracking-widest uppercase text-bg-deep bg-aether px-1.5 py-0.5">★ BEST</span>
        )}
      </div>
      <Link to={`/item/${card.itemId}`} className="block text-text-cream hover:text-aether truncate">
        {card.itemName}
      </Link>

      <div className="border-t border-border-base/50 pt-2 space-y-1.5">
        <Row label="Sale price"><Gil value={card.salePrice} />/u</Row>
        <Row label="Profit/unit">
          <span className={card.profitPerUnit >= 0 ? 'text-jade' : 'text-crimson'}>
            {card.profitPerUnit >= 0 ? '+' : ''}<Gil value={card.profitPerUnit} />
          </span>
        </Row>
        <Row label="Velocity">{card.velocity > 0 ? `${card.velocity.toFixed(1)}/day` : '—'}</Row>
        <Row label="Time to sell">{card.kind === 'vendor' ? 'instant' : fmtHours(card.timeToSellHours)}</Row>
        <Row label="Gil/day"><span className="text-gold">{card.kind === 'vendor' ? 'instant' : <Gil value={Math.round(card.gilPerDay)} />}</span></Row>
      </div>

      {card.stack && (
        <div className="border-t border-border-base/50 pt-2 space-y-1.5">
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Stack profile (90d)</div>
          <Row label="Dominant stack">
            {card.stack.dominantStack}s{card.stack.supplyGap && <span className="text-gold"> ★</span>}
          </Row>
          <Row label="Vol @ best">{card.stack.volumeAtBest}</Row>
          <Row label="Listed @ best">{card.stack.listedAtBest}</Row>
          {card.stack.dominantStack > 1 && (
            <Row label="Throughput">~{card.stack.listingEventsPerDay.toFixed(1)} lists/day</Row>
          )}
        </div>
      )}

      <div className="border-t border-border-base/50 pt-2 space-y-1.5">
        <Row label="Risk">{card.risk}</Row>
        <Row label="Effort">{EFFORT_LABEL[card.effort]}</Row>
        {quantity > 1 && card.kind !== 'vendor' && (
          <>
            <Row label="Total profit">
              <span className={card.profitPerUnit >= 0 ? 'text-jade' : 'text-crimson'}>
                <Gil value={Math.round(card.profitPerUnit * quantity)} />
              </span>
            </Row>
            <Row label="Days to clear">{Number.isFinite(days) ? days.toFixed(1) : '—'}</Row>
          </>
        )}
      </div>

      {warnings.overcrowding && (
        <div className="text-[10px] text-gold border border-gold/40 px-2 py-1">⚠ {warnings.overcrowding}</div>
      )}
      {warnings.flood && (
        <div className="text-[10px] text-crimson border border-crimson/40 px-2 py-1">⚠ {warnings.flood}</div>
      )}
    </div>
  );
}
