import { usePlannerStore } from './plannerStore';
import { DAILY_TASKS } from './seedPlanner';

export function DailyRhythm() {
  const daily = usePlannerStore((s) => s.daily);
  const toggleDaily = usePlannerStore((s) => s.toggleDaily);
  const doneCount = DAILY_TASKS.reduce((n, t) => n + (daily.done[t.id] ? 1 : 0), 0);

  return (
    <section className="border border-border-base bg-bg-card p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
        {DAILY_TASKS.map((t) => {
          const done = !!daily.done[t.id];
          return (
            <label
              key={t.id}
              className="flex items-center gap-2.5 py-1.5 border-b border-border-base/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggleDaily(t.id)}
                className="accent-gold"
              />
              <span className={`text-sm ${done ? 'text-text-low line-through' : 'text-text-cream'}`}>
                {t.label}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-4 font-mono text-[11px] text-text-low uppercase tracking-widest">
        <span>
          <span className="text-jade">{doneCount}</span> / {DAILY_TASKS.length} done today
        </span>
        <span>{daily.date || '—'}</span>
      </div>
    </section>
  );
}
