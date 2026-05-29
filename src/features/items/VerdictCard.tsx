import { fmtGil } from '../../lib/format';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { Tone } from './verdict/types';
import { computeVerdict } from './verdict/computeVerdict';

const TONE_BORDER: Record<Tone, string> = {
  gold: 'border-l-gold', good: 'border-l-jade', aether: 'border-l-aether',
  warn: 'border-l-gold', bad: 'border-l-crimson', mute: 'border-l-border-base',
};
const TONE_TEXT: Record<Tone, string> = {
  gold: 'text-gold', good: 'text-jade', aether: 'text-aether',
  warn: 'text-gold', bad: 'text-crimson', mute: 'text-text-low',
};
const TONE_FRAME: Record<Tone, string> = {
  gold: 'border-gold/40', good: 'border-jade/40', aether: 'border-aether/40',
  warn: 'border-gold/40', bad: 'border-crimson/40', mute: 'border-border-base',
};

interface Props {
  phantom: MarketItem | undefined;
  region: MarketItem | undefined;
  recipe: Recipe | undefined;
  vendorPrice: number | undefined;
  materialCost: number;
  homeWorld: string;
  canHq: boolean;
  now?: number;
}

export function VerdictCard(props: Props) {
  const now = props.now ?? Date.now();
  const { best, runnerUp } = computeVerdict({ ...props, now });
  const v = best;

  return (
    <section
      className={`bg-bg-card border ${TONE_FRAME[v.tone]} border-l-[3px] ${TONE_BORDER[v.tone]} p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] gap-5 md:gap-7`}
    >
      <div>
        <div className={`font-mono text-[10px] tracking-widest uppercase mb-1.5 ${TONE_TEXT[v.tone]}`}>
          ✦ Verdict
        </div>
        <div className={`font-display text-xl tracking-wide mb-1.5 ${v.tone === 'bad' ? 'text-crimson' : v.tone === 'good' ? 'text-jade' : 'text-text-cream'}`}>
          {v.headline}
        </div>
        <p className="text-[12.5px] text-text-dim leading-snug">{v.rationale}</p>
        {runnerUp && (
          <p className="font-mono text-[11px] text-text-low mt-2">
            also viable: {runnerUp.bestPlay} · + {fmtGil(runnerUp.gilPerDay)}/day
          </p>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Best play</div>
        <div className="font-display text-base text-gold tracking-wide mb-1">{v.bestPlay}</div>
        <p className="text-[12.5px] text-text-dim leading-snug">{v.bestPlayDetail}</p>
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Margin</div>
        {v.netPerUnit > 0 ? (
          <>
            <div className="font-mono text-2xl text-jade tabular-nums leading-none">+ {fmtGil(v.netPerUnit)}</div>
            <p className="font-mono text-[11px] text-text-dim mt-1.5">
              ~ + {fmtGil(v.gilPerDay)}/day{v.roi != null ? ` · ${Math.round(v.roi * 100)}% ROI` : ''}
            </p>
          </>
        ) : (
          <div className="font-mono text-2xl text-text-low tabular-nums leading-none">—</div>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Risk</div>
        <div className="font-display text-base text-text-cream tracking-wide mb-1">{v.risk}</div>
      </div>
    </section>
  );
}
