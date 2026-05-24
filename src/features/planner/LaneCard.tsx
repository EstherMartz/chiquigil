import { useState } from 'react';
import { LANE_META, type LaneKey, type PlanItem } from './seedPlanner';
import { PlanItemRow } from './PlanItemRow';
import { AddItemModal } from './AddItemModal';
import { usePlannerStore } from './plannerStore';

interface Props {
  lane: LaneKey;
  items: PlanItem[];
}

export function LaneCard({ lane, items }: Props) {
  const meta = LANE_META[lane];
  const [addOpen, setAddOpen] = useState(false);

  const recordSale = usePlannerStore((s) => s.recordSale);
  const reverseSale = usePlannerStore((s) => s.reverseSale);
  const toggleActive = usePlannerStore((s) => s.toggleActive);
  const removeItem = usePlannerStore((s) => s.removeItem);
  const addItem = usePlannerStore((s) => s.addItem);

  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} aria-hidden />
        <span className="font-display text-base text-text-cream tracking-wide">{meta.nm}</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-text-low">
          {meta.desc}
        </span>
      </div>

      {items.map((item) => (
        <PlanItemRow
          key={item.id}
          lane={lane}
          item={item}
          onToggleActive={() => toggleActive(lane, item.id)}
          onPlus={() => recordSale(lane, item.id)}
          onMinus={() => reverseSale(lane, item.id)}
          onDelete={() => removeItem(lane, item.id)}
        />
      ))}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="w-full font-mono text-[11px] tracking-widest uppercase text-text-low hover:text-gold border border-dashed border-border-base hover:border-gold py-2.5 mt-1 transition-colors"
      >
        + add item to {meta.nm}
      </button>

      {addOpen && (
        <AddItemModal
          lane={lane}
          onAdd={(partial) => addItem(lane, partial)}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
