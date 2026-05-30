export function fmtGil(n: number | null | undefined): string {
  if (n == null) return '—';
  // Format the magnitude with the scale rules, then reapply the sign. Without
  // this, negative values fell through every `>=` branch to a raw
  // `toLocaleString()`, which (a) used the viewer's locale separators — e.g.
  // es-ES renders -13863.45 as "-13.863,45" — and (b) leaked fractional gil
  // (a 247.175 gil/day value showed as "247,175", misread as 247k).
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (abs >= 10_000) return sign + Math.round(abs / 1000) + 'k';
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + 'k';
  // Gil is a whole-number currency; round derived fractions and pin the locale
  // so the output never depends on the viewer's regional separators.
  const rounded = Math.round(abs);
  return rounded === 0 ? '0' : sign + rounded.toLocaleString('en-US');
}

export function fmtGilFull(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toLocaleString();
}

export function garlandItemUrl(id: number): string {
  return `https://www.garlandtools.org/db/#item/${id}`;
}

export function universalisItemUrl(id: number): string {
  return `https://universalis.app/market/${id}`;
}

export function gamerEscapeItemUrl(name: string): string {
  return `https://ffxiv.gamerescape.com/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`;
}

export function garlandQuestUrl(id: number): string {
  return `https://www.garlandtools.org/db/#quest/${id}`;
}

export function fmtRelative(ms: number): string {
  if (!ms) return '—';
  const now = Date.now();
  const elapsed = now - ms;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(elapsed / 3_600_000);
  const days = Math.floor(elapsed / 86_400_000);
  const weeks = Math.floor(elapsed / 604_800_000);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${weeks}w ago`;
}
