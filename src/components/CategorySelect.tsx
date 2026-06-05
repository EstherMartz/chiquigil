import { useState, useRef, useEffect } from 'react';

interface Category {
  id: number;
  name: string;
}

interface Props {
  categories: Category[];
  selected: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  groups?: { label: string; ids: number[] }[];
}

export function CategorySelect({
  categories,
  selected,
  onChange,
  placeholder = 'Search categories...',
  groups,
}: Props) {
  const [searchText, setSearchText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter categories based on search text (case-insensitive substring match)
  const filteredCategories = searchText.trim()
    ? categories.filter(cat =>
        cat.name.toLowerCase().includes(searchText.toLowerCase())
      )
    : categories;

  // Get selected category objects for display
  const selectedCategories = categories.filter(cat =>
    selected.includes(cat.id)
  );

  // Handle checkbox toggle
  const handleToggle = (id: number) => {
    const newSelected = selected.includes(id)
      ? selected.filter(sid => sid !== id)
      : [...selected, id];
    onChange(newSelected);
  };

  // Handle clear all
  const handleClearAll = () => {
    onChange([]);
  };

  // Remove individual pill
  const handleRemovePill = (id: number) => {
    onChange(selected.filter(sid => sid !== id));
  };

  // Tri-state for a group: 'active' (all ids selected), 'mixed' (some), 'none'.
  const groupState = (ids: number[]): 'active' | 'mixed' | 'none' => {
    const n = ids.reduce((acc, id) => acc + (selected.includes(id) ? 1 : 0), 0);
    if (n === 0) return 'none';
    return n === ids.length ? 'active' : 'mixed';
  };

  // Toggle a whole group: remove all if fully selected, otherwise add all.
  const handleToggleGroup = (ids: number[]) => {
    if (ids.every((id) => selected.includes(id))) {
      onChange(selected.filter((id) => !ids.includes(id)));
    } else {
      const next = new Set(selected);
      ids.forEach((id) => next.add(id));
      onChange([...next]);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleMouseDown);
      return () => {
        document.removeEventListener('mousedown', handleMouseDown);
      };
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {/* Input field */}
      <input
        ref={inputRef}
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full bg-bg-card border border-border-base text-text-cream font-mono text-xs px-3 py-2"
      />

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-bg-card-hi border border-border-hi max-h-60 overflow-y-auto">
          {groups && groups.length > 0 && (
            <div className="flex flex-wrap gap-1 p-2 border-b border-border-base">
              {groups.map((g) => {
                const state = groupState(g.ids);
                const cls =
                  state === 'active'
                    ? 'border-gold text-gold'
                    : state === 'mixed'
                    ? 'border-gold/50 text-gold/70'
                    : 'border-border-base text-text-dim hover:text-aether';
                return (
                  <button
                    key={g.label}
                    type="button"
                    aria-pressed={state === 'active' ? 'true' : state === 'mixed' ? 'mixed' : 'false'}
                    onClick={() => handleToggleGroup(g.ids)}
                    className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 border ${cls}`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}
          {filteredCategories.length > 0 ? (
            filteredCategories.map(category => (
              <label
                key={category.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-card cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(category.id)}
                  onChange={() => handleToggle(category.id)}
                  className="accent-gold w-3 h-3"
                />
                <span className="font-mono text-[10px] text-text-cream">
                  {category.name}
                </span>
              </label>
            ))
          ) : (
            <div className="px-3 py-2 font-mono text-[10px] text-text-low italic">
              No matching categories
            </div>
          )}
        </div>
      )}

      {/* Selected pills */}
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedCategories.map(category => (
            <div
              key={category.id}
              className="inline-flex items-center gap-1 bg-bg-card-hi border border-border-base text-text-dim font-mono text-[10px] px-2 py-0.5 rounded"
            >
              <span>{category.name}</span>
              <button
                onClick={() => handleRemovePill(category.id)}
                aria-label={`Remove ${category.name}`}
                className="hover:text-crimson transition-colors"
              >
                ×
              </button>
            </div>
          ))}
          {selected.length > 0 && (
            <button
              onClick={handleClearAll}
              className="font-mono text-[10px] text-text-low hover:text-aether transition-colors ml-2"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
