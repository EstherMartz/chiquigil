import { useRef, useState, type ReactNode } from 'react';
import { RecipePopover } from './RecipePopover';

interface Props {
  itemId: number;
  itemName: string;
  children: ReactNode;
}

/**
 * Inline wrapper that opens a recipe tooltip on hover/focus.
 * Children render as-is; popover floats absolutely below the wrapper.
 *
 * Touch devices: tap to toggle (long-press would conflict with link tap).
 * Keyboard: focus opens, blur closes.
 */
export function RecipeHover({ itemId, itemName, children }: Props) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  function scheduleOpen() {
    if (closeTimer.current != null) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (openTimer.current != null) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, 180);
  }
  function scheduleClose() {
    if (openTimer.current != null) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current != null) return;
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, 120);
  }

  return (
    <span
      className="relative inline-flex items-baseline gap-1.5 flex-wrap"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={scheduleClose}
    >
      {children}
      {open && (
        <span
          className="absolute left-0 top-full mt-2 z-50 normal-case tracking-normal"
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
        >
          <RecipePopover itemId={itemId} itemName={itemName} />
        </span>
      )}
    </span>
  );
}
