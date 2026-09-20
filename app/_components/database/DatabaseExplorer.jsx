'use client';

/* ------------------------------------------------------------------ *
 * The database explorer.
 *
 * WHAT IT IS FOR. Everything this app knows is in one of two places:
 * the Postgres database and the blob store the notebook uploads files
 * to. Until this page the only way to see either was to write SQL
 * against production or to open a vendor dashboard, which means in
 * practice nobody looked — and a practice that cannot see what its
 * software holds about it cannot answer the one question an
 * information-governance review always asks.
 *
 * IT IS A WINDOW, NOT A CONSOLE. No edit, no delete, no query box. The
 * endpoint behind it only ever builds SELECTs (app/api/database/route.js),
 * so the worst a reader can do here is look. A tool that could change a
 * row would need a permission model, an audit trail and a way to undo,
 * and none of those are worth building for a thing whose job is to show.
 *
 * THE LAYOUT IS THE ONE EVERY DATABASE CONSOLE USES — rail of tables,
 * a header saying what is open, the rows under it, a status bar under
 * those — because a reader who has used Supabase, Neon or a data editor
 * already knows how to read it. What is not borrowed is the colour: it
 * is drawn from the practice's own tokens, so this looks like the rest
 * of the app rather than like a developer tool wearing its badge.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import { MONO, BTN, BTN_HOVER, Segmented, bytes, count, getJson, ErrorNote, Skeleton } from './parts';
import Rail, { groupOf, GROUP_ORDER } from './Rail';
import OverviewView from './OverviewView';
import RowsView from './RowsView';
import StructureView from './StructureView';
import FilesView from './FilesView';

const TABS = [
  { id: 'rows', label: 'Rows', icon: Icons.menu },
  { id: 'structure', label: 'Structure', icon: Icons.sitemap },
];

function Stat({ label, value }) {
  return (
    <div style={s('display:flex;flex-direction:column;gap:1px;')}>
      <span style={s('font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--rv-ink-4);')}>{label}</span>
      <span style={s('font-size:13px;font-weight:700;color:var(--rv-ink);' + MONO)}>{value}</span>
    </div>
  );
}

export default function DatabaseExplorer() {
  const [state, setState] = React.useState({ loading: true, tables: [], error: '' });
  const [selected, setSelected] = React.useState('__overview__');
  const [tab, setTab] = React.useState('rows');
  const [fileCount, setFileCount] = React.useState(null);
  const [structure, setStructure] = React.useState({ loading: false, data: null, error: '', table: '' });

  React.useEffect(() => {
    getJson('/api/database?view=overview')
      .then((d) => setState({ loading: false, tables: d.tables || [], error: '' }))
      .catch((e) => setState({ loading: false, tables: [], error: String(e.message || e) }));
  }, []);

  // The structure of a table is fetched once per table and kept, because
  // it is the half of this page that does not change while it is read.
  React.useEffect(() => {
    if (tab !== 'structure' || selected.startsWith('__')) return undefined;
    if (structure.table === selected && structure.data) return undefined;
    let live = true;
    setStructure({ loading: true, data: null, error: '', table: selected });
    getJson('/api/database?view=table&table=' + encodeURIComponent(selected))
      .then((d) => { if (live) setStructure({ loading: false, data: d, error: '', table: selected }); })
      .catch((e) => { if (live) setStructure({ loading: false, data: null, error: String(e.message || e), table: selected }); });
    return () => { live = false; };
  }, [tab, selected, structure.table, structure.data]);

  const onCount = React.useCallback((n) => setFileCount(n), []);
  const table = state.tables.find((t) => t.name === selected);
  const totalRows = state.tables.reduce((n, t) => n + (t.rows || 0), 0);
  const totalBytes = state.tables.reduce((n, t) => n + (t.bytes || 0), 0);

  function open(name) {
    setSelected(name);
    if (!name.startsWith('__')) setTab('rows');
  }

  const heading = selected === '__overview__' ? 'Overview'
    : selected === '__files__' ? 'Stored files'
    : selected;

  return (
    <div style={s('flex:1;display:flex;flex-direction:column;min-height:0;gap:13px;')}>
      {/* The page's own header: what this is, how much of it there is,
          and the one thing a reader must know before they touch it. */}
      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:12px 22px;')}>
        <div>
          <h1 style={s('font-size:23px;margin:0;letter-spacing:-0.02em;color:var(--rv-ink);')}>Database</h1>
          <p style={s('margin:2px 0 0;font-size:13px;color:var(--rv-ink-3);')}>
            Everything this app has stored, and the files beside it.
          </p>
        </div>
        <div style={s('display:flex;gap:22px;align-items:center;margin-left:8px;')}>
          <Stat label="Tables" value={count(state.tables.length)} />
          <Stat label="Rows" value={count(totalRows)} />
          <Stat label="On disk" value={bytes(totalBytes)} />
          <Stat label="Files" value={fileCount == null ? '—' : count(fileCount)} />
        </div>
        <span style={s('margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--rv-accent-hi);background:var(--rv-accent-dim);border:1px solid var(--rv-accent-line);border-radius:999px;padding:4px 11px;')}>
          <Svg w={12} sw={2.2}>{Icons.lock}</Svg>Read-only
        </span>
      </div>

      {state.error && <ErrorNote>{state.error}</ErrorNote>}

      <div style={s('flex:1;display:flex;gap:13px;min-height:0;align-items:stretch;')}>
        <Rail tables={state.tables} selected={selected} onSelect={open} fileCount={fileCount} />

        <section style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:11px;min-height:0;')}>
          {/* The crumb: which schema, which table, and what can be done
              with it. One row, so the grid starts as high as it can. */}
          <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-height:32px;')}>
            <div style={s('display:flex;align-items:baseline;gap:7px;min-width:0;')}>
              {!selected.startsWith('__') && (
                <span style={s('font-size:13px;color:var(--rv-ink-4);' + MONO)}>public /</span>
              )}
              <h2 style={s('font-size:17px;margin:0;color:var(--rv-ink);letter-spacing:-0.01em;'
                + (selected.startsWith('__') ? '' : MONO))}>{heading}</h2>
              {table && (
                <span style={s('font-size:12px;color:var(--rv-ink-3);')}>
                  {count(table.rows)} rows · {table.columns} columns · {bytes(table.bytes)} · {groupOf(table.name)}
                </span>
              )}
              {selected === '__overview__' && (
                <span style={s('font-size:12px;color:var(--rv-ink-3);')}>every table, by size and by use</span>
              )}
            </div>
            {table && (
              <div style={s('margin-left:auto;')}>
                <Segmented value={tab} onChange={setTab} options={TABS} />
              </div>
            )}
          </div>

          {state.loading && <div style={s('flex:1;')}><Skeleton rows={12} cols={5} /></div>}

          {!state.loading && selected === '__overview__' && (
            <OverviewView tables={state.tables} onOpen={open} />
          )}
          {!state.loading && selected === '__files__' && <FilesView onCount={onCount} />}
          {!state.loading && table && tab === 'rows' && <RowsView key={table.name} table={table.name} />}
          {!state.loading && table && tab === 'structure' && (
            <StructureView table={table.name} data={structure.table === table.name ? structure.data : null}
              loading={structure.loading || structure.table !== table.name} error={structure.error} />
          )}
          {!state.loading && !table && !selected.startsWith('__') && (
            <p style={s('color:var(--rv-ink-3);')}>That table is no longer there.</p>
          )}
        </section>
      </div>
    </div>
  );
}
