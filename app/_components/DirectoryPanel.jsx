'use client';

import React from 'react';
import { s, Hover } from './ui';

/* ------------------------------------------------------------------ *
 * The practice directory, offered against the field as someone types.
 *
 * It floats off the field rather than standing in the dock's flow: the
 * dock never moves when it opens, and nothing on the page is pushed
 * aside to make room for it.
 *
 * Nothing here snaps. The panel rises out of the dock and settles back
 * into it, holding the rows it was showing while it leaves; when the
 * matches change underneath it, the panel grows or shrinks to its new
 * height rather than jumping, and each new row fades in behind the one
 * before it. Numbers are shown verbatim from the directory.
 * ------------------------------------------------------------------ */

const EXIT_MS = 180;

// How tall the panel is allowed to get before it starts scrolling instead.
// About five rows: enough to see there is more, short enough that it never
// swallows the page it is floating over.
const MAX_H = 330;

export default function DirectoryPanel({ v, place = 'above' }) {
  const [mounted, setMounted] = React.useState(v.hasDirectory);
  const [rows, setRows] = React.useState(v.directory);
  const [count, setCount] = React.useState(v.directoryCount);
  const [height, setHeight] = React.useState(null);
  const inner = React.useRef(null);
  const scroller = React.useRef(null);

  React.useEffect(() => {
    if (v.hasDirectory) {
      setRows(v.directory);
      setCount(v.directoryCount);
      setMounted(true);
      return undefined;
    }
    if (!mounted) return undefined;
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [v.hasDirectory, v.directory, v.directoryCount, mounted]);

  // The panel is as tall as whatever it is currently showing, and moves
  // between those heights rather than cutting to them.
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const measure = () => setHeight(Math.min(el.offsetHeight, MAX_H));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, mounted]);

  // Walking the list with the arrow keys scrolls it: a selected row below the
  // fold is a selection nobody can see.
  React.useEffect(() => {
    const box = scroller.current;
    const el = box && box.querySelector('[aria-selected="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [v.directory]);

  if (!mounted) return null;
  const leaving = !v.hasDirectory;

  return (
    <div
      style={s('position:absolute;left:0;right:0;z-index:5;background:#fff;border:1px solid #dde4e7;border-radius:14px;box-shadow:0 12px 34px rgba(33,43,50,.16);overflow:hidden;transition:height .24s cubic-bezier(.2,.7,.3,1);'
        + (place === 'below' ? 'top:calc(100% + 10px);transform-origin:top center;' : 'bottom:calc(100% + 10px);transform-origin:bottom center;')
        + (height == null ? '' : 'height:' + height + 'px;')
        + (leaving
          ? 'animation:rivaPanelOut .18s ease both;pointer-events:none;'
          : 'animation:rivaPanelIn .22s cubic-bezier(.2,.7,.3,1) both;'))}>
      <div ref={scroller} style={s('height:100%;overflow-y:auto;overscroll-behavior:contain;')}>
      <div ref={inner} role="listbox" aria-label="Contacts">
        <div style={s('display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:8px 16px;background:#f0f4f5;border-bottom:1px solid #dde4e7;')}>
          <span style={s('font-size:12.5px;color:#4c6272;')}>{count} &middot; &uarr;&darr; to choose</span>
        </div>
        {rows.map((r, i) => (
          <React.Fragment key={r.key}>
            {/* A heading wherever the list changes hands: the practice's own
                numbers, then the register of every service in England. */}
            {r.group && r.group !== (rows[i - 1] || {}).group && (
              <div style={s('padding:8px 16px 6px;background:#fbfcfd;border-top:1px solid #eef1f2;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a99a3;')}>{r.group}</div>
            )}
          <Hover tag="button" type="button" role="option" aria-selected={r.isSelected} onClick={r.onPick}
            base={'display:flex;align-items:center;gap:14px;width:100%;text-align:left;border:none;'
              + (r.group && r.group !== (rows[i - 1] || {}).group ? '' : 'border-top:1px solid #eef1f2;')
              + 'padding:12px 16px;font:inherit;cursor:pointer;transition:background .16s ease,color .16s ease;animation:rivaAnswerIn .26s cubic-bezier(.2,.7,.3,1) both;animation-delay:' + (i * 0.035).toFixed(3) + 's;'
              + (r.isSelected ? 'background:#e8f1f8;' : 'background:#fff;')}
            hover="background:#f0f6fb;">
            <span style={s('flex:1;min-width:0;')}>
              <span style={s('display:block;font-size:15.5px;font-weight:700;color:#212b32;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{r.label}</span>
              {r.detail && <span style={s('display:block;font-size:13px;color:#4c6272;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{r.detail}</span>}
            </span>
            <span style={s('flex:none;font-size:16px;font-weight:700;color:#005eb8;')}>{r.number}</span>
          </Hover>
          </React.Fragment>
        ))}
      </div>
      </div>
    </div>
  );
}
