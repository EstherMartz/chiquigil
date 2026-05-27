import { Link } from 'react-router-dom';
import { QueriesView } from '../features/queries/QueriesView';
import { SectionHeader } from '../components/SectionHeader';

export default function Gathering() {
  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <SectionHeader
        label="Gathering"
        trailing={
          <Link
            to="/gathering/plan"
            className="text-gold hover:text-gold-hi transition-colors"
          >
            Plan a session →
          </Link>
        }
      />
      <p className="font-mono text-[11px] text-text-low max-w-prose -mt-2">
        Raw materials you can gather while doing other things. Sells as-is — no recipe required.
      </p>
      <QueriesView category="gathering" />
    </div>
  );
}
