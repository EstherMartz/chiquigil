import type { MaterialSource } from './useComparePaths';

const SOURCE_OPTS: { value: MaterialSource; label: string }[] = [
  { value: 'home', label: 'Home MB' },
  { value: 'region', label: 'Region' },
  { value: 'self', label: 'Self-sourced' },
];

export function CompareControls({
  quantity, onQuantity, materialSource, onMaterialSource,
}: {
  quantity: number;
  onQuantity: (n: number) => void;
  materialSource: MaterialSource;
  onMaterialSource: (s: MaterialSource) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 mb-4">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">How many do you have?</span>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => onQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="w-24 bg-bg-card border border-border-base text-text-cream font-mono text-sm px-3 py-2 focus:outline-none focus:border-aether"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Materials from</span>
        <div className="flex" role="group" aria-label="Materials from">
          {SOURCE_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={materialSource === o.value}
              onClick={() => onMaterialSource(o.value)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-border-base -ml-px first:ml-0 transition-colors ${
                materialSource === o.value ? 'bg-aether text-bg-deep border-aether' : 'text-text-dim hover:text-aether'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
