'use client';

// The pieces both halves of /stats are built from.
//
// The page shows two things about the same app — what it was asked, and what was
// done in it — and they are read one after the other. Sharing the tiles, the
// filter switches, the ranked lists and the way a time is written keeps them
// looking like one page rather than two pages that share an address.

import { s, Hover } from '../ui';

export const CARD = 'background:#fff;border:1px solid #d8e1e5;border-radius:12px;';

// The windows both views offer. Kept here so the two cannot disagree about what
// "7 days" means when the tab is switched.
export const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
  { key: 'quarter', label: '90 days' },
  { key: 'all', label: 'Everything' },
];

export const number = (n) => Number(n || 0).toLocaleString('en-GB');

export function timeOf(at) {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function dayKey(at) {
  return new Date(at).toLocaleDateString('en-CA'); // YYYY-MM-DD, sorts and compares cleanly
}

export function dayHeading(key) {
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(key + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function ago(at) {
  if (!at) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function duration(ms) {
  if (ms == null) return '';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * A headline number and what it counts.
 *
 * `hint` is the line under it that says what the number means when the caption
 * alone would not: "3 of 41" against the answers the model wrote itself is the
 * difference between a number and a fact about the assistant.
 */
export function Tile({ value, caption, hint = '', tone = '' }) {
  const ink = tone === 'bad' ? '#8a1509' : tone === 'good' ? '#00612f' : '#212b32';
  return (
    <div style={s(CARD + 'padding:16px 18px;')}>
      <div style={s(`font-size:30px;font-weight:800;letter-spacing:-0.02em;color:${ink};line-height:1.1;`)}>{value}</div>
      <div style={s('font-size:13.5px;color:#4c6272;margin-top:3px;')}>{caption}</div>
      {hint && <div style={s('font-size:12.5px;color:#768692;margin-top:2px;')}>{hint}</div>}
    </div>
  );
}

export function Segmented({ options, value, onChange, name }) {
  return (
    <div role="group" aria-label={name} style={s('display:inline-flex;flex-wrap:wrap;gap:3px;background:#f0f4f5;border:1px solid #d8dde0;border-radius:10px;padding:3px;')}>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <Hover key={option.key} tag="button" type="button" onClick={() => onChange(option.key)}
            aria-pressed={active}
            base={'border:none;border-radius:7px;padding:6px 13px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;' +
              (active ? 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);' : 'background:none;color:#4c6272;')}
            hover={active ? '' : 'color:#212b32;'}>
            {option.label}
            {option.count != null && (
              <span style={s('margin-left:6px;font-weight:600;opacity:.7;')}>{number(option.count)}</span>
            )}
          </Hover>
        );
      })}
    </div>
  );
}

// A plain list of "thing — count": the questions asked most, the templates that
// answered them, the pages opened most. `onPick` makes a row a way in, so a
// question that keeps coming back can be read in the log with one press.
export function Ranked({ title, rows, labelKey, empty, onPick }) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  return (
    <div style={s(CARD + 'padding:18px 20px;')}>
      <h2 style={s('font-size:16px;font-weight:700;margin:0 0 12px;color:#212b32;')}>{title}</h2>
      {rows.length ? (
        <ol style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;')}>
          {rows.map((row) => {
            const label = row[labelKey];
            const body = (
              <>
                <div style={s('display:flex;justify-content:space-between;gap:12px;font-size:14.5px;color:#212b32;')}>
                  <span style={s('min-width:0;overflow-wrap:anywhere;text-align:left;')}>{label}</span>
                  <span style={s('flex:none;font-weight:700;font-variant-numeric:tabular-nums;')}>{number(row.total)}</span>
                </div>
                {/* A magnitude bar in the one blue: same series, same colour. */}
                <div style={s('height:4px;border-radius:2px;background:#eaeff1;margin-top:5px;')}>
                  <div style={s(`height:100%;width:${Math.max(3, (row.total / max) * 100)}%;border-radius:2px;background:#005eb8;`)} />
                </div>
              </>
            );
            return (
              <li key={label + (row.path || '')}>
                {onPick ? (
                  <Hover tag="button" type="button" onClick={() => onPick(row)}
                    base="display:block;width:100%;background:none;border:none;padding:0;font:inherit;cursor:pointer;"
                    hover="opacity:.72;">{body}</Hover>
                ) : body}
              </li>
            );
          })}
        </ol>
      ) : (
        <p style={s('margin:0;font-size:14.5px;color:#768692;')}>{empty}</p>
      )}
    </div>
  );
}
