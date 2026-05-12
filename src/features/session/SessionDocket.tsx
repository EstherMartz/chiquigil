import { fmtGil, universalisItemUrl, garlandItemUrl } from '../../lib/format';
import { useSettingsStore } from '../settings/store';
import { useSnapshotById } from '../queries/useSnapshotById';
import { CopyButton } from '../../components/CopyButton';
import { RecipeHover } from '../../components/RecipeHover';
import type { SessionResult } from './packSession';

interface Props {
  result: SessionResult | null;
  hasGenerated: boolean;
}

export function SessionDocket({ result, hasGenerated }: Props) {
  const { world } = useSettingsStore();
  const byId = useSnapshotById();
  if (!hasGenerated || !result || result.picks.length === 0) return null;
  return (
    <section className="mt-10">
      <header className="border-b-2 border-border-base pb-2 mb-2 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xs tracking-[0.4em] uppercase text-gold">The Docket</h2>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
          {result.picks.length} items · {Math.round(result.totalSeconds / 60)} min · ~{fmtGil(result.totalGil)}
        </div>
      </header>
      <ol className="divide-y divide-border-base">
        {result.picks.map((p, i) => (
          <li
            key={p.id}
            className="py-4 grid grid-cols-12 gap-2 sm:gap-4 items-baseline"
          >
            <div className="col-span-2 sm:col-span-1 font-display text-xl sm:text-2xl text-gold tabular-nums">
              {(i + 1).toString().padStart(2, '0')}
            </div>
            <div className="col-span-10 sm:col-span-5">
              <RecipeHover itemId={p.id} itemName={p.name}>
                {byId.get(p.id)?.ilvl != null && byId.get(p.id)!.ilvl > 1 && (
                  <span className="font-mono text-[10px] tracking-widest text-gold tabular-nums">
                    i{byId.get(p.id)!.ilvl}
                  </span>
                )}
                <a
                  href={universalisItemUrl(p.id, world)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-lg sm:text-xl text-text-cream leading-tight hover:text-aether hover:underline decoration-1 underline-offset-4 transition-colors"
                  title="Open on Universalis"
                >
                  {p.name}
                </a>
                <CopyButton text={p.name} />
              </RecipeHover>
              <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-aether border border-border-base px-1 py-0.5 leading-none">
                  {p.crafter}
                </span>
                <span>{fmtGil(p.unitPrice)} unit · {fmtGil(p.materialCost)} mats</span>
                <a
                  href={garlandItemUrl(p.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-aether transition-colors"
                  title="Open on Garland Tools (recipe, NPC vendors, drop sources)"
                >
                  ↗
                </a>
              </div>
            </div>
            <div className="hidden sm:block col-span-1 text-right font-mono text-xs text-text-dim">
              {p.velocity.toFixed(1)}<span className="text-text-low">/d</span>
            </div>
            <div className="hidden sm:block col-span-1 text-right font-mono text-xs">
              <span className={p.listingCount < 3 ? 'text-crimson' : 'text-text-dim'}>{p.listingCount}</span>
              <span className="text-text-low"> list</span>
            </div>
            <div className="col-span-3 sm:col-span-1 text-right font-mono text-sm text-gold">
              ×{p.batch}
            </div>
            <div className="col-span-4 sm:col-span-1 text-right font-mono text-sm text-text-dim">
              {Math.round(p.totalSeconds / 60)} <span className="text-text-low">min</span>
            </div>
            <div className="col-span-5 sm:col-span-2 text-right font-mono text-base text-jade">
              +{fmtGil(p.totalGil)}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
