interface MarketStateBadgeProps {
  // Delta over last 7 days as a percentage (e.g. 12 = +12%, -8 = -8%).
  // null when there isn't enough data to compute (no recent sales or no prior week).
  delta: number | null;
  // Current listing count on home world.
  listings: number;
}

export function MarketStateBadge({ delta, listings }: MarketStateBadgeProps): JSX.Element {
  // Priority order state logic
  if (listings === 0) {
    // State 1: Out of stock
    return (
      <span className="font-mono text-[10px] tracking-widest uppercase border px-2 py-0.5 inline-flex items-center gap-1.5 rounded-sm text-aether border-aether/40">
        <span>○</span>
        <span>Out of stock</span>
      </span>
    );
  }

  if (delta === null) {
    // State 2: No data
    return (
      <span className="font-mono text-[10px] tracking-widest uppercase border px-2 py-0.5 inline-flex items-center gap-1.5 rounded-sm text-text-low border-border-base">
        <span>·</span>
        <span>No data</span>
      </span>
    );
  }

  const roundedDelta = Math.round(delta);

  if (delta > 5) {
    // State 3: Rising
    return (
      <span className="font-mono text-[10px] tracking-widest uppercase border px-2 py-0.5 inline-flex items-center gap-1.5 rounded-sm text-jade border-jade/40">
        <span>▲</span>
        <span>Rising +{roundedDelta}%</span>
      </span>
    );
  }

  if (delta < -5) {
    // State 4: Falling
    return (
      <span className="font-mono text-[10px] tracking-widest uppercase border px-2 py-0.5 inline-flex items-center gap-1.5 rounded-sm text-crimson border-crimson/40">
        <span>▼</span>
        <span>Falling {roundedDelta}%</span>
      </span>
    );
  }

  // State 5: Stable (between -5 and +5, inclusive)
  return (
    <span className="font-mono text-[10px] tracking-widest uppercase border px-2 py-0.5 inline-flex items-center gap-1.5 rounded-sm text-text-low border-border-base">
      <span>●</span>
      <span>Stable {roundedDelta}%</span>
    </span>
  );
}
