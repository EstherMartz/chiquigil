interface Props {
  label?: string;
}

/**
 * Loading indicator with a spinning aether crystal. The sigil rotates,
 * the label pulses — reads as "aetherial divination in progress" rather
 * than a generic browser spinner.
 */
export function Spinner({ label = 'Loading…' }: Props) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs text-text-low">
      <span
        aria-hidden
        className="inline-block animate-spin text-aether text-base leading-none"
      >
        ❖
      </span>
      <span className="animate-pulse">{label}</span>
    </div>
  );
}
