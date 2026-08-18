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
 * IT IS THE SEARCH ICON, AND IT IS A BUTTON. The magnifying glass has
 * always sat at the left of the field. It was decoration: a picture of
 * what the box does, costing 48px of the box and doing nothing when it
 * was pressed. It now carries a disc behind it, which is what says a
 * thing can be pressed, and pressing it opens the list of modes over the
 * field. Nothing new was added to the page to make room for this — the
 * one control that was already there stopped being ornamental.
 *
 * WHY NOT THE ROW OF PILLS IT REPLACED. Four named pills under the box
 * were the plainest thing to read, but they were four buttons hanging
 * off the dock for a choice that is left alone almost every time, and
 * the row had to appear and disappear with the cursor to stay out of the
 * way — which is its own kind of movement. A disc that is already part
 * of the field costs nothing when it is not being used.
 *
 * THE ARMED MODE IS THE DISC'S COLOUR. Filled blue with a white glass
 * whenever anything other than Q&A is armed, quiet grey otherwise, so a
 * field about to answer out of the referral list cannot look like a
 * field about to answer a question. The placeholder says the same thing
 * in words, and the transcript carries "Asked as Form" afterwards.
 *
 * IT STILL SAYS WHEN IT IS BUSY. The spinner that used to replace the
 * glass while a message is screened for patient details replaces it
 * inside the disc instead, in the same place, for the same reason: a
 * field that looks dead for even half a second has somebody pressing
 * Enter again.
 *
 * IT LASTS ONE MESSAGE. The mode goes back to Q&A as soon as the
 * question is sent, and that is the whole safety of it. A switch that
 * stayed put would be left on the wrong setting by somebody halfway
 * through a phone call. The failure modes are not symmetric: a wrong
 * /form says honestly that the list has no such entry, while a wrong
 * /accurx renders a confident triage card, with a destination and an
 * urgency, for a question that was never about a patient. AccurX is on
 * this list — it is the answer the practice reaches for most — so that
 * one-message rule is now load-bearing rather than a precaution.
 *
 * TYPING STILL WINS. A command typed into the box overrides whatever is
 * armed here: it is the more specific thing the reader just did.
 * ------------------------------------------------------------------ */

export default function ModeSwitch({ mode, onPick, busy = false }) {
  const [open, setOpen] = React.useState(false);
  // Which row the keyboard is on. It starts on the armed mode rather than at
  // the top, so the first arrow key moves away from where you already are.
  const [at, setAt] = React.useState(0);
  const wrapRef = React.useRef(null);

  const current = MODES.find((m) => m.name === mode) || MODES[0];
  const armed = Boolean(current.name);

  // The trigger, found rather than held: Hover renders the button for us and
  // React 18 does not pass a ref through a plain function component.
  const focusBtn = () => {
    const el = wrapRef.current && wrapRef.current.querySelector('.riva-modes-btn');
    if (el) el.focus();
  };

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

  // The keyboard row is the focused row, not a highlight drawn beside one: an
  // arrow key moves focus, so Enter can only ever take the row somebody is
  // looking at, and a screen reader reads the move without being told to.
  React.useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rows = wrapRef.current.querySelectorAll('.riva-mode');
    if (rows[at]) rows[at].focus();
  }, [open, at]);

  const show = () => {
    setAt(Math.max(0, MODES.findIndex((m) => m.name === mode)));
    setOpen(true);
  };

  const choose = (name) => {
    setOpen(false);
    onPick(name);
  };

  // Escape closes the list and leaves the mode alone — the field's own Escape
  // is what backs out of the mode itself, one step at a time.
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
    if (open && e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={wrapRef} className={'riva-modes' + (open ? ' riva-modes-open' : '')} onKeyDown={onKey}>
      <Hover
        tag="button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={'Kind of answer: ' + current.label}
        title={current.summary}
        onClick={() => (open ? setOpen(false) : show())}
        className="riva-modes-btn"
        base={'display:flex;align-items:center;justify-content:center;width:100%;height:100%;'
          + 'border:none;border-radius:50%;padding:0;cursor:pointer;'
          + 'transition:background .16s ease,color .16s ease;'
          + (armed ? 'background:#005eb8;color:#fff;' : 'background:#eaeff1;color:#4c6272;')}
        hover={armed ? 'background:#00437f;' : 'background:#dbe3e7;color:#005eb8;'}>
        {busy
          ? <Svg w={20} sw={2.2} style={s('animation:rivaSpin .9s linear infinite;')}>{Icons.spinner}</Svg>
          : <Svg w={20} sw={2.2}>{Icons.search}</Svg>}
      </Hover>

      {open && (
        <div role="menu" aria-label="Kind of answer" className="riva-modes-list">
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
                  + 'padding:10px 15px;font:inherit;cursor:pointer;background:#fff;'
                  + 'transition:background .14s ease;'}
                hover="background:#f0f6fb;">
                {/* The tick holds its column whether or not it is drawn, so the
                    names line up down the list instead of stepping in on the
                    armed one. */}
                <span style={s('flex:none;display:flex;width:14px;color:#005eb8;')}>
                  {on ? <Svg w={14} sw={3}>{Icons.check}</Svg> : null}
                </span>
                <span style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;')}>
                  <span style={s('font-size:14px;font-weight:700;color:' + (on ? '#005eb8' : '#212b32') + ';')}>
                    {row.label}
                  </span>
                  <span style={s('font-size:12.5px;color:#5b7183;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>
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
