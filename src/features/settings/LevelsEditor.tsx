import { useSettingsStore, type CrafterLevels } from './store';

const ORDER: (keyof CrafterLevels)[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'];

function tierClass(lvl: number): string {
  if (lvl >= 100) return 'text-gold-hi';
  if (lvl >= 80) return 'text-text-cream';
  if (lvl >= 50) return 'text-text-dim';
  return 'text-text-low';
}

export function LevelsEditor() {
  const { retainerLevels, setRetainerLevel } = useSettingsStore();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {ORDER.map((c) => {
        const lvl = retainerLevels[c];
        return (
          <label key={c} className="flex flex-col items-center text-center p-2 border border-border-base bg-bg-card">
            <span className="font-mono text-[10px] tracking-widest text-text-dim uppercase">{c}</span>
            <input
              type="number"
              min={1}
              max={100}
              value={lvl}
              onChange={(e) => setRetainerLevel(c, Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
              className={`mt-1 w-full bg-transparent text-center font-display text-2xl font-semibold focus:outline-none ${tierClass(lvl)}`}
            />
          </label>
        );
      })}
    </div>
  );
}
