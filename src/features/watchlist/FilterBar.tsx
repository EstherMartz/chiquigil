import { useUiStore } from '../ui/uiStore';

const CATS = ['All', 'Raid', 'Tincture', 'Food', 'Fish', 'Dye', 'Glamour', 'Housing', 'Materia', 'Minion'];

export function FilterBar() {
  const { catFilter, search, setCat, setSearch } = useUiStore();

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4 w-full">
      <span className="font-mono text-[10px] tracking-widest text-text-low uppercase mr-1">Category</span>
      <div className="flex border border-border-base overflow-x-auto min-w-0 max-w-full w-full sm:w-auto">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`font-mono text-[11px] tracking-wider px-3.5 py-2 border-r border-border-base last:border-r-0 uppercase transition-colors whitespace-nowrap shrink-0 ${
              catFilter === c ? 'bg-bg-card-hi text-gold' : 'text-text-dim hover:text-aether'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search items…"
        className="bg-bg-card border border-border-base text-text-cream font-mono text-xs px-3 py-2 w-full sm:w-52 sm:ml-auto focus:outline-none focus:border-aether"
      />
    </div>
  );
}
