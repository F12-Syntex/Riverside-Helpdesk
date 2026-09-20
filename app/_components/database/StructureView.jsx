'use client';

/* What a table IS, rather than what is in it: the columns with their
 * types and defaults, then the keys, the indexes and everything that
 * points at it. Console layout — one card per kind, definitions in
 * monospace, nothing invented. */

import React from 'react';
import { s, Svg, Icons } from '../ui';
import { MONO, CARD, Skeleton, ErrorNote, KeyMark, shortType, bytes, count } from './parts';

function Section({ title, note, rows }) {
  if (!rows.length) return null;
  return (
    <div>
      <div style={s('display:flex;align-items:baseline;gap:8px;margin:0 0 7px;')}>
        <h3 style={s('font-size:13px;margin:0;color:var(--rv-ink);letter-spacing:-0.01em;')}>{title}</h3>
        <span style={s('font-size:11.5px;color:var(--rv-ink-4);')}>{note}</span>
      </div>
      <div style={s(CARD + 'overflow:hidden;')}>
        {rows.map((r, i) => (
          <div key={r.key} style={s('padding:8px 12px;' + (i ? 'border-top:1px solid var(--rv-line-soft);' : ''))}>
            <div style={s('font-size:12px;font-weight:700;color:var(--rv-ink-2);' + MONO)}>{r.key}</div>
            <div style={s('font-size:12px;color:var(--rv-ink-3);overflow-wrap:anywhere;margin-top:2px;' + MONO)}>{r.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StructureView({ table, data, loading, error }) {
  if (loading) return <div style={s(CARD + 'overflow:hidden;')}><Skeleton rows={9} cols={4} /></div>;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return null;

  const kinds = { p: 'primary key', f: 'foreign key', u: 'unique', c: 'check', x: 'exclusion' };

  return (
    <div style={s('flex:1;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:16px;padding-bottom:4px;')}>
      <div style={s(CARD + 'overflow:hidden;')}>
        <table style={s('border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px;')}>
          <thead>
            <tr>
              {['Column', 'Type', 'Null', 'Default'].map((h) => (
                <th key={h} style={s('background:var(--rv-surface-3);border-bottom:1px solid var(--rv-line);text-align:left;padding:7px 12px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--rv-ink-3);')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.columns.map((c, i) => (
              <tr key={c.name}>
                <td style={s('border-top:' + (i ? '1px solid var(--rv-line-soft)' : '0') + ';padding:7px 12px;color:var(--rv-ink);font-weight:600;' + MONO)}>
                  <span style={s('display:inline-flex;align-items:center;gap:6px;')}>
                    {c.primaryKey && <KeyMark />}{c.name}
                  </span>
                </td>
                <td style={s('border-top:' + (i ? '1px solid var(--rv-line-soft)' : '0') + ';padding:7px 12px;color:var(--rv-ink-2);' + MONO)}>
                  {shortType(c.type)}
                  {!c.readable && <span style={s('margin-left:7px;font-size:11px;color:var(--rv-ink-4);')}>not shown in the grid</span>}
                </td>
                <td style={s('border-top:' + (i ? '1px solid var(--rv-line-soft)' : '0') + ';padding:7px 12px;color:var(--rv-ink-3);')}>{c.nullable ? 'yes' : 'no'}</td>
                <td style={s('border-top:' + (i ? '1px solid var(--rv-line-soft)' : '0') + ';padding:7px 12px;color:var(--rv-ink-3);overflow-wrap:anywhere;' + MONO)}>{c.default || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Section title="Keys and checks" note={count(data.constraints.length) + ' on this table'}
        rows={data.constraints.map((c) => ({ key: c.name + '  ·  ' + (kinds[c.kind] || c.kind), text: c.definition }))} />
      <Section title="Indexes" note={count(data.indexes.length) + ' built'}
        rows={data.indexes.map((i) => ({ key: i.name, text: i.definition }))} />
      <Section title="Referenced by" note="other tables that point at this one"
        rows={data.referencedBy.map((r) => ({ key: r.table + '  ·  ' + r.name, text: r.definition }))} />
    </div>
  );
}
