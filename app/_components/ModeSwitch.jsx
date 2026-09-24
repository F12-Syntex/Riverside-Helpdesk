'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';
import { MODES, MODE_FOLDER, TOP_MODES, FOLDER_MODES } from '../../lib/commands.mjs';

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
 * THE LOOKUPS ARE BEHIND A FOLDER. Q&A and the write-up modes are the
 * menu at rest; Referral form, Contract template and Practice documents
 * sit behind one "Documents & lookups" row (MODE_FOLDER in
 * lib/commands.mjs). Opening it REPLACES the list with its modes under a
 * header that leads back, so the menu is always one short list. The
 * folder page is what opens whenever one of its modes is armed, so the
 * tick is never behind a closed row.
 * ------------------------------------------------------------------ */

// The two pages the menu can show, each as the rows the keyboard walks in the
// order they are drawn. The folder row and the Back row are rows like any
// other — they take focus, Enter and the arrows.
const FOLDER_ROW = { name: null, kind: 'folder', label: MODE_FOLDER.label, icon: MODE_FOLDER.icon, summary: MODE_FOLDER.summary };
const BACK_ROW = { name: null, kind: 'back', label: MODE_FOLDER.label, icon: 'arrowLeft', summary: 'Back to all modes' };
const rowsFor = (inFolder) => (inFolder ? [BACK_ROW, ...FOLDER_MODES] : [...TOP_MODES, FOLDER_ROW]);

// `ready` is the host saying it has read the kept mode back from storage.
// Until then the pill is drawn blank, so it never flashes the default glyph
// and then swaps to whatever was kept.
export default function ModeSwitch({ mode, onPick, busy = false, ready = true }) {
  const [open, setOpen] = React.useState(false);
  // Which row the keyboard is on. It starts on the armed mode, so the first
  // arrow key moves away from where you already are.
  const [at, setAt] = React.useState(0);
  const [inFolder, setInFolder] = React.useState(false);
  const wrapRef = React.useRef(null);

  const current = MODES.find((m) => m.name === mode) || MODES[0];
  const armed = Boolean(current.name) && ready;
  const rows = rowsFor(inFolder);

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

  // Into the folder: onto its first mode, past the header row. Out of it:
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

  // Each mode's glyph on a small tile, so the list can be scanned by shape
  // before it is read; the armed mode's tile turns blue.
  const tile = (icon, on) => (
    <span className={'riva-mode-tile' + (on ? ' is-on' : '')} aria-hidden="true">
      <Svg w={16} sw={2.1}>{Icons[icon] || Icons.search}</Svg>
    </span>
  );

  const text = (label, summary) => (
    <span className="riva-mode-text">
      <span className="riva-mode-label">{label}</span>
      <span className="riva-mode-summary">{summary}</span>
    </span>
  );

  // The pointer moves the same highlight the arrow keys do, so there is
  // only ever one lit row: the one Enter would take.
  const point = (i) => () => { if (i !== at) setAt(i); };

  const renderRow = (row, i) => {
    if (row.kind === 'back') {
      return (
        <button key="back" type="button" role="menuitem" title={row.summary}
          onClick={leaveFolder} onMouseMove={point(i)} className="riva-mode riva-mode-back">
          <span className="riva-mode-backicon" aria-hidden="true">
            <Svg w={15} sw={2.4}>{Icons.arrowLeft}</Svg>
          </span>
          <span className="riva-mode-heading">{row.label}</span>
        </button>
      );
    }
    if (row.kind === 'folder') {
      const holds = Boolean(current.folder);
      return (
        <React.Fragment key="folder">
          <span className="riva-modes-sep" role="separator" />
          <button type="button" role="menuitem" title={row.summary}
            onClick={enterFolder} onMouseMove={point(i)} className={'riva-mode riva-mode-folder' + (holds ? ' is-on' : '')}>
            {tile(row.icon, false)}
            {text(row.label, holds ? 'Now: ' + current.label : row.summary)}
            <span className="riva-mode-trail" aria-hidden="true">
              <Svg w={16} sw={2.2}>{Icons.chevronRight}</Svg>
            </span>
          </button>
        </React.Fragment>
      );
    }
    const on = row.name === mode;
    return (
      <button key={row.name || 'qa'} type="button" role="menuitemradio" aria-checked={on}
        title={row.summary} onClick={() => choose(row.name)} onMouseMove={point(i)}
        className={'riva-mode' + (on ? ' is-on' : '')}>
        {tile(row.icon, on)}
        {text(row.label, row.summary)}
        <span className="riva-mode-trail riva-mode-check" aria-hidden="true">
          {on ? <Svg w={15} sw={2.8}>{Icons.check}</Svg> : null}
        </span>
      </button>
    );
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

      {open && (
        <div role="menu" aria-label={inFolder ? MODE_FOLDER.label : 'Kind of answer'} className="riva-modes-list">
          {!inFolder && <div className="riva-modes-title">Answer mode</div>}
          {/* Keyed on the page so switching slides the new list in. */}
          <div key={inFolder ? 'folder' : 'top'} className={'riva-modes-page' + (inFolder ? ' is-folder' : '')}>
            {rows.map((row, i) => renderRow(row, i))}
          </div>
          <div className="riva-modes-foot" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
            <span><kbd>Enter</kbd> choose</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
