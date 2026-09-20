'use client';

/* ------------------------------------------------------------------ *
 * The database explorer.
 *
 * WHAT IT IS FOR. Everything this app knows is in one of two places: the
 * Postgres database and the blob store the notebook uploads files to.
 * Until this page the only way to see either was to write SQL against
 * production or to open the Vercel dashboard, which means in practice
 * nobody looked — and a practice that cannot see what its software holds
 * about it cannot answer the one question an information-governance
 * review always asks.
 *
 * IT IS A WINDOW, NOT A CONSOLE. There is no edit, no delete, no query
 * box. The endpoint behind it only ever builds SELECTs (see
 * app/api/database/route.js), so the worst a reader can do here is look.
 * That is deliberate: a tool that could change a row would need a
 * permission model, an audit trail and a way to undo, and none of those
 * are worth building for a thing whose whole job is to show.
 *
 * THE LEFT RAIL IS GROUPED BY WHAT A TABLE IS FOR, not alphabetically.
 * Somebody comes here asking "where do the notebook's pages live", not
 * "what begins with N", and thirty-odd table names in one flat list is a
 * list nobody reads twice.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';

const BOX = 'background:#fff;border:1px solid #dde4e7;border-radius:12px;';
const MONO = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;";
const INPUT = 'width:100%;box-sizing:border-box;padding:8px 11px;font-family:inherit;font-size:14px;border:1.5px solid #d8dde0;border-radius:8px;background:#fff;color:#212b32;';
const QUIET = 'display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #d8e1e5;border-radius:8px;padding:6px 12px;font-family:inherit;font-size:13px;font-weight:600;color:#4c6272;cursor:pointer;';
const QUIET_HOVER = 'border-color:#005eb8;color:#005eb8;';

/* Which part of the app a table belongs to. Ordered: the first rule that
   matches wins, so note_attachments is the notebook's and not "other". */
