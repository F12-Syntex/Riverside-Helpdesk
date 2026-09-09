'use client';

import React from 'react';
import { s, Hover } from './ui';

/* ------------------------------------------------------------------ *
 * The commands, offered the moment a "/" is typed.
 *
 * Same panel as the telephone list: floating off the field, so the dock
 * never moves and nothing on the page is pushed aside to make room.
 *
 * Two rows and nothing else — no icons, no explanation of what the
 * assistant is, no footer of keyboard hints. The list is read in the
 * half-second before somebody keeps typing, and every extra mark on it
 * is something read instead of the command.
 * ------------------------------------------------------------------ */

export default function CommandMenu({ rows, place = 'above' }) {
  if (!rows.length) return null;

  return (
    <div
      role="listbox"
      aria-label="Commands"
      style={s('position:absolute;left:0;right:0;z-index:6;background:#141416;border:1px solid #26262a;border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,.16);overflow:hidden;'
        + (place === 'below' ? 'top:calc(100% + 10px);' : 'bottom:calc(100% + 10px);')
        + 'animation:rivaPanelIn .18s cubic-bezier(.2,.7,.3,1) both;')}>
      {rows.map((row, i) => (
        <Hover key={row.name} tag="button" type="button" role="option" aria-selected={row.isSelected}
          onClick={row.onPick}
          base={'display:flex;align-items:baseline;gap:12px;width:100%;text-align:left;border:none;'
            + (i ? 'border-top:1px solid #1c1c1f;' : '')
            + 'padding:11px 16px;font:inherit;cursor:pointer;transition:background .16s ease;'
            + (row.isSelected ? 'background:#221a1a;' : 'background:#141416;')}
          hover="background:#1b1b1f;">
          <span style={s('flex:none;font-size:15px;font-weight:700;color:#e0554f;')}>/{row.name}</span>
          <span style={s('flex:1;min-width:0;font-size:14px;color:#9a9aa3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>
            {row.summary}
          </span>
        </Hover>
      ))}
    </div>
  );
}
