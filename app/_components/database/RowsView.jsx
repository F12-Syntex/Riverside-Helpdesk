'use client';

/* The grid, and one row in full.
 *
 * WHAT WAS COPIED, AND FROM WHERE. The shape here is the one every
 * database console has converged on — Supabase, Neon, Vercel's data
 * editor, Basedash — because it solves the same three problems every
 * time. A row-number gutter, so a reader can say "the fourth one" and
 * be understood. The column TYPE printed in grey beside its name, so
 * nobody has to open the structure tab to find out whether a thing is
 * text or an integer. And a status bar under the grid saying what is
 * shown, out of how many, in how long — which is the difference between
 * a page that feels like a tool and one that feels like a screenshot.
 *
 * COLUMNS ARE DRAGGABLE because every one of those consoles has that
 * too, and for the same reason: a fixed width that suits an id is
 * useless for a note body, and no default can suit both.
 *
 * A ROW OPENS RATHER THAN EXPANDS. A cell shows the first 280
 * characters; the sheet shows the row. Arrow keys move the selection and
 * Enter opens it, so a long table can be read without the mouse. */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import {
  MONO, CARD, BTN, BTN_HOVER, SearchField, IconButton, StatusBar, Skeleton, Empty, ErrorNote,
  KeyMark, count, shortType, useDebounced, getJson, copyText,
} from './parts';

const GUTTER = 46;
const DEFAULT_W = 190;
const NARROW = { int4: 96, int8: 110, int2: 84, bool: 84, date: 116, timestamptz: 190, uuid: 290 };

function widthFor(column) {
  return NARROW[shortType(column.type)] || DEFAULT_W;
}

/* ---------------------------------------------------------------- *
 * One row, in full.
 * ---------------------------------------------------------------- */

