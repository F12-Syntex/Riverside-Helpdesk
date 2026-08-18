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
 * IT IS ONE CONTROL AT THE LEFT, NOT FOUR POSITIONS OF A TRACK. The
 * segmented pill named every mode at rest, which is what solved the
 * discovery problem — but four filled columns is a wide, busy thing to
 * hang over the page for a choice that is left alone almost every time,
 * and the sliding thumb kept saying "something is happening here" when
 * nothing was. What is left is one quiet button at the left edge of the
 * strip, reading the mode that is armed, that opens the list when it is
 * clicked. Closed, it is four words wide; open, every mode is named with
 * the line that says what it does — which the pill never had room for.
 *
 * IT STILL SAYS WHAT IS ARMED WITHOUT BEING OPENED. That is the part
 * worth keeping from the pill: the button carries the mode's own label,
 * and reads blue and filled whenever it is anything other than Q&A, so a
 * field that is about to answer out of the referral list cannot look
 * like a field that is about to answer a question.
 *
 * WHERE IT SITS. In the strip directly above the field, which is
 * ALREADY 32px tall and already reserved in --riva-dock-h, so nothing on
 * the page moves to make room and the dock does not grow. The list is
 * absolutely positioned above the button, out of the flow for the same
 * reason the telephone panel is: the dock stays put while it is open.
 * The strip's other two occupants — the send bar and the "Copied" line —
 * are both under three seconds, and they take the strip back while they
 * need it.
 *
 * IT LASTS ONE MESSAGE. The mode goes back to Q&A as soon as the
 * question is sent, and that is the whole safety of it. A switch that
 * stayed put would be left on the wrong setting by somebody halfway
 * through a phone call. The failure modes are not symmetric: a wrong
 * /form says honestly that the list has no such entry, while a wrong
 * /accurx renders a confident triage card, with a destination and an
 * urgency, for a question that was never about a patient. Re-arming is
 * two clicks, which is still affordable for a run of lookups.
 *
 * TYPING STILL WINS. A command typed into the box overrides whatever is
 * selected here: it is the more specific thing the reader just did.
 * ------------------------------------------------------------------ */

export default function ModeSwitch({ mode, onPick }) {
  const [open, setOpen] = React.useState(false);
  // Which row the keyboard is on. Only meaningful while the list is open,
  // and it starts on the armed mode rather than at the top, so the first
  // arrow key moves away from where you already are.
  const [at, setAt] = React.useState(0);
  const wrapRef = React.useRef(null);
  // The trigger, found rather than held: Hover renders the button for us and
  // React 18 does not pass a ref through a plain function component.
  const focusBtn = () => {
    const el = wrapRef.current && wrapRef.current.querySelector('.riva-modes-btn');
    if (el) el.focus();
  };

  const current = MODES.find((m) => m.name === mode) || MODES[0];
  const armed = Boolean(current.name);

  // A click anywhere else closes it. Pointerdown rather than click, so the
  // list is gone before whatever was clicked reacts to being clicked.
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const show = () => {
    setAt(Math.max(0, MODES.findIndex((m) => m.name === mode)));
    setOpen(true);
  };

  const choose = (name) => {
    setOpen(false);
    onPick(name);
  };

  // The keyboard row is the focused row, not a highlight drawn beside one:
  // an arrow key moves focus, so Enter can only ever take the row somebody is
  // looking at, and a screen reader reads the move without being told to.
  React.useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rows = wrapRef.current.querySelectorAll('.riva-mode');
    if (rows[at]) rows[at].focus();
  }, [open, at]);

  // Escape closes the list and leaves the mode alone — the field's own
  // Escape is what backs out of the mode itself, one step at a time.
  const onKey = (e) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
      focusBtn();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { show(); return; }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setAt((i) => (i + step + MODES.length) % MODES.length);
      return;
    }
    if (open && (e.key === 'Tab')) setOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      className={'riva-modes' + (open ? ' riva-modes-open' : '')}
      onKeyDown={onKey}>
      <Hover
        tag="button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={'Kind of answer: ' + current.label}
        title={current.summary}
        onClick={() => (open ? setOpen(false) : show())}
        className="riva-modes-btn"
        base={'display:inline-flex;align-items:center;gap:8px;height:26px;padding:0 10px 0 12px;'
          + 'border-radius:999px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;'
          + 'white-space:nowrap;transition:background .16s ease,border-color .16s ease,color .16s ease;'
          + (armed
            ? 'background:#005eb8;border:1px solid #005eb8;color:#fff;'
            : 'background:rgba(255,255,255,.78);border:1px solid #dde4e7;color:#4c6272;')}
        hover={armed ? 'background:#00437f;border-color:#00437f;' : 'border-color:#005eb8;color:#00437f;'}>
        <span>{current.label}</span>
        {/* One chevron, pointing up at the list it will open and turning over
            once it is open, so the button says which way it is going rather
            than only what it holds. Turned in CSS (.riva-modes-caret). */}
        <span className="riva-modes-caret" aria-hidden="true" style={s('display:flex;opacity:.8;')}>
          <Svg w={12} sw={2.4}>{Icons.chevronRight}</Svg>
        </span>
      </Hover>

      {open && (
        <div
          role="menu"
          aria-label="Kind of answer"
          className="riva-modes-list">
          {MODES.map((row, i) => {
            const on = row.name === mode;
            return (
              <Hover
                key={row.name || 'qa'}
                tag="button"
                type="button"
                role="menuitemradio"
                aria-checked={on}
                title={row.summary}
                onClick={() => choose(row.name)}
                className="riva-mode"
                base={'display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;'
                  + (i ? 'border-top:1px solid #eef1f2;' : '')
                  + 'padding:9px 14px;font:inherit;cursor:pointer;transition:background .14s ease;'
                  + (i === at ? 'background:#f0f6fb;' : 'background:#fff;')}
                hover="background:#f0f6fb;">
                {/* The tick is the only mark in the row, and it holds its
                    column whether or not it is drawn, so the labels line up
                    down the list instead of stepping in on the armed one. */}
                <span style={s('flex:none;display:flex;width:14px;color:#005eb8;')}>
                  {on ? <Svg w={14} sw={3}>{Icons.check}</Svg> : null}
                </span>
                <span style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;')}>
                  <span style={s('font-size:13.5px;font-weight:700;color:' + (on ? '#005eb8' : '#212b32') + ';')}>
                    {row.label}
                  </span>
                  <span style={s('font-size:12px;color:#5b7183;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>
                    {row.summary}
                  </span>
                </span>
              </Hover>
            );
          })}
        </div>
      )}
    </div>
  );
}
