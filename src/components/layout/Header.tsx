import { NavLink } from 'react-router-dom';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
    isActive ? 'text-gold' : 'text-text-dim hover:text-aether'
  }`;

const navClassDim = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
    isActive ? 'text-gold' : 'text-text-low hover:text-aether'
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
        <nav className="flex gap-1 items-center">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/watchlist" className={navClass}>Watchlist</NavLink>
          <NavLink to="/crafts" className={navClass}>Crafts</NavLink>
          <NavLink to="/settings" className={navClass}>Settings</NavLink>
          <span className="border-l border-border-base h-5 mx-2" aria-hidden />
          <NavLink to="/trading" className={navClassDim}>Trading</NavLink>
        </nav>
      </div>
    </header>
  );
}
