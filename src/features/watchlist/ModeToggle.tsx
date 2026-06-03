import type { SuggestionMode } from './suggestions';

const MODES: [SuggestionMode, string][] = [
  ['craft', 'Craft'], ['vendor', 'Vendor'], ['gather', 'Gather'],
];

/** Craft / Vendor / Gather selector for suggestion sources. */
export function ModeToggle({ mode, onChange }: { mode: SuggestionMode; onChange: (m: SuggestionMode) => void }) {
  return (
    <div className="flex gap-1">
      {MODES.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 transition-colors ${
            mode === id ? 'text-aether' : 'text-text-dim hover:text-aether'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
