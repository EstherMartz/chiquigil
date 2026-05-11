import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useMarketData } from '../watchlist/useMarketData';
import { useRecipes } from '../profit/useRecipes';
import { allItemsFromEnabledPacks } from '../items/starterPacks';
import { buildRows } from '../watchlist/buildRows';
import { buildCandidates } from './buildCandidates';
import { packSession, type SessionStrategy } from './packSession';
import { SessionMasthead } from './SessionMasthead';
import { SessionHero } from './SessionHero';
import { SessionForm } from './SessionForm';
import { SessionDocket } from './SessionDocket';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import type { CrafterCode } from '../items/types';
import { HomePanel } from '../home/HomePanel';
import { SessionDefaults } from '../settings/SessionDefaults';
import { LevelsEditor } from '../settings/LevelsEditor';
import { WorldDcPicker } from '../settings/WorldDcPicker';
import { PackToggles } from '../settings/PackToggles';
import { AddItemSearch } from '../settings/AddItemSearch';

interface Committed {
  minutes: number;
  strategy: SessionStrategy;
  crafterLock: CrafterCode | undefined;
  minProfit: number | undefined;
}

function configsEqual(a: Committed, b: Committed): boolean {
  return (
    a.minutes === b.minutes &&
    a.strategy === b.strategy &&
    a.crafterLock === b.crafterLock &&
    a.minProfit === b.minProfit
  );
}

export default function SessionPlanner() {
  const settings = useSettingsStore();
  const { starterPacks, customItems, perItemFlags, excludedItems } = useWatchlistStore();

  const [minutes, setMinutes] = useState(60);
  const [strategy, setStrategy] = useState<SessionStrategy>('balanced');
  const [crafterLock, setCrafterLock] = useState<CrafterCode | undefined>(undefined);
  const [minProfit, setMinProfit] = useState<number | undefined>(undefined);

  const [committed, setCommitted] = useState<Committed | null>(null);
  const [benchOpenManual, setBenchOpenManual] = useState<boolean | null>(null);

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks, new Set(excludedItems));
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedItems.includes(i.id))];
  }, [starterPacks, customItems, excludedItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, settings.world, settings.dc);
  const recipes = useRecipes(ids);
  const dataReady = !!market.data && !!recipes.data;

  const computed = useMemo(() => {
    if (!committed || !market.data || !recipes.data) return null;
    const rows = buildRows(
      items,
      market.data.phantom,
      market.data.dc,
      settings.retainerLevels,
      recipes.data,
      perItemFlags,
      Date.now(),
    );
    const candidates = buildCandidates(rows, {
      baseSeconds: settings.defaultCraftTimeSeconds,
      perItemFlags,
      crafterLock: committed.crafterLock,
      minProfit: committed.minProfit,
    });
    const result = packSession(candidates, {
      budgetMinutes: committed.minutes,
      overheadMinutes: settings.overheadMinutes,
      batchCapDays: settings.batchCapDays,
      strategy: committed.strategy,
    });
    const diagnostics = {
      totalItems: rows.length,
      withRecipe: rows.filter((r) => r.craftable === true).length,
      craftableAtMyLevel: rows.filter((r) => r.craftable === true && r.craftStatus === 'ok').length,
      profitable: rows.filter((r) => r.craftable === true && r.craftStatus === 'ok' && r.profit != null && r.profit > 0).length,
      candidates: candidates.length,
    };
    return { result, diagnostics };
  }, [
    committed, items, market.data, recipes.data,
    settings.retainerLevels, settings.defaultCraftTimeSeconds, settings.overheadMinutes, settings.batchCapDays,
    perItemFlags,
  ]);
  const result = computed?.result ?? null;
  const diagnostics = computed?.diagnostics ?? null;

  function generate() {
    setCommitted({ minutes, strategy, crafterLock, minProfit });
  }

  function refresh() {
    market.refetch();
    recipes.refetch();
  }

  const stale = committed != null && !configsEqual(committed, { minutes, strategy, crafterLock, minProfit });
  const watchlistEmpty = items.length === 0;
  const benchOpen = benchOpenManual ?? watchlistEmpty;

  return (
    <div className="max-w-7xl mx-auto px-4">
      <SessionMasthead
        dataUpdatedAt={market.dataUpdatedAt ?? null}
        onRefresh={refresh}
        isRefreshing={market.isFetching || recipes.isFetching}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <SessionHero
          result={result}
          hasGenerated={committed != null}
          strategy={committed?.strategy ?? strategy}
          stale={stale}
          diagnostics={diagnostics}
        />
        <SessionForm
          minutes={minutes} setMinutes={setMinutes}
          strategy={strategy} setStrategy={setStrategy}
          crafterLock={crafterLock} setCrafterLock={setCrafterLock}
          minProfit={minProfit} setMinProfit={setMinProfit}
          onGenerate={generate}
          canGenerate={dataReady}
          stale={stale}
        />
      </div>

      {(market.isLoading || recipes.isLoading) && (
        <div className="mt-6"><Spinner label="Loading market + recipe data…" /></div>
      )}
      {market.isError && (
        <div className="mt-6"><StatusBanner kind="error">Universalis fetch failed.</StatusBanner></div>
      )}
      {recipes.isError && (
        <div className="mt-6"><StatusBanner kind="error">XIVAPI fetch failed.</StatusBanner></div>
      )}

      <SessionDocket result={result} hasGenerated={committed != null} />

      <section className="mt-14">
        <button
          onClick={() => setBenchOpenManual(!benchOpen)}
          className="font-mono text-[10px] tracking-[0.4em] uppercase text-text-low hover:text-aether border-b-2 border-border-base pb-2 mb-4 w-full text-left flex justify-between items-center transition-colors"
        >
          <span>The Editor's Bench</span>
          <span>{benchOpen ? '— hide' : '+ show'}</span>
        </button>
        {benchOpen && (
          <div className="space-y-4">
            <HomePanel title="Session defaults">
              <SessionDefaults />
            </HomePanel>
            <HomePanel title="Retainer levels">
              <LevelsEditor />
            </HomePanel>
            <HomePanel title="World &amp; Data Center">
              <WorldDcPicker />
            </HomePanel>
            <HomePanel title="Watchlist" hint="packs + custom items">
              <div className="space-y-6">
                <div>
                  <h4 className="font-mono text-[10px] tracking-widest text-text-low uppercase mb-2">Starter packs</h4>
                  <PackToggles />
                </div>
                <div>
                  <h4 className="font-mono text-[10px] tracking-widest text-text-low uppercase mb-2">Custom items</h4>
                  <AddItemSearch />
                </div>
              </div>
            </HomePanel>
          </div>
        )}
      </section>
    </div>
  );
}
