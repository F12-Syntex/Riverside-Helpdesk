'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';
import { MODES } from '../../lib/commands.mjs';

/* ------------------------------------------------------------------ *
 * Choosing the kind of answer, instead of knowing to type "/".
 *
 * THE PROBLEM. The commands were only ever reachable by typing a slash.
 * Somebody who has not been told they exist never finds them, and the
 * two newest — the referral forms and the contract templates — are the
 * two most worth finding, because they answer from a published list
 * rather than from a model. A feature nobody can see is a feature
 * nobody uses.
 *
 * WHERE IT SITS, AND WHY THERE. In the field, on the left, where a
 * magnifying glass already sat doing nothing. So it costs no height, no
 * second row, and nothing in the header or the footer — every one of
 * which is a thing to look at before the box you were going to type in
 * anyway. In its resting state it IS that magnifying glass, so the
 * opening screen looks as it did.
 *
 * IT LASTS ONE MESSAGE. The mode goes back to Q&A as soon as the
 * question is sent, and that is the whole safety of it. A switch that
 * stayed put would eventually be left on the wrong setting by somebody
 * halfway through a phone call, and an ordinary question answered out
 * of the referral-form list is worse than no answer — it is a confident
 * one. Typing "/form ..." has always applied to one message; the button
 * does the same thing, so the two cannot mean different things.
 *
 * TYPING STILL WINS. A command typed into the box overrides whatever
 * the button says, because it is the more specific thing the reader
 * did, and because the typed command is what the muscle memory of
 * anyone already using them will reach for.
 * ------------------------------------------------------------------ */

// The words — every mode's label, summary and placeholder — live in
// lib/commands.mjs beside the commands themselves, so the button and the typed
// command cannot drift apart and the tests can read them. Only the pictures are
// here, because only this file draws anything.
const ICON = {
  '': Icons.search,
  accurx: Icons.stethoscope,
  document: Icons.fileLines,
  form: Icons.file,
  template: Icons.folder,
  practice: Icons.book,
};

/**
 * The chip in the field, and the list it opens.
 *
 * Every mode is offered every time. A list that changes with what has been
 * typed is exactly the behaviour that made these hard to find in the first
 * place — the "/" menu only ever appeared to somebody who already knew to
 * type "/".
 */
export default function ModeSwitch({ mode, open, onToggle, onPick, place = 'above' }) {
  const active = MODES.find((m) => m.name === mode && m.name) || null;

  return (
    <>
      <Hover
        tag="button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={active ? `Answer kind: ${active.label}. Change it` : 'Choose the kind of answer'}
        onClick={onToggle}
        base={'position:absolute;left:11px;top:50%;transform:translateY(-50%);z-index:3;'
          + 'display:flex;align-items:center;gap:6px;height:44px;padding:0 10px;border-radius:999px;'
          + 'border:1px solid ' + (active ? '#bcd9f0' : 'transparent') + ';'
          + 'background:' + (active ? '#e8f1f8' : 'transparent') + ';'
          + 'color:' + (active ? '#005eb8' : '#8a99a3') + ';'
          + 'font:inherit;font-size:14.5px;font-weight:700;letter-spacing:-0.01em;cursor:pointer;'
          + 'transition:background .16s ease,color .16s ease,border-color .16s ease;'}
        hover={'background:' + (active ? '#dbeaf6' : '#eef2f4') + ';color:#005eb8;'}>
        <Svg w={20} sw={2.2}>{ICON[mode] || Icons.search}</Svg>
        {active && <span>{active.label}</span>}
        {/* The caret is what says this is a control rather than decoration.
            It is the only mark added to the resting field. */}
        <Svg w={12} sw={2.6} style={s('opacity:.75;')}>{Icons.chevronRight}</Svg>
      </Hover>

      {open && (
        <div
          role="listbox"
          aria-label="Kind of answer"
          style={s('position:absolute;left:0;right:0;z-index:7;background:#fff;border:1px solid #dde4e7;'
            + 'border-radius:14px;box-shadow:0 12px 34px rgba(33,43,50,.16);overflow:hidden;'
            + (place === 'below' ? 'top:calc(100% + 10px);' : 'bottom:calc(100% + 10px);')
            + 'animation:rivaPanelIn .18s cubic-bezier(.2,.7,.3,1) both;')}>
          {MODES.map((row, i) => (
            <Hover key={row.name || 'qa'} tag="button" type="button" role="option"
              aria-selected={row.name === mode}
              onClick={() => onPick(row.name)}
              base={'display:flex;align-items:center;gap:11px;width:100%;text-align:left;border:none;'
                + (i ? 'border-top:1px solid #eef1f2;' : '')
                + 'padding:11px 15px;font:inherit;cursor:pointer;transition:background .16s ease;'
                + (row.name === mode ? 'background:#e8f1f8;' : 'background:#fff;')}
              hover="background:#f0f6fb;">
              <span style={s('flex:none;display:flex;color:' + (row.name === mode ? '#005eb8' : '#8a99a3') + ';')}>
                <Svg w={18} sw={2.2}>{ICON[row.name] || Icons.search}</Svg>
              </span>
              <span style={s('flex:none;min-width:74px;font-size:15px;font-weight:700;color:#005eb8;')}>
                {row.label}
              </span>
              <span style={s('flex:1;min-width:0;font-size:14px;color:#4c6272;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>
                {row.summary}
              </span>
              {row.name === mode && (
                <span style={s('flex:none;display:flex;color:#005eb8;')}><Svg w={16} sw={2.6}>{Icons.check}</Svg></span>
              )}
            </Hover>
          ))}
        </div>
      )}
    </>
  );
}