function looksLikeJson(text) {
  const t = String(text || '').trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function pretty(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch (e) { return text; }
}

function RowSheet({ table, rows, index, onIndex, onClose }) {
  const rowid = rows[index] && rows[index].id;
  const [state, setState] = React.useState({ loading: true, values: [], error: '' });
  const [copied, setCopied] = React.useState('');

  React.useEffect(() => {
    if (!rowid) return undefined;
    let live = true;
    setState({ loading: true, values: [], error: '' });
    getJson('/api/database?view=row&table=' + encodeURIComponent(table) + '&rowid=' + encodeURIComponent(rowid))
      .then((d) => { if (live) setState({ loading: false, values: d.values || [], error: '' }); })
      .catch((e) => { if (live) setState({ loading: false, values: [], error: String(e.message || e) }); });
    return () => { live = false; };
  }, [table, rowid]);

  React.useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); onIndex(Math.min(index + 1, rows.length - 1)); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); onIndex(Math.max(index - 1, 0)); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onIndex, index, rows.length]);

  function copyAll() {
    const out = {};
    for (const v of state.values) out[v.column] = v.null ? null : v.text;
    copyText(JSON.stringify(out, null, 2));
    setCopied('row');
    setTimeout(() => setCopied(''), 1400);
  }

  return (
    <div onMouseDown={onClose} role="presentation"
      style={s('position:fixed;inset:0;background:rgba(33,43,50,.28);backdrop-filter:blur(1.5px);z-index:60;display:flex;justify-content:flex-end;')}>
      <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={'Row in ' + table}
        style={s('width:min(640px,100%);background:var(--rv-surface);height:100%;display:flex;flex-direction:column;box-shadow:-20px 0 44px rgba(33,43,50,.16);')}>

        <div style={s('display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--rv-line);')}>
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:14.5px;font-weight:700;color:var(--rv-ink);' + MONO)}>{table}</div>
            <div style={s('font-size:11.5px;color:var(--rv-ink-3);')}>
              Row {count(index + 1)} of {count(rows.length)} on this page · ctid {rowid}
            </div>
          </div>
          <IconButton title="Previous row" icon={Icons.up} disabled={index <= 0} onClick={() => onIndex(index - 1)} />
          <IconButton title="Next row" icon={Icons.chevronDown} disabled={index >= rows.length - 1} onClick={() => onIndex(index + 1)} />
          <Hover tag="button" type="button" onClick={copyAll} base={BTN} hover={BTN_HOVER}>
            <Svg w={13} sw={2}>{copied === 'row' ? Icons.check : Icons.copy}</Svg>{copied === 'row' ? 'Copied' : 'Copy JSON'}
          </Hover>
          <IconButton title="Close" icon={Icons.close} onClick={onClose} />
        </div>

        <div style={s('flex:1;overflow:auto;padding:12px 14px 40px;display:flex;flex-direction:column;gap:11px;')}>
          {state.loading && <Skeleton rows={6} cols={2} />}
          {state.error && <ErrorNote>{state.error}</ErrorNote>}
          {state.values.map((v) => {
            const json = !v.null && looksLikeJson(v.text);
            return (
              <div key={v.column}>
                <div style={s('display:flex;align-items:baseline;gap:8px;margin-bottom:4px;')}>
                  <span style={s('font-size:12.5px;font-weight:700;color:var(--rv-ink);' + MONO)}>{v.column}</span>
                  <span style={s('font-size:11px;color:var(--rv-ink-4);' + MONO)}>{shortType(v.type)}</span>
                  {!v.null && (
                    <Hover tag="button" type="button" title="Copy this value"
                      onClick={() => { copyText(v.text); setCopied(v.column); setTimeout(() => setCopied(''), 1400); }}
                      base={'margin-left:auto;border:0;background:transparent;color:var(--rv-ink-4);cursor:pointer;font-family:inherit;font-size:11.5px;display:inline-flex;align-items:center;gap:4px;padding:2px 4px;border-radius:5px;'}
                      hover={'color:var(--rv-accent);background:var(--rv-accent-dim);'}>
                      <Svg w={11} sw={2}>{copied === v.column ? Icons.check : Icons.copy}</Svg>
                      {copied === v.column ? 'Copied' : 'Copy'}
                    </Hover>
                  )}
                </div>
                {v.null
                  ? <div style={s('font-size:12.5px;color:var(--rv-ink-4);font-style:italic;')}>null</div>
                  : (
                    <div style={s('white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px;line-height:1.55;color:var(--rv-ink);background:var(--rv-page);border:1px solid var(--rv-line-soft);border-radius:8px;padding:9px 11px;max-height:340px;overflow:auto;' + MONO)}>
                      {json ? pretty(v.text) : v.text}
                      {v.truncated && (
                        <span style={s('display:block;margin-top:7px;color:var(--rv-ink-3);font-style:italic;')}>
                          … {count(v.length)} characters in total; the rest is not shown.
                        </span>
                      )}
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * The grid.
 * ---------------------------------------------------------------- */

function Cell({ cell: c }) {
  if (c.omitted) return <span style={s('color:var(--rv-ink-4);font-style:italic;')}>not shown</span>;
  if (c.null) return <span style={s('color:var(--rv-ink-4);font-style:italic;')}>null</span>;
  if (c.note) return <span style={s('color:var(--rv-ink-2);')}>{c.text}</span>;
  return <span title={c.truncated ? c.text + '…' : c.text}>{c.text}{c.truncated ? '…' : ''}</span>;
}

export default function RowsView({ table }) {
  const [sort, setSort] = React.useState('');
  const [dir, setDir] = React.useState('desc');
  const [offset, setOffset] = React.useState(0);
  const [limit, setLimit] = React.useState(50);
  const [raw, setRaw] = React.useState('');
  const query = useDebounced(raw, 300);
  const [nonce, setNonce] = React.useState(0);
  const [state, setState] = React.useState({ loading: true, data: null, error: '' });
  const [widths, setWidths] = React.useState({});
  const [cursor, setCursor] = React.useState(-1);   // the highlighted row
  const [open, setOpen] = React.useState(-1);       // the row in the sheet
  const [copied, setCopied] = React.useState(false);
  const gridRef = React.useRef(null);

  React.useEffect(() => { setSort(''); setDir('desc'); setOffset(0); setRaw(''); setWidths({}); setCursor(-1); }, [table]);
  React.useEffect(() => { setOffset(0); }, [query, limit]);

  React.useEffect(() => {
    let live = true;
    setState((p) => ({ ...p, loading: true, error: '' }));
    const url = '/api/database?view=rows&table=' + encodeURIComponent(table)
      + '&limit=' + limit + '&offset=' + offset + '&dir=' + dir
      + (sort ? '&sort=' + encodeURIComponent(sort) : '')
      + (query ? '&q=' + encodeURIComponent(query) : '');
    getJson(url)
      .then((d) => { if (live) { setState({ loading: false, data: d, error: '' }); setCursor(-1); } })
      .catch((e) => { if (live) setState({ loading: false, data: null, error: String(e.message || e) }); });
    return () => { live = false; };
  }, [table, limit, offset, sort, dir, query, nonce]);

  const data = state.data;
  const columns = (data && data.columns) || [];
  const rows = (data && data.rows) || [];
  const total = (data && data.total) || 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + rows.length, total);
  const activeSort = sort || (data ? data.sort : '');
  const pages = Math.max(Math.ceil(total / limit), 1);
  const page = Math.floor(offset / limit) + 1;

  // Arrow keys walk the page, Enter opens what they landed on. The grid
  // takes focus itself so this never steals a keystroke from the search.
  function onKeyDown(e) {
    if (!rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); setOpen(cursor); }
  }

  function clickHeader(name) {
    if (activeSort === name) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(name); setDir('asc'); }
    setOffset(0);
  }

  // Drag a column edge. The width map is keyed by column name and
  // thrown away when the table changes, because a width belongs to the
  // column it was dragged on and to nothing else.
  function startResize(e, name, current) {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    function move(ev) {
      const next = Math.max(70, Math.min(720, current + (ev.clientX - x0)));
      setWidths((w) => ({ ...w, [name]: next }));
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function copyPage() {
    const out = rows.map((r) => {
      const o = {};
      columns.forEach((c, i) => {
        const cell = r.cells[i];
        o[c.name] = cell.null ? null : (cell.omitted ? undefined : cell.text);
      });
      return o;
    });
    copyText(JSON.stringify(out, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={s('display:flex;flex-direction:column;gap:10px;min-height:0;flex:1;')}>
      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:9px;')}>
        <SearchField value={raw} onChange={setRaw} placeholder="Search every column…" label="Search this table" width="360px" />
        <IconButton title="Read it again" icon={Icons.refresh} onClick={() => setNonce((n) => n + 1)} spinning={state.loading} />
        <Hover tag="button" type="button" onClick={copyPage} base={BTN} hover={BTN_HOVER} title="Copy this page of rows as JSON">
          <Svg w={13} sw={2}>{copied ? Icons.check : Icons.copy}</Svg>{copied ? 'Copied' : 'Copy page'}
        </Hover>
        <span style={s('margin-left:auto;font-size:12px;color:var(--rv-ink-4);')}>
          Click a row to open it · ↑ ↓ to move · Enter to open
        </span>
      </div>

      {state.error && <ErrorNote>{state.error}</ErrorNote>}

      <div style={s(CARD + 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;')}>
        <div ref={gridRef} tabIndex={0} onKeyDown={onKeyDown}
          style={s('flex:1;overflow:auto;min-height:0;outline:none;')}>
          {state.loading && !rows.length
            ? <Skeleton rows={10} cols={Math.min(columns.length || 5, 6)} />
            : (
              <table style={s('border-collapse:separate;border-spacing:0;table-layout:fixed;width:max-content;min-width:100%;font-size:12.5px;' + MONO)}>
                <colgroup>
                  <col style={{ width: GUTTER + 'px' }} />
                  {columns.map((c) => <col key={c.name} style={{ width: (widths[c.name] || widthFor(c)) + 'px' }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={s('position:sticky;top:0;left:0;z-index:3;background:var(--rv-surface-3);border-bottom:1px solid var(--rv-line);border-right:1px solid var(--rv-line);padding:0;height:31px;')} />
                    {columns.map((c) => {
                      const on = activeSort === c.name;
                      return (
                        <th key={c.name} onClick={() => clickHeader(c.name)}
                          title={c.type + (c.omitted ? ' — too large to show in a grid' : '')}
                          style={s('position:sticky;top:0;z-index:2;background:var(--rv-surface-3);border-bottom:1px solid var(--rv-line);border-right:1px solid var(--rv-line-soft);text-align:left;padding:0 9px;height:31px;cursor:pointer;white-space:nowrap;overflow:hidden;'
                            + 'font-weight:700;color:' + (on ? 'var(--rv-accent-hi)' : 'var(--rv-ink-2)') + ';')}>
                          <span style={s('display:flex;align-items:center;gap:5px;overflow:hidden;')}>
                            {c.primaryKey && <KeyMark />}
                            <span style={s('overflow:hidden;text-overflow:ellipsis;')}>{c.name}</span>
                            <span style={s('font-weight:500;color:var(--rv-ink-4);font-size:11px;')}>{shortType(c.type)}</span>
                            {on && <span style={s('margin-left:auto;color:var(--rv-accent);')}>{dir === 'asc' ? '↑' : '↓'}</span>}
                          </span>
                          <span onMouseDown={(e) => startResize(e, c.name, widths[c.name] || widthFor(c))}
                            role="presentation"
                            style={s('position:absolute;top:0;right:-3px;width:7px;height:100%;cursor:col-resize;z-index:3;')} />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const here = i === cursor || i === open;
                    return (
                      <tr key={r.id} onClick={() => { setCursor(i); setOpen(i); }}
                        onMouseEnter={(e) => { if (!here) e.currentTarget.style.background = 'var(--rv-surface-2)'; }}
                        onMouseLeave={(e) => { if (!here) e.currentTarget.style.background = 'transparent'; }}
                        style={s('cursor:pointer;' + (here ? 'background:var(--rv-accent-dim);' : ''))}>
                        <td style={s('position:sticky;left:0;z-index:1;background:' + (here ? 'var(--rv-accent-dim)' : 'var(--rv-surface)') + ';border-bottom:1px solid var(--rv-line-soft);border-right:1px solid var(--rv-line);padding:0 9px;height:30px;text-align:right;color:var(--rv-ink-4);font-size:11px;')}>
                          {count(offset + i + 1)}
                        </td>
                        {r.cells.map((c, j) => (
                          <td key={j} style={s('border-bottom:1px solid var(--rv-line-soft);border-right:1px solid var(--rv-line-soft);padding:0 9px;height:30px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rv-ink);')}>
                            <Cell cell={c} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

          {!state.loading && !rows.length && !state.error && (
            <Empty icon={query ? Icons.search : Icons.fileLines}
              title={query ? 'Nothing in this table matches that.' : 'This table is empty.'}
              note={query ? 'The search runs over every column the database can read as text.' : 'Nothing has been written to it yet.'} />
          )}
        </div>

        <StatusBar right={(
          <>
            <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10))} aria-label="Rows per page"
              style={s('font-family:inherit;font-size:12px;height:26px;padding:0 6px;border:1px solid var(--rv-line);border-radius:6px;background:var(--rv-surface);color:var(--rv-ink-2);')}>
              {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} rows</option>)}
            </select>
            <IconButton title="Previous page" icon={Icons.chevronLeft} disabled={offset <= 0}
              onClick={() => setOffset(Math.max(offset - limit, 0))} />
            <span style={s('font-size:12px;color:var(--rv-ink-3);min-width:74px;text-align:center;' + MONO)}>
              {count(page)} / {count(pages)}
            </span>
            <IconButton title="Next page" icon={Icons.chevronRight} disabled={to >= total}
              onClick={() => setOffset(offset + limit)} />
          </>
        )}>
          <span style={s(MONO)}>{total ? count(from) + '–' + count(to) : '0'} of {count(total)}</span>
          {data && data.ms != null && <span>{count(data.ms)} ms</span>}
          {query && <span>filtered by “{query}”</span>}
        </StatusBar>
      </div>

      {open >= 0 && rows[open] && (
        <RowSheet table={table} rows={rows} index={open} onIndex={(i) => { setOpen(i); setCursor(i); }} onClose={() => setOpen(-1)} />
      )}
    </div>
  );
}
