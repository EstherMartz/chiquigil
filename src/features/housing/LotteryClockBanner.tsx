import { lotteryStatus } from '../../lib/housingLottery';
import { SectionHeader } from '../../components/SectionHeader';

interface Props {
  /** Injectable for tests; defaults to Date.now(). */
  now?: number;
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
function fmtRange(startMs: number, endMs: number): string {
  return `${DATE_FMT.format(new Date(startMs))} – ${DATE_FMT.format(new Date(endMs))}`;
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

  const periods: { key: 'entry' | 'results'; label: string; range: string; active: boolean; activeClass: string }[] = [
    { key: 'entry', label: 'Entry', range: fmtRange(s.entryStart, s.entryEnd), active: isEntry, activeClass: 'text-aether border-l-aether' },
    { key: 'results', label: 'Results', range: fmtRange(s.resultsStart, s.resultsEnd), active: !isEntry, activeClass: 'text-gold border-l-gold' },
  ];

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

      {/* Dated cycle windows for the current period */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {periods.map((p) => (
          <div
            key={p.key}
            className={`border-l-[3px] pl-3 py-1 ${p.active ? p.activeClass : 'border-l-border-base text-text-low'}`}
          >
            <div className="font-mono text-[10px] tracking-widest uppercase">
              {p.label}{p.active && ' · now'}
            </div>
            <div className={`font-display text-sm tabular-nums ${p.active ? '' : 'text-text-dim'}`}>{p.range}</div>
          </div>
        ))}
      </div>

      {/* Slim day-position strip */}
      <div className="mt-3 flex gap-1" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 ${
              i === s.dayInCycle ? 'bg-aether' : i < 5 ? 'bg-aether/30' : 'bg-gold/30'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
