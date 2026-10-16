'use client';

import React from 'react';
import { THINKING_MODES } from '../../lib/thinking.mjs';

/* ------------------------------------------------------------------ *
 * Fast · Think · Deep — beside the send button.
 *
 * How hard the assistant thinks, which is only ever which model answers
 * (lib/thinking.mjs). Three segments rather than a menu: it is chosen in
 * one tap with a patient at the desk, and the choice that is on is always
 * in sight, so nobody wonders why an answer took twenty seconds.
 *
 * A RADIO GROUP, AND IT BEHAVES LIKE ONE. One Tab stop for the three; the
 * arrows move between them and choose as they go, as native radios do.
 * The hint for each is its title and is read out with it.
 *
 * It lasts until it is changed, across a reload — QaApp keeps it.
 * ------------------------------------------------------------------ */
export default function ThinkingSwitch({ value, onPick, ready = true }) {
  const refs = React.useRef([]);
  const at = Math.max(0, THINKING_MODES.findIndex((m) => m.id === value));

  const onKey = (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (at + step + THINKING_MODES.length) % THINKING_MODES.length;
    onPick(THINKING_MODES[next].id);
    const el = refs.current[next];
    if (el) el.focus();
  };

  return (
    <div className={'riva-think' + (ready ? '' : ' is-pending')} role="radiogroup" aria-label="How hard to think" onKeyDown={onKey}>
      {THINKING_MODES.map((m, i) => {
        const on = ready && i === at;
        return (
          <button key={m.id} ref={(el) => { refs.current[i] = el; }} type="button" role="radio"
            className={'riva-think__opt' + (on ? ' is-on' : '')} aria-checked={on}
            tabIndex={i === at ? 0 : -1} title={m.hint} aria-description={m.hint}
            onClick={() => onPick(m.id)}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
