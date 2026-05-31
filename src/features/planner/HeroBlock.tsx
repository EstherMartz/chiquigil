import { useMemo, useState } from 'react';
import { usePlannerStore } from './plannerStore';
import {
  abbr, abbrParts, elapsedDays, eta, pct, rate, todaySum, weekSum,
} from './plannerStats';
import { LANE_ORDER } from './seedPlanner';
import { EditGoalModal } from './EditGoalModal';
import { LedgerDrawer } from './LedgerDrawer';
import { SalesImport } from './SalesImport';
import { PluginGilSync } from '../plugin/PluginGilSync';

export function HeroBlock() {
  const goal = usePlannerStore((s) => s.goal);
  const log = usePlannerStore((s) => s.log);
  const lanes = usePlannerStore((s) => s.lanes);
  const logGil = usePlannerStore((s) => s.logGil);
  const setGoal = usePlannerStore((s) => s.setGoal);

  const [amt, setAmt] = useState('');
  const [itemId, setItemId] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const now = Date.now();
  const stats = useMemo(() => {
    const today = todaySum(log, now);
    const week = weekSum(log, now);
    const days = elapsedDays(goal.startTs, now);
    const r = rate(week, days);
    const remaining = Math.max(0, goal.target - goal.current);
    const e = eta(remaining, r);
    const totalEarned = LANE_ORDER.reduce(
      (sum, lane) => sum + lanes[lane].reduce((s, it) => s + it.earned, 0), 0,
    );
    const totalInvested = LANE_ORDER.reduce(
      (sum, lane) => sum + lanes[lane].reduce((s, it) => s + it.cost * it.units, 0), 0,
    );
    return {
      today, week, days, rate: r, remaining,
      eta: e, pct: pct(goal.current, goal.target),
      netProfit: totalEarned - totalInvested,
    };
  }, [log, goal, lanes, now]);

  const [curVal, curUnit] = abbrParts(goal.current);
  const targetAbbr = abbr(goal.target);

  function submitLog(e?: React.FormEvent) {
    e?.preventDefault();
    const n = parseInt(amt.replace(/[^0-9-]/g, ''), 10);
    if (!Number.isFinite(n) || n === 0) return;
    logGil(n, itemId ? { itemId } : undefined);
    setAmt('');
    setItemId('');
  }

  return (
    <section
      className="border border-border-base bg-bg-card p-4 sm:p-6 relative overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(circle at 100% 0%, rgba(212,169,88,0.12), transparent 55%)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-5 relative">
        <div>
          <div className="font-mono text-[11px] tracking-widest uppercase text-text-low mb-2">
            Current Treasury
          </div>
          <div className="font-display font-semibold text-4xl sm:text-5xl text-gold leading-none">
            {curVal}
            <span className="font-mono text-base sm:text-lg text-text-low ml-2">{curUnit}</span>
          </div>
          <div className="font-mono text-[13px] text-text-dim mt-2">
            toward <span className="text-gold">{targetAbbr}</span>
            {' · '}
            <span>{abbr(stats.remaining)} gil to go</span>
          </div>
          <PluginGilSync onSync={(gil) => setGoal({ current: gil })} />
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <StatTile label="Today" value={(stats.today >= 0 ? '+' : '') + abbr(stats.today)} accent="gold" />
          <StatTile label="Last 7d" value={'+' + abbr(stats.week)} accent="jade" />
          <StatTile label="Rate / day" value={stats.rate > 0 ? abbr(stats.rate) : '—'} />
          <StatTile label="Net Profit" value={abbr(stats.netProfit)} accent={stats.netProfit >= 0 ? 'jade' : 'crimson'} />
          <StatTile label="ETA" value={stats.eta != null ? stats.eta + 'd' : '—'} />
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between mb-2 font-mono">
          <span className="font-display font-semibold text-2xl text-gold tabular-nums leading-none">
            {stats.pct.toFixed(1)}%
          </span>
          <span className="text-[11px] text-text-low">
            target <span className="text-gold">{targetAbbr}</span>
          </span>
        </div>
        <div className="h-4 rounded-full bg-bg-card-hi border border-border-base overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{
              width: `${stats.pct}%`,
              background: 'linear-gradient(90deg, #a07b27, #d4a958, #f0c878)',
              boxShadow: '0 0 18px rgba(212,169,88,0.35)',
            }}
          />
        </div>
      </div>

      <form
        onSubmit={submitLog}
        className="flex flex-wrap items-center gap-2 mt-5 border border-border-base bg-bg-deep/30 p-3"
      >
        <span className="font-mono text-[11px] tracking-widest uppercase text-text-low">Log gil</span>
        <input
          type="text"
          inputMode="numeric"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          placeholder="e.g. 4,025,000"
          className="w-40 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
        />
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
        >
          <option value="">— untagged —</option>
          {LANE_ORDER.flatMap((lane) =>
            lanes[lane].map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            )),
          )}
        </select>
        <button
          type="submit"
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 transition-opacity"
        >
          + Add to treasury
        </button>
        <button
          type="button"
          onClick={() => setLedgerOpen((v) => !v)}
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-2 hover:text-aether hover:border-aether transition-colors"
        >
          Ledger
        </button>
        <SalesImport />
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="ml-auto font-mono text-[11px] text-aether hover:underline decoration-1 underline-offset-4"
        >
          edit goal
        </button>
      </form>

      <LedgerDrawer open={ledgerOpen} />

      {editOpen && (
        <EditGoalModal
          current={goal.current}
          target={goal.target}
          onSave={(patch) => setGoal(patch)}
          onClose={() => setEditOpen(false)}
        />
      )}
    </section>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: 'gold' | 'jade' | 'crimson' }) {
  const valueColor = accent === 'gold' ? 'text-gold' : accent === 'jade' ? 'text-jade' : accent === 'crimson' ? 'text-crimson' : 'text-text-cream';
  return (
    <div className="border border-border-base bg-bg-card-hi/40 px-3 py-2 min-w-[104px]">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">{label}</div>
      <div className={`font-mono text-lg font-semibold mt-1 ${valueColor}`}>{value}</div>
    </div>
  );
}
