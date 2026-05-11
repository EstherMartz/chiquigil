export function fmtGil(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 10_000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}

export function universalisItemUrl(id: number, scope?: string): string {
  return scope
    ? `https://universalis.app/market/${id}?world=${encodeURIComponent(scope)}`
    : `https://universalis.app/market/${id}`;
}

export function garlandItemUrl(id: number): string {
  return `https://www.garlandtools.org/db/#item/${id}`;
}
