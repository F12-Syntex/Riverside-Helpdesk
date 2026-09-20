'use client';

/* The blob store, as a file browser rather than a list of URLs.
 *
 * Two views, because the two questions are different: the grid answers
 * "what is this file" (a thumbnail does that instantly and a filename
 * of 40 random characters never will), and the list answers "what is in
 * here and how big is it", which wants one line each and columns that
 * line up. Asset browsers have offered both for twenty years. */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import {
  MONO, CARD, BTN, BTN_HOVER, SearchField, Segmented, StatusBar, IconButton,
  Skeleton, Empty, ErrorNote, bytes, count, when,
} from './parts';

function kindOf(type, pathname) {
  const t = String(type || '');
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf' || pathname.endsWith('.pdf')) return 'pdf';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('text/') || t.includes('json')) return 'text';
  return 'file';
}

const KIND_ICON = { image: Icons.image, pdf: Icons.fileLines, video: Icons.image, text: Icons.fileLines, file: Icons.file };

function Owner({ blob }) {
  if (!blob.attachment) {
    return (
      <span title="No row in note_attachments points at this file"
        style={s('display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#8a6100;background:#fff3cd;border:1px solid #f0dca0;border-radius:999px;padding:2px 8px;')}>
        <Svg w={11} sw={2}>{Icons.alertCircle}</Svg>unattached
      </span>
    );
  }
  return (
    <span title={'note ' + blob.attachment.noteId}
      style={s('display:inline-flex;align-items:center;gap:5px;max-width:100%;overflow:hidden;font-size:11px;font-weight:600;color:var(--rv-accent-hi);background:var(--rv-accent-dim);border:1px solid var(--rv-accent-line);border-radius:999px;padding:2px 8px;')}>
      <Svg w={11} sw={2}>{Icons.edit}</Svg>
      <span style={s('overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>
        {blob.attachment.noteTitle || ('note ' + blob.attachment.noteId)}
      </span>
    </span>
  );
}

export default function FilesView({ onCount }) {
  const [state, setState] = React.useState({ loading: true, blobs: [], error: '', hasMore: false, cursor: '', attachmentRows: 0, ms: null });
  const [filter, setFilter] = React.useState('');
  const [view, setView] = React.useState('grid');

  const load = React.useCallback((cursor) => {
    setState((p) => ({ ...p, loading: true, error: '' }));
    fetch('/api/database?view=files' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setState((p) => ({
        loading: false,
        error: d.error || '',
        blobs: cursor ? p.blobs.concat(d.blobs || []) : (d.blobs || []),
        hasMore: !!d.hasMore,
        cursor: d.cursor || '',
        attachmentRows: d.attachmentRows || 0,
        ms: d.ms,
      })))
      .catch((e) => setState((p) => ({ ...p, loading: false, error: String(e.message || e) })));
  }, []);

  React.useEffect(() => { load(''); }, [load]);
  React.useEffect(() => { if (!state.loading) onCount(state.blobs.length); }, [state.loading, state.blobs.length, onCount]);

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? state.blobs.filter((b) => (b.pathname + ' ' + (b.attachment ? b.attachment.filename + ' ' + b.attachment.noteTitle : '')).toLowerCase().includes(needle))
    : state.blobs;
  const totalBytes = state.blobs.reduce((n, b) => n + b.size, 0);
  const missing = state.attachmentRows - state.blobs.length;
  const nameOf = (b) => (b.attachment ? b.attachment.filename : b.pathname.split('/').pop());

  return (
    <div style={s('display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;')}>
      <div style={s('display:flex;flex-wrap:wrap;gap:9px;align-items:center;')}>
        <SearchField value={filter} onChange={setFilter} placeholder="Find a file…" label="Find a file" width="340px" />
        <IconButton title="Read it again" icon={Icons.refresh} onClick={() => load('')} spinning={state.loading} />
        <Segmented value={view} onChange={setView} options={[
          { id: 'grid', label: 'Grid', icon: Icons.image },
          { id: 'list', label: 'List', icon: Icons.menu },
        ]} />
        {!state.hasMore && !state.loading && missing > 0 && (
          <span title="Rows in note_attachments whose blob is no longer in the store"
            style={s('font-size:11.5px;font-weight:600;color:#8a6100;background:#fff3cd;border:1px solid #f0dca0;border-radius:999px;padding:3px 10px;')}>
            {count(missing)} rows point at a file the store no longer has
          </span>
        )}
      </div>

      {state.error && <ErrorNote>{state.error}</ErrorNote>}

      <div style={s(CARD + 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;')}>
        <div style={s('flex:1;overflow:auto;min-height:0;' + (view === 'grid' ? 'padding:12px;' : ''))}>
          {state.loading && !state.blobs.length && <Skeleton rows={7} cols={4} />}

          {view === 'grid' && !!shown.length && (
            <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(216px,1fr));gap:12px;align-content:start;')}>
              {shown.map((b) => {
                const kind = kindOf(b.contentType, b.pathname);
                return (
                  <a key={b.url} href={b.url} target="_blank" rel="noreferrer"
                    style={s('display:flex;flex-direction:column;border:1px solid var(--rv-line);border-radius:10px;overflow:hidden;text-decoration:none;background:var(--rv-surface);')}>
                    <div style={s('height:124px;background:var(--rv-page);display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--rv-line-soft);overflow:hidden;')}>
                      {kind === 'image'
                        ? <img src={b.url} alt="" loading="lazy" style={s('width:100%;height:100%;object-fit:cover;')} />
                        : <span style={s('color:var(--rv-ink-4);')}><Svg w={30} sw={1.5}>{KIND_ICON[kind]}</Svg></span>}
                    </div>
                    <div style={s('padding:9px 10px;display:flex;flex-direction:column;gap:5px;flex:1;')}>
                      <div title={nameOf(b)} style={s('font-size:12.5px;font-weight:700;color:var(--rv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>
                        {nameOf(b)}
                      </div>
                      <div style={s('font-size:11.5px;color:var(--rv-ink-3);' + MONO)}>
                        {bytes(b.size)} · {(b.contentType || 'unknown').replace('application/', '')}
                      </div>
                      <div style={s('font-size:11px;color:var(--rv-ink-4);')}>{when(b.uploadedAt)}</div>
                      <div style={s('margin-top:auto;padding-top:7px;min-width:0;')}><Owner blob={b} /></div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          {view === 'list' && !!shown.length && (
            <table style={s('border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px;')}>
              <thead>
                <tr>
                  {['File', 'Type', 'Size', 'Uploaded', 'Attached to', ''].map((h) => (
                    <th key={h} style={s('position:sticky;top:0;z-index:1;background:var(--rv-surface-3);border-bottom:1px solid var(--rv-line);text-align:left;padding:7px 12px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--rv-ink-3);white-space:nowrap;')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr key={b.url}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rv-surface-2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:7px 12px;max-width:340px;')}>
                      <div style={s('font-weight:600;color:var(--rv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{nameOf(b)}</div>
                      <div title={b.pathname} style={s('font-size:11px;color:var(--rv-ink-4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + MONO)}>{b.pathname}</div>
                    </td>
                    <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:7px 12px;color:var(--rv-ink-3);white-space:nowrap;' + MONO)}>{(b.contentType || 'unknown').replace('application/', '')}</td>
                    <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:7px 12px;color:var(--rv-ink-2);white-space:nowrap;' + MONO)}>{bytes(b.size)}</td>
                    <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:7px 12px;color:var(--rv-ink-3);white-space:nowrap;')}>{when(b.uploadedAt)}</td>
                    <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:7px 12px;max-width:240px;')}><Owner blob={b} /></td>
                    <td style={s('border-bottom:1px solid var(--rv-line-soft);padding:7px 12px;text-align:right;')}>
                      <Hover tag="a" href={b.url} target="_blank" rel="noreferrer" base={BTN + 'text-decoration:none;height:26px;'} hover={BTN_HOVER}>
                        Open<Svg w={11} sw={2.2}>{Icons.external}</Svg>
                      </Hover>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!state.loading && !shown.length && (
            <Empty icon={Icons.folder}
              title={needle ? 'No file by that name.' : 'The blob store is empty.'}
              note={needle ? 'The filter matches the path, the filename and the note a file is attached to.' : 'Files uploaded to a notebook page appear here.'} />
          )}
        </div>

        <StatusBar right={state.hasMore ? (
          <Hover tag="button" type="button" onClick={() => load(state.cursor)} base={BTN} hover={BTN_HOVER}>
            {state.loading ? 'Loading…' : 'Load more'}
          </Hover>
        ) : null}>
          <span style={s(MONO)}>{count(shown.length)} of {count(state.blobs.length)} files</span>
          <span style={s(MONO)}>{bytes(totalBytes)}</span>
          {state.ms != null && <span>{count(state.ms)} ms</span>}
          {state.attachmentRows > 0 && <span>{count(state.attachmentRows)} rows in note_attachments</span>}
        </StatusBar>
      </div>
    </div>
  );
}
