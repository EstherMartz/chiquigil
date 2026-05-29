export function fmtGil(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 10_000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
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
