import { GameIcon } from '../lib/icons/GameIcon';

interface Props {
  /** Leading space for inline use after the item name. */
  leading?: boolean;
  /** Slightly larger marker, e.g. for masthead. */
  big?: boolean;
}

/**
 * High-Quality marker rendered as an in-game HQ icon (XIVAPI icon 062004).
 * Replaces the bare inline "★" sprinkled throughout result tables so the
 * HQ signal is visually consistent and carries a bit of warmth.
 */
export function HqStar({ leading, big }: Props) {
  return (
    <span
      title="High Quality"
      className={`inline-block transition-[filter] duration-200 hover:[filter:drop-shadow(0_0_4px_rgb(212_169_88_/_0.8))] ${leading ? 'ml-1' : ''}`}
    >
      <GameIcon
        src="/icons/hq/marker.png"
        alt="High Quality"
        size={big ? 18 : 14}
        decorative={false}
      />
    </span>
  );
}
