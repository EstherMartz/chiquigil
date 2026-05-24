import { Link } from 'react-router-dom';
import { GlobalItemSearch } from './GlobalItemSearch';
import { AetheryteChip } from './AetheryteChip';

export function ContentBar() {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-6">
      <GlobalItemSearch />
      <div className="flex items-center gap-2">
        <AetheryteChip />
        <Link
          to="/settings"
          className="font-mono text-[13px] text-text-low hover:text-aether transition-colors"
          title="Change your world or data center"
        >
          change
        </Link>
      </div>
    </div>
  );
}
