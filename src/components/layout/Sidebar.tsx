import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { usePluginBridge } from '../../features/plugin/usePluginBridge';

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-3 md:py-1.5 font-mono text-[13px] tracking-widest transition-colors border-l-[3px] ${
    isActive
      ? 'text-gold border-l-gold bg-bg-card-hi/60'
      : 'text-text-dim border-l-transparent hover:text-text-cream hover:bg-bg-card-hi/30 active:bg-bg-card-hi'
  }`;

interface NavGroup {
  label: string;
  items: Array<{ label: string; path: string }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { label: 'Dashboard', path: '/dashboard' },
    ],
  },
  {
    label: 'Gil-Making',
    items: [
      { label: 'Crafts', path: '/crafts' },
      { label: 'Trading', path: '/trading' },
      { label: 'Gathering', path: '/gathering' },
      { label: 'Vendor Flip', path: '/vendor-flip' },
      { label: 'Empty Shelf', path: '/empty-shelf' },
      { label: 'Currencies', path: '/currency-flip' },
      { label: 'Housing', path: '/housing' },
      { label: 'Submarines', path: '/submarines' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { label: 'Projects', path: '/projects' },
      { label: 'Watchlist', path: '/watchlist' },
      { label: 'Discover', path: '/discover' },
      { label: 'Batch', path: '/craft-batch' },
      { label: 'Craft Helper', path: '/shopping-list' },
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
      { label: 'Craft Inventory', path: '/craft-from-inventory' },
      { label: 'Heatmap', path: '/heatmap' },
      { label: 'History', path: '/batch-history' },
      { label: 'Settings', path: '/settings' },
    ],
  },
];

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { connected } = usePluginBridge();
  const navGroups = NAV_GROUPS.map((group) =>
    group.label === 'Planning' && connected
      ? { ...group, items: [{ label: 'Plan', path: '/planner' }, ...group.items] }
      : group,
  );

  const closeMobileMenu = () => setMobileOpen(false);

  // Desktop sidebar
  const desktopContent = (
    <aside className="hidden md:flex md:flex-col fixed md:relative w-[220px] min-w-[220px] h-screen md:h-full sticky top-0 bg-bg-card border-r border-border-base z-20">
      {/* Branding — qiqirn banner art behind the title, darkened for legibility */}
      <div
        className="relative px-4 pt-3 pb-3 border-b border-border-base flex-shrink-0 bg-bg-card bg-cover bg-center"
        style={{ backgroundImage: 'url(/qiqirn-banner.png)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-bg-card via-bg-card/80 to-bg-card/30" aria-hidden />
        <div className="relative">
          <div className="font-mono text-[13px] tracking-widest text-aether uppercase mb-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            clink-clink
          </div>
          <h1 className="font-display font-semibold text-xl tracking-wide leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <span className="text-gold italic">qiqirn.tools</span>
          </h1>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="py-4 space-y-6 overflow-y-auto flex-1">
        {navGroups.map((group, idx) => (
          <div key={group.label} className={idx > 0 ? 'border-t border-border-base/50 pt-4' : ''}>
            <div className="px-4 font-mono text-[13px] tracking-widest uppercase text-text-low mb-2">
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

  // Mobile top bar + overlay.
  // Top bar is `fixed` (not sticky) so it leaves the parent flex flow on
  // mobile — otherwise it would claim a column and squeeze <main>.
  const mobileContent = (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-12 bg-bg-deep border-b border-border-base px-4 flex items-center justify-between pt-[env(safe-area-inset-top)]">
        <div className="font-mono text-[13px] tracking-widest text-aether uppercase">
          qiqirn.tools
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-11 h-11 flex items-center justify-center text-xl text-text-cream hover:text-aether active:text-aether transition-colors -mr-2"
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
        className={`fixed left-0 top-0 bottom-0 w-[260px] bg-bg-card border-r border-border-base z-50 overflow-y-auto transition-transform md:hidden pt-[env(safe-area-inset-top)] ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          className="relative h-12 px-4 flex items-center justify-between border-b border-border-base bg-cover bg-center"
          style={{ backgroundImage: 'url(/qiqirn-banner.png)' }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-bg-card via-bg-card/80 to-bg-card/30" aria-hidden />
          <span className="relative font-mono text-[13px] tracking-widest text-aether uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            qiqirn.tools
          </span>
          <button
            onClick={closeMobileMenu}
            className="relative w-11 h-11 flex items-center justify-center text-xl text-text-cream hover:text-aether active:text-aether transition-colors -mr-2"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="py-4 space-y-6">
          {navGroups.map((group, idx) => (
            <div key={group.label} className={idx > 0 ? 'border-t border-border-base/50 pt-4' : ''}>
              <div className="px-4 font-mono text-[13px] tracking-widest uppercase text-text-low mb-2">
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
