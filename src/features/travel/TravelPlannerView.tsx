import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useSelectedItems } from '../items/useSelectedItems';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { useInitialScan } from '../queries/useInitialScan';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { EU_WORLDS, dcOf } from '../../lib/europeWorlds';
import { planTravel } from './planTravel';
import { TravelResults } from './TravelResults';
import type { HqMode, TravelMetric, TravelPlan } from './types';
import { fmtGil } from '../../lib/format';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';

const MAX_CANDIDATES = 500;

/**
 * Destination books come from the region-scope cache (every world you can
 * DC-travel to lives in your physical region). Must match the scope seeded at
 * startup in main.tsx (`loadSharedMarketCache(world, dc, 'Europe')`).
 */
const REGION = 'Europe';

interface RunResult {
  destMarket: MarketData;
  homeMarket: MarketData;
  skipped: number;
  destWorld: string;
}

export function TravelPlannerView() {
  const { world, hideCrystals, applyMarketTax } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const watchlistItems = useSelectedItems();

  const destChoices = useMemo(
    () => [...EU_WORLDS]
      .filter((w) => w !== world)
      .sort((a, b) => {
        const da = dcOf(a)!, db = dcOf(b)!;
        return da === db ? a.localeCompare(b) : da.localeCompare(db);
      }),
    [world],
  );

  const [dest, setDest] = useState(() => destChoices[0] ?? '');
  const [budget, setBudget] = useState<number | null>(null);
  const [metric, setMetric] = useState<TravelMetric>('profit');
  const [hq, setHq] = useState<HqMode>('either');
  const [minVelocity, setMinVelocity] = useState(1);
  const [horizonDays, setHorizonDays] = useState(7);

  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const ids = new Set<number>();
    for (const it of watchlistItems) ids.add(it.id);
    const catalog = [...snapshot.data.items]
      .filter((i) => i.sc > 0)
      .filter((i) => !(hideCrystals && i.sc === CRYSTALS_SEARCH_CATEGORY))
      .filter((i) => (hq === 'hq' ? i.canHq : true))
      .sort((a, b) => b.ilvl - a.ilvl);
    for (const it of catalog) {
      if (ids.size >= MAX_CANDIDATES) break;
      ids.add(it.id);
    }
    return [...ids];
  }, [snapshot.data, watchlistItems, hideCrystals, hq]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      if (!dest) throw new Error('Pick a destination world');
      // Destination listings come from the region-scope cache (filtered to the
      // chosen world in planTravel); the per-world scope is never seeded.
      const [destRes, homeRes] = await Promise.all([
        fetchInBatches<MarketData[string]>(candidateIds, (chunk) => fetchMarketData(REGION, chunk), { chunkSize: 100, concurrency: 4 }),
        fetchInBatches<MarketData[string]>(candidateIds, (chunk) => fetchMarketData(world, chunk), { chunkSize: 100, concurrency: 4 }),
      ]);
      return {
        destMarket: destRes.data,
        homeMarket: homeRes.data,
        skipped: destRes.errors.length + homeRes.errors.length,
        destWorld: dest,
      };
    },
  });

  const plan = useMemo<TravelPlan | null>(() => {
    if (!snapshot.data || !run.data) return null;
    return planTravel(snapshot.data.items, run.data.destMarket, run.data.homeMarket, {
      homeWorld: world, destWorld: run.data.destWorld, budget, metric, hq, minVelocity, horizonDays, applyMarketTax,
    });
  }, [snapshot.data, run.data, world, budget, metric, hq, minVelocity, horizonDays, applyMarketTax]);

  const ready = snapshot.data != null && dest !== '';
  useInitialScan(ready, () => { run.reset(); run.mutate(); });

  return (
    <div className="space-y-4">
      <FilterBar
        dest={dest} destChoices={destChoices} onDest={setDest}
        budget={budget} onBudget={setBudget}
        metric={metric} onMetric={setMetric}
        hq={hq} onHq={setHq}
        minVelocity={minVelocity} onMinVelocity={setMinVelocity}
        horizonDays={horizonDays} onHorizon={setHorizonDays}
        onRun={() => { run.reset(); run.mutate(); }}
        busy={run.isPending} notReady={!snapshot.data}
      />

      {run.isPending && <Spinner label={`Pricing ${candidateIds.length} items on ${dest} and ${world}…`} />}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}

      {!run.data && !run.isPending && (
        <EmptyState icon="✈" message={snapshot.data ? `Plan a buying trip to ${dest || 'another world'} and sell back on ${world}.` : 'Loading item catalog…'} />
      )}

      {plan && run.data && (
        <>
          <SummaryBand plan={plan} dest={run.data.destWorld} home={world} budget={budget} />
          <TravelResults rows={plan.rows} totalCandidates={candidateIds.length} skippedChunks={run.data.skipped} />
        </>
      )}
    </div>
  );
}

