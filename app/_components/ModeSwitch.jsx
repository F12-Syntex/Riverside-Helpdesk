'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';
import { MODES, MODE_FOLDER, TOP_MODES, FOLDER_MODES } from '../../lib/commands.mjs';

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
 * EACH MODE IS NAMED FOR THE DOCUMENT IT READS. "Form" and "Template" were
 * the names of the things being looked for, which said nothing about where the
 * answer would come from; they are "Referral form — Search the NEL Referral
 * Tree (EMIS Web)" and "Contract template — Search the NEL Local Contract
 * Specifications" now, because the row in this list is the only place a reader
 * is told what a mode will read before they use it.
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
 * THE ARMED MODE IS THE DISC'S COLOUR AND THE DISC'S GLYPH. Filled blue
 * whenever anything other than Q&A is armed, quiet grey otherwise — and
 * the glass is replaced by that mode's own icon: a sheet of lines for
 * Form, two sheets for Template, a speech bubble for AccurX, a folder
 * for Coding, a book for Practice. The colour said A mode is on; the
 * glyph says WHICH, which is the question somebody glancing at the field
 * actually has. The same
 * glyph is drawn beside the name in the list, so what was chosen and
 * what is showing are visibly the same thing. The placeholder still says
 * it in words, and the transcript carries "Asked as Referral form"
 * afterwards.
 *
 * IT STILL SAYS WHEN IT IS BUSY. The spinner that used to replace the
 * glass while a message is screened for patient details replaces it
 * inside the disc instead, in the same place, for the same reason: a
 * field that looks dead for even half a second has somebody pressing
 * Enter again. It never appears under Coding: that screen does not run on
 * a mode whose whole input is a letter about a patient — see `screened`
 * in lib/commands.mjs.
 *
 * IT LASTS UNTIL IT IS CHANGED. It used to go back to Q&A the moment a
 * question was sent, on the argument that a switch left on the wrong
 * setting is worse than one that has to be set every time. That was the
 * wrong trade for how the modes are actually used: looking up three
 * referral forms means three questions, and re-arming the picker between
 * each one is exactly the friction the picker was added to remove. So
 * the mode is now kept, and kept across a reload too.
 *
 * WHAT PAYS FOR THAT. The failure modes are not symmetric — a wrong
 * /form says honestly that no list has such an entry, while a wrong
 * /accurx renders a confident triage card, with a destination and an
 * urgency, for a question that was never about a patient — so a mode
 * that stays put has to be impossible to miss and trivial to drop:
 *
 *   - the disc wears the mode's own icon, not just a colour, so the
 *     armed mode is legible at a glance rather than inferrable;
 *   - the placeholder is that mode's own wording;
 *   - Escape in the field drops the mode in one key (QaApp.onInputKey);
 *   - every message sent under one is labelled "Asked as Referral form" in
 *     the transcript, so a wrong answer says how it was asked for.
 *
 * TYPING STILL WINS. A command typed into the box overrides whatever is
 * armed here: it is the more specific thing the reader just did.
 *
 * FOUR OF THE MODES ARE BEHIND A FOLDER. Q&A, AccurX and Consultation are
 * the list at rest; Coding, Referral form, Contract template and Practice
 * documents sit behind one "Documents & lookups" row — see MODE_FOLDER in
 * lib/commands.mjs for why those four. Opening the folder REPLACES the
 * list with its four modes under a Back row, rather than growing the list
 * under the folder: the panel stays the same height either way, and what
 * is showing is always one short list rather than one list inside another.
 * The folder page is what opens whenever one of its modes is the armed
 * one, so the tick is never behind a closed row.
 * ------------------------------------------------------------------ */

// The two pages the list can show, each as the rows the keyboard walks in the
// order they are drawn. The folder row and the Back row are rows like any
// other — they take focus, Enter and the arrows — so the keyboard walks one
// list on each page rather than a list and a control.
const FOLDER_ROW = { name: null, kind: 'folder', label: MODE_FOLDER.label, icon: MODE_FOLDER.icon, summary: MODE_FOLDER.summary };
const BACK_ROW = { name: null, kind: 'back', label: 'Back', icon: 'arrowLeft', summary: 'All kinds of answer' };
const rowsFor = (inFolder) => (inFolder ? [BACK_ROW, ...FOLDER_MODES] : [...TOP_MODES, FOLDER_ROW]);

