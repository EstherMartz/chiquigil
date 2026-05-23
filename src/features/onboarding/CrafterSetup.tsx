import type { CrafterLevels } from '../settings/store';

const JOBS: (keyof CrafterLevels)[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'];

function tierClass(lvl: number): string {
  if (lvl >= 100) return 'text-gold-hi';
  if (lvl >= 80) return 'text-text-cream';
  if (lvl >= 50) return 'text-text-dim';
  return 'text-text-low';
}

interface Props {
  levels: CrafterLevels;
  onChange: (levels: CrafterLevels) => void;
}

export function CrafterSetup({ levels, onChange }: Props) {
  function setLevel(job: keyof CrafterLevels, value: number) {
    onChange({ ...levels, [job]: Math.max(0, Math.min(100, value)) });
  }

  function allMax() {
    const next = { ...levels };
    for (const j of JOBS) next[j] = 100;
    onChange(next);
  }

  function clearAll() {
    const next = { ...levels };
    for (const j of JOBS) next[j] = 0;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={allMax}
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-1.5 hover:border-gold hover:text-gold transition-colors"
        >
          All level 100
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-1.5 hover:border-aether hover:text-aether transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {JOBS.map((job) => {
          const lvl = levels[job];
          return (
            <label key={job} className="flex flex-col items-center text-center p-2 border border-border-base bg-bg-card-hi">
              <span className="font-mono text-[10px] tracking-widest text-text-dim uppercase">{job}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={lvl}
                onChange={(e) => setLevel(job, Number(e.target.value) || 0)}
                className={`mt-1 w-full bg-transparent text-center font-display text-2xl font-semibold focus:outline-none ${tierClass(lvl)}`}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