function SummaryBand({ plan, dest, home, budget }: {
  plan: TravelPlan; dest: string; home: string; budget: number | null;
}) {
  const spend = budget && budget > 0 ? `${fmtGil(plan.totalCost)} / ${fmtGil(budget)}` : fmtGil(plan.totalCost);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border border-border-base bg-bg-card font-mono">
      <Stat label={`Buy on ${dest}`} value={`${plan.rows.length} items · ${plan.totalUnits} units`} tone="text-aether" />
      <Stat label="Spend" value={spend} tone="text-gold" />
      <Stat label={`Profit on ${home}`} value={`+${fmtGil(plan.totalProfit)}`} tone="text-jade" />
      <Stat label="Blended ROI" value={`${Math.round(plan.blendedRoi * 100)}%`} tone="text-text-cream" />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest uppercase text-text-low">{label}</div>
      <div className={`mt-0.5 text-sm tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function FilterBar(props: {
  dest: string; destChoices: string[]; onDest: (w: string) => void;
  budget: number | null; onBudget: (n: number | null) => void;
  metric: TravelMetric; onMetric: (m: TravelMetric) => void;
  hq: HqMode; onHq: (m: HqMode) => void;
  minVelocity: number; onMinVelocity: (n: number) => void;
  horizonDays: number; onHorizon: (n: number) => void;
  onRun: () => void; busy: boolean; notReady: boolean;
}) {
  const metrics: { id: TravelMetric; label: string }[] = [
    { id: 'profit', label: 'Profit' },
    { id: 'roi', label: 'ROI %' },
    { id: 'spread', label: 'Spread' },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Destination</span>
        <select
          value={props.dest}
          onChange={(e) => props.onDest(e.target.value)}
          className="mt-1 block w-44 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
        >
          {props.destChoices.map((w) => (
            <option key={w} value={w}>{w} ({dcOf(w)})</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Budget (gil)</span>
        <input
          type="number" inputMode="decimal" min={0} step={10000}
          value={props.budget ?? ''}
          placeholder="∞"
          onChange={(e) => { const n = Number(e.target.value); props.onBudget(Number.isFinite(n) && n > 0 ? n : null); }}
          className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Rank by</span>
        <div className="flex gap-2">
          {metrics.map((m) => (
            <button key={m.id} type="button" onClick={() => props.onMetric(m.id)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${props.metric === m.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">HQ mode</span>
        <div className="flex gap-2">
          {(['nq', 'hq', 'either'] as HqMode[]).map((mode) => (
            <button key={mode} type="button" onClick={() => props.onHq(mode)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${props.hq === mode ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {mode === 'either' ? 'Either' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min sales/day</span>
        <input type="number" inputMode="decimal" min={0} step={0.1} value={props.minVelocity}
          onChange={(e) => props.onMinVelocity(Math.max(0, Number(e.target.value) || 0))}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Sell horizon (days)</span>
        <input type="number" inputMode="decimal" min={1} step={1} value={props.horizonDays}
          onChange={(e) => props.onHorizon(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <div className="flex flex-col items-stretch gap-1 w-full sm:w-auto sm:ml-auto order-last">
        <button type="button" onClick={props.onRun} disabled={props.busy || props.notReady}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          {props.busy ? <>Running…<SpinGlyph /></> : 'Run scan'}
        </button>
      </div>
    </div>
  );
}