export default function ModeSwitch({ mode, onPick, busy = false }) {
  const [open, setOpen] = React.useState(false);
  // Which row the keyboard is on. It starts on the armed mode rather than at
  // the top, so the first arrow key moves away from where you already are.
  const [at, setAt] = React.useState(0);
  // Which page the list is showing. Set each time the list opens.
  const [inFolder, setInFolder] = React.useState(false);
  const wrapRef = React.useRef(null);

  const current = MODES.find((m) => m.name === mode) || MODES[0];
  const armed = Boolean(current.name);
  const rows = rowsFor(inFolder);

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
    // A foldered mode that is armed opens on the folder page, so the list
    // opens on the row that is ticked rather than on a folder hiding it.
    const folded = Boolean(current.folder);
    const list = rowsFor(folded);
    setInFolder(folded);
    setAt(Math.max(0, list.findIndex((m) => m.name === mode)));
    setOpen(true);
  };

  const choose = (name) => {
    setOpen(false);
    onPick(name);
  };

  // Into the folder: the keyboard lands on its first mode, past the Back row,
  // because Back is where it just came from. Out of it: back onto the folder
  // row, which is the last row of the top page.
  const enterFolder = () => { setInFolder(true); setAt(1); };
  const leaveFolder = () => { setInFolder(false); setAt(TOP_MODES.length); };

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
      setAt((i) => (i + step + rows.length) % rows.length);
      return;
    }
    // Right on the folder row goes into it; Left anywhere on the folder page
    // comes back out — the usual keys for going down and up a level.
    if (open && e.key === 'ArrowRight' && !inFolder && rows[at] === FOLDER_ROW) {
      e.preventDefault();
      enterFolder();
      return;
    }
    if (open && e.key === 'ArrowLeft' && inFolder) {
      e.preventDefault();
      leaveFolder();
      return;
    }
    if (open && e.key === 'Tab') setOpen(false);
  };

  const rowStyle = (i) => (
    'display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;'
    + (i ? 'border-top:1px solid #eef1f2;' : '')
    + 'padding:10px 15px;font:inherit;cursor:pointer;background:#fff;'
    + 'transition:background .14s ease;'
  );

  // The folder row and the Back row: the same shape as a mode row, so the list
  // reads as one thing, but neither is a mode — no tick, no radio role. The
  // folder row's chevron points in; the Back row's arrow points out; and a
  // folder holding the armed mode wears a dot in the tick's column so the tick
  // has not simply vanished from the top page.
  const controlRow = (row, i, onClick, { marked = false, trailing = null } = {}) => (
    <Hover
      key={row.kind}
      tag="button"
      type="button"
      role="menuitem"
      title={row.summary}
      onClick={onClick}
      className={'riva-mode riva-mode-' + row.kind}
      base={rowStyle(i) + (row.kind === 'back' ? 'background:#f7f9fa;' : '')}
      hover="background:#f0f6fb;">
      <span style={s('flex:none;display:flex;width:14px;color:#005eb8;justify-content:center;')}>
        {marked ? <span style={s('width:7px;height:7px;border-radius:50%;background:#005eb8;')} /> : null}
      </span>
      <span style={s('flex:none;display:flex;color:' + (marked ? '#005eb8' : '#6b7f8d') + ';')}>
        <Svg w={16} sw={2.1}>{Icons[row.icon] || Icons.folder}</Svg>
      </span>
      <span style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;')}>
        <span style={s('font-size:14px;font-weight:700;color:' + (marked ? '#005eb8' : '#212b32') + ';')}>
          {row.label}
        </span>
        <span style={s('font-size:12.5px;color:#5b7183;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>
          {row.summary}
        </span>
      </span>
      {trailing}
    </Hover>
  );

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
          : <Svg w={20} sw={2.2}>{Icons[current.icon] || Icons.search}</Svg>}
      </Hover>

      {open && (
        <div role="menu" aria-label={inFolder ? MODE_FOLDER.label : 'Kind of answer'} className="riva-modes-list">
          {rows.map((row, i) => {
            if (row.kind === 'folder') {
              return controlRow(row, i, enterFolder, {
                marked: Boolean(current.folder),
                trailing: (
                  <span style={s('flex:none;display:flex;color:#6b7f8d;')}>
                    <Svg w={16} sw={2.2}>{Icons.chevronRight}</Svg>
                  </span>
                ),
              });
            }
            if (row.kind === 'back') return controlRow(row, i, leaveFolder);
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
                base={rowStyle(i)}
                hover="background:#f0f6fb;">
                {/* The tick holds its column whether or not it is drawn, so the
                    names line up down the list instead of stepping in on the
                    armed one. */}
                <span style={s('flex:none;display:flex;width:14px;color:#005eb8;')}>
                  {on ? <Svg w={14} sw={3}>{Icons.check}</Svg> : null}
                </span>
                {/* The same glyph the disc wears while this mode is armed, so
                    the picture in the field is the picture that was picked and
                    not a second thing to learn. */}
                <span style={s('flex:none;display:flex;color:' + (on ? '#005eb8' : '#6b7f8d') + ';')}>
                  <Svg w={16} sw={2.1}>{Icons[row.icon] || Icons.search}</Svg>
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
