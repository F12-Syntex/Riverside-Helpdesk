'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import TextShimmer from './TextShimmer';
import { EASE, EASE_EXIT } from './motion.mjs';

/**
 * A value that changes no faster than a person can read it.
 *
 * The working line is told about every stage the server reaches, and a fast
 * turn reaches four of them inside 600ms: "Reading the practice documents",
 * "Reading the Notebook — 132 pages", "Writing the answer". Swapped as they
 * came, the line was mostly blank — each new one fading in from nothing just
 * as the next arrived. So each line is held for at least `hold` ms, and when
 * several arrive inside that, the newest is the one shown next: the line is
 * always true, just never in a hurry.
 */
export function useHeldValue(value, hold = 600) {
  const [shown, setShown] = React.useState(value);
  const since = React.useRef(0);
  React.useEffect(() => { since.current = performance.now(); }, []);
  React.useEffect(() => {
    if (value === shown) return undefined;
    const wait = Math.max(0, hold - (performance.now() - since.current));
    const t = setTimeout(() => { since.current = performance.now(); setShown(value); }, wait);
    return () => clearTimeout(t);
  }, [value, shown, hold]);
  return shown;
}

/**
 * One line of status that rolls over when it changes: the old words leave
 * upward and the new ones rise into their place out of a slight blur, with
 * the light still passing along them (the 21st.dev Reasoning Text "swap",
 * calmed: real steps only, never invented phrases on a timer — see
 * WorkingState). The line is decoration for sighted readers; the caller puts
 * the same words in its own live region, once, where a screen reader hears
 * them without the animation re-announcing every frame.
 */
export default function RollingLine({ text, className = '', hold = 600 }) {
  const line = useHeldValue(text, hold);
  return (
    <span className={'riva-roll' + (className ? ' ' + className : '')} aria-hidden="true">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={line} className="riva-roll-line"
          initial={{ opacity: 0, y: '0.9em', filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.36, ease: EASE, delay: 0.06 } }}
          exit={{ opacity: 0, y: '-0.9em', filter: 'blur(4px)', transition: { duration: 0.18, ease: EASE_EXIT } }}>
          <TextShimmer>{line}</TextShimmer>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
