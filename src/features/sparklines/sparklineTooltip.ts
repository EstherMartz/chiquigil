const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatSparklineTooltip(
  buckets: (number | null)[],
  now: Date = new Date(),
): string {
  const lines: string[] = [];
  const todayIdx = buckets.length - 1;

  for (let i = 0; i < buckets.length; i++) {
    const daysAgo = todayIdx - i;
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    const dayName = DAY_NAMES[d.getDay()];
    const value = buckets[i];
    const formatted = value !== null ? value.toLocaleString() : '—';
    const suffix = i === todayIdx ? '  ← today' : '';
    lines.push(`${dayName}  ${formatted}${suffix}`);
  }
  return lines.join('\n');
}
