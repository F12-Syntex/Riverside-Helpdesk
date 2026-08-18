'use client';

import React from 'react';
import { Hover } from './ui';
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
 * WHY ONE CONTROL RATHER THAN A MENU. The first attempt put a chip
 * in the field that opened a list. It cost no space, but at rest it was
 * a grey magnifying glass with a small caret beside it — and a reader
 * who was never told the modes exist will not read a caret as a menu any
 * more than they read a blank field as a slash prompt. It solved the
 * space problem and not the problem. Every mode is named here, with no
 * click needed to find out they are there.
 *
 * IT IS ONE SWITCH, NOT A ROW OF BUTTONS. An earlier pass gave each mode its own
 * bordered chip with an icon, and six outlined things floating over the
 * page read as clutter rather than as a control. They share one quiet
 * track now, the way a segmented control does: only the chosen one is
 * filled, the rest are plain text, and there is a single edge around the
 * set. Nothing is drawn that is not a word somebody needs to read.
 *
 * WHERE IT SITS. In the strip directly above the field, which is
 * ALREADY 32px tall and already reserved in --riva-dock-h, so nothing on
 * the page moves to make room and the dock does not grow. It is part of
 * the dock, not the header and not the footer. The strip's other two
 * occupants — the send bar and the "Copied" line — are both under three
 * seconds, and they take it back while they need it.
 *
 * IT LASTS ONE MESSAGE. The mode goes back to Q&A as soon as the
 * question is sent, and that is the whole safety of it. A switch that
 * stayed put would be left on the wrong setting by somebody halfway
 * through a phone call. The failure modes are not symmetric: a wrong
 * /form says honestly that the list has no such entry, while a wrong
 * /accurx renders a confident triage card, with a destination and an
 * urgency, for a question that was never about a patient. Re-arming is
 * one click, which is what makes resetting affordable for a run of
 * lookups.
 *
 * TYPING STILL WINS. A command typed into the box overrides whatever is
 * selected here: it is the more specific thing the reader just did.
 * ------------------------------------------------------------------ */

export default function ModeSwitch({ mode, onPick }) {
  const at = Math.max(0, MODES.findIndex((m) => m.name === mode));
  return (
    <div
      className="riva-modes"
      role="radiogroup"
      aria-label="Kind of answer"
      style={{ '--riva-mode-i': at, '--riva-mode-n': MODES.length }}>
      {/* The thumb. One element that slides, rather than a fill that jumps from
          one label to the next: the movement is what says these are positions of
          one switch and not five separate buttons. Behind the labels, and hidden
          from assistive technology, which reads the radio group instead. */}
      <span className="riva-modes-thumb" aria-hidden="true" />
      {MODES.map((row) => {
        const on = row.name === mode;
        return (
          <Hover
            key={row.name || 'qa'}
            tag="button"
            type="button"
            role="radio"
            aria-checked={on}
            title={row.summary}
            onClick={() => onPick(row.name)}
            className={'riva-mode' + (on ? ' riva-mode-on' : '')}
            base={'position:relative;z-index:1;display:inline-flex;align-items:center;'
              + 'justify-content:center;height:24px;padding:0 14px;border:none;background:transparent;'
              + 'border-radius:999px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;'
              + 'white-space:nowrap;transition:color .16s ease;'
              + (on ? 'color:#fff;' : 'color:#5b7183;')}
            hover={on ? '' : 'color:#00437f;'}>
            {row.label}
          </Hover>
        );
      })}
    </div>
  );
}
