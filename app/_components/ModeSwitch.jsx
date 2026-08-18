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
 * FOUR PILLS UNDER THE BOX, AND NOTHING ELSE. Every mode is a word you
 * can read without opening anything and arm with one click. The two
 * controls this replaced both got in their own way: a segmented track
 * with a sliding thumb was a piece of machinery for a choice that is
 * left alone almost every time, and the button-and-menu that followed it
 * hid three of the four modes behind a click and still had to explain
 * itself with a caption. A row of words needs neither.
 *
 * UNDER THE FIELD, NOT BESIDE IT AND NOT ABOVE IT. Beside it, the
 * control was competing with the box for the row and taking width off a
 * placeholder that needs it — badly on a phone. Above it, it shared the
 * strip with the send bar. Under the box it is out of the field's way
 * entirely, and it is read in the order it is used: the question first,
 * the kind of answer second. The room it takes is declared once, in
 * --riva-dock-extras, which every other measurement on the page is
 * already worked out from, so the hero above still clears the dock.
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
 * Q&A IS A PILL LIKE THE REST. It is what almost every message is, and
 * showing it as one of the four is what says the row is a choice with a
 * setting rather than three switches that might all be off.
 *
 * TYPING STILL WINS. A command typed into the box overrides whatever is
 * armed here: it is the more specific thing the reader just did.
 * ------------------------------------------------------------------ */

export default function ModeSwitch({ mode, onPick }) {
  return (
    <div className="riva-modes" role="group" aria-label="Kind of answer">
      {MODES.map((row) => {
        const on = row.name === mode;
        return (
          <Hover
            key={row.name || 'qa'}
            tag="button"
            type="button"
            /* Toggle buttons rather than radios: every pill stays an ordinary
               tab stop that way, and "pressed" is exactly what the filled one
               is. The group's label says what the set is for. */
            aria-pressed={on}
            title={row.summary}
            onClick={() => onPick(row.name)}
            className={'riva-mode' + (on ? ' riva-mode-on' : '')}
            base={'display:inline-flex;align-items:center;height:32px;padding:0 15px;'
              + 'border-radius:999px;font:inherit;font-size:13.5px;font-weight:600;'
              + 'cursor:pointer;white-space:nowrap;'
              + 'transition:background .16s ease,border-color .16s ease,color .16s ease;'
              + (on
                ? 'background:#005eb8;border:1px solid #005eb8;color:#fff;'
                : 'background:rgba(255,255,255,.72);border:1px solid #dde4e7;color:#4c6272;')}
            hover={on ? 'background:#00437f;border-color:#00437f;' : 'border-color:#005eb8;color:#00437f;'}>
            {row.label}
          </Hover>
        );
      })}
    </div>
  );
}
