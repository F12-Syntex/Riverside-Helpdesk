'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Notebook — a OneNote-style store of practice notes.
 *
 * Layout: a fixed sidebar pinned to the far left (sections + sub-notes,
 * searchable) and a centred editor column. Everything persists to
 * Postgres via /api/notebook; files attach via Vercel Blob through
 * /api/notebook/attachments. Note bodies are used by the assistant as
 * citable sources at request time (see lib/notebook.js).
 * ------------------------------------------------------------------ */

const C = {
  ink: '#212b32', mut: '#4c6272', dim: '#768692', line: '#d8dde0',
  soft: '#eef1f2', blue: '#005eb8', navy: '#003087', sel: '#e8f1f8',
  bg: '#f0f4f5', red: '#d5281b', green: '#007f3b',
};

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function NotebookPage() {
  const [notes, setNotes] = React.useState([]);
  const [attachments, setAttachments] = React.useState([]);
  const [status, setStatus] = React.useState('loading'); // loading | ready | error
  const [selectedId, setSelectedId] = React.useState(null);
  const [expanded, setExpanded] = React.useState({});      // parentId -> bool
  const [search, setSearch] = React.useState('');
  const [saveState, setSaveState] = React.useState('');     // '' | 'saving' | 'saved' | 'unsaved'
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState('');
  const timer = React.useRef(null);
  const pending = React.useRef(null);
  const fileInput = React.useRef(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notebook');
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        const list = Array.isArray(data.notes) ? data.notes : [];
        setNotes(list);
        setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
        setStatus('ready');
        if (list.length) setSelectedId((list.find((n) => !n.parentId) || list[0]).id);
      } catch (e) {
        setStatus('error');
      }
    })();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const childrenOf = React.useCallback((id) => notes.filter((n) => n.parentId === id), [notes]);
  const selected = notes.find((n) => n.id === selectedId) || null;
  const selectedFiles = attachments.filter((a) => a.noteId === selectedId);

  // Search matches title or body; a matching sub-note keeps its section visible.
  const q = search.trim().toLowerCase();
  const matches = (n) => !q || (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q);
  const topLevel = notes.filter((n) => !n.parentId).filter((n) => matches(n) || childrenOf(n.id).some(matches));

  /* ------------------------------ Saving ------------------------------ */

  async function flush() {
    if (!pending.current) return;
    const body = pending.current;
    pending.current = null;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    try {
      setSaveState('saving');
      const res = await fetch('/api/notebook', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('bad status');
      setSaveState('saved');
      setTimeout(() => setSaveState((s2) => (s2 === 'saved' ? '' : s2)), 1500);
    } catch (e) {
      setSaveState('unsaved');
    }
  }

  function scheduleSave(id, patch) {
    pending.current = { ...(pending.current && pending.current.id === id ? pending.current : {}), ...patch, id };
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }

  function editSelected(patch) {
    setNotes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, ...patch } : n)));
    scheduleSave(selectedId, patch);
  }

  /* --------------------------- Note actions --------------------------- */

  async function selectNote(id) {
    await flush();
    setSelectedId(id);
  }

  async function newNote(parentId) {
    await flush();
    try {
      const res = await fetch('/api/notebook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: parentId ? 'New sub-note' : 'New note', parentId: parentId || null }),
      });
      if (!res.ok) throw new Error('bad status');
      const { note } = await res.json();
      setNotes((ns) => ns.concat([note]));
      if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
      setSelectedId(note.id);
    } catch (e) { /* ignore */ }
  }

  async function removeNote(id) {
    const n = notes.find((x) => x.id === id);
    const kids = childrenOf(id).length;
    const msg = 'Delete "' + (n ? n.title : 'this note') + '"' + (kids ? ' and its ' + kids + ' sub-note(s)' : '') + '? Attached files are deleted too. This cannot be undone.';
    if (!window.confirm(msg)) return;
    try {
      await fetch('/api/notebook?id=' + id, { method: 'DELETE' });
      const goneIds = new Set([id, ...childrenOf(id).map((k) => k.id)]);
      setNotes((ns) => ns.filter((x) => !goneIds.has(x.id)));
      setAttachments((as) => as.filter((a) => !goneIds.has(a.noteId)));
      if (goneIds.has(selectedId)) {
        const remaining = notes.filter((x) => !goneIds.has(x.id) && !x.parentId);
        setSelectedId(remaining.length ? remaining[0].id : null);
      }
    } catch (e) { /* ignore */ }
  }

  /* --------------------------- Attachments ---------------------------- */

  async function uploadFiles(files) {
    if (!selectedId || !files || !files.length) return;
    setUploading(true);
    setUploadErr('');
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('noteId', String(selectedId));
      form.append('file', file);
      try {
        const res = await fetch('/api/notebook/attachments', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed.');
        setAttachments((as) => as.concat([data.attachment]));
      } catch (e) {
        setUploadErr(String(e.message || e));
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function removeAttachment(a) {
    if (!window.confirm('Remove "' + a.filename + '"?')) return;
    try {
      await fetch('/api/notebook/attachments?id=' + a.id, { method: 'DELETE' });
      setAttachments((as) => as.filter((x) => x.id !== a.id));
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------ Sidebar ------------------------------ */

  const rowBase = 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:none;background:none;font:inherit;font-size:14.5px;cursor:pointer;border-radius:8px;padding:8px 10px;color:' + C.ink + ';';
  const rowSel = 'background:' + C.sel + ';color:' + C.navy + ';font-weight:600;';
  const iconBtn = 'flex:none;display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;color:' + C.dim + ';border-radius:6px;';

  function NoteRow({ n, child }) {
    const kids = childrenOf(n.id).filter((k) => !q || matches(k) || matches(n));
    const isSel = selectedId === n.id;
    const open = !!expanded[n.id] || (!!q && kids.length > 0);
    const fileCount = attachments.filter((a) => a.noteId === n.id).length;
    return (
      <div>
        <div style={s('display:flex;align-items:center;gap:2px;' + (child ? 'padding-left:20px;' : ''))}>
          {!child && kids.length > 0 ? (
            <Hover tag="button" onClick={() => setExpanded((e) => ({ ...e, [n.id]: !open }))} aria-label={open ? 'Collapse' : 'Expand'}
              base={iconBtn + 'width:22px;height:22px;'} hover={'background:' + C.soft + ';'}>
              <Svg w={14} sw={2.4} style={s('transform:rotate(' + (open ? 90 : 0) + 'deg);transition:transform .15s;')}>{Icons.chevronRight}</Svg>
            </Hover>
          ) : (<span style={s('flex:none;width:22px;')} />)}
          <Hover tag="button" onClick={() => selectNote(n.id)} base={rowBase + 'flex:1;min-width:0;' + (isSel ? rowSel : '')} hover={isSel ? '' : 'background:#f7fbff;'}>
            <Svg w={15} sw={2} style={s('flex:none;color:' + (isSel ? C.blue : C.dim) + ';')}>{child ? Icons.fileLines : Icons.book}</Svg>
            <span style={s('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{n.title || 'Untitled note'}</span>
            {fileCount > 0 && <span style={s('flex:none;font-size:11.5px;color:' + C.dim + ';background:' + C.soft + ';border-radius:99px;padding:1px 7px;')}>{fileCount}</span>}
          </Hover>
          {!child && (
            <Hover tag="button" onClick={() => newNote(n.id)} aria-label="Add sub-note" title="Add sub-note"
              base={iconBtn + 'width:26px;height:26px;'} hover={'background:' + C.sel + ';color:' + C.blue + ';'}>
              <Svg w={15} sw={2.2}>{Icons.plus}</Svg>
            </Hover>
          )}
        </div>
        {!child && open && kids.map((k) => <NoteRow key={k.id} n={k} child />)}
      </div>
    );
  }

  /* ------------------------------ Render ------------------------------- */

  return (
    <div style={s('display:flex;flex-direction:column;height:100vh;min-height:100vh;background:' + C.bg + ';')}>
      <AppHeader subtitle="Notebook" />

      {/* Full-width shell: sidebar pinned to the far left, editor fills the rest. */}
      <div style={s('flex:1;min-height:0;display:flex;width:100%;')}>
        <aside style={s('flex:none;width:290px;border-right:1px solid ' + C.line + ';background:#fff;display:flex;flex-direction:column;min-height:0;')}>
          <div style={s('flex:none;padding:14px 14px 8px;display:flex;flex-direction:column;gap:10px;')}>
            <Hover tag="button" onClick={() => newNote(null)}
              base={'display:inline-flex;align-items:center;gap:8px;width:100%;justify-content:center;background:' + C.blue + ';color:#fff;border:none;border-radius:10px;padding:10px 14px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;'}
              hover={'background:' + C.navy + ';'}>
              <Svg w={16} sw={2.2}>{Icons.plus}</Svg>New note
            </Hover>
            <div style={s('display:flex;align-items:center;gap:8px;border:1px solid ' + C.line + ';border-radius:10px;padding:8px 11px;background:' + C.bg + ';')}>
              <Svg w={15} sw={2} style={s('flex:none;color:' + C.dim + ';')}>{Icons.search}</Svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes"
                style={s('flex:1;min-width:0;border:none;outline:none;background:none;font:inherit;font-size:14px;color:' + C.ink + ';')} />
              {search && (
                <Hover tag="button" onClick={() => setSearch('')} aria-label="Clear search" base={iconBtn + 'width:18px;height:18px;'} hover={'color:' + C.ink + ';'}>
                  <Svg w={13} sw={2.4}>{Icons.close}</Svg>
                </Hover>
              )}
            </div>
          </div>

          <div style={s('flex:1;overflow-y:auto;padding:2px 10px 14px;')}>
            {status === 'loading' && <p style={s('color:' + C.mut + ';font-size:14.5px;padding:10px 12px;')}>Loading…</p>}
            {status === 'error' && <p style={s('color:' + C.red + ';font-size:14.5px;padding:10px 12px;')}>Could not load notes. Is the database configured?</p>}
            {status === 'ready' && topLevel.length === 0 && (
              <p style={s('color:' + C.dim + ';font-size:14.5px;padding:10px 12px;line-height:1.5;')}>
                {q ? 'No notes match your search.' : 'No notes yet. Create one — for example an “Instructions” note with sub-notes like “How to book appointments”.'}
              </p>
            )}
            {topLevel.map((n) => <NoteRow key={n.id} n={n} />)}
          </div>

          <div style={s('flex:none;border-top:1px solid ' + C.soft + ';padding:11px 14px;font-size:12.5px;color:' + C.dim + ';line-height:1.45;')}>
            <span style={s('display:inline-flex;align-items:center;gap:6px;')}>
              <Svg w={13} sw={2.2} stroke={C.green}>{Icons.shield}</Svg>Notes here are used by the assistant automatically.
            </span>
          </div>
        </aside>

        <main style={s('flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;overflow-y:auto;')}>
          {!selected && (
            <div style={s('flex:1;display:flex;align-items:center;justify-content:center;color:' + C.dim + ';font-size:16px;text-align:center;padding:24px;')}>
              <div>
                <div style={s('margin-bottom:8px;')}><Svg w={30} stroke="#a3b1ba" sw={1.8}>{Icons.book}</Svg></div>
                Select a note, or create one to get started.
              </div>
            </div>
          )}
          {selected && (
            <div style={s('width:100%;max-width:900px;margin:0 auto;display:flex;flex-direction:column;flex:1;min-height:0;padding:18px 28px 24px;')}>
              {/* Title row */}
              <div style={s('flex:none;display:flex;align-items:center;gap:12px;padding-bottom:8px;')}>
                <input
                  value={selected.title || ''}
                  onChange={(e) => editSelected({ title: e.target.value })}
                  placeholder="Note title"
                  style={s('flex:1;min-width:0;font:inherit;font-size:24px;font-weight:700;letter-spacing:-0.01em;border:none;outline:none;background:none;color:' + C.ink + ';')}
                />
                <span style={s('flex:none;font-size:13px;min-width:64px;text-align:right;color:' + (saveState === 'unsaved' ? C.red : C.dim) + ';')}>
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'unsaved' ? 'Not saved' : ''}
                </span>
                <Hover tag="button" onClick={() => removeNote(selected.id)} aria-label="Delete note" title="Delete note"
                  base={'flex:none;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;cursor:pointer;color:' + C.mut + ';'}
                  hover={'border-color:' + C.red + ';color:' + C.red + ';'}>
                  <Svg w={17} sw={2}>{Icons.trash}</Svg>
                </Hover>
              </div>

              {/* Body */}
              <textarea
                value={selected.body || ''}
                onChange={(e) => editSelected({ body: e.target.value })}
                placeholder="Write your note here. Plain text or markdown. Anything you write is used by the assistant to answer and to triage — for example ‘Sore throat → signpost to Pharmacy First’."
                style={s('flex:1;min-height:240px;width:100%;resize:none;font:inherit;font-size:16px;line-height:1.6;border:1px solid ' + C.line + ';border-radius:12px;background:#fff;padding:16px 18px;outline:none;color:' + C.ink + ';')}
              />

              {/* Attachments */}
              <section style={s('flex:none;margin-top:14px;border:1px solid ' + C.line + ';border-radius:12px;background:#fff;padding:14px 16px;')}>
                <div style={s('display:flex;align-items:center;gap:10px;margin-bottom:' + (selectedFiles.length || uploadErr ? '10px' : '0') + ';')}>
                  <span style={s('font-size:14px;font-weight:600;color:' + C.ink + ';')}>Attachments</span>
                  {selectedFiles.length > 0 && <span style={s('font-size:12.5px;color:' + C.dim + ';')}>{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}</span>}
                  <span style={s('flex:1;')} />
                  <input ref={fileInput} type="file" multiple style={s('display:none;')} onChange={(e) => uploadFiles(e.target.files)} />
                  <Hover tag="button" onClick={() => fileInput.current && fileInput.current.click()} disabled={uploading}
                    base={'display:inline-flex;align-items:center;gap:7px;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;padding:7px 13px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;color:' + C.blue + ';' + (uploading ? 'opacity:.6;' : '')}
                    hover={'border-color:' + C.blue + ';background:' + C.sel + ';'}>
                    <Svg w={14} sw={2.2}>{Icons.plus}</Svg>{uploading ? 'Uploading…' : 'Attach file'}
                  </Hover>
                </div>
                {uploadErr && <p style={s('color:' + C.red + ';font-size:13px;margin:0 0 8px;')}>{uploadErr}</p>}
                {selectedFiles.length > 0 && (
                  <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;')}>
                    {selectedFiles.map((a) => (
                      <li key={a.id} style={s('display:flex;align-items:center;gap:10px;border:1px solid ' + C.soft + ';border-radius:9px;padding:8px 11px;background:' + C.bg + ';')}>
                        <Svg w={15} sw={2} style={s('flex:none;color:' + C.dim + ';')}>{(a.contentType || '').startsWith('image/') ? Icons.image : Icons.file}</Svg>
                        <a href={a.url} target="_blank" rel="noopener noreferrer"
                          style={s('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;color:' + C.blue + ';text-decoration:none;')}>
                          {a.filename}
                        </a>
                        <span style={s('flex:none;font-size:12.5px;color:' + C.dim + ';')}>{fmtSize(a.size)}</span>
                        <Hover tag="button" onClick={() => removeAttachment(a)} aria-label={'Remove ' + a.filename} title="Remove"
                          base={iconBtn + 'width:26px;height:26px;'} hover={'color:' + C.red + ';background:#fbe9e7;'}>
                          <Svg w={14} sw={2.2}>{Icons.trash}</Svg>
                        </Hover>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
