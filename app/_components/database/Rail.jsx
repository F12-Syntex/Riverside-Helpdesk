'use client';

/* The rail: what there is to look at, grouped by what it is for.
 *
 * Every console puts the schema picker at the top and the tables under
 * it; this app has exactly one schema, so the chip says so and stops.
 * The counts are right-aligned and tabular, because the useful reading
 * of this list is "which of these has anything in it". */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import { MONO, SearchField, count } from './parts';

export const GROUPS = [
  { label: 'Notebook', test: (n) => n === 'notes' || n.startsWith('note_') || n.startsWith('notebook_') },
  { label: 'Knowledge base', test: (n) => n.startsWith('knowledge_') },
  { label: 'Questions and answers', test: (n) => ['question_log', 'open_questions', 'answer_feedback'].includes(n) },
  { label: 'Routing', test: (n) => n.startsWith('routing_') },
  { label: 'Audit', test: (n) => n.startsWith('audit_') },
  { label: 'Staff and rotas', test: (n) => ['staff', 'rotas'].includes(n) },
  { label: 'Medications', test: (n) => n.startsWith('medication') },
  { label: 'Reference data', test: (n) => ['snomed_terms', 'ers_directory'].includes(n) },
  { label: 'System', test: (n) => ['app_settings', 'ai_usage'].includes(n) },
];

export function groupOf(name) {
  const hit = GROUPS.find((g) => g.test(name));
  return hit ? hit.label : 'Other';
}

export const GROUP_ORDER = GROUPS.map((g) => g.label).concat(['Other']);

function Item({ label, mono, badge, active, onClick, icon }) {
  return (
    <Hover tag="button" type="button" onClick={onClick}
      base={'display:flex;position:relative;width:100%;align-items:center;gap:8px;text-align:left;border:0;border-radius:7px;padding:6px 9px;font-family:inherit;font-size:13px;cursor:pointer;'
        + (active
          ? 'background:var(--rv-accent-dim);color:var(--rv-accent-hi);font-weight:700;'
          : 'background:transparent;color:var(--rv-ink);font-weight:500;')}
      hover={active ? '' : 'background:var(--rv-surface-2);'}>
      {active && <span style={s('position:absolute;left:0;top:6px;bottom:6px;width:2.5px;border-radius:2px;background:var(--rv-accent);')} />}
      {icon && <span style={s('display:flex;color:' + (active ? 'var(--rv-accent)' : 'var(--rv-ink-4)') + ';')}><Svg w={14} sw={2}>{icon}</Svg></span>}
      <span style={s('flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + (mono ? MONO : ''))}>{label}</span>
      {badge != null && (
        <span style={s('font-size:11px;color:' + (active ? 'var(--rv-accent)' : 'var(--rv-ink-4)') + ';' + MONO)}>{badge}</span>
      )}
    </Hover>
  );
}

export default function Rail({ tables, selected, onSelect, fileCount }) {
  const [filter, setFilter] = React.useState('');
  const needle = filter.trim().toLowerCase();
  const shown = needle ? tables.filter((t) => t.name.toLowerCase().includes(needle)) : tables;

  const grouped = [];
  for (const t of shown) {
    const label = groupOf(t.name);
    let bucket = grouped.find((g) => g.label === label);
    if (!bucket) { bucket = { label, items: [] }; grouped.push(bucket); }
    bucket.items.push(t);
  }
  grouped.sort((a, b) => GROUP_ORDER.indexOf(a.label) - GROUP_ORDER.indexOf(b.label));

  return (
    <aside style={s('width:250px;flex:0 0 250px;display:flex;flex-direction:column;min-height:0;background:var(--rv-surface);border:1px solid var(--rv-line);border-radius:10px;overflow:hidden;')}>
      <div style={s('padding:9px;border-bottom:1px solid var(--rv-line);display:flex;flex-direction:column;gap:8px;')}>
        <div style={s('display:flex;align-items:center;gap:7px;font-size:12px;color:var(--rv-ink-3);')}>
          <span style={s('display:inline-flex;align-items:center;gap:5px;background:var(--rv-surface-3);border:1px solid var(--rv-line);border-radius:6px;padding:2px 7px;font-weight:700;color:var(--rv-ink-2);' + MONO)}>
            <Svg w={11} sw={2}>{Icons.database}</Svg>schema public
          </span>
          <span style={s('margin-left:auto;' + MONO)}>{count(tables.length)}</span>
        </div>
        <SearchField value={filter} onChange={setFilter} placeholder="Find a table…" label="Find a table" />
      </div>

      <div style={s('flex:1;overflow:auto;padding:7px;min-height:0;')}>
        <Item label="Overview" icon={Icons.chart} active={selected === '__overview__'} onClick={() => onSelect('__overview__')} />
        <Item label="Stored files" icon={Icons.folder} badge={fileCount == null ? null : count(fileCount)}
          active={selected === '__files__'} onClick={() => onSelect('__files__')} />

        {grouped.map((g) => (
          <div key={g.label} style={s('margin-top:11px;')}>
            <div style={s('font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--rv-ink-4);padding:0 9px 4px;')}>
              {g.label}
            </div>
            {g.items.map((t) => (
              <Item key={t.name} label={t.name} mono badge={t.rows == null ? '—' : count(t.rows)}
                active={selected === t.name} onClick={() => onSelect(t.name)} />
            ))}
          </div>
        ))}

        {!shown.length && (
          <p style={s('color:var(--rv-ink-3);font-size:13px;padding:14px 9px;')}>No table by that name.</p>
        )}
      </div>
    </aside>
  );
}
