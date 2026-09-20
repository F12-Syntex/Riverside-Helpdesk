'use client';

/* The overview: every table at once, as a table.
 *
 * The rail answers "where is X". This answers the question somebody
 * opening the page for the first time actually has — what is in here,
 * how much of it is there, and what is taking up the room — which a
 * list of names down the side cannot, because it cannot be sorted by
 * size and cannot be read in one sweep. */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import { MONO, CARD, SearchField, Segmented, bytes, count, Empty } from './parts';
import { groupOf, GROUP_ORDER } from './Rail';

const COLUMNS = [
  { id: 'name', label: 'Table', align: 'left' },
  { id: 'group', label: 'Belongs to', align: 'left' },
  { id: 'columns', label: 'Columns', align: 'right' },
  { id: 'rows', label: 'Rows', align: 'right' },
  { id: 'bytes', label: 'Size', align: 'right' },
];

export default function OverviewView({ tables, onOpen }) {
  const [filter, setFilter] = React.useState('');
  const [sort, setSort] = React.useState('rows');
  const [dir, setDir] = React.useState('desc');

  const needle = filter.trim().toLowerCase();
  const rows = tables
    .map((t) => ({ ...t, group: groupOf(t.name) }))
    .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.group.toLowerCase().includes(needle))
    .sort((a, b) => {
      const sign = dir === 'asc' ? 1 : -1;
      if (sort === 'name') return sign * a.name.localeCompare(b.name);
      if (sort === 'group') return sign * (GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
      return sign * ((a[sort] || 0) - (b[sort] || 0));
    });

  const empties = tables.filter((t) => !t.rows).length;

  function head(c) {
    const on = sort === c.id;
    return (
      <th key={c.id} onClick={() => { if (on) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(c.id); setDir(c.id === 'name' || c.id === 'group' ? 'asc' : 'desc'); } }}
        style={s('position:sticky;top:0;z-index:1;background:var(--rv-surface-3);border-bottom:1px solid var(--rv-line);padding:7px 12px;cursor:pointer;white-space:nowrap;'
          + 'font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;text-align:' + c.align + ';color:' + (on ? 'var(--rv-accent-hi)' : 'var(--rv-ink-3)') + ';')}>
        {c.label}
        <span style={s('margin-left:5px;opacity:' + (on ? '1' : '0') + ';')}>{dir === 'asc' ? '↑' : '↓'}</span>
      </th>
    );
  }

  return (
    <div style={s('display:flex;flex-direction:column;gap:11px;flex:1;min-height:0;')}>
      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:10px;')}>
        <SearchField value={filter} onChange={setFilter} placeholder="Find a table…" label="Find a table" width="320px" />
        <span style={s('font-size:12.5px;color:var(--rv-ink-3);')}>
          {count(rows.length)} of {count(tables.length)} tables · {count(empties)} empty
        </span>
      </div>

      <div style={s(CARD + 'flex:1;overflow:auto;min-height:0;')}>
        <table style={s('border-collapse:separate;border-spacing:0;width:100%;font-size:13px;')}>
          <thead><tr>{COLUMNS.map(head)}</tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.name} onClick={() => onOpen(t.name)} style={s('cursor:pointer;')}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rv-surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:8px 12px;color:var(--rv-ink);font-weight:600;' + MONO)}>{t.name}</td>
                <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:8px 12px;color:var(--rv-ink-3);')}>{t.group}</td>
                <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:8px 12px;text-align:right;color:var(--rv-ink-2);' + MONO)}>{t.columns}</td>
                <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:8px 12px;text-align:right;color:' + (t.rows ? 'var(--rv-ink)' : 'var(--rv-ink-4)') + ';' + MONO)}>{t.rows == null ? '—' : count(t.rows)}</td>
                <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:8px 12px;text-align:right;color:var(--rv-ink-2);' + MONO)}>{bytes(t.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title="No table by that name." note="The filter matches a table name or the part of the app it belongs to." />}
      </div>
    </div>
  );
}
