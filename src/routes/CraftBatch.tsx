import { CraftBatchView } from '../features/craftBatch/CraftBatchView';

export default function CraftBatch() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Craft Batch Planner</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Build a diversified crafting batch within your budget. Auto-picks profitable items across categories, then let you swap before sending to Shopping List.
        </p>
      </div>
      <CraftBatchView />
    </div>
  );
}
