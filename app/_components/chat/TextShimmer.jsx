'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * TextShimmer — a line of status text with a light passing along it.
 *
 * Ported from the 21st.dev Agent Elements "Text Shimmer" into this
 * project's idiom: no Tailwind, no injected stylesheet — the class is
 * in globals.css (.riva-shimmer) and the only knob is the duration.
 * Used for the line the assistant is currently working on, so the wait
 * reads as something happening rather than a label that has stalled.
 * The gradient repeats, so when reduced motion stops the sweep the text
 * is still fully coloured.
 * ------------------------------------------------------------------ */

export default function TextShimmer({ children, as: Tag = 'span', duration = 2, style }) {
  return (
    <Tag className="riva-shimmer" style={{ animationDuration: duration + 's', ...style }}>
      {children}
    </Tag>
  );
}
