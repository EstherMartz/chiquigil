import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runCraftFlip, narrowForCraftFlip } from '../queries/runCraftFlip';
import { useRecipes } from '../profit/useRecipes';
import { sessionCandidatesFromCraftFlip } from './sessionFromCraftFlip';
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
import type { QueryFilter } from '../queries/types';

interface Committed {
  minutes: number;
  strategy: SessionStrategy;
  crafterLock: CrafterCode | undefined;
  minProfit: number | undefined;
  minIlvl: number | undefined;
  maxIlvl: number | undefined;
}

function configsEqual(a: Committed, b: Committed): boolean {
  return (
    a.minutes === b.minutes &&
    a.strategy === b.strategy &&
    a.crafterLock === b.crafterLock &&
    a.minProfit === b.minProfit &&
    a.minIlvl === b.minIlvl &&
    a.maxIlvl === b.maxIlvl
  );
}

const SCAN_FILTER: QueryFilter = {
  searchCategories: [],
  hq: 'either',
  minDealPct: 0,
  minVelocity: 1,
  minPrice: null,
  maxPrice: null,
  sort: 'gilFlow',
  limit: 500,
  scope: 'home',
  maxListings: null,
  mode: 'craft',
  minGap: null,
  trainedEye: false,
};

interface ScanResult {
  priceMap: MarketData;
  narrowedIds: number[];
  scannedCount: number;
  completedAt: number;
}

export default function SessionPlanner() {
  const settings = useSettingsStore();
  const { perItemFlags } = useWatchlistStore();
  const snapshot = useItemSnapshot();

  const [minutes, setMinutes] = useState(60);
  const [strategy, setStrategy] = useState<SessionStrategy>('balanced');
  const [crafterLock, setCrafterLock] = useState<CrafterCode | undefined>(undefined);
  const [minProfit, setMinProfit] = useState<number | undefined>(undefined);
  const [minIlvl, setMinIlvl] = useState<number | undefined>(undefined);
  const [maxIlvl, setMaxIlvl] = useState<number | undefined>(undefined);

  const [committed, setCommitted] = useState<Committed | null>(null);
  const [benchOpenManual, setBenchOpenManual] = useState<boolean | null>(null);

  const allIds = useMemo(() => {
    if (!snapshot.data) return [];
    return snapshot.data.items.map((i) => i.id);
  }, [snapshot.data]);

  const ilvlById = useMemo(() => {
    const m = new Map<number, number>();
    if (snapshot.data) {
      for (const it of snapshot.data.items) m.set(it.id, it.ilvl);
    }
    return m;
  }, [snapshot.data]);

  const scan = useMutation<ScanResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item catalog not ready');
      const result = await fetchInBatches<MarketData[string]>(
        allIds,
        async (chunk) => fetchMarketData(settings.world, chunk),
        { chunkSize: 25, concurrency: 4 },
      );
      const narrowedIds = narrowForCraftFlip(snapshot.data.items, result.data, SCAN_FILTER);
      return {
        priceMap: result.data,
        narrowedIds,
        scannedCount: allIds.length,
        completedAt: Date.now(),
      };
    },
  });

  const recipes = useRecipes(scan.data?.narrowedIds ?? []);

  const computed = useMemo(() => {
    if (!committed || !scan.data || !recipes.data || !snapshot.data) return null;
    const craftFlipRows = runCraftFlip(
      snapshot.data.items,
      scan.data.priceMap,
      recipes.data,
      SCAN_FILTER,
    );
    const candidates = sessionCandidatesFromCraftFlip(craftFlipRows, {
      recipeMap: recipes.data,
      priceMap: scan.data.priceMap,
      levels: settings.retainerLevels,
      baseSeconds: settings.defaultCraftTimeSeconds,
      perItemFlags,
      crafterLock: committed.crafterLock,
      minProfit: committed.minProfit,
      ilvlById,
      minIlvl: committed.minIlvl,
      maxIlvl: committed.maxIlvl,
    });
    const result = packSession(candidates, {
      budgetMinutes: committed.minutes,
      overheadMinutes: settings.overheadMinutes,
      batchCapDays: settings.batchCapDays,
      strategy: committed.strategy,
    });
    const atMyLevel = sessionCandidatesFromCraftFlip(craftFlipRows, {
      recipeMap: recipes.data,
      priceMap: scan.data.priceMap,
      levels: settings.retainerLevels,
      baseSeconds: settings.defaultCraftTimeSeconds,
      perItemFlags,
    }).length;
    const diagnostics = {
      scanned: scan.data.scannedCount,
      profitable: craftFlipRows.length,
      atMyLevel,
      pickable: candidates.length,
    };
    return { result, diagnostics };
  }, [committed, scan.data, recipes.data, snapshot.data, settings, perItemFlags, ilvlById]);

  const result = computed?.result ?? null;
  const diagnostics = computed?.diagnostics ?? null;

  function generate() {
    setCommitted({ minutes, strategy, crafterLock, minProfit, minIlvl, maxIlvl });
    scan.mutate();
  }

  function refresh() {
    if (committed) scan.mutate();
  }

  const stale = committed != null && !configsEqual(committed, { minutes, strategy, crafterLock, minProfit, minIlvl, maxIlvl });
  const benchOpen = benchOpenManual ?? false;
  const dataReady = !!snapshot.data;

  const scanning = scan.isPending;
  const resolvingRecipes = scan.data != null && recipes.isLoading;

  return (
    <div className="max-w-7xl mx-auto px-4">
      <SessionMasthead
        dataUpdatedAt={scan.data?.completedAt ?? null}
        onRefresh={refresh}
        isRefreshing={scanning || resolvingRecipes}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <SessionHero
          result={result}
          hasGenerated={committed != null && !scanning && !resolvingRecipes}
          strategy={committed?.strategy ?? strategy}
          stale={stale}
          diagnostics={diagnostics}
        />
        <SessionForm
          minutes={minutes} setMinutes={setMinutes}
          strategy={strategy} setStrategy={setStrategy}
          crafterLock={crafterLock} setCrafterLock={setCrafterLock}
          minProfit={minProfit} setMinProfit={setMinProfit}
          minIlvl={minIlvl} setMinIlvl={setMinIlvl}
          maxIlvl={maxIlvl} setMaxIlvl={setMaxIlvl}
          onGenerate={generate}
          canGenerate={dataReady && !scanning}
          stale={stale}
        />
      </div>

      {snapshot.isLoading && (
        <div className="mt-6">
          <Spinner label={`Loading item catalog (~30s, one-time)… ${snapshot.progress.toLocaleString()} items`} />
        </div>
      )}
      {snapshot.isError && (
        <div className="mt-6"><StatusBanner kind="error">XIVAPI item catalog failed: {(snapshot.error as Error).message}</StatusBanner></div>
      )}
      {scanning && (
        <div className="mt-6"><Spinner label={`Scanning ${allIds.length.toLocaleString()} items on ${settings.world}…`} /></div>
      )}
      {scan.isError && (
        <div className="mt-6"><StatusBanner kind="error">Universalis scan failed: {(scan.error as Error).message}</StatusBanner></div>
      )}
      {resolvingRecipes && (
        <div className="mt-6"><Spinner label={`Resolving ${scan.data!.narrowedIds.length} recipes…`} /></div>
      )}
      {recipes.isError && (
        <div className="mt-6"><StatusBanner kind="error">XIVAPI recipe fetch failed.</StatusBanner></div>
      )}

      <SessionDocket result={result} hasGenerated={committed != null && !scanning && !resolvingRecipes} />

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
          </div>
        )}
      </section>
    </div>
  );
}
