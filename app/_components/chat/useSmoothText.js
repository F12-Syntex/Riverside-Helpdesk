'use client';

import React from 'react';
import { useReducedMotion } from 'motion/react';
import { nextShown } from './smooth.mjs';

/**
 * The streaming answer, released at an even reading pace.
 *
 * The draft arrives as the whole answer so far, in lumps (see ./smooth.mjs);
 * this hands back a steadily growing prefix of it instead, one frame at a
 * time, so the text types on rather than landing two lines at once. Only
 * while `active`: otherwise, and wherever less motion is asked for, the text
 * is simply the text.
 *
 * Returns [shown, caughtUp]. `caughtUp` is how the answer knows the reveal
 * has reached the end of what was sent, which is when its action row may
 * arrive — not before the reader can see the last line it belongs under.
 */
export default function useSmoothText(target, active) {
  const text = target || '';
  const reduce = useReducedMotion();
  const live = !!active && !reduce;
  const [shown, setShown] = React.useState(live ? '' : text);
  const ref = React.useRef({ shown: live ? '' : text, target: text });
  ref.current.target = text;

  React.useEffect(() => {
    if (!live) {
      ref.current.shown = ref.current.target;
      setShown(ref.current.target);
      return undefined;
    }
    let frame;
    let last = performance.now();
    const tick = (now) => {
      const st = ref.current;
      if (st.shown !== st.target) {
        const next = nextShown(st.shown, st.target, now - last);
        if (next !== st.shown) { st.shown = next; setShown(next); }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [live]);

  const out = live ? shown : text;
  return [out, out === text];
}
