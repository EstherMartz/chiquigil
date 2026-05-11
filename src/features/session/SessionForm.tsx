import type { SessionStrategy } from './packSession';
import type { CrafterCode } from '../items/types';
import { useSettingsStore } from '../settings/store';

const STRATEGIES: { id: SessionStrategy; label: string; tag: string }[] = [
  { id: 'balanced', label: 'Balanced',  tag: 'margin × movement' },
  { id: 'quickwin', label: 'Quick Win', tag: 'favor fast movers' },
  { id: 'patient',  label: 'Patient',   tag: 'favor fat margins' },
];

const CRAFTERS: CrafterCode[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'];

interface Props {
  minutes: number;
  setMinutes: (n: number) => void;
  strategy: SessionStrategy;
  setStrategy: (s: SessionStrategy) => void;
  crafterLock: CrafterCode | undefined;
  setCrafterLock: (c: CrafterCode | undefined) => void;
  minProfit: number | undefined;
  setMinProfit: (n: number | undefined) => void;
  onGenerate: () => void;
  canGenerate: boolean;
  stale: boolean;
}

export function SessionForm(p: Props) {
  const { overheadMinutes } = useSettingsStore();
  return (
    <aside className="border border-border-base bg-bg-card p-5 space-y-4 lg:sticky lg:top-4 h-fit">
      <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-gold border-b border-border-base pb-2">
        The Plan
      </div>

      <label className="block">
        <span className="font-mono text-[9px] tracking-widest text-text-low uppercase">Time (min)</span>
        <input
          type="number"
          min={1}
          max={600}
          value={p.minutes}
          onChange={(e) => p.setMinutes(Math.max(1, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
        />
        <span className="block mt-1 font-mono text-[9px] text-text-low">
          −{overheadMinutes} overhead = {Math.max(0, p.minutes - overheadMinutes)} crafting
        </span>
      </label>

      <label className="block">
        <span className="font-mono text-[9px] tracking-widest text-text-low uppercase">Crafter</span>
        <select
          value={p.crafterLock ?? ''}
          onChange={(e) => p.setCrafterLock(e.target.value === '' ? undefined : (e.target.value as CrafterCode))}
          className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
        >
          <option value="">Any</option>
          {CRAFTERS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="font-mono text-[9px] tracking-widest text-text-low uppercase">Min profit (gil)</span>
        <input
          type="number"
          min={0}
          value={p.minProfit ?? ''}
          placeholder="any"
          onChange={(e) =>
            p.setMinProfit(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0))
          }
          className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
        />
      </label>

      <div>
        <span className="font-mono text-[9px] tracking-widest text-text-low uppercase block mb-2">Strategy</span>
        <div className="space-y-1">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              onClick={() => p.setStrategy(s.id)}
              className={`w-full text-left px-3 py-2 border font-mono text-xs flex justify-between items-center transition-colors ${
                p.strategy === s.id
                  ? 'border-gold text-gold bg-bg-deep'
                  : 'border-border-base text-text-dim hover:text-aether hover:border-border-hi'
              }`}
            >
              <span className="uppercase tracking-wider">{s.label}</span>
              <span className="text-[9px] text-text-low normal-case">{s.tag}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={p.onGenerate}
        disabled={!p.canGenerate}
        className={`w-full mt-2 px-4 py-3 font-display text-base tracking-[0.25em] uppercase border-2 transition-colors ${
          !p.canGenerate
            ? 'opacity-40 cursor-not-allowed bg-bg-card text-text-low border-border-base'
            : p.stale
              ? 'bg-gold-hi text-bg-deep border-gold-hi hover:bg-gold hover:border-gold animate-pulse'
              : 'bg-gold text-bg-deep border-gold hover:bg-gold-hi hover:border-gold-hi'
        }`}
      >
        {p.stale ? 'Regenerate →' : 'Generate →'}
      </button>
      {p.stale && (
        <p className="font-mono text-[9px] text-crimson tracking-wider text-center -mt-1">
          settings changed since last run
        </p>
      )}
    </aside>
  );
}
