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
 * WHY A ROW OF PILLS RATHER THAN A MENU. The first attempt put a chip
 * in the field that opened a list. It cost no space, but at rest it was
 * a grey magnifying glass with a small caret beside it — and a reader
 * who was never told the modes exist will not read a caret as a menu any
 * more than they read a blank field as a slash prompt. It solved the
 * space problem and not the problem. Every mode is named here, with no
 * click needed to find out they are there.
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

const ICON = {
  '': Icons.search,
  accurx: Icons.stethoscope,
  document: Icons.fileLines,
  form: Icons.file,
  template: Icons.folder,
  practice: Icons.book,
};

export default function ModeSwitch({ mode, onPick }) {
  return (
    <div className="riva-modes" role="radiogroup" aria-label="Kind of answer">
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
            className="riva-mode"
            base={'display:inline-flex;align-items:center;gap:5px;flex:none;height:26px;padding:0 10px;'
              + 'border-radius:999px;font:inherit;font-size:13px;font-weight:700;letter-spacing:-0.01em;'
              + 'cursor:pointer;white-space:nowrap;transition:background .16s ease,color .16s ease,border-color .16s ease;'
              + (on
                ? 'background:#005eb8;border:1px solid #005eb8;color:#fff;'
                : 'background:#fff;border:1px solid #d8dde0;color:#4c6272;')}
            hover={on ? 'background:#003087;border-color:#003087;' : 'background:#eef4f8;border-color:#a9c6dd;color:#005eb8;'}>
            <Svg w={14} sw={2.3}>{ICON[row.name] || Icons.search}</Svg>
            <span>{row.label}</span>
          </Hover>
        );
      })}
    </div>
  );
}
