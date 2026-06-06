import { TravelPlannerView } from '../features/travel/TravelPlannerView';

export default function Travel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Travel Planner</h2>
        <p className="font-mono text-[13px] text-text-low max-w-prose">
          Pick a world you can travel to and get a budget-aware shopping list — items to buy
          there and resell on your home world.
        </p>
      </div>
      <TravelPlannerView />
    </div>
  );
}