const GROUPS = [
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

function groupOf(name) {
  const hit = GROUPS.find((g) => g.test(name));
  return hit ? hit.label : 'Other';
}

function bytes(n) {
  const v = Number(n || 0);
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' kB';
  if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
  return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function count(n) {
  return Number(n || 0).toLocaleString('en-GB');
}

function when(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function useDebounced(value, ms) {
  const [out, setOut] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return out;
}

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
  return d;
}

/* ---------------------------------------------------------------- *
 * The rail.
 * ---------------------------------------------------------------- */

function Rail({ tables, selected, onSelect, fileCount }) {
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
  const order = GROUPS.map((g) => g.label).concat(['Other']);
  grouped.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));

  return (
    <aside style={s('width:262px;flex:0 0 262px;display:flex;flex-direction:column;gap:10px;min-height:0;')}>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a table…"
        aria-label="Find a table" style={s(INPUT)} />

      <div style={s(BOX + 'flex:1;overflow:auto;padding:6px;min-height:0;')}>
        <Hover tag="button" type="button" onClick={() => onSelect('__files__')}
          base={'display:flex;width:100%;align-items:center;gap:9px;text-align:left;border:0;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:4px;'
            + (selected === '__files__' ? 'background:#e8f1f8;color:#003087;' : 'background:transparent;color:#212b32;')}
          hover={selected === '__files__' ? '' : 'background:#f3f7f9;'}>
          <Svg w={15} sw={2}>{Icons.folder}</Svg>
          <span style={s('flex:1;')}>Stored files</span>
          {fileCount != null && <span style={s('font-size:12px;color:#768692;font-weight:600;')}>{count(fileCount)}</span>}
        </Hover>

        {grouped.map((g) => (
          <div key={g.label} style={s('margin-top:10px;')}>
            <div style={s('font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#768692;padding:0 10px 5px;')}>
              {g.label}
            </div>
            {g.items.map((t) => (
              <Hover key={t.name} tag="button" type="button" onClick={() => onSelect(t.name)}
                base={'display:flex;width:100%;align-items:baseline;gap:8px;text-align:left;border:0;border-radius:8px;padding:7px 10px;font-family:inherit;font-size:13.5px;cursor:pointer;'
                  + (selected === t.name ? 'background:#e8f1f8;color:#003087;font-weight:700;' : 'background:transparent;color:#212b32;font-weight:500;')}
                hover={selected === t.name ? '' : 'background:#f3f7f9;'}>
                <span style={s('flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + MONO)}>{t.name}</span>
                <span style={s('font-size:11.5px;color:#768692;')}>{t.rows == null ? '—' : count(t.rows)}</span>
              </Hover>
            ))}
          </div>
        ))}

        {!shown.length && <p style={s('color:#768692;font-size:13.5px;padding:10px;')}>No table by that name.</p>}
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- *
 * One row, in full. Opened from the grid, because a grid cell that
 * shows the first 280 characters of a note is a grid cell that has
 * told you a page exists and nothing about what it says.
 * ---------------------------------------------------------------- */

function RowSheet({ table, rowid, onClose }) {
  const [state, setState] = React.useState({ loading: true, values: [], error: '' });

  React.useEffect(() => {
    let live = true;
    setState({ loading: true, values: [], error: '' });
    getJson('/api/database?view=row&table=' + encodeURIComponent(table) + '&rowid=' + encodeURIComponent(rowid))
      .then((d) => { if (live) setState({ loading: false, values: d.values || [], error: '' }); })
      .catch((e) => { if (live) setState({ loading: false, values: [], error: String(e.message || e) }); });
    return () => { live = false; };
  }, [table, rowid]);

  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onMouseDown={onClose} role="presentation"
      style={s('position:fixed;inset:0;background:rgba(33,43,50,.32);z-index:60;display:flex;justify-content:flex-end;')}>
      <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={'Row in ' + table}
        style={s('width:min(620px,100%);background:#fff;height:100%;overflow:auto;box-shadow:-18px 0 40px rgba(0,0,0,.14);')}>
        <div style={s('position:sticky;top:0;background:#fff;border-bottom:1px solid #e3e9ec;padding:14px 18px;display:flex;align-items:center;gap:12px;')}>
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:16px;font-weight:700;color:#212b32;' + MONO)}>{table}</div>
            <div style={s('font-size:12.5px;color:#768692;')}>Row {rowid}</div>
          </div>
          <Hover tag="button" type="button" onClick={onClose} aria-label="Close"
            base={QUIET} hover={QUIET_HOVER}><Svg w={14} sw={2.4}>{Icons.close}</Svg>Close</Hover>
        </div>

        <div style={s('padding:14px 18px 40px;display:flex;flex-direction:column;gap:12px;')}>
          {state.loading && <p style={s('color:#4c6272;')}>Loading…</p>}
          {state.error && <p style={s('color:#a51b0f;')}>{state.error}</p>}
          {state.values.map((v) => (
            <div key={v.column}>
              <div style={s('display:flex;align-items:baseline;gap:8px;margin-bottom:3px;')}>
                <span style={s('font-size:13px;font-weight:700;color:#212b32;' + MONO)}>{v.column}</span>
                <span style={s('font-size:11.5px;color:#768692;')}>{v.type}</span>
              </div>
              {v.null
                ? <div style={s('font-size:13px;color:#768692;font-style:italic;')}>null</div>
                : (
                  <div style={s('white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5;color:#212b32;background:#f6f9fa;border:1px solid #e3e9ec;border-radius:8px;padding:9px 11px;' + MONO)}>
                    {v.text}
                    {v.truncated && (
                      <span style={s('display:block;margin-top:6px;color:#768692;font-style:italic;')}>
                        … {count(v.length)} characters in total; the rest is not shown.
                      </span>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * A table: its rows, and what its shape is.
 * ---------------------------------------------------------------- */

function Cell({ cell: c }) {
  if (c.omitted) return <span style={s('color:#768692;font-style:italic;')}>not shown</span>;
  if (c.null) return <span style={s('color:#aab7bf;font-style:italic;')}>null</span>;
  if (c.note) return <span style={s('color:#4c6272;')}>{c.text}</span>;
  return <span title={c.truncated ? c.text + '…' : c.text}>{c.text}{c.truncated ? '…' : ''}</span>;
}

function RowsView({ table }) {
  const [sort, setSort] = React.useState('');
  const [dir, setDir] = React.useState('desc');
  const [offset, setOffset] = React.useState(0);
  const [limit, setLimit] = React.useState(50);
  const [raw, setRaw] = React.useState('');
  const query = useDebounced(raw, 300);
  const [state, setState] = React.useState({ loading: true, data: null, error: '' });
  const [open, setOpen] = React.useState(null);

  // A new table is a new question: the sort, the page and the search all
  // belonged to the table being left, not to this one.
  React.useEffect(() => { setSort(''); setDir('desc'); setOffset(0); setRaw(''); }, [table]);
  React.useEffect(() => { setOffset(0); }, [query, limit]);

  React.useEffect(() => {
    let live = true;
    setState((p) => ({ ...p, loading: true, error: '' }));
    const url = '/api/database?view=rows&table=' + encodeURIComponent(table)
      + '&limit=' + limit + '&offset=' + offset + '&dir=' + dir
      + (sort ? '&sort=' + encodeURIComponent(sort) : '')
      + (query ? '&q=' + encodeURIComponent(query) : '');
    getJson(url)
      .then((d) => { if (live) setState({ loading: false, data: d, error: '' }); })
      .catch((e) => { if (live) setState({ loading: false, data: null, error: String(e.message || e) }); });
    return () => { live = false; };
  }, [table, limit, offset, sort, dir, query]);

  const data = state.data;
  const columns = (data && data.columns) || [];
  const shown = (data && data.rows) || [];
  const total = (data && data.total) || 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + shown.length, total);

  function clickHeader(name) {
    if (sort === name || (!sort && data && data.sort === name)) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(name); setDir('asc'); }
    setOffset(0);
  }

  const activeSort = sort || (data ? data.sort : '');

  return (
    <div style={s('display:flex;flex-direction:column;gap:12px;min-height:0;flex:1;')}>
      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:10px;')}>
        <div style={s('flex:1;min-width:220px;max-width:420px;')}>
          <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Search every column…"
            aria-label="Search this table" style={s(INPUT)} />
        </div>
        <span style={s('font-size:13px;color:#4c6272;')}>
          {state.loading ? 'Reading…' : (total ? count(from) + '–' + count(to) + ' of ' + count(total) : 'No rows')}
        </span>
        <div style={s('display:flex;align-items:center;gap:6px;margin-left:auto;')}>
          <label style={s('font-size:12.5px;color:#768692;')} htmlFor="db-page-size">Per page</label>
          <select id="db-page-size" value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            style={s('font-family:inherit;font-size:13px;padding:5px 8px;border:1px solid #d8dde0;border-radius:7px;background:#fff;color:#212b32;')}>
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <Hover tag="button" type="button" disabled={offset <= 0} onClick={() => setOffset(Math.max(offset - limit, 0))}
            base={QUIET + (offset <= 0 ? 'opacity:.45;cursor:default;' : '')} hover={offset <= 0 ? '' : QUIET_HOVER}>
            <Svg w={13} sw={2.4}>{Icons.chevronLeft}</Svg>Back
          </Hover>
          <Hover tag="button" type="button" disabled={to >= total} onClick={() => setOffset(offset + limit)}
            base={QUIET + (to >= total ? 'opacity:.45;cursor:default;' : '')} hover={to >= total ? '' : QUIET_HOVER}>
            Next<Svg w={13} sw={2.4}>{Icons.chevronRight}</Svg>
          </Hover>
        </div>
      </div>

      {state.error && <p style={s('color:#a51b0f;')}>{state.error}</p>}

      <div style={s(BOX + 'flex:1;overflow:auto;min-height:0;')}>
        <table style={s('border-collapse:separate;border-spacing:0;width:100%;font-size:13px;' + MONO)}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.name} onClick={() => clickHeader(c.name)}
                  title={c.type + (c.omitted ? ' — too large to show in a grid' : '')}
                  style={s('position:sticky;top:0;z-index:1;background:#f3f7f9;border-bottom:1px solid #dde4e7;text-align:left;padding:8px 11px;white-space:nowrap;cursor:pointer;font-weight:700;color:'
                    + (activeSort === c.name ? '#003087;' : '#4c6272;'))}>
                  {c.name}
                  {c.primaryKey && <span style={s('margin-left:5px;font-size:10px;color:#005eb8;')}>PK</span>}
                  {activeSort === c.name && <span style={s('margin-left:5px;')}>{dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} style={s('cursor:pointer;')}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f6f9fa'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                {r.cells.map((c, i) => (
                  <td key={i} style={s('border-bottom:1px solid #eef2f4;padding:7px 11px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#212b32;')}>
                    <Cell cell={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!state.loading && !shown.length && !state.error && (
          <p style={s('padding:18px;color:#768692;font-size:14px;' + 'font-family:inherit;')}>
            {query ? 'Nothing in this table matches that.' : 'This table is empty.'}
          </p>
        )}
      </div>

      {open && <RowSheet table={table} rowid={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function StructureView({ table }) {
  const [state, setState] = React.useState({ loading: true, data: null, error: '' });

  React.useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: '' });
    getJson('/api/database?view=table&table=' + encodeURIComponent(table))
      .then((d) => { if (live) setState({ loading: false, data: d, error: '' }); })
      .catch((e) => { if (live) setState({ loading: false, data: null, error: String(e.message || e) }); });
    return () => { live = false; };
  }, [table]);

  if (state.loading) return <p style={s('color:#4c6272;')}>Loading…</p>;
  if (state.error) return <p style={s('color:#a51b0f;')}>{state.error}</p>;
  const d = state.data;

  return (
    <div style={s('flex:1;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:18px;')}>
      <div style={s(BOX + 'overflow:hidden;')}>
        <table style={s('border-collapse:separate;border-spacing:0;width:100%;font-size:13px;')}>
          <thead>
            <tr>
              {['Column', 'Type', 'Nullable', 'Default'].map((h) => (
                <th key={h} style={s('background:#f3f7f9;border-bottom:1px solid #dde4e7;text-align:left;padding:8px 11px;font-size:12px;font-weight:700;color:#4c6272;')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.columns.map((c) => (
              <tr key={c.name}>
                <td style={s('border-bottom:1px solid #eef2f4;padding:7px 11px;color:#212b32;font-weight:600;' + MONO)}>
                  {c.name}
                  {c.primaryKey && <span style={s('margin-left:6px;font-size:10px;color:#005eb8;font-weight:700;')}>PK</span>}
                </td>
                <td style={s('border-bottom:1px solid #eef2f4;padding:7px 11px;color:#4c6272;' + MONO)}>{c.type}</td>
                <td style={s('border-bottom:1px solid #eef2f4;padding:7px 11px;color:#768692;')}>{c.nullable ? 'yes' : 'no'}</td>
                <td style={s('border-bottom:1px solid #eef2f4;padding:7px 11px;color:#768692;overflow-wrap:anywhere;' + MONO)}>{c.default || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {[{ title: 'Keys and checks', rows: d.constraints.map((c) => ({ key: c.name, text: c.definition })) },
        { title: 'Indexes', rows: d.indexes.map((i) => ({ key: i.name, text: i.definition })) },
        { title: 'Referenced by', rows: d.referencedBy.map((r) => ({ key: r.name, text: r.table + ' — ' + r.definition })) }]
        .filter((sec) => sec.rows.length)
        .map((sec) => (
          <div key={sec.title}>
            <h3 style={s('font-size:14px;margin:0 0 8px;color:#212b32;')}>{sec.title}</h3>
            <div style={s(BOX + 'padding:4px 0;')}>
              {sec.rows.map((r) => (
                <div key={r.key} style={s('padding:7px 12px;border-bottom:1px solid #f0f4f5;')}>
                  <div style={s('font-size:12.5px;font-weight:700;color:#4c6272;' + MONO)}>{r.key}</div>
                  <div style={s('font-size:12.5px;color:#768692;overflow-wrap:anywhere;' + MONO)}>{r.text}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * The other store. Everything in the blob bucket, whether or not the
 * database still claims it.
 * ---------------------------------------------------------------- */

function FilesView({ onCount }) {
  const [state, setState] = React.useState({ loading: true, blobs: [], error: '', hasMore: false, cursor: '', attachmentRows: 0 });
  const [filter, setFilter] = React.useState('');

  const load = React.useCallback((cursor) => {
    setState((p) => ({ ...p, loading: true, error: '' }));
    getJson('/api/database?view=files' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))
      .then((d) => setState((p) => ({
        loading: false,
        error: d.error || '',
        blobs: cursor ? p.blobs.concat(d.blobs || []) : (d.blobs || []),
        hasMore: !!d.hasMore,
        cursor: d.cursor || '',
        attachmentRows: d.attachmentRows || 0,
      })))
      .catch((e) => setState((p) => ({ ...p, loading: false, error: String(e.message || e) })));
  }, []);

  React.useEffect(() => { load(''); }, [load]);
  React.useEffect(() => { if (!state.loading) onCount(state.blobs.length); }, [state.loading, state.blobs.length, onCount]);

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? state.blobs.filter((b) => (b.pathname + ' ' + (b.attachment ? b.attachment.noteTitle : '')).toLowerCase().includes(needle))
    : state.blobs;
  const totalBytes = state.blobs.reduce((n, b) => n + b.size, 0);

  return (
    <div style={s('display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;')}>
      <div style={s('display:flex;flex-wrap:wrap;gap:10px;align-items:center;')}>
        <div style={s('flex:1;min-width:220px;max-width:420px;')}>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a file…"
            aria-label="Find a file" style={s(INPUT)} />
        </div>
        <span style={s('font-size:13px;color:#4c6272;')}>
          {count(state.blobs.length)} files · {bytes(totalBytes)}
        </span>
        {/* A row in note_attachments whose file is no longer in the store is
            the one thing about this page worth noticing on the way past. */}
        {!state.hasMore && !state.loading && state.attachmentRows > state.blobs.length && (
          <span style={s('font-size:12px;font-weight:600;color:#8a6100;background:#fff3cd;border-radius:999px;padding:3px 10px;')}>
            {count(state.attachmentRows - state.blobs.length)} rows point at a file the store no longer has
          </span>
        )}
      </div>

      {state.error && <p style={s('color:#a51b0f;')}>{state.error}</p>}
      {state.loading && !state.blobs.length && <p style={s('color:#4c6272;')}>Reading the blob store…</p>}

      <div style={s('flex:1;overflow:auto;min-height:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;align-content:start;padding-bottom:6px;')}>
        {shown.map((b) => {
          const image = String(b.contentType || '').startsWith('image/');
          return (
            <div key={b.url} style={s(BOX + 'overflow:hidden;display:flex;flex-direction:column;')}>
              <div style={s('height:130px;background:#f3f7f9;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #eef2f4;overflow:hidden;')}>
                {image
                  ? <img src={b.url} alt="" style={s('width:100%;height:100%;object-fit:cover;')} />
                  : <span style={s('color:#93a4ae;')}><Svg w={34} sw={1.5}>{Icons.file}</Svg></span>}
              </div>
              <div style={s('padding:10px 12px;display:flex;flex-direction:column;gap:5px;flex:1;')}>
                <div style={s('font-size:13px;font-weight:700;color:#212b32;overflow-wrap:anywhere;')}>
                  {b.attachment ? b.attachment.filename : b.pathname.split('/').pop()}
                </div>
                <div style={s('font-size:11.5px;color:#768692;overflow-wrap:anywhere;' + MONO)}>{b.pathname}</div>
                <div style={s('font-size:12px;color:#4c6272;')}>
                  {bytes(b.size)} · {b.contentType || 'unknown type'}
                </div>
                <div style={s('font-size:12px;color:#768692;')}>{when(b.uploadedAt)}</div>
                <div style={s('margin-top:auto;padding-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
                  {b.attachment
                    ? <span style={s('font-size:11.5px;color:#005eb8;background:#e8f1f8;border-radius:999px;padding:3px 9px;font-weight:600;')}>
                        {b.attachment.noteTitle || ('note ' + b.attachment.noteId)}
                      </span>
                    : <span style={s('font-size:11.5px;color:#8a6100;background:#fff3cd;border-radius:999px;padding:3px 9px;font-weight:600;')}>
                        no row points at this
                      </span>}
                  <Hover tag="a" href={b.url} target="_blank" rel="noreferrer"
                    base={QUIET + 'text-decoration:none;font-size:12px;padding:4px 10px;'} hover={QUIET_HOVER}>
                    Open<Svg w={12} sw={2.2}>{Icons.external}</Svg>
                  </Hover>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {state.hasMore && (
        <div>
          <Hover tag="button" type="button" onClick={() => load(state.cursor)} base={QUIET} hover={QUIET_HOVER}>
            {state.loading ? 'Loading…' : 'Load more files'}
          </Hover>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * The page.
 * ---------------------------------------------------------------- */

export default function DatabaseExplorer() {
  const [state, setState] = React.useState({ loading: true, tables: [], error: '' });
  const [selected, setSelected] = React.useState('');
  const [tab, setTab] = React.useState('rows');
  const [fileCount, setFileCount] = React.useState(null);

  React.useEffect(() => {
    getJson('/api/database?view=overview')
      .then((d) => {
        setState({ loading: false, tables: d.tables || [], error: '' });
        // Open on something rather than on nothing, and on the practice's own
        // material rather than on the biggest table — the biggest is the SNOMED
        // dictionary, half a million rows of reference data nobody came here to
        // read. Rail order is the order of interest, so take the first group
        // that has anything in it.
        const order = GROUPS.map((g) => g.label).concat(['Other']);
        const first = (d.tables || [])
          .filter((t) => (t.rows || 0) > 0)
          .sort((a, b) => order.indexOf(groupOf(a.name)) - order.indexOf(groupOf(b.name)) || (b.rows || 0) - (a.rows || 0))[0];
        setSelected((cur) => cur || (first ? first.name : '__files__'));
      })
      .catch((e) => setState({ loading: false, tables: [], error: String(e.message || e) }));
  }, []);

  const onCount = React.useCallback((n) => setFileCount(n), []);
  const table = state.tables.find((t) => t.name === selected);
  const totalRows = state.tables.reduce((n, t) => n + (t.rows || 0), 0);
  const totalBytes = state.tables.reduce((n, t) => n + (t.bytes || 0), 0);

  return (
    <div style={s('flex:1;display:flex;flex-direction:column;min-height:0;gap:14px;')}>
      <div style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 18px;')}>
        <h1 style={s('font-size:26px;margin:0;letter-spacing:-0.02em;')}>Database</h1>
        <p style={s('margin:0;font-size:14px;color:#4c6272;')}>
          Everything this app has stored — {count(state.tables.length)} tables, {count(totalRows)} rows, {bytes(totalBytes)},
          and the files uploaded alongside them.
        </p>
        <span style={s('margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#005eb8;background:#e8f1f8;border-radius:999px;padding:4px 11px;')}>
          <Svg w={13} sw={2.2}>{Icons.lock}</Svg>Read-only
        </span>
      </div>

      {state.error && <p style={s('color:#a51b0f;')}>{state.error}</p>}
      {state.loading && <p style={s('color:#4c6272;')}>Reading the database…</p>}

      {!state.loading && !state.error && (
        <div style={s('flex:1;display:flex;gap:16px;min-height:0;align-items:stretch;')}>
          <Rail tables={state.tables} selected={selected} onSelect={(n) => { setSelected(n); setTab('rows'); }} fileCount={fileCount} />

          <section style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;min-height:0;')}>
            {selected === '__files__' ? (
              <>
                <div>
                  <h2 style={s('font-size:19px;margin:0 0 2px;')}>Stored files</h2>
                  <p style={s('margin:0;font-size:13.5px;color:#4c6272;')}>
                    Every object in the blob store, whether or not a row still points at it.
                  </p>
                </div>
                <FilesView onCount={onCount} />
              </>
            ) : table ? (
              <>
                <div style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 14px;')}>
                  <h2 style={s('font-size:19px;margin:0;' + MONO)}>{table.name}</h2>
                  <span style={s('font-size:13px;color:#4c6272;')}>
                    {count(table.rows)} rows · {table.columns} columns · {bytes(table.bytes)}
                  </span>
                  <div style={s('margin-left:auto;display:flex;gap:6px;')}>
                    {[{ id: 'rows', label: 'Rows' }, { id: 'structure', label: 'Structure' }].map((t) => (
                      <Hover key={t.id} tag="button" type="button" onClick={() => setTab(t.id)}
                        base={'border-radius:999px;padding:6px 14px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid '
                          + (tab === t.id ? '#005eb8;background:#005eb8;color:#fff;' : '#d8e1e5;background:#fff;color:#4c6272;')}
                        hover={tab === t.id ? '' : 'border-color:#005eb8;color:#005eb8;'}>
                        {t.label}
                      </Hover>
                    ))}
                  </div>
                </div>
                {tab === 'rows'
                  ? <RowsView key={table.name} table={table.name} />
                  : <StructureView key={table.name} table={table.name} />}
              </>
            ) : (
              <p style={s('color:#4c6272;')}>Pick a table on the left.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
