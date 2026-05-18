interface Props {
  /** Leading space for inline use after the item name. */
  leading?: boolean;
  /** Slightly larger star, e.g. for masthead. */
  big?: boolean;
}

/**
 * High-Quality star with a soft golden glow on hover. Replaces the bare
 * inline " ★" sprinkled throughout result tables so the HQ signal carries
 * a bit of warmth and reads consistently.
 */
export function HqStar({ leading, big }: Props) {
  return (
    <span
      aria-label="High Quality"
      title="High Quality"
      className={`text-gold transition-[text-shadow] duration-200 hover:[text-shadow:_0_0_8px_rgb(212_169_88_/_0.8)] ${big ? 'text-base' : ''} ${leading ? 'ml-1' : ''}`}
    >
      ★
    </span>
  );
}
