'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { s, Hover, Svg, Icons } from './ui';
import { MODES, MODE_FOLDER, TOP_MODES, FOLDER_MODES } from '../../lib/commands.mjs';
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
 * TWO HEADINGS AND A FOLDER. Ask a question and Help with a task are the
 * menu at rest; the three lookups (Referral form, Contract template,
 * Practice documents) sit behind one "Look something up" row, which
 * REPLACES the list with its own page under a Back row. Whenever one of
 * the lookups is armed the menu opens on that page, so the tick is never
 * hidden behind a closed row. Every row is the same four columns, so the
 * names and descriptions line up on both pages.
 *
 * IT CLOSES THE WAY IT OPENED. The menu arrives by CSS (rivaModesIn, or
 * the bottom sheet on a phone) and leaves by motion, settling back toward
 * the pill it came out of instead of blinking out. The CSS entrance holds
 * no end state (fill `backwards`, globals.css) — one that did would
 * override the exit's inline styles and the menu would sit there solid
 * until it vanished (the lesson of 63bce7b).
 * ------------------------------------------------------------------ */

// The two pages the menu can show, as the rows the keyboard walks in the
// order they are drawn. The folder row and the Back row are rows like any
// other — they take focus, Enter and the arrows.
const FOLDER_ROW = { name: null, kind: 'folder', label: MODE_FOLDER.label, icon: MODE_FOLDER.icon, summary: MODE_FOLDER.summary };
const BACK_ROW = { name: null, kind: 'back', label: 'Back', icon: 'arrowLeft', summary: MODE_FOLDER.label };
const rowsFor = (inFolder) => (inFolder ? [BACK_ROW, ...FOLDER_MODES] : [...TOP_MODES, FOLDER_ROW]);
// The heading over each group on the top page. The folder row has none of
// its own — a hairline sets it apart instead.
const groupOf = (m) => (m.kind ? m.kind : !m.name ? 'Ask a question' : 'Help with a task');

// `ready` is the host saying it has read the kept mode back from storage.
// Until then the pill is drawn blank, so it never flashes the default glyph
// and then swaps to whatever was kept.
export default function ModeSwitch({ mode, onPick, ready = true }) {
  const [open, setOpen] = React.useState(false);
  // Which row the keyboard is on. It starts on the armed mode, so the first
  // arrow key moves away from where you already are.
  const [at, setAt] = React.useState(0);
  const [inFolder, setInFolder] = React.useState(false);
  const wrapRef = React.useRef(null);

  const current = MODES.find((m) => m.name === mode) || MODES[0];
  const armed = Boolean(current.name) && ready;
  const rows = rowsFor(inFolder);

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
  }, [open, at, inFolder]);

  const show = () => {
    const folded = Boolean(current.folder);
    setInFolder(folded);
    setAt(Math.max(0, rowsFor(folded).findIndex((m) => m.name === mode)));
    setOpen(true);
  };

  const choose = (name) => {
    setOpen(false);
    onPick(name);
  };

  // Into the folder: onto its first mode, past the Back row. Out of it:
  // back onto the folder row, the last row of the top page.
  const enterFolder = () => { setInFolder(true); setAt(1); };
  const leaveFolder = () => { setInFolder(false); setAt(TOP_MODES.length); };

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
    if (row.kind === 'back') {
      return (
        <button key="back" type="button" role="menuitem" onClick={leaveFolder} onMouseMove={point(i)}
          className="riva-mode riva-mode-back">
          {glyph(row.icon)}
          <span className="riva-mode-name">{row.summary}</span>
        </button>
      );
    }
    if (row.kind === 'folder') {
      const holds = Boolean(current.folder);
      return (
        <React.Fragment key="folder">
          <div className="riva-modes-rule" role="separator" />
          <button type="button" role="menuitem" aria-haspopup="menu" onClick={enterFolder} onMouseMove={point(i)}
            className={'riva-mode riva-mode-folder' + (holds ? ' is-on' : '')}>
            {glyph(row.icon)}
            <span className="riva-mode-name">{row.label}</span>
            <span className="riva-mode-desc">{holds ? 'Now: ' + current.label : row.summary}</span>
            <span className="riva-mode-check" aria-hidden="true"><Svg w={14} sw={2.4}>{Icons.chevronRight}</Svg></span>
          </button>
        </React.Fragment>
      );
    }
    const on = row.name === mode;
    const group = groupOf(row);
    const heading = !inFolder && (i === 0 || group !== groupOf(rows[i - 1]));
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
        {/* The mode's own glyph beside its name. */}
        <Svg w={15} sw={2.2}>{Icons[current.icon] || Icons.search}</Svg>
        <span className="riva-modes-label">{current.label}</span>
        <Svg w={13} sw={2.4} style={s('opacity:.7;transition:transform .18s ease;' + (open ? 'transform:rotate(180deg);' : ''))}>{Icons.chevronDown}</Svg>
      </Hover>

      <AnimatePresence>
        {open && (
          <motion.div key="menu" role="menu" aria-label={inFolder ? MODE_FOLDER.label : 'Answer mode'} className="riva-modes-list"
            initial={false} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: downward() ? -4 : 4, scale: 0.98, transition: { duration: 0.14, ease: EASE_EXIT } }}>
            {/* Keyed on the page so switching slides the new list in. */}
            <div key={inFolder ? 'folder' : 'top'} className={'riva-modes-page' + (inFolder ? ' is-folder' : '')}>
              {rows.map((row, i) => renderRow(row, i))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
