import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RecipePopover } from './RecipePopover';

interface Props {
  itemId: number;
  itemName: string;
  children: ReactNode;
}

const GAP = 8; // px between trigger and popover
const MARGIN = 8; // min px from the viewport edge

/**
 * Inline wrapper that opens a recipe tooltip on hover/focus.
 *
 * The popover is rendered in a portal on `document.body` with fixed positioning,
 * so it escapes any `overflow` clipping ancestor (e.g. an `overflow-x-auto` table
 * wrapper, which per the CSS overflow-coupling rule also clips vertically). Position
 * is derived from the trigger's bounding rect, clamped into the viewport, and flipped
 * above the trigger when there isn't room below.
 *
 * Keyboard: focus opens, blur closes. Touch: tap focuses the link, which opens it.
 */
export function RecipeHover({ itemId, itemName, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const pop = popoverRef.current;
    const pw = pop?.offsetWidth ?? 0;
    const ph = pop?.offsetHeight ?? 0;

    let left = r.left;
    if (pw && left + pw > window.innerWidth - MARGIN) left = window.innerWidth - pw - MARGIN;
    if (left < MARGIN) left = MARGIN;

    let top = r.bottom + GAP;
    // Flip above the trigger if it would overflow the bottom and there's more room up top.
    if (ph && top + ph > window.innerHeight - MARGIN && r.top - GAP - ph > MARGIN) {
      top = r.top - GAP - ph;
    }
    setPos({ top, left });
  }, []);

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

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    reposition();
    // Keep the fixed-positioned popover glued to the trigger as the page scrolls/resizes.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-baseline gap-1.5 flex-wrap"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={scheduleClose}
    >
      {children}
      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-50 normal-case tracking-normal"
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
        >
          <RecipePopover itemId={itemId} itemName={itemName} />
        </div>,
        document.body,
      )}
    </span>
  );
}
