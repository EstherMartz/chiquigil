//
// Best-effort map of Garland quest JournalGenre id -> crafter/gatherer job code.
// The tag is DECORATIVE ONLY: the turn-in list's correctness never depends on it,
// and unknown genres yield null (no tag) so we never display a guessed job.
//
// Garland's genre ids proved unreliable across jobs during probing, so this map is
// intentionally conservative — seeded only with values confirmed against real Garland
// quest docs. Add more genre ids here as they are verified (DoH: CRP/BSM/ARM/GSM/LTW/
// WVR/ALC/CUL class quests; DoL: MIN/BTN/FSH class quests).
const GENRE_TO_JOB: Record<number, string> = {
  174: 'BTN', // "Way of the Botanist" line (verified)
};

export function jobTagForGenre(genre: number | undefined): string | null {
  if (genre == null) return null;
  const job = GENRE_TO_JOB[genre];
  return job ? `${job} class quest` : null;
}
