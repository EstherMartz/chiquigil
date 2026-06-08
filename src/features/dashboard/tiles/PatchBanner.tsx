import { Link } from 'react-router-dom';
import { usePatchStatus } from '../usePatchStatus';
import { useWhatsNewSnapshot } from '../../queries/useWhatsNewSnapshot';
import { usePatchMovers } from '../usePatchMovers';
import { useSettingsStore } from '../../settings/store';
import { fmtGil } from '../../../lib/format';
import { AddToWatchlistButton } from '../../items/AddToWatchlistButton';

export function PatchBanner() {
  const status = usePatchStatus();
  const whatsNew = useWhatsNewSnapshot();
  const { movers } = usePatchMovers();
  const patchBannerDismissedDate = useSettingsStore((s) => s.patchBannerDismissedDate);
  const setPatchBannerDismissedDate = useSettingsStore((s) => s.setPatchBannerDismissedDate);
  const setLastSeenPatchDate = useSettingsStore((s) => s.setLastSeenPatchDate);

  // Visibility: render only if
  // 1. A new patch is active
  // 2. Within the 14-day window
  // 3. Patch date is available
  // 4. Banner not dismissed for this patch
  if (
    !status.isNewPatch
    || !status.withinWindow(14)
    || status.patchDateIso == null
    || patchBannerDismissedDate === status.patchDateIso
  ) {
    return null;
  }

  const newItemCount = whatsNew.data?.newItems.length ?? 0;
  const topMovers = movers.slice(0, 3);

  const handleDismiss = () => {
    setPatchBannerDismissedDate(status.patchDateIso);
  };

  const handleViewAll = () => {
    setLastSeenPatchDate(status.patchDateIso);
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3 bg-aether/10 border border-aether/40 rounded-sm">
      {/* Headline */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="font-mono text-[10px] tracking-widest uppercase text-aether mb-2">
            ◆ NEW PATCH
          </div>
          <div className="font-mono text-sm text-text-cream">
            {newItemCount.toLocaleString()} items added in the {status.patchDateIso} update.
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          title="Dismiss for this patch"
          className="font-mono text-sm text-text-low hover:text-aether transition-colors px-2 flex-shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Movers section */}
      {topMovers.length > 0 && (
        <div className="mt-2">
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">
            Top craftable movers for your jobs:
          </div>
          <div className="space-y-2">
            {topMovers.map((mover) => (
              <div key={mover.id} className="flex items-center gap-3 px-2 py-1 bg-bg-card/50 rounded text-sm">
                <Link
                  to={`/item/${mover.id}`}
                  className="font-mono text-aether hover:text-gold transition-colors flex-1 truncate"
                >
                  {mover.name}
                </Link>
                <span className="font-mono text-[10px] text-text-low whitespace-nowrap">
                  {mover.velocity.toFixed(1)}/day
                </span>
                <span className="font-mono text-[10px] text-text-low whitespace-nowrap">
                  {fmtGil(mover.price)}
                </span>
                <AddToWatchlistButton
                  itemId={mover.id}
                  itemName={mover.name}
                  ilvl={mover.ilvl}
                  recipe={{
                    itemResultId: mover.id,
                    classJob: mover.crafter,
                    recipeLevel: mover.recipeLevel,
                    ingredients: [],
                  }}
                  sc={mover.sc}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No movers fallback */}
      {topMovers.length === 0 && (
        <div className="font-mono text-[11px] text-text-low italic">
          No craftable movers selling yet — see What's New.
        </div>
      )}

      {/* View all link */}
      <div className="mt-1">
        <Link
          to="/whats-new"
          onClick={handleViewAll}
          className="font-mono text-[10px] tracking-widest uppercase text-text-low hover:text-gold transition-colors"
        >
          [ View all new items → ]
        </Link>
      </div>
    </div>
  );
}
