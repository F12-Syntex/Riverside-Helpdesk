'use client';

/* ------------------------------------------------------------------ *
 * The pieces every part of the explorer is built from.
 *
 * The console patterns here are the ones every serious database client
 * has settled on — Supabase, Neon, Vercel's data editor, Basedash — and
 * they are worth copying because a reader who has used any of them
 * already knows how to read this one: a row-number gutter, the column
 * type printed beside its name, hairline separators rather than boxes,
 * a status bar under the grid saying how much was read and how long it
 * took. What is NOT copied is the colour: these all use their own dark
 * chrome, and this page is part of an NHS-blue app, so everything below
 * is drawn from the practice's own tokens in globals.css.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';

export const MONO = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-variant-numeric:tabular-nums;";
export const CARD = 'background:var(--rv-surface);border:1px solid var(--rv-line);border-radius:10px;';
export const FIELD = 'width:100%;box-sizing:border-box;height:32px;padding:0 10px 0 30px;font:inherit;font-size:13px;border:1px solid var(--rv-line);border-radius:8px;background:var(--rv-surface);color:var(--rv-ink);outline:none;';
export const BTN = 'display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:7px;border:1px solid var(--rv-line);background:var(--rv-surface);color:var(--rv-ink-2);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;';
export const BTN_HOVER = 'border-color:var(--rv-accent-line);color:var(--rv-accent);background:var(--rv-accent-dim);';

export function bytes(n) {
  const v = Number(n || 0);
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' kB';
  if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
  return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export function count(n) {
  return Number(n || 0).toLocaleString('en-GB');
}

export function when(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// A type as a console prints it: int4, not "integer"; varchar(200), not
// "character varying". Short enough to sit beside the column name.
export function shortType(type) {
  const t = String(type || '');
  const map = {
    'integer': 'int4', 'bigint': 'int8', 'smallint': 'int2', 'boolean': 'bool',
    'text': 'text', 'double precision': 'float8', 'real': 'float4',
    'timestamp with time zone': 'timestamptz', 'timestamp without time zone': 'timestamp',
    'character varying': 'varchar', 'jsonb': 'jsonb', 'json': 'json', 'uuid': 'uuid',
    'date': 'date', 'numeric': 'numeric', 'tsvector': 'tsvector', 'bytea': 'bytea',
  };
  if (map[t]) return map[t];
  return t.replace('character varying', 'varchar').replace(' with time zone', 'tz').replace(' without time zone', '');
}

export function useDebounced(value, ms) {
  const [out, setOut] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return out;
}

export async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
  return d;
}

export function copyText(text) {
  try { navigator.clipboard.writeText(text); } catch (e) { /* a browser that will not, then */ }
}

/* A search field with the magnifier inside it, which is the only way a
   field this short reads as a search rather than as a name box. */
export function SearchField({ value, onChange, placeholder, label, width }) {
  return (
    <div style={s('position:relative;flex:1;min-width:180px;' + (width ? 'max-width:' + width + ';' : ''))}>
      <span style={s('position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--rv-ink-4);display:flex;pointer-events:none;')}>
        <Svg w={14} sw={2}>{Icons.search}</Svg>
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        aria-label={label || placeholder} style={s(FIELD)} />
    </div>
  );
}

/* One control, two or three states, drawn as a single sunk track — the
   shape every console uses for "which view of this thing am I looking
   at", and the reason two separate pills were the wrong answer. */
export function Segmented({ value, onChange, options, size }) {
  const h = size === 'sm' ? 26 : 30;
  return (
    <div role="tablist" style={s('display:inline-flex;gap:2px;padding:2px;background:var(--rv-surface-3);border:1px solid var(--rv-line);border-radius:9px;')}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Hover key={o.id} tag="button" type="button" role="tab" aria-selected={on ? 'true' : 'false'}
            onClick={() => onChange(o.id)}
            base={'display:inline-flex;align-items:center;gap:6px;height:' + h + 'px;padding:0 11px;border:0;border-radius:7px;font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;'
              + (on ? 'background:var(--rv-surface);color:var(--rv-accent-hi);box-shadow:0 1px 2px rgba(33,43,50,.10);' : 'background:transparent;color:var(--rv-ink-3);')}
            hover={on ? '' : 'color:var(--rv-ink-2);'}>
            {o.icon && <Svg w={13} sw={2}>{o.icon}</Svg>}
            {o.label}
          </Hover>
        );
      })}
    </div>
  );
}

export function IconButton({ title, onClick, icon, disabled, spinning }) {
  return (
    <Hover tag="button" type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
      base={'display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;border:1px solid var(--rv-line);background:var(--rv-surface);color:var(--rv-ink-2);cursor:pointer;'
        + (disabled ? 'opacity:.4;cursor:default;' : '') + (spinning ? 'animation:rivaSpin 900ms linear infinite;' : '')}
      hover={disabled ? '' : BTN_HOVER}>
      <Svg w={14} sw={2}>{icon}</Svg>
    </Hover>
  );
}

/* The bar under a grid. Left: what is being shown. Right: the way
   through it. Fixed to the bottom of the card so paging does not move. */
export function StatusBar({ children, right }) {
  return (
    <div style={s('display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-top:1px solid var(--rv-line);background:var(--rv-surface);padding:7px 11px;font-size:12px;color:var(--rv-ink-3);border-radius:0 0 9px 9px;')}>
      <div style={s('display:flex;align-items:center;gap:10px;flex-wrap:wrap;')}>{children}</div>
      <div style={s('margin-left:auto;display:flex;align-items:center;gap:6px;')}>{right}</div>
    </div>
  );
}

/* Grey bars in the shape of the thing that is coming. A row of the word
   "Loading" tells the reader to wait; this tells them what for. */
export function Skeleton({ rows = 8, cols = 5 }) {
  return (
    <div style={s('padding:0;')} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={s('display:flex;gap:18px;padding:9px 12px;border-bottom:1px solid var(--rv-line-soft);')}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} style={s('height:9px;border-radius:4px;background:var(--rv-surface-3);flex:' + ((c % 3) + 1) + ';opacity:' + (1 - r * 0.07) + ';')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, note, icon }) {
  return (
    <div style={s('display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:56px 20px;text-align:center;')}>
      <span style={s('color:var(--rv-ink-4);')}><Svg w={26} sw={1.6}>{icon || Icons.search}</Svg></span>
      <div style={s('font-size:14.5px;font-weight:700;color:var(--rv-ink-2);')}>{title}</div>
      {note && <div style={s('font-size:13px;color:var(--rv-ink-3);max-width:380px;')}>{note}</div>}
    </div>
  );
}

export function ErrorNote({ children }) {
  return (
    <div style={s('display:flex;gap:9px;align-items:flex-start;background:#fdf2f0;border:1px solid #f4c7c1;border-radius:9px;padding:10px 12px;color:#a51b0f;font-size:13.5px;')}>
      <span style={s('display:flex;margin-top:1px;')}><Svg w={15} sw={2}>{Icons.alertCircle}</Svg></span>
      <span style={s('overflow-wrap:anywhere;')}>{children}</span>
    </div>
  );
}

/* A key, for the column that is one. Drawn rather than lettered: "PK" in
   a header row of lower-case type names reads as another type. */
export const KeyMark = () => (
  <span title="Primary key" style={s('display:inline-flex;color:var(--rv-accent);')}>
    <Svg w={11} sw={2.2}>{Icons.lock}</Svg>
  </span>
);
