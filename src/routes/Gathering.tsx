import { Link } from 'react-router-dom';
import { QueriesView } from '../features/queries/QueriesView';

export default function Gathering() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-gold tracking-wide">Gathering</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Raw materials you can gather while doing other things. Sells as-is — no recipe required.
          </p>
        </div>
        <Link
          to="/gathering/plan"
          className="font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold text-gold hover:bg-bg-card-hi"
        >
          Plan a session →
        </Link>
      </div>
      <QueriesView category="gathering" />
    </div>
  );
}
