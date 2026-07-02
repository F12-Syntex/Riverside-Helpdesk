'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Notebook — practice notes the assistant uses automatically.
 *
 * Full-page editor with no app header: the sidebar pinned to the far
 * left carries a home link and a recursive note tree where connector
 * lines run from each parent to its children (notes nest to any
 * depth). The editor fills the page; attachments show as chips under
 * the title and files upload by drag-and-drop onto the note (or the
 * paperclip button). Notes persist to Postgres (/api/notebook); files
 * go to Vercel Blob (/api/notebook/attachments).
 * ------------------------------------------------------------------ */

const C = {
  ink: '#212b32', mut: '#4c6272', dim: '#768692', line: '#d8dde0',
  soft: '#eef1f2', blue: '#005eb8', navy: '#003087', sel: '#e8f1f8',
  bg: '#f0f4f5', red: '#d5281b', green: '#007f3b',
};

// Hover-reveal row actions + the parent→child connector lines live in real
// CSS. Each nested level is indented inside .nb-kids, which draws a vertical
// guide; each row in it draws a short horizontal tick joining the guide.
const CSS = `
.nb-row .nb-actions{opacity:0;transition:opacity .12s;}
.nb-row:hover .nb-actions,.nb-row:focus-within .nb-actions{opacity:1;}
.nb-row:hover{background:#f7fbff;}
.nb-kids{margin-left:13px;padding-left:6px;border-left:1.5px solid ${C.line};}
.nb-kids>div>.nb-row{position:relative;}
.nb-kids>div>.nb-row::before{content:"";position:absolute;left:-6px;top:50%;width:5px;height:1.5px;background:${C.line};}
`;

const MAX_DEPTH = 4; // sections + 3 levels of sub-notes keeps the tree sane

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

