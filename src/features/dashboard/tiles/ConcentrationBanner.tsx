import { Link } from 'react-router-dom';
import { useSettingsStore } from '../../settings/store';
import type { WatchlistRow } from '../../watchlist/buildRows';
import { topCategory } from '../aggregate';

export function ConcentrationBanner({ rows }: { rows: WatchlistRow[] }) {
  const concentrationBannerLastDismissed = useSettingsStore((s) => s.concentrationBannerLastDismissed);
  const concentrationBannerSuppressed = useSettingsStore((s) => s.concentrationBannerSuppressed);
  const setConcentrationBannerLastDismissed = useSettingsStore((s) => s.setConcentrationBannerLastDismissed);
  const setConcentrationBannerSuppressed = useSettingsStore((s) => s.setConcentrationBannerSuppressed);

  // Visibility rules: all must hold to render the banner.
  // 1. At least 10 items in the watchlist
  if (rows.length < 10) return null;

  // 2. topCategory is non-null AND pct > 50
  const topCat = topCategory(rows);
  if (!topCat || topCat.pct <= 50) return null;

  // 3. Not permanently suppressed
  if (concentrationBannerSuppressed) return null;

  // 4. Not within 7-day snooze window
  const sevenDaysMs = 7 * 86_400_000;
  if (concentrationBannerLastDismissed != null) {
    const lastDismissedTime = Date.parse(concentrationBannerLastDismissed);
    if (Date.now() - lastDismissedTime < sevenDaysMs) return null;
  }

  const handleDismiss = () => {
    setConcentrationBannerLastDismissed(new Date().toISOString());
  };

  const handleSuppressForever = () => {
    setConcentrationBannerSuppressed(true);
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-gold/10 border border-gold/30 rounded-sm">
      <div className="flex-1">
        <div className="font-mono text-[9px] tracking-widest uppercase text-gold mb-1">
          ⚠ HIGH CONCENTRATION
        </div>
        <div className="font-mono text-sm text-text-cream mb-2">
          {Math.round(topCat.pct)}% of your daily potential comes from {topCat.cat} ({topCat.itemCount} items).
        </div>
        <div className="font-mono text-[11px] text-text-low">
          A single patch or wave of flooding could affect all of them at once.
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
        <Link
          to="/discover?focus=gaps"
          className="font-mono text-[10px] tracking-widest uppercase text-text-low hover:text-gold transition-colors whitespace-nowrap"
        >
          Find diversification opportunities →
        </Link>

        <button
          type="button"
          onClick={handleDismiss}
          title="Dismiss for 7 days"
          className="font-mono text-sm text-text-low hover:text-crimson transition-colors px-1"
        >
          ✕
        </button>

        <button
          type="button"
          onClick={handleSuppressForever}
          title="Don't show this banner again"
          className="font-mono text-[10px] tracking-widest uppercase text-text-low hover:text-gold transition-colors px-1"
        >
          □ don't show again
        </button>
      </div>
    </div>
  );
}
