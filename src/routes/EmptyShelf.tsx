import { EmptyShelfView } from '../features/insights/EmptyShelfView';

export default function EmptyShelf() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Empty Shelf</h2>
        <p className="font-mono text-[13px] text-text-low max-w-prose">
          Restock opportunities — items sold out on your home world that still sell. List into the gap.
        </p>
      </div>
      <EmptyShelfView />
    </div>
  );
}
