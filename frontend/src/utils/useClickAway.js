import { useEffect } from 'react';

// Runs `handler` whenever the user presses the mouse outside of *all* of the
// provided refs. `refs` is an array of React refs so the caller can whitelist
// both the popover container and its trigger button (otherwise clicking the
// trigger to close would immediately re-open the popover as a side-effect of
// the outside-click detection firing first).
//
//   useClickAway([popoverRef, triggerRef], () => setOpen(false), open);
//
// The `active` flag lets the caller skip attaching the listener when the
// popover is closed.
export default function useClickAway(refs, handler, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onDown = (e) => {
      const list = Array.isArray(refs) ? refs : [refs];
      for (const r of list) {
        const el = r && r.current;
        if (el && el.contains(e.target)) return;
      }
      handler(e);
    };
    // pointerdown (not click) catches the intent to dismiss before the
    // target receives a click event - avoids races with internal onClick
    // handlers.
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [refs, handler, active]);
}
