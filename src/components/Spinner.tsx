interface Props {
  label?: string;
}

/**
 * Inline spinning glyph for use in buttons or tight layouts.
 */
export function SpinGlyph() {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin text-aether text-xs leading-none ml-1"
    >
      ❖
    </span>
  );
}

/**
 * Loading indicator with a spinning aether crystal. The sigil rotates,
 * the label pulses — reads as "aetherial divination in progress" rather
 * than a generic browser spinner.
 */
export function Spinner({ label = 'Loading…' }: Props) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs text-text-low">
      <SpinGlyph />
      <span className="animate-pulse">{label}</span>
    </div>
  );
}
