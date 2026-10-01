import React from 'react';

/* ------------------------------------------------------------------ *
 * ThinkingPaths — thin lines drifting across the page while an answer
 * is worked out.
 *
 * The 21st.dev "Floating paths" background (bundui): two mirrored sets
 * of 36 long curves, each a little heavier than the one before, with
 * light travelling slowly along them. Here it is in the theme's colour,
 * behind the page, and only there while somebody is waiting.
 *
 * A wait is easier when it looks like calm work rather than a spinner,
 * so the motion is slow — every line takes twenty-odd seconds to run —
 * and nothing flashes. It fades in when <html data-busy> is set (the
 * working card sets it, see chat/WorkingState.jsx) and fades out as the
 * answer lands; the middle of the page, where the reading is, is masked
 * almost clear.
 *
 * All CSS (.riva-paths in globals.css): no animation loop in script, and
 * the lines stop painting once they have faded out. Reduced motion
 * leaves them still. Durations come from each line's index rather than
 * Math.random, so the server and the browser draw the same thing.
 * ------------------------------------------------------------------ */

function paths(position) {
  return Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    opacity: 0.1 + i * 0.03,
    // 20–30s, spread so neighbouring lines never move in step.
    duration: 20 + ((i * 7) % 11),
    delay: -((i * 13) % 29),
  }));
}

function PathSet({ position }) {
  return (
    <svg className="riva-paths-set" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice">
      {paths(position).map((p) => (
        <path
          key={p.id}
          d={p.d}
          pathLength="1"
          stroke="currentColor"
          strokeWidth={p.width}
          strokeOpacity={p.opacity}
          style={{ animationDuration: p.duration + 's', animationDelay: p.delay + 's' }}
        />
      ))}
    </svg>
  );
}

export default function ThinkingPaths() {
  return (
    <div className="riva-paths" aria-hidden="true">
      <PathSet position={1} />
      <PathSet position={-1} />
    </div>
  );
}
