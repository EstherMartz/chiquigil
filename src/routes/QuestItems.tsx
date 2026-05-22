import { QuestItemFlipView } from '../features/insights/QuestItemFlipView';

export default function QuestItems() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">GC Supply Turn-ins</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Items players need for daily Grand Company supply missions. High-velocity items sell well because demand recurs daily.
        </p>
      </div>
      <QuestItemFlipView />
    </div>
  );
}
