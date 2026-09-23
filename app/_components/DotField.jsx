'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * DotField: layers of dots behind the Q&A, for depth.
 *
 * The 21st.dev (Magic UI) "Dot Pattern", an SVG grid of dots faded out
 * with a radial mask, used three times over at three depths:
 *
 *   far   fine dots, close together, faint, in a soft pool behind the
 *         answer column, so the column has something to sit ON
 *   mid   middling dots in a ring around the column
 *   near  larger dots, far apart, softened a touch as if out of focus,
 *         only towards the edges of the screen
 *
 * Each layer is a different size, spacing, colour and opacity, and each
 * moves at its own speed as the conversation scrolls (far slowest, near
 * fastest). That difference in speed is what reads as depth: the answers
 * scroll over the dots rather than sitting flat on the page.
 *
 * The movement goes through the pattern's own transform, not the layer's:
 * the dots slide while the mask fading them stays where it is, and
 * because a pattern tiles, sliding it by a whole cell is invisible, so
 * the offset wraps and the layer never runs out however long the
 * conversation gets. One attribute write per layer per frame; no layout.
 *
 * While an answer is being worked out (<html data-busy>, set by
 * WorkingState) the layers drift slowly, the same cue the light behind
 * the page gives. With less motion wanted, they stay still.
 * ------------------------------------------------------------------ */

// Spacings with no common factor, so the grids never line up into one
// grid, and they slide against each other as the page scrolls.
const LAYERS = [
  { key: 'far', gap: 13, r: 0.75, rate: 0.06 },
  { key: 'mid', gap: 29, r: 1.2, rate: 0.14 },
  { key: 'near', gap: 53, r: 2.2, rate: 0.26 },
];

export default function DotField({ scrollerId = 'riva-scroll' }) {
  const uid = React.useId().replace(/:/g, '');
  const pats = React.useRef([]);

  React.useEffect(() => {
    const scroller = document.getElementById(scrollerId);
    if (!scroller) return undefined;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0;
    const place = () => {
      raf = 0;
      const y = scroller.scrollTop;
      LAYERS.forEach((l, i) => {
        const el = pats.current[i];
        if (el) el.setAttribute('patternTransform', 'translate(0 ' + (-((y * l.rate) % l.gap)).toFixed(2) + ')');
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(place); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    place();
    return () => { scroller.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [scrollerId]);

  return (
    <div aria-hidden="true" className="riva-dots">
      {LAYERS.map((l, i) => (
        // The mask is on the wrapper and the drift on the svg inside it, so
        // the dots can move without taking their fade with them.
        <div key={l.key} className={'riva-dots-layer riva-dots-' + l.key} style={{ '--riva-dots-gap': l.gap + 'px' }}>
          <svg className="riva-dots-svg" width="100%" height="100%">
            <defs>
              <pattern id={uid + l.key} ref={(el) => { pats.current[i] = el; }}
                width={l.gap} height={l.gap} patternUnits="userSpaceOnUse">
                <circle cx={l.gap / 2} cy={l.gap / 2} r={l.r} fill="currentColor" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={'url(#' + uid + l.key + ')'} />
          </svg>
        </div>
      ))}
    </div>
  );
}
