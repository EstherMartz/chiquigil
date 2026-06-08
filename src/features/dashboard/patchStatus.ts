export interface PatchStatus {
  /** Bake timestamp of the latest catalog snapshot, or null if unknown. */
  bakedAt: number | null;
  /** Patch date as YYYY-MM-DD, or null. */
  patchDateIso: string | null;
  /** True when the latest patch is newer than what the user last acknowledged. */
  isNewPatch: boolean;
  /** True when now is within `days` days after the patch bake. */
  withinWindow: (days: number) => boolean;
}

/**
 * Pure patch-status derivation. `bakedAt` is the snapshot bake time (ms),
 * `lastSeenPatchDate` the user's acknowledged patch date (YYYY-MM-DD or null),
 * `nowMs` the current time. Compares DATE SLICES, not raw timestamps, so a
 * patch is never flagged new against its own date.
 */
export function derivePatchStatus(
  bakedAt: number | null,
  lastSeenPatchDate: string | null,
  nowMs: number,
): PatchStatus {
  if (bakedAt == null) {
    return {
      bakedAt: null,
      patchDateIso: null,
      isNewPatch: false,
      withinWindow: () => false,
    };
  }

  const patchDateIso = new Date(bakedAt).toISOString().slice(0, 10);
  const isNewPatch = lastSeenPatchDate == null || patchDateIso > lastSeenPatchDate;

  const withinWindow = (days: number) => {
    const elapsedMs = nowMs - bakedAt;
    return elapsedMs < days * 86_400_000 && elapsedMs >= 0;
  };

  return {
    bakedAt,
    patchDateIso,
    isNewPatch,
    withinWindow,
  };
}
