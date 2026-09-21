'use client';

// The controls that make a drawn screen into an editable one.
//
// THE SAME PICTURE, TYPED INTO. ErsForm, ProfMessage and PathologyForm draw
// the three screens a referral is actually typed into, and they draw them for
// a reader: radios that do not move, boxes that cannot be clicked. The
// Notebook needs the same picture with the values editable — because what a
// person is filling in IS the e-RS screen, and a two-column form of labelled
// inputs beside a picture of that screen is two representations of one thing,
// which is how they drift apart.
//
// So each of those components takes an `edit` prop. Given one, it swaps its
// own frozen controls for these, which are styled to sit in exactly the same
// space: same border, same weight, same height. The layout does not branch.
//
// WHAT AN EMPTY BOX SAYS DIFFERS BETWEEN THE TWO MODES, and that is the whole
// reason these are separate components rather than `disabled` versions. To a
// reader, an empty box means the practice has not recorded this, said in amber
// in the box. To an author, it is a box to type in, and it says what goes in
// it. `invalid` is the third state: a box that has to be filled in for this
// note to be served at all, and is not.
import React from 'react';
import { s, Svg, Icons } from '../ui';

const INK = '#212b32';
const LINE = '#4c6272';
const RED = '#d5281b';

// The border a box wears. Red when the note cannot be served without it, the
// screen's own colour otherwise — never amber, which in these screens means
// "the practice has not recorded this" and would be a lie about a box somebody
// is in the middle of typing into.
const edge = (invalid) => (invalid ? RED : LINE);

const FOCUS = 'outline:none;box-shadow:0 0 0 3px #ffeb3b;';

/**
 * A box on the screen, typed into.
 *
 * `lines` makes it a textarea — for wording, and for a list where one line is
 * one value. Everything else is one line, because everything else on these
 * screens is.
 */
export function EditBox({ value, onChange, placeholder = '', invalid = false, lines = 0, label, mono = false, big = true }) {
  const common = {
    value: value == null ? '' : value,
    onChange: (e) => onChange(e.target.value),
    placeholder,
    'aria-label': label,
    'aria-invalid': invalid ? true : undefined,
    onFocus: (e) => { e.target.style.cssText += FOCUS; },
    onBlur: (e) => { e.target.style.boxShadow = 'none'; },
    style: {
      width: '100%',
      boxSizing: 'border-box',
      minHeight: lines ? undefined : '40px',
      padding: '7px 11px',
      background: '#fff',
      border: '2px solid ' + edge(invalid),
      borderRadius: 0,
      font: 'inherit',
      fontSize: big ? '16px' : '15px',
      fontWeight: big ? 700 : 400,
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
      color: INK,
      lineHeight: 1.5,
      resize: lines ? 'vertical' : undefined,
    },
  };
  return lines ? <textarea {...common} rows={lines} /> : <input {...common} type="text" />;
}

/** The line under a box: what goes in it, or why it is red. */
export function EditHint({ children, bad = false }) {
  if (!children) return null;
  return (
    <div style={s('margin-top:5px;font-size:12.5px;line-height:1.45;font-weight:' + (bad ? '700' : '400') + ';color:' + (bad ? RED : '#4c6272') + ';')}>
      {children}
    </div>
  );
}

/** The screen's radio group, made real. */
export function EditRadios({ name, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={name} style={s('display:flex;flex-direction:column;gap:8px;')}>
      {options.map((option) => {
        const on = option === value;
        return (
          <label key={option} style={s('display:flex;align-items:center;gap:10px;cursor:pointer;')}>
            <input type="radio" name={name} checked={on} onChange={() => onChange(option)}
              style={{ width: '20px', height: '20px', accentColor: '#005eb8', margin: 0, cursor: 'pointer' }} />
            <span style={s('font-size:16px;color:' + INK + ';font-weight:' + (on ? '700' : '400') + ';')}>{option}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * A list where one row is one value: the clinic types a reader picks between,
 * the tests on a blood form.
 *
 * ONE ROW AT A TIME, with its own remove, and an empty row on the end that
 * becomes a real one as soon as it is typed in. A textarea split on newlines
 * was simpler and wrong: it cannot show a tick box against each value, and
 * pasting a list out of a screen brought its blank lines with it.
 */
export function EditList({ value, onChange, placeholder = '', addLabel = 'Add another', label, renderBefore = null }) {
  const rows = Array.isArray(value) ? value : [];
  const set = (i, next) => onChange(rows.map((row, j) => (j === i ? next : row)));
  const remove = (i) => onChange(rows.filter((row, j) => j !== i));
  return (
    <div style={s('display:flex;flex-direction:column;gap:7px;')}>
      {rows.map((row, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} style={s('display:flex;align-items:center;gap:8px;')}>
          {renderBefore ? renderBefore(row, i) : null}
          <div style={s('flex:1;min-width:0;')}>
            <EditBox value={row} onChange={(next) => set(i, next)} placeholder={placeholder} label={label + ' ' + (i + 1)} />
          </div>
          <button type="button" onClick={() => remove(i)} aria-label={'Remove ' + (row || 'this row')}
            style={{ flex: 'none', width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#768692', cursor: 'pointer', padding: 0 }}>
            <Svg w={15} sw={2.4}>{Icons.close}</Svg>
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange(rows.concat(['']))}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '7px', border: '1.5px dashed #4c6272', background: 'none', padding: '6px 12px', font: 'inherit', fontSize: '13.5px', fontWeight: 700, color: '#4c6272', cursor: 'pointer' }}>
        <Svg w={14} sw={2.6}>{Icons.plus}</Svg>{addLabel}
      </button>
    </div>
  );
}
