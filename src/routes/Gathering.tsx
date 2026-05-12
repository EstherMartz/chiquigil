import { QueriesView } from '../features/queries/QueriesView';

export default function Gathering() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <h2 className="font-display text-lg text-gold tracking-wide">Gathering</h2>
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Raw materials you can gather while doing other things. Sells as-is — no recipe required.
      </p>
      <QueriesView category="gathering" />
    </div>
  );
}
