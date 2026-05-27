import { GlobalItemSearch } from './GlobalItemSearch';
import { AetheryteChip } from './AetheryteChip';

export function ContentBar() {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-6">
      <GlobalItemSearch />
      <AetheryteChip />
    </div>
  );
}
