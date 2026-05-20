import { NavLink } from 'react-router-dom';
import { GlobalItemSearch } from './GlobalItemSearch';
import { AetheryteChip } from './AetheryteChip';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
    isActive ? 'text-gold' : 'text-text-dim hover:text-aether'
  }`;

export function Header() {
  return (
    <header className="border-b border-border-base mb-7 pb-5">
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] tracking-widest text-aether uppercase mb-1">
            Final Fantasy XIV · Crafting Helper
          </div>
          <h1 className="font-display font-semibold text-3xl tracking-wide leading-tight">
            Phantom <span className="text-gold italic">Crafting</span> Ledger
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <GlobalItemSearch />
            <AetheryteChip />
          </div>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/home" className={navClass}>Tonight</NavLink>
            <NavLink to="/watchlist" className={navClass}>Watchlist</NavLink>
            <NavLink to="/crafts" className={navClass}>Crafts</NavLink>
            <NavLink to="/trading" className={navClass}>Trading</NavLink>
            <NavLink to="/gathering" className={navClass}>Gathering</NavLink>
            <NavLink to="/leves" className={navClass}>Leves</NavLink>
            <NavLink to="/shopping-list" className={navClass}>Shopping</NavLink>
            <NavLink to="/cleanup" className={navClass}>Cleanup</NavLink>
            <NavLink to="/vendor-flip" className={navClass}>Vendor flip</NavLink>
            <NavLink to="/currency-flip" className={navClass}>Currencies</NavLink>
            <NavLink to="/gc-seals" className={navClass}>GC Seals</NavLink>
            <NavLink to="/quest-items" className={navClass}>Quest items</NavLink>
            <NavLink to="/settings" className={navClass}>Settings</NavLink>
          </nav>
        </div>
      </div>
    </header>
  );
}
