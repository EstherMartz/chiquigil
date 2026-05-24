import { PlannerView } from '../features/planner/PlannerView';

export default function Planner() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Crafting Plan</h2>
        <p className="font-mono text-[13px] text-text-low max-w-prose">
          Your battle plan toward the gil target. Log sales, track progress, and check in daily.
        </p>
      </div>
      <PlannerView />
    </div>
  );
}
