'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { s, Hover, Svg, Icons } from './ui';
import { MODES } from '../../lib/commands.mjs';
import { EASE_EXIT } from './chat/motion.mjs';

/* ------------------------------------------------------------------ *
 * Choosing the kind of answer.
 *
 * The pill at the left of the composer's toolbar opens a menu of modes
 * over the field. It is the only way to choose one: the slash commands
 * that used to sit beside it are gone.
 *
 * EACH MODE IS NAMED FOR WHAT IT READS. The row's summary line is the
 * only place a reader is told what a mode will answer from before they
 * use it, so "Referral form" says "Search the NEL Referral Tree (EMIS
 * Web)" rather than nothing.
 *
 * THE ARMED MODE IS THE PILL'S COLOUR AND THE PILL'S GLYPH. Filled blue
 * whenever anything other than Q&A is armed, quiet grey otherwise, and
 * the glass is replaced by that mode's own icon. The same glyph sits in
 * the row's tile in the menu, so what was chosen and what is showing are
 * visibly the same thing.
 *
 * IT STILL SAYS WHEN IT IS BUSY. While a message is screened for patient
 * details the pill's glyph is a spinner: a field that looks dead for
 * even half a second has somebody pressing Enter again.
 *
 * IT LASTS UNTIL IT IS CHANGED, across a reload too — looking up three
 * referral forms is three questions. What makes that safe: the pill wears
 * the mode's icon and name, the placeholder is the mode's own wording,
 * Escape in the field drops the mode in one key (QaApp.onInputKey), and
 * every message sent under one is labelled "Asked as …" in the transcript.
 *
 * ONE LIST, THREE HEADINGS. Ask a question, Help with a task, Look
 * something up: every mode is visible at once with a plain sentence saying
 * what it does. There is no sub-page to find and no keyboard legend.
 *
 * IT CLOSES THE WAY IT OPENED. The menu arrives by CSS (rivaModesIn, or
 * the bottom sheet on a phone) and leaves by motion, settling back toward
 * the pill it came out of instead of blinking out. The CSS entrance holds
 * no end state (fill `backwards`, globals.css) — one that did would
 * override the exit's inline styles and the menu would sit there solid
 * until it vanished (the lesson of 63bce7b).
 * ------------------------------------------------------------------ */

// One flat list under three plain headings, in the order it is drawn. The
// headings say what each group is FOR, so nobody has to guess from a name.
const rows = MODES;
const groupOf = (m) => (!m.name ? 'Ask a question' : m.folder ? 'Look something up' : 'Help with a task');

// `ready` is the host saying it has read the kept mode back from storage.
// Until then the pill is drawn blank, so it never flashes the default glyph
// and then swaps to whatever was kept.
export default function ModeSwitch({ mode, onPick, busy = false, ready = true }) {
  const [open, setOpen] = React.useState(false);
  // Which row the keyboard is on. It starts on the armed mode, so the first
  // arrow key moves away from where you already are.
  const [at, setAt] = React.useState(0);
  const wrapRef = React.useRef(null);

  const current = MODES.find((m) => m.name === mode) || MODES[0];
  const armed = Boolean(current.name) && ready;

  // Which way the menu opens: down into the empty page while the field is in
  // the middle of it, up out of the dock otherwise. Its exit goes back the
  // way it came.
  const downward = () => !!(wrapRef.current && wrapRef.current.closest('.riva-dock-center'));

  // The trigger, found rather than held: Hover renders the button for us and
  // does not pass a ref through.
  const focusBtn = () => {
    const el = wrapRef.current && wrapRef.current.querySelector('.riva-modes-btn');
    if (el) el.focus();
  };

  // A click anywhere else closes it. Pointerdown rather than click, so the
  // menu is gone before whatever was clicked reacts to being clicked.
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // The keyboard row is the focused row, so Enter can only ever take the row
  // somebody is looking at, and a screen reader reads the move.
  React.useEffect(() => {
    if (!open || !wrapRef.current) return;
    const els = wrapRef.current.querySelectorAll('.riva-mode');
    if (els[at]) els[at].focus();
  }, [open, at]);

  const show = () => {
    setAt(Math.max(0, rows.findIndex((m) => m.name === mode)));
    setOpen(true);
  };

  const choose = (name) => {
    setOpen(false);
    onPick(name);
  };

  // Escape closes the menu and leaves the mode alone — the field's own Escape
  // is what drops the mode.
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
    if (open && e.key === 'Tab') setOpen(false);
  };

  // Each row is four columns — glyph, name, what it does, tick — so every
  // name and every description starts on the same line down the list.
  const glyph = (icon) => (
    <span className="riva-mode-icon" aria-hidden="true">
      <Svg w={16} sw={2}>{Icons[icon] || Icons.search}</Svg>
    </span>
  );

  // The pointer moves the same highlight the arrow keys do, so there is
  // only ever one lit row: the one Enter would take.
  const point = (i) => () => { if (i !== at) setAt(i); };

  const renderRow = (row, i) => {
    const on = row.name === mode;
    const group = groupOf(row);
    const heading = i === 0 || group !== groupOf(rows[i - 1]);
    return (
      <React.Fragment key={row.name || 'qa'}>
        {heading && <div className="riva-modes-group" role="presentation">{group}</div>}
        <button type="button" role="menuitemradio" aria-checked={on}
          onClick={() => choose(row.name)} onMouseMove={point(i)}
          className={'riva-mode' + (on ? ' is-on' : '')}>
          {glyph(row.icon)}
          <span className="riva-mode-name">{row.label}</span>
          <span className="riva-mode-desc">{row.summary}</span>
          <span className="riva-mode-check" aria-hidden="true">
            {on ? <Svg w={14} sw={2.8}>{Icons.check}</Svg> : null}
          </span>
        </button>
      </React.Fragment>
    );
  };

  return (
    <div ref={wrapRef} className={'riva-modes' + (open ? ' riva-modes-open' : '')} onKeyDown={onKey}>
      <Hover
        tag="button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={'Answer mode: ' + current.label}
        title={current.summary}
        onClick={() => (open ? setOpen(false) : show())}
        className="riva-modes-btn"
        base={'display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 9px 0 12px;'
          + 'border:none;border-radius:999px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;'
          + 'transition:color .16s ease,opacity .25s ease;'
          + (armed ? 'background:#005eb8;color:#fff;' : 'background:#eef2f4;color:#4c6272;')
          + (ready ? '' : 'opacity:0;')}
        hover={armed ? 'background:#0068c9;' : 'background:#e1e8ec;color:#005eb8;'}>
        {/* The mode's own glyph beside its name, swapped for the spinner
            while a message is being screened. */}
        {busy
          ? <Svg w={16} sw={2.2} style={s('animation:rivaSpin .9s linear infinite;')}>{Icons.spinner}</Svg>
          : <Svg w={15} sw={2.2}>{Icons[current.icon] || Icons.search}</Svg>}
        <span className="riva-modes-label">{current.label}</span>
        <Svg w={13} sw={2.4} style={s('opacity:.7;transition:transform .18s ease;' + (open ? 'transform:rotate(180deg);' : ''))}>{Icons.chevronDown}</Svg>
      </Hover>

      <AnimatePresence>
        {open && (
          <motion.div key="menu" role="menu" aria-label="Answer mode" className="riva-modes-list"
            initial={false} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: downward() ? -4 : 4, scale: 0.98, transition: { duration: 0.14, ease: EASE_EXIT } }}>
            <div className="riva-modes-page">
              {rows.map((row, i) => renderRow(row, i))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