// The app's standard popup: centered dialog on desktop, bottom sheet on mobile
// (.riva-modal-overlay / .riva-sheet in globals.css — same as the rota's).
function Sheet({ maxWidth = 420, onClose, children }) {
  return (
    <div className="riva-modal-overlay" onClick={onClose}>
      <div className="riva-sheet" style={{ maxWidth: maxWidth + 'px' }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function NotebookPage() {
  const [notes, setNotes] = React.useState([]);
  const [attachments, setAttachments] = React.useState([]);
  const [status, setStatus] = React.useState('loading'); // loading | ready | error
  const [selectedId, setSelectedId] = React.useState(null);
  const [expanded, setExpanded] = React.useState({});      // noteId -> bool
  const [search, setSearch] = React.useState('');
  const [saveState, setSaveState] = React.useState('');     // '' | 'saving' | 'saved' | 'unsaved'
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const [confirmBox, setConfirmBox] = React.useState(null); // { title, message, confirmLabel, onConfirm }
  const [renameBox, setRenameBox] = React.useState(null);   // { id, value } — section rename dialog
  const dragDepth = React.useRef(0);
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

  const byId = React.useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const childrenOf = React.useCallback((id) => notes.filter((n) => n.parentId === id), [notes]);
  const selected = byId.get(selectedId) || null;
  const selectedFiles = attachments.filter((a) => a.noteId === selectedId);

  // Ancestor chain of the selection, root first (breadcrumb-ish highlight + auto-expand).
  const ancestors = React.useMemo(() => {
    const chain = [];
    for (let cur = selected && byId.get(selected.parentId); cur && chain.length < 12; cur = byId.get(cur.parentId)) {
      chain.unshift(cur);
    }
    return chain;
  }, [selected, byId]);

  // Descendants of a note (for delete bookkeeping).
  const descendantIds = React.useCallback((id) => {
    const out = new Set([id]);
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      for (const n of notes) if (frontier.includes(n.parentId) && !out.has(n.id)) { out.add(n.id); next.push(n.id); }
      frontier = next;
    }
    return out;
  }, [notes]);

  // Search: a note matching by title/body keeps its whole ancestor chain visible.
  const q = search.trim().toLowerCase();
  const selfMatch = (n) => !q || (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q);
  const treeMatch = React.useCallback(function treeMatch(n) {
    return selfMatch(n) || childrenOf(n.id).some(treeMatch);
  }, [childrenOf, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = notes.filter((n) => !n.parentId).filter(treeMatch);

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
    setUploadErr('');
    setSelectedId(id);
    // Open the path to the selection so it is always visible in the tree.
    setExpanded((e) => {
      const next = { ...e };
      for (let cur = byId.get(id); cur && cur.parentId; cur = byId.get(cur.parentId)) next[cur.parentId] = true;
      return next;
    });
  }

  async function newNote(parentId) {
    await flush();
    try {
      const res = await fetch('/api/notebook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: parentId ? 'New page' : 'New section', parentId: parentId || null }),
      });
      if (!res.ok) throw new Error('bad status');
      const { note } = await res.json();
      setNotes((ns) => ns.concat([note]));
      if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
      setSelectedId(note.id);
      // A section is only a name — go straight to naming it.
      if (!parentId) setRenameBox({ id: note.id, value: note.title || '' });
    } catch (e) { /* ignore */ }
  }

  // Delete goes through the app's standard confirm dialog (no window.confirm).
  function askRemoveNote(id) {
    const n = byId.get(id);
    const gone = descendantIds(id);
    const kids = gone.size - 1;
    const isSection = n && !n.parentId;
    setConfirmBox({
      title: isSection ? 'Delete section' : 'Delete page',
      message: 'Delete “' + ((n && n.title) || 'Untitled') + '”'
        + (kids ? ' and the ' + kids + ' page' + (kids === 1 ? '' : 's') + ' inside it' : '')
        + '? Attached files are deleted too. This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirmBox(null);
        try {
          await fetch('/api/notebook?id=' + id, { method: 'DELETE' });
          setNotes((ns) => ns.filter((x) => !gone.has(x.id)));
          setAttachments((as) => as.filter((a) => !gone.has(a.noteId)));
          if (gone.has(selectedId)) {
            // Prefer staying near the deleted note: its parent, else the first section.
            const parent = n && n.parentId && !gone.has(n.parentId) ? n.parentId : null;
            if (parent) setSelectedId(parent);
            else {
              const remaining = notes.filter((x) => !gone.has(x.id) && !x.parentId);
              setSelectedId(remaining.length ? remaining[0].id : null);
            }
          }
        } catch (e) { /* ignore */ }
      },
    });
  }

  // Section rename dialog — saves straight away (sections have no autosave body).
  async function saveRename() {
    if (!renameBox) return;
    const { id, value } = renameBox;
    const title = value.trim() || 'Untitled section';
    setRenameBox(null);
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, title } : n)));
    try {
      await fetch('/api/notebook', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }) });
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

  function askRemoveAttachment(a) {
    setConfirmBox({
      title: 'Remove file',
      message: 'Remove “' + a.filename + '”? This cannot be undone.',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setConfirmBox(null);
        try {
          await fetch('/api/notebook/attachments?id=' + a.id, { method: 'DELETE' });
          setAttachments((as) => as.filter((x) => x.id !== a.id));
        } catch (e) { /* ignore */ }
      },
    });
  }

  // Drag-and-drop anywhere on the editor uploads to the open note. Pages only —
  // sections are name-only and hold no files.
  const dropHandlers = selected && selected.parentId ? {
    onDragEnter: (e) => { e.preventDefault(); if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { dragDepth.current++; setDragging(true); } },
    onDragOver: (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); uploadFiles(e.dataTransfer.files); },
  } : {};

  /* ------------------------------ Sidebar ------------------------------ */

  const actBtn = 'flex:none;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;color:' + C.mut + ';border-radius:6px;';

  // One tree row; children render recursively inside .nb-kids, which draws
  // the parent→child connector lines.
  function SideRow({ n, depth }) {
    const isSel = selectedId === n.id;
    const onPath = ancestors.some((a) => a.id === n.id);
    const kids = q ? childrenOf(n.id).filter(treeMatch) : childrenOf(n.id);
    const open = !!expanded[n.id] || (!!q && kids.length > 0);
    const fileCount = attachments.filter((a) => a.noteId === n.id).length;
    return (
      <div>
        <div className="nb-row" style={s('display:flex;align-items:center;gap:2px;border-radius:9px;padding:0 4px;' +
          (isSel ? 'background:' + C.sel + ';' : onPath ? 'background:#f7fbff;' : ''))}>
          {kids.length > 0 ? (
            <Hover tag="button" onClick={() => setExpanded((e) => ({ ...e, [n.id]: !open }))} aria-label={open ? 'Collapse' : 'Expand'}
              base={actBtn + 'width:24px;height:24px;'} hover={'background:' + C.soft + ';'}>
              <Svg w={16} sw={2.4} style={s('transform:rotate(' + (open ? 90 : 0) + 'deg);transition:transform .15s;')}>{Icons.chevronRight}</Svg>
            </Hover>
          ) : (<span style={s('flex:none;width:24px;')} />)}
          <button onClick={() => selectNote(n.id)}
            style={s('flex:1;min-width:0;display:flex;align-items:center;gap:7px;text-align:left;border:none;background:none;font:inherit;font-size:14.5px;cursor:pointer;padding:8px 4px;color:' + (isSel ? C.navy : C.ink) + ';' + (isSel ? 'font-weight:600;' : ''))}>
            <Svg w={17} sw={2} style={s('flex:none;color:' + (isSel ? C.blue : C.mut) + ';')}>{depth === 0 ? Icons.book : Icons.fileLines}</Svg>
            <span style={s('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{n.title || 'Untitled'}</span>
            {fileCount > 0 && <Svg w={13} sw={2.2} style={s('flex:none;color:' + C.dim + ';')}>{Icons.paperclip}</Svg>}
          </button>
          <span className="nb-actions" style={s('flex:none;display:flex;align-items:center;gap:1px;')}>
            {depth === 0 && (
              <Hover tag="button" onClick={() => setRenameBox({ id: n.id, value: n.title || '' })} aria-label="Rename section" title="Rename section"
                base={actBtn} hover={'background:' + C.sel + ';color:' + C.blue + ';'}>
                <Svg w={15} sw={2.2}>{Icons.edit}</Svg>
              </Hover>
            )}
            {depth < MAX_DEPTH - 1 && (
              <Hover tag="button" onClick={() => newNote(n.id)} aria-label={depth === 0 ? 'Add page' : 'Add sub-page'} title={depth === 0 ? 'Add page' : 'Add sub-page'}
                base={actBtn} hover={'background:' + C.sel + ';color:' + C.blue + ';'}>
                <Svg w={16} sw={2.2}>{Icons.plus}</Svg>
              </Hover>
            )}
            <Hover tag="button" onClick={() => askRemoveNote(n.id)} aria-label="Delete" title="Delete"
              base={actBtn} hover={'background:#fbe9e7;color:' + C.red + ';'}>
              <Svg w={16} sw={2.2}>{Icons.trash}</Svg>
            </Hover>
          </span>
        </div>
        {open && kids.length > 0 && (
          <div className="nb-kids">
            {kids.map((k) => <SideRow key={k.id} n={k} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ Render ------------------------------- */

  return (
    <div style={s('display:flex;flex-direction:column;height:100vh;min-height:100vh;background:' + C.bg + ';')}>
      <style>{CSS}</style>
      <AppHeader subtitle="Notebook" />
      <div style={s('flex:1;min-height:0;display:flex;width:100%;')}>

      {/* --------------------------- Sidebar --------------------------- */}
      <aside style={s('flex:none;width:290px;border-right:1px solid ' + C.line + ';background:#fff;display:flex;flex-direction:column;min-height:0;')}>
        <div style={s('flex:none;padding:12px 14px 6px;display:flex;flex-direction:column;gap:10px;')}>
          <div style={s('display:flex;align-items:center;gap:8px;')}>
            <span style={s('flex:1;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + C.mut + ';')}>Sections</span>
            <Hover tag="button" onClick={() => newNote(null)} aria-label="New section" title="New section"
              base={'flex:none;display:inline-flex;align-items:center;gap:6px;background:' + C.blue + ';color:#fff;border:none;border-radius:8px;padding:7px 13px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;'}
              hover={'background:' + C.navy + ';'}>
              <Svg w={14} sw={2.4}>{Icons.plus}</Svg>New
            </Hover>
          </div>
          <div style={s('display:flex;align-items:center;gap:8px;border:1px solid ' + C.line + ';border-radius:9px;padding:7px 10px;background:' + C.bg + ';')}>
            <Svg w={16} sw={2} style={s('flex:none;color:' + C.mut + ';')}>{Icons.search}</Svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes"
              style={s('flex:1;min-width:0;border:none;outline:none;background:none;font:inherit;font-size:14px;color:' + C.ink + ';')} />
            {search && (
              <Hover tag="button" onClick={() => setSearch('')} aria-label="Clear search" base={actBtn + 'width:18px;height:18px;'} hover={'color:' + C.ink + ';'}>
                <Svg w={12} sw={2.4}>{Icons.close}</Svg>
              </Hover>
            )}
          </div>
        </div>

        <div style={s('flex:1;overflow-y:auto;padding:4px 10px 14px;display:flex;flex-direction:column;gap:1px;')}>
          {status === 'loading' && <p style={s('color:' + C.mut + ';font-size:14px;padding:8px 10px;')}>Loading…</p>}
          {status === 'error' && <p style={s('color:' + C.red + ';font-size:14px;padding:8px 10px;')}>Could not load notes. Is the database configured?</p>}
          {status === 'ready' && sections.length === 0 && (
            <p style={s('color:' + C.dim + ';font-size:14px;padding:8px 10px;line-height:1.5;')}>
              {q ? 'No notes match your search.' : 'No sections yet. Create one — e.g. “Instructions” with pages like “How to book appointments”.'}
            </p>
          )}
          {sections.map((n) => <SideRow key={n.id} n={n} depth={0} />)}
        </div>

        <div style={s('flex:none;border-top:1px solid ' + C.soft + ';padding:10px 14px;font-size:12.5px;color:' + C.dim + ';line-height:1.45;')}>
          <span style={s('display:inline-flex;align-items:center;gap:6px;')}>
            <Svg w={13} sw={2.2} stroke={C.green}>{Icons.shield}</Svg>Notes are used by the assistant automatically.
          </span>
        </div>
      </aside>

      {/* ---------------------------- Editor ---------------------------- */}
      <main style={s('flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;position:relative;')} {...dropHandlers}>
        {!selected && (
          <div style={s('flex:1;display:flex;align-items:center;justify-content:center;color:' + C.dim + ';font-size:16px;text-align:center;padding:24px;')}>
            <div>
              <div style={s('margin-bottom:8px;')}><Svg w={30} stroke="#a3b1ba" sw={1.8}>{Icons.book}</Svg></div>
              Select a note, or create one to get started.
            </div>
          </div>
        )}
        {/* Section view — a section is a name that groups pages; nothing is
            written on it. Rename and delete go through the standard dialogs. */}
        {selected && !selected.parentId && (
          <div style={s('flex:1;min-height:0;display:flex;flex-direction:column;width:100%;max-width:1000px;margin:0 auto;padding:20px 28px 20px;')}>
            <div style={s('flex:none;display:flex;align-items:center;gap:10px;')}>
              <Svg w={22} sw={2} style={s('flex:none;color:' + C.blue + ';')}>{Icons.book}</Svg>
              <h1 style={s('flex:1;min-width:0;margin:0;font-size:25px;font-weight:700;letter-spacing:-0.01em;color:' + C.ink + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>
                {selected.title || 'Untitled section'}
              </h1>
              <Hover tag="button" onClick={() => setRenameBox({ id: selected.id, value: selected.title || '' })} aria-label="Rename section" title="Rename section"
                base={'flex:none;display:inline-flex;align-items:center;gap:7px;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;padding:8px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;color:' + C.mut + ';'}
                hover={'border-color:' + C.blue + ';color:' + C.blue + ';'}>
                <Svg w={15} sw={2.2}>{Icons.edit}</Svg>Rename
              </Hover>
              <Hover tag="button" onClick={() => askRemoveNote(selected.id)} aria-label="Delete section" title="Delete section"
                base={'flex:none;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;cursor:pointer;color:' + C.mut + ';'}
                hover={'border-color:' + C.red + ';color:' + C.red + ';'}>
                <Svg w={16} sw={2}>{Icons.trash}</Svg>
              </Hover>
            </div>

            <div style={s('flex:1;min-height:0;overflow-y:auto;margin-top:10px;')}>
              <div style={s('border:1px solid ' + C.line + ';border-radius:12px;background:#fff;padding:18px 20px;')}>
                <p style={s('margin:0 0 14px;font-size:14.5px;line-height:1.55;color:' + C.mut + ';')}>
                  A section is just a name that groups pages — writing happens on its pages.
                </p>
                {childrenOf(selected.id).length === 0 && (
                  <p style={s('margin:0 0 14px;font-size:14.5px;color:' + C.dim + ';')}>No pages yet.</p>
                )}
                {childrenOf(selected.id).map((k) => {
                  const firstLine = (k.body || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
                  return (
                    <Hover key={k.id} tag="button" onClick={() => selectNote(k.id)}
                      base={'display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid ' + C.soft + ';background:' + C.bg + ';border-radius:10px;padding:11px 14px;margin:0 0 8px;font:inherit;cursor:pointer;'}
                      hover={'border-color:' + C.blue + ';background:' + C.sel + ';'}>
                      <Svg w={16} sw={2} style={s('flex:none;color:' + C.mut + ';')}>{Icons.fileLines}</Svg>
                      <span style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;')}>
                        <span style={s('font-size:14.5px;font-weight:600;color:' + C.ink + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{k.title || 'Untitled'}</span>
                        {firstLine && <span style={s('font-size:13px;color:' + C.dim + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{firstLine.slice(0, 120)}</span>}
                      </span>
                      <Svg w={14} sw={2.2} style={s('flex:none;color:' + C.dim + ';')}>{Icons.chevronRight}</Svg>
                    </Hover>
                  );
                })}
                <Hover tag="button" onClick={() => newNote(selected.id)}
                  base={'display:inline-flex;align-items:center;gap:7px;background:' + C.blue + ';color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px;'}
                  hover={'background:' + C.navy + ';'}>
                  <Svg w={14} sw={2.4}>{Icons.plus}</Svg>Add page
                </Hover>
              </div>
            </div>
          </div>
        )}

        {/* Page editor — pages carry the writing and the files. */}
        {selected && !!selected.parentId && (
          <div style={s('flex:1;min-height:0;display:flex;flex-direction:column;width:100%;max-width:1000px;margin:0 auto;padding:20px 28px 20px;')}>
            {/* Title row */}
            <div style={s('flex:none;display:flex;align-items:center;gap:10px;')}>
              <input
                value={selected.title || ''}
                onChange={(e) => editSelected({ title: e.target.value })}
                placeholder="Page title"
                style={s('flex:1;min-width:0;font:inherit;font-size:25px;font-weight:700;letter-spacing:-0.01em;border:none;outline:none;background:none;color:' + C.ink + ';')}
              />
              <span style={s('flex:none;font-size:13px;min-width:64px;text-align:right;color:' + (saveState === 'unsaved' ? C.red : C.dim) + ';')}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'unsaved' ? 'Not saved' : ''}
              </span>
              <input ref={fileInput} type="file" multiple style={s('display:none;')} onChange={(e) => uploadFiles(e.target.files)} />
              <Hover tag="button" onClick={() => fileInput.current && fileInput.current.click()} disabled={uploading} aria-label="Attach files" title="Attach files (or drag and drop onto the page)"
                base={'flex:none;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;cursor:pointer;color:' + C.mut + ';' + (uploading ? 'opacity:.6;' : '')}
                hover={'border-color:' + C.blue + ';color:' + C.blue + ';'}>
                <Svg w={16} sw={2}>{Icons.paperclip}</Svg>
              </Hover>
              <Hover tag="button" onClick={() => askRemoveNote(selected.id)} aria-label="Delete page" title="Delete page"
                base={'flex:none;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;cursor:pointer;color:' + C.mut + ';'}
                hover={'border-color:' + C.red + ';color:' + C.red + ';'}>
                <Svg w={16} sw={2}>{Icons.trash}</Svg>
              </Hover>
            </div>

            {/* Body — fills the page; attachments dock below and never push it down. */}
            <textarea
              value={selected.body || ''}
              onChange={(e) => editSelected({ body: e.target.value })}
              placeholder="Write your note here. Plain text or markdown. Drag files onto the page to attach them. Anything you write is used by the assistant to answer and to triage — for example ‘Sore throat → signpost to Pharmacy First’."
              style={s('flex:1;min-height:0;width:100%;resize:none;font:inherit;font-size:16px;line-height:1.65;border:1px solid ' + C.line + ';border-radius:12px;background:#fff;padding:18px 20px;outline:none;color:' + C.ink + ';margin-top:10px;')}
            />

            {/* Attachments — docked at the bottom of the page. */}
            {(selectedFiles.length > 0 || uploadErr || uploading) && (
              <div style={s('flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 2px 0;')}>
                {selectedFiles.map((a) => (
                  <span key={a.id} style={s('display:inline-flex;align-items:center;gap:7px;border:1px solid ' + C.line + ';border-radius:99px;background:#fff;padding:5px 6px 5px 11px;max-width:280px;')}>
                    <Svg w={14} sw={2} style={s('flex:none;color:' + C.blue + ';')}>{(a.contentType || '').startsWith('image/') ? Icons.image : Icons.file}</Svg>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.filename + (a.size ? ' · ' + fmtSize(a.size) : '')}
                      style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:600;color:' + C.ink + ';text-decoration:none;')}>
                      {a.filename}
                    </a>
                    <Hover tag="button" onClick={() => askRemoveAttachment(a)} aria-label={'Remove ' + a.filename} title="Remove"
                      base={'flex:none;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:none;background:' + C.soft + ';border-radius:99px;cursor:pointer;color:' + C.mut + ';'}
                      hover={'background:#fbe9e7;color:' + C.red + ';'}>
                      <Svg w={12} sw={2.6}>{Icons.close}</Svg>
                    </Hover>
                  </span>
                ))}
                {uploading && <span style={s('font-size:13px;color:' + C.dim + ';')}>Uploading…</span>}
                {uploadErr && <span style={s('font-size:13px;color:' + C.red + ';')}>{uploadErr}</span>}
              </div>
            )}
          </div>
        )}

        {/* Drop overlay */}
        {dragging && selected && !!selected.parentId && (
          <div style={s('position:absolute;inset:10px;border:2.5px dashed ' + C.blue + ';border-radius:14px;background:rgba(232,241,248,.85);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5;')}>
            <div style={s('display:flex;align-items:center;gap:10px;font-size:17px;font-weight:600;color:' + C.navy + ';')}>
              <Svg w={22} sw={2.2}>{Icons.paperclip}</Svg>
              Drop files to attach to “{selected.title || 'Untitled'}”
            </div>
          </div>
        )}
      </main>
      </div>

      {/* Standard confirm dialog (same pattern as the rota's). */}
      {confirmBox && (
        <Sheet maxWidth={420} onClose={() => setConfirmBox(null)}>
          <div style={s('padding:24px 24px 8px;')}>
            <h2 style={s('font-size:21px;font-weight:700;margin:0 0 8px;')}>{confirmBox.title}</h2>
            <p style={s('font-size:16px;line-height:1.5;margin:0;color:' + C.mut + ';')}>{confirmBox.message}</p>
          </div>
          <div style={s('display:flex;gap:10px;padding:16px 24px 22px;')}>
            <Hover tag="button" onClick={confirmBox.onConfirm}
              base={'font-family:inherit;font-size:16px;font-weight:700;color:#fff;background:' + C.red + ';border:none;border-radius:8px;padding:11px 22px;cursor:pointer;box-shadow:0 4px 0 #7a160d;'}
              active="transform:translateY(4px);box-shadow:none;">{confirmBox.confirmLabel}</Hover>
            <Hover tag="button" onClick={() => setConfirmBox(null)}
              base={'font-family:inherit;font-size:16px;font-weight:600;color:' + C.mut + ';background:transparent;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;'}
              hover={'color:' + C.ink + ';'}>Cancel</Hover>
          </div>
        </Sheet>
      )}

      {/* Rename-section dialog. */}
      {renameBox && (
        <Sheet maxWidth={420} onClose={() => setRenameBox(null)}>
          <div style={s('padding:24px 24px 8px;')}>
            <h2 style={s('font-size:21px;font-weight:700;margin:0 0 8px;')}>Rename section</h2>
            <input
              autoFocus
              value={renameBox.value}
              onChange={(e) => setRenameBox((r) => ({ ...r, value: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenameBox(null); }}
              placeholder="Section name"
              style={s('width:100%;font:inherit;font-size:16px;padding:10px 12px;border:2px solid ' + C.mut + ';border-radius:4px;background:#fff;outline:none;color:' + C.ink + ';')}
            />
          </div>
          <div style={s('display:flex;gap:10px;padding:16px 24px 22px;')}>
            <Hover tag="button" onClick={saveRename}
              base={'font-family:inherit;font-size:16px;font-weight:700;color:#fff;background:' + C.green + ';border:none;border-radius:8px;padding:11px 22px;cursor:pointer;box-shadow:0 4px 0 #003419;'}
              active="transform:translateY(4px);box-shadow:none;">Save</Hover>
            <Hover tag="button" onClick={() => setRenameBox(null)}
              base={'font-family:inherit;font-size:16px;font-weight:600;color:' + C.mut + ';background:transparent;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;'}
              hover={'color:' + C.ink + ';'}>Cancel</Hover>
          </div>
        </Sheet>
      )}
    </div>
  );
}
