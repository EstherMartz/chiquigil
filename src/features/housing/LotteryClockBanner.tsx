import { lotteryStatus } from '../../lib/housingLottery';
import { SectionHeader } from '../../components/SectionHeader';

interface Props {
  /** Injectable for tests; defaults to Date.now(). */
  now?: number;
}

export function LotteryClockBanner({ now }: Props) {
  const s = lotteryStatus(now ?? Date.now());
  const isEntry = s.phase === 'entry';
  const phaseLabel = isEntry ? 'Entry period' : 'Results period';
  const nudge = isEntry
    ? 'Players are placing bids — craft and stock furnishings now to sell into the move-in wave.'
    : 'Winners are moving in and decorating — list furnishings now while demand peaks.';
  const tone = isEntry ? 'text-aether' : 'text-gold';
  const dayLabel = `Day ${s.dayInCycle + 1} of 9`;
  const remaining = `${s.daysRemaining} day${s.daysRemaining === 1 ? '' : 's'} until ${s.nextPhase} period`;

  return (
    <section className="border border-border-base bg-bg-card border-l-[3px] border-l-aether p-5 md:p-6">
      <SectionHeader label="Housing Lottery" compact />
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className={`font-display text-xl tracking-wide ${tone}`}>{phaseLabel}</div>
          <p className="text-[12.5px] text-text-dim leading-snug mt-1 max-w-xl">{nudge}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-2xl text-text-cream tabular-nums leading-none">{s.daysRemaining}d</div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mt-1">{remaining}</div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">{dayLabel}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 ${
              i === s.dayInCycle ? 'bg-aether' : i < 5 ? 'bg-aether/30' : 'bg-gold/30'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
