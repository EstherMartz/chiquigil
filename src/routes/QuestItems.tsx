import { QuestItemFlipView } from '../features/insights/QuestItemFlipView';

export default function QuestItems() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Quest Items</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Find profitable quest-reward items to flip on the MB. Compare required quantities against market prices and rank by revenue/day.
        </p>
      </div>
      <QuestItemFlipView />
    </div>
  );
}
