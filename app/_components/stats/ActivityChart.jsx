'use client';

import React from 'react';
import { s } from '../ui';

/* ------------------------------------------------------------------ *
 * How busy the app has been, one bar per day (or per hour over a single
 * day).
 *
 * One series, so there is nothing to tell apart and no legend to read:
 * the heading names what the bars are and the bars carry magnitude and
 * nothing else. Colour is the single NHS blue throughout — a bar is not
 * a category, and giving each day its own hue would be decoration
 * pretending to be information.
 *
 * Only the busiest bar is labelled directly. A number over every bar is
 * a table drawn badly; the rest are read by hovering.
 * ------------------------------------------------------------------ */

const BAR = '#005eb8';
const TRACK = '#eaeff1';
const HEIGHT = 132;

function labelFor(bucket, size) {
  const at = new Date(bucket);
  if (size === 'hour') return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function tooltipFor(bucket, size, total) {
  const at = new Date(bucket);
  const when = size === 'hour'
    ? at.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : at.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${when} — ${total.toLocaleString('en-GB')} ${total === 1 ? 'event' : 'events'}`;
}

export default function ActivityChart({ buckets = [], size = 'day' }) {
  const [hovered, setHovered] = React.useState(-1);

  if (!buckets.length) return null;

  const max = buckets.reduce((m, b) => Math.max(m, b.total || 0), 0);
  const busiest = max > 0 ? buckets.findIndex((b) => b.total === max) : -1;
  const total = buckets.reduce((sum, b) => sum + (b.total || 0), 0);

  // Enough room at the top for the direct label on the tallest bar.
  const scale = max > 0 ? (value) => Math.max(2, Math.round((value / max) * (HEIGHT - 22))) : () => 2;
  const active = hovered >= 0 ? buckets[hovered] : null;

  return (
    <figure style={s('margin:0;')}>
      <figcaption style={s('display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 14px;')}>
        <span style={s('font-size:16px;font-weight:700;color:#212b32;')}>
          Activity by {size === 'hour' ? 'hour' : 'day'}
        </span>
        <span style={s('font-size:13.5px;color:#768692;')} aria-live="polite">
          {active
            ? tooltipFor(active.bucket, size, active.total || 0)
            : `${total.toLocaleString('en-GB')} events across ${buckets.length} ${size === 'hour' ? 'hours' : 'days'}`}
        </span>
      </figcaption>

      <div
        style={s(`position:relative;display:flex;align-items:flex-end;gap:2px;height:${HEIGHT}px;`)}
        onMouseLeave={() => setHovered(-1)}
      >
        {buckets.map((bucket, i) => {
          const value = bucket.total || 0;
          const on = hovered === i;
          return (
            // The column is the hit target, not the bar: a quiet day is three
            // pixels tall and would otherwise be impossible to hover.
            <div
              key={bucket.bucket}
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(-1)}
              tabIndex={0}
              role="img"
              aria-label={tooltipFor(bucket.bucket, size, value)}
              style={s('position:relative;flex:1;min-width:3px;height:100%;display:flex;align-items:flex-end;justify-content:stretch;cursor:default;')}
            >
              {/* A faint full-height track, so the gaps read as "nothing
                  happened" rather than as missing data. */}
              <div style={s(`position:absolute;inset:0;background:${on ? '#f4f8fa' : 'transparent'};border-radius:4px;`)} />
              <div
                style={s(
                  `position:relative;width:100%;height:${scale(value)}px;border-radius:4px 4px 0 0;` +
                  `background:${value > 0 ? BAR : TRACK};opacity:${!active || on ? 1 : 0.55};transition:opacity .12s;`,
                )}
              />
              {i === busiest && max > 0 && (
                <span style={s(`position:absolute;left:50%;transform:translateX(-50%);bottom:${scale(value) + 4}px;font-size:12px;font-weight:700;color:#212b32;white-space:nowrap;`)}>
                  {max.toLocaleString('en-GB')}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* The baseline and the two ends of the window. Recessive: the bars are
          the data, the axis is only there to say where zero is. */}
      <div style={s('height:1px;background:#d8dde0;margin-top:2px;')} />
      <div style={s('display:flex;justify-content:space-between;margin-top:6px;font-size:12.5px;color:#768692;')}>
        <span>{labelFor(buckets[0].bucket, size)}</span>
        {buckets.length > 2 && <span>{labelFor(buckets[Math.floor(buckets.length / 2)].bucket, size)}</span>}
        <span>{labelFor(buckets[buckets.length - 1].bucket, size)}</span>
      </div>
    </figure>
  );
}
