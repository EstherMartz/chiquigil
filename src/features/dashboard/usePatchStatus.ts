import { useWhatsNewSnapshot } from '../queries/useWhatsNewSnapshot';
import { useSettingsStore } from '../settings/store';
import { derivePatchStatus, type PatchStatus } from './patchStatus';

/** Live patch status for the dashboard. Reads the catalog snapshot bake time and the user's acknowledged patch date. */
export function usePatchStatus(): PatchStatus {
  const snap = useWhatsNewSnapshot();
  const lastSeenPatchDate = useSettingsStore((s) => s.lastSeenPatchDate);
  return derivePatchStatus(snap.data?.bakedAt ?? null, lastSeenPatchDate, Date.now());
}
