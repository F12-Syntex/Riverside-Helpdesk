'use client';

import React from 'react';
import { Svg, Icons } from './ui';

/* ------------------------------------------------------------------ *
 * Suggestions as you type (lib/autocomplete.mjs), under the field.
 *
 * A LISTBOX THE FIELD OWNS. Focus never leaves the field: it is the
 * combobox, the arrows move `aria-activedescendant` through these rows,
 * Enter asks the highlighted one, Tab puts it in the field to be added to,
 * and Escape closes the list without leaving the mode (QaApp.onInputKey).
 * The pointer works the same rows: pressing one asks it, and the press
 * does not take the focus out of the field on its way.
 *
 * It opens DOWN into the empty page while the field sits in the middle of
 * it, and UP out of the dock once there is an answer under it — the same
 * rule the mode menu follows.
 * ------------------------------------------------------------------ */

const ICON = { page: 'book', guide: 'question', contact: 'phone', recent: 'refresh', mode: 'sparkle' };

// The part of the label the typed words met, in bold — so a row that matched
// on its third word says why it is there.
function marked(label, typed) {
  const words = String(typed || '').toLowerCase().split(/\s+/).filter((w) => w.length > 0 && !w.startsWith('/'));
  if (!words.length) return label;
  const parts = [];
  const re = new RegExp('\\b(' + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  let last = 0;
  let m;
  while ((m = re.exec(label))) {
    if (m.index > last) parts.push(label.slice(last, m.index));
    parts.push(<b key={m.index}>{m[0]}</b>);
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < label.length) parts.push(label.slice(last));
  return parts;
}

export const SUGGEST_LIST_ID = 'riva-suggest';
export const optionId = (i) => 'riva-suggest-' + i;

export default function SuggestList({ items, at, typed, down, onPick, onHover }) {
  if (!items.length) return null;
  return (
    <div className={'riva-suggest' + (down ? ' is-down' : ' is-up')}>
      <ul id={SUGGEST_LIST_ID} role="listbox" aria-label="Suggestions" className="riva-suggest__list">
        {items.map((s, i) => (
          <li key={s.kind + ':' + s.label} id={optionId(i)} role="option" aria-selected={i === at}
            className={'riva-suggest__row' + (i === at ? ' is-at' : '')}
            onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
            onMouseMove={() => { if (i !== at) onHover(i); }}>
            <span className={'riva-suggest__ico is-' + s.kind} aria-hidden="true">
              <Svg w={15} sw={2.1}>{Icons[s.icon] || Icons[ICON[s.kind]] || Icons.search}</Svg>
            </span>
            <span className="riva-suggest__text">
              <span className="riva-suggest__label">{s.kind === 'mode' ? s.label : marked(s.label, typed)}</span>
              {s.kind === 'mode' && s.summary ? <span className="riva-suggest__sub">{s.summary}</span> : null}
            </span>
            <span className="riva-suggest__tag">{s.tag}</span>
          </li>
        ))}
      </ul>
      <div className="riva-suggest__foot" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> choose</span>
        <span><kbd>Enter</kbd> ask</span>
        <span><kbd>Tab</kbd> fill in</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </div>
  );
}
