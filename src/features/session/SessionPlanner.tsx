import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useMarketData } from '../watchlist/useMarketData';
import { useRecipes } from '../profit/useRecipes';
import { allItemsFromEnabledPacks } from '../items/starterPacks';
import { buildRows } from '../watchlist/buildRows';
import { buildCandidates } from './buildCandidates';
import { packSession, type SessionStrategy } from './packSession';
import { SessionResults } from './SessionResults';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import type { CrafterCode } from '../items/types';

const STRATEGIES: { id: SessionStrategy; label: string; tag: string }[] = [
  { id: 'balanced',  label: 'Balanced',    tag: 'mix of margin and movement' },
  { id: 'quickwin',  label: 'Quick Win',   tag: 'favor items that move fast' },
  { id: 'patient',   label: 'Patient',     tag: 'favor fat-margin items' },
];

const CRAFTERS: CrafterCode[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'];

export default function SessionPlanner() {
  const settings = useSettingsStore();
  const { starterPacks, customItems, perItemFlags } = useWatchlistStore();

  const [minutes, setMinutes] = useState(60);
  const [strategy, setStrategy] = useState<SessionStrategy>('balanced');
  const [crafterLock, setCrafterLock] = useState<CrafterCode | undefined>(undefined);
  const [minProfit, setMinProfit] = useState<number | undefined>(undefined);

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks);
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id))];
  }, [starterPacks, customItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, settings.world, settings.dc);
  const recipes = useRecipes(ids);

  const result = useMemo(() => {
    if (!market.data || !recipes.data) return null;
    const rows = buildRows(items, market.data.phantom, market.data.dc, settings.retainerLevels, recipes.data, perItemFlags, Date.now());
    const candidates = buildCandidates(rows, {
      baseSeconds: settings.defaultCraftTimeSeconds,
      perItemFlags,
      crafterLock,
      minProfit,
    });
    return packSession(candidates, {
      budgetMinutes: minutes,
      overheadMinutes: settings.overheadMinutes,
      batchCapDays: settings.batchCapDays,
      strategy,
    });
  }, [
    items, market.data, recipes.data,
    settings.retainerLevels, settings.defaultCraftTimeSeconds, settings.overheadMinutes, settings.batchCapDays,
    perItemFlags, minutes, strategy, crafterLock, minProfit,
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-6">
      <section className="border border-border-base bg-bg-card p-5 space-y-5">
        <h2 className="font-display text-xl text-gold tracking-wide">Plan a session</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Time budget (min)</span>
            <input
              type="number" min={1} max={600}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 0))}
              className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono"
            />
            <span className="block mt-1 font-mono text-[10px] text-text-low">
              minus {settings.overheadMinutes} min overhead = {Math.max(0, minutes - settings.overheadMinutes)} min crafting
            </span>
          </label>

          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Lock to crafter</span>
            <select
              value={crafterLock ?? ''}
              onChange={(e) => setCrafterLock(e.target.value === '' ? undefined : (e.target.value as CrafterCode))}
              className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono"
            >
              <option value="">Any</option>
              {CRAFTERS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min profit (gil)</span>
            <input
              type="number" min={0}
              value={minProfit ?? ''}
              placeholder="any"
              onChange={(e) => setMinProfit(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono"
            />
          </label>
        </div>

        <div>
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase block mb-2">Strategy</span>
          <div className="flex flex-wrap gap-2">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStrategy(s.id)}
                className={`px-4 py-3 sm:py-2 border font-mono text-xs tracking-wider uppercase min-w-[140px] sm:min-w-0 ${
                  strategy === s.id ? 'border-gold text-gold bg-bg-card-hi' : 'border-border-base text-text-dim hover:text-aether'
                }`}
              >
                <div>{s.label}</div>
                <div className="text-[10px] text-text-low normal-case mt-0.5">{s.tag}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {(market.isLoading || recipes.isLoading) && <Spinner label="Loading market + recipe data…" />}
      {market.isError && <StatusBanner kind="error">Universalis fetch failed.</StatusBanner>}
      {recipes.isError && <StatusBanner kind="error">XIVAPI fetch failed.</StatusBanner>}

      <SessionResults result={result} />
    </div>
  );
}
