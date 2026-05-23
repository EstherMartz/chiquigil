import { useState } from 'react';
import { NavLink } from 'react-router-dom';

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-1.5 font-mono text-xs tracking-widest transition-colors ${
    isActive ? 'text-gold' : 'text-text-dim hover:text-aether'
  }`;

interface NavGroup {
  label: string;
  items: Array<{ label: string; path: string }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [{ label: 'What Now?', path: '/home' }],
  },
  {
    label: 'Gil-Making',
    items: [
      { label: 'Crafts', path: '/crafts' },
      { label: 'Trading', path: '/trading' },
      { label: 'Gathering', path: '/gathering' },
      { label: 'Vendor Flip', path: '/vendor-flip' },
      { label: 'Currencies', path: '/currency-flip' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { label: 'Watchlist', path: '/watchlist' },
      { label: 'Batch', path: '/craft-batch' },
      { label: 'Shopping', path: '/shopping-list' },
      { label: 'Leves', path: '/leves' },
    ],
  },
  {
    label: 'Grand Company',
    items: [
      { label: 'GC Seals', path: '/gc-seals' },
      { label: 'GC Supply', path: '/quest-items' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Cleanup', path: '/cleanup' },
      { label: 'Heatmap', path: '/heatmap' },
      { label: 'History', path: '/batch-history' },
      { label: 'Settings', path: '/settings' },
    ],
  },
];

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobileMenu = () => setMobileOpen(false);

  // Desktop sidebar
  const desktopContent = (
    <aside className="hidden md:flex md:flex-col fixed md:relative w-[220px] min-w-[220px] h-screen md:h-full sticky top-0 bg-bg-card border-r border-border-base z-20">
      {/* Branding */}
      <div className="px-4 pb-3 border-b border-border-base flex-shrink-0">
        <div className="font-mono text-[10px] tracking-widest text-aether uppercase mb-1">
          Final Fantasy XIV · Crafting Helper
        </div>
        <h1 className="font-display font-semibold text-xl tracking-wide leading-tight">
          Phantom <span className="text-gold italic">Crafting</span> Ledger
        </h1>
      </div>

      {/* Nav groups */}
      <nav className="py-4 space-y-4 overflow-y-auto flex-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-4 font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">
              {group.label}
            </div>
            <div>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={navItemClass}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );

  // Mobile top bar + overlay
  const mobileContent = (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 bg-bg-deep border-b border-border-base px-4 py-2 flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-widest text-aether uppercase">
          Phantom
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-xl text-text-cream hover:text-aether transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile overlay + sidebar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMobileMenu}
        />
      )}
      <aside
        className={`fixed left-0 top-12 bottom-0 w-[260px] bg-bg-card border-r border-border-base z-50 overflow-y-auto transition-transform md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="py-4 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-4 font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">
                {group.label}
              </div>
              <div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={navItemClass}
                    onClick={closeMobileMenu}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );

  return (
    <>
      {desktopContent}
      {mobileContent}
    </>
  );
}
