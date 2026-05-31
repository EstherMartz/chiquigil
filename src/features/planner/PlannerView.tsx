import { useEffect } from 'react';
import { usePlannerStore } from './plannerStore';
import { LANE_ORDER } from './seedPlanner';
import { HeroBlock } from './HeroBlock';
import { LaneCard } from './LaneCard';
import { DailyRhythm } from './DailyRhythm';
import { SalesInsights } from './SalesInsights';
import { UndercutPanel } from '../plugin/UndercutPanel';

export function PlannerView() {
  const lanes = usePlannerStore((s) => s.lanes);
  const dailyResetIfStale = usePlannerStore((s) => s.dailyResetIfStale);
  const resetAll = usePlannerStore((s) => s.resetAll);

  useEffect(() => {
    dailyResetIfStale();
    const onVis = () => {
      if (document.visibilityState === 'visible') dailyResetIfStale();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [dailyResetIfStale]);

  const activeCount = LANE_ORDER.reduce(
    (n, lane) => n + lanes[lane].filter((i) => i.active).length,
    0,
  );

  return (
    <div className="space-y-8">
      <HeroBlock />

      <UndercutPanel />

      <SalesInsights />

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-display text-xl text-text-cream tracking-wide">The Plan</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-border-base to-transparent" />
          <span className="font-mono text-[11px] text-text-low uppercase tracking-widest">
            {activeCount} active lines
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {LANE_ORDER.map((lane) => (
            <LaneCard key={lane} lane={lane} items={lanes[lane]} />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-display text-xl text-text-cream tracking-wide">Daily Rhythm</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-border-base to-transparent" />
          <span className="font-mono text-[11px] text-text-low uppercase tracking-widest">
            resets each day
          </span>
        </div>
        <DailyRhythm />
      </div>

      <footer className="flex items-center justify-between gap-3 flex-wrap font-mono text-[11px] text-text-low pt-4">
        <span>
          Snapshot prices from Universalis · throughput = price × units/day (gross)
        </span>
        <span>
          <button
            type="button"
            onClick={() => {
              if (confirm('Reset the entire planner to the default battle plan? This clears your log and progress.')) {
                resetAll();
              }
            }}
            className="text-aether hover:underline decoration-1 underline-offset-4"
          >
            reset planner
          </button>
          {' · auto-saved'}
        </span>
      </footer>
    </div>
  );
}
