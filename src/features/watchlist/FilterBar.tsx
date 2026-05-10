import { useUiStore } from '../ui/uiStore';

const CATS = ['All', 'Raid', 'Tincture', 'Food', 'Dye', 'Glamour', 'Housing', 'Materia'];
const CRAFTERS = ['All', 'LTW', 'WVR', 'CUL', 'ALC', 'CRP', 'GSM', 'ARM', 'BSM', 'ANY'];

export function FilterBar() {
  const { catFilter, craftFilter, search, setCat, setCraft, setSearch } = useUiStore();

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <span className="font-mono text-[10px] tracking-widest text-text-low uppercase mr-1">Category</span>
      <div className="flex border border-border-base">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`font-mono text-[11px] tracking-wider px-3.5 py-2 border-r border-border-base last:border-r-0 uppercase transition-colors ${
              catFilter === c ? 'bg-bg-card-hi text-gold' : 'text-text-dim hover:text-aether'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <span className="font-mono text-[10px] tracking-widest text-text-low uppercase ml-3 mr-1">Crafter</span>
      <div className="flex border border-border-base">
        {CRAFTERS.map((c) => (
          <button
            key={c}
            onClick={() => setCraft(c)}
            className={`font-mono text-[11px] tracking-wider px-3.5 py-2 border-r border-border-base last:border-r-0 uppercase transition-colors ${
              craftFilter === c ? 'bg-bg-card-hi text-gold' : 'text-text-dim hover:text-aether'
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
        className="bg-bg-card border border-border-base text-text-cream font-mono text-xs px-3 py-2 w-52 ml-auto focus:outline-none focus:border-aether"
      />
    </div>
  );
}
