import { fmtGil, garlandItemUrl, gamerEscapeItemUrl } from '../../lib/format';
import { useSnapshotById } from '../queries/useSnapshotById';
import { CopyButton } from '../../components/CopyButton';
import { RecipeHover } from '../../components/RecipeHover';
import { Gil } from '../../components/Gil';
import type { SessionResult, SessionStrategy } from './packSession';

export interface SessionDiagnostics {
  scanned: number;
  profitable: number;
  atMyLevel: number;
  pickable: number;
}

interface Props {
  result: SessionResult | null;
  hasGenerated: boolean;
  strategy: SessionStrategy;
  stale: boolean;
  diagnostics: SessionDiagnostics | null;
}

const STRATEGY_LABEL: Record<SessionStrategy, string> = {
  balanced: 'Balanced',
  quickwin: 'Quick Win',
  patient: 'Patient',
};

export function SessionHero({ result, hasGenerated, strategy, stale, diagnostics }: Props) {
  const byId = useSnapshotById();
  if (!hasGenerated) {
    return (
      <article className="border border-border-base bg-bg-card p-6 sm:p-10 min-h-[320px] flex flex-col justify-center relative overflow-hidden">
        <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-text-low mb-4">
          The Brief
        </div>
        <h1 className="font-body text-3xl sm:text-4xl text-text-dim italic leading-tight max-w-prose">
          Set your terms, then run the press.
        </h1>
        <p className="font-body text-base text-text-low mt-4 max-w-prose">
          Choose a time budget and a strategy. The Ledger will tell you what to craft tonight.
        </p>
      </article>
    );
  }
  if (!result || result.picks.length === 0) {
    return (
      <article className="border border-crimson bg-bg-card p-6 sm:p-10 min-h-[320px] flex flex-col justify-center">
        <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-crimson mb-4">
          Nothing fits
        </div>
        <h1 className="font-body text-2xl sm:text-3xl text-text-cream leading-tight italic">
          No items match your budget tonight.
        </h1>
        <p className="font-body text-base text-text-dim mt-3 max-w-prose">
          Try a longer time, lower your minimum profit, widen the crafter, or pick a different strategy. Crafter levels are set in the Editor’s Bench below.
        </p>
        {diagnostics && <Diagnostics d={diagnostics} />}
      </article>
    );
  }
  const top = result.picks[0];
  const topIlvl = byId.get(top.id)?.ilvl;
  return (
    <article className="border border-border-base bg-bg-card p-6 sm:p-10 min-h-[320px] relative overflow-hidden">
      {stale && (
        <div className="absolute top-3 right-3 font-mono text-[9px] tracking-[0.3em] uppercase text-crimson border border-crimson/50 px-2 py-1">
          Settings changed
        </div>
      )}
      <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-text-low mb-5 flex items-center gap-3 flex-wrap">
        <span>Tonight, craft</span>
        {topIlvl != null && topIlvl > 1 && (
          <span className="font-mono text-gold tracking-widest">i{topIlvl}</span>
        )}
        <span className="text-aether border border-border-base px-2 py-0.5 leading-none">
          {top.crafter}
        </span>
      </div>
      <h1 className="font-body text-4xl sm:text-5xl md:text-6xl text-gold-hi leading-[1] tracking-tight text-balance">
        <RecipeHover itemId={top.id} itemName={top.name}>
          <a
            href={garlandItemUrl(top.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gold hover:underline decoration-1 underline-offset-4 transition-colors"
            title="Open on Garland Tools (recipe, NPC vendors, drop sources)"
          >
            {top.name}
          </a>
          <span className="text-gold-hi">.</span>
          <a
            href={gamerEscapeItemUrl(top.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-cream hover:text-gold hover:underline decoration-1 underline-offset-4 transition-colors text-sm"
            title="Gamer Escape wiki"
          >
            GE
          </a>
          <CopyButton text={top.name} className="ml-3 align-middle" />
        </RecipeHover>
      </h1>
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-text-low mt-3 flex items-center gap-3 flex-wrap">
        <span>×{top.batch} · <Gil value={top.totalGil} display={`+${fmtGil(top.totalGil)}`} className="text-jade" /> expected</span>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-text-dim">
        <PickFact label="Sells" value={`${top.velocity.toFixed(1)}/day`} />
        <PickFact label="Listings" value={String(top.listingCount)} warn={top.listingCount < 3} />
        <PickFact label="Unit" value={fmtGil(top.unitPrice)} />
        <PickFact label="Mats" value={fmtGil(top.materialCost)} />
      </dl>
      <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 border-t border-border-base pt-5">
        <Stat label="Take" value={`~${fmtGil(result.totalGil)}`} accent gil />
        <Stat label="Items" value={String(result.picks.length)} />
        <Stat
          label="Time"
          value={`${Math.round(result.totalSeconds / 60)}`}
          unit="min"
        />
        <Stat label="Strategy" value={STRATEGY_LABEL[strategy]} small />
      </div>
    </article>
  );
}

function PickFact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-text-low">{label}</dt>
      <dd className={warn ? 'text-crimson' : 'text-text-cream'}>{value}</dd>
    </div>
  );
}

function Diagnostics({ d }: { d: SessionDiagnostics }) {
  const rows: { label: string; value: number; lost?: boolean }[] = [
    { label: 'Items scanned', value: d.scanned },
    { label: 'Profitable to craft', value: d.profitable, lost: d.profitable < d.scanned },
    { label: 'Craftable at your level', value: d.atMyLevel, lost: d.atMyLevel < d.profitable },
    { label: 'Passed your filters', value: d.pickable, lost: d.pickable < d.atMyLevel },
  ];
  return (
    <div className="mt-6 pt-4 border-t border-border-base">
      <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-text-low mb-2">Why?</div>
      <dl className="space-y-1 font-mono text-[11px]">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt className="text-text-dim">{r.label}</dt>
            <dd className={`tabular-nums ${r.value === 0 ? 'text-crimson' : r.lost ? 'text-gold' : 'text-text-cream'}`}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
  small,
  gil,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  small?: boolean;
  gil?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-text-low mb-1">
        {label}
      </div>
      <div
        className={`font-display leading-none ${
          accent ? 'text-gold' : 'text-text-cream'
        } ${small ? 'text-base sm:text-lg' : 'text-2xl sm:text-3xl'} tabular-nums`}
      >
        {gil && <span aria-hidden className="text-gold/70 mr-1.5 text-base sm:text-lg">⊚</span>}
        {value}
        {unit && <span className="text-sm text-text-dim ml-1 font-body">{unit}</span>}
      </div>
    </div>
  );
}
