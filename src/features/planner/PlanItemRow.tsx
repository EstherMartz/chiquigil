import type { LaneKey, PlanItem } from './seedPlanner';
import { abbr, fmt, supClass } from './plannerStats';

interface Props {
  lane: LaneKey;
  item: PlanItem;
  onToggleActive: () => void;
  onPlus: () => void;
  onMinus: () => void;
  onDelete: () => void;
}

const SUPPLY_PILL_CLASS: Record<string, string> = {
  low: 'text-jade border-jade/30',
  mid: 'text-gold border-gold/30',
  high: 'text-crimson border-crimson/30',
};

export function PlanItemRow({ item, onToggleActive, onPlus, onMinus, onDelete }: Props) {
  const sc = supClass(item.supply);
  return (
    <div
      className={`border border-border-base bg-bg-card-hi/30 p-3 mb-2 transition-opacity ${
        item.active ? '' : 'opacity-50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={item.active}
          onChange={onToggleActive}
          className="mt-0.5 accent-gold"
          aria-label="Active"
        />
        <div className="flex-1 min-w-0">
          <div className="font-body font-semibold text-sm text-text-cream leading-tight">{item.name}</div>
          <div className="font-mono text-[10px] text-text-low mt-0.5">{item.src}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remove "${item.name}"?`)) onDelete();
          }}
          className="text-text-low hover:text-crimson text-base leading-none opacity-60 hover:opacity-100 transition px-1"
          aria-label="Remove"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className="font-mono text-[10px] px-2 py-0.5 border border-border-base text-gold">
          {fmt(item.price)} g
        </span>
        <span className="font-mono text-[10px] px-2 py-0.5 border border-border-base text-text-dim">
          {item.perDay}/day
        </span>
        {sc !== '' && (
          <span className={`font-mono text-[10px] px-2 py-0.5 border ${SUPPLY_PILL_CLASS[sc]}`}>
            supply {item.supply}d
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-dashed border-border-base/50">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-low">sold</span>
        <button
          type="button"
          onClick={onMinus}
          disabled={item.units <= 0}
          className="bg-bg-deep border border-border-base text-text-dim hover:text-aether hover:border-aether disabled:opacity-30 disabled:cursor-not-allowed w-6 h-6 leading-none transition-colors"
          aria-label="Decrement units"
        >
          –
        </button>
        <span className="font-mono text-xs min-w-[28px] text-center text-text-cream">{item.units}</span>
        <button
          type="button"
          onClick={onPlus}
          className="bg-bg-deep border border-border-base text-text-dim hover:text-aether hover:border-aether w-6 h-6 leading-none transition-colors"
          aria-label="Increment units"
        >
          +
        </button>
        <span className="font-mono text-xs font-semibold text-jade ml-auto">
          +{abbr(item.earned)}
        </span>
      </div>
    </div>
  );
}
