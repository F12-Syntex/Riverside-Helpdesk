'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Notebook — a simple OneNote-style store of practice notes.
 *
 * Top-level notes act like sections; each can hold sub-notes. Notes save
 * automatically and are used by the assistant for reasoning/referencing
 * (the /api/ask route pulls them in as citable sources at request time).
 * ------------------------------------------------------------------ */

export default function NotebookPage() {
  const [notes, setNotes] = React.useState([]);
  const [status, setStatus] = React.useState('loading'); // loading | ready | error
  const [selectedId, setSelectedId] = React.useState(null);
  const [expanded, setExpanded] = React.useState({});     // parentId -> bool
  const [saveState, setSaveState] = React.useState('');    // '' | 'saving' | 'saved'
  const timer = React.useRef(null);
  const pending = React.useRef(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notebook');
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        const list = Array.isArray(data.notes) ? data.notes : [];
        setNotes(list);
        setStatus('ready');
        if (list.length) setSelectedId((list.find((n) => !n.parentId) || list[0]).id);
      } catch (e) {
        setStatus('error');
      }
    })();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const topLevel = notes.filter((n) => !n.parentId);
  const childrenOf = (id) => notes.filter((n) => n.parentId === id);
  const selected = notes.find((n) => n.id === selectedId) || null;

  async function flush() {
    if (!pending.current) return;
    const body = pending.current;
    pending.current = null;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    try {
      setSaveState('saving');
      await fetch('/api/notebook', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setSaveState('saved');
      setTimeout(() => setSaveState((s2) => (s2 === 'saved' ? '' : s2)), 1500);
    } catch (e) {
      setSaveState('');
    }
  }

  function scheduleSave(id, patch) {
    pending.current = { id, ...(pending.current && pending.current.id === id ? pending.current : {}), ...patch, id };
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }

  function editSelected(patch) {
    setNotes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, ...patch } : n)));
    scheduleSave(selectedId, patch);
  }

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
    const msg = 'Delete "' + (n ? n.title : 'this note') + '"' + (kids ? ' and its ' + kids + ' sub-note(s)' : '') + '? This cannot be undone.';
    if (!window.confirm(msg)) return;
    try {
      await fetch('/api/notebook?id=' + id, { method: 'DELETE' });
      setNotes((ns) => ns.filter((x) => x.id !== id && x.parentId !== id));
      if (selectedId === id || notes.find((x) => x.id === selectedId)?.parentId === id) {
        setSelectedId((prev) => {
          const remaining = notes.filter((x) => x.id !== id && x.parentId !== id && !x.parentId);
          return remaining.length ? remaining[0].id : null;
        });
      }
    } catch (e) { /* ignore */ }
  }

  const rowBase = 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:none;background:none;font:inherit;cursor:pointer;border-radius:8px;padding:9px 10px;color:#212b32;';
  const rowSel = 'background:#e8f1f8;color:#003087;font-weight:600;';

  function NoteRow({ n, child }) {
    const kids = childrenOf(n.id);
    const isSel = selectedId === n.id;
    const open = !!expanded[n.id];
    return (
      <div>
        <div style={s('display:flex;align-items:center;gap:2px;' + (child ? 'padding-left:18px;' : ''))}>
          {!child && kids.length > 0 ? (
            <Hover tag="button" onClick={() => setExpanded((e) => ({ ...e, [n.id]: !open }))} aria-label={open ? 'Collapse' : 'Expand'}
              base="flex:none;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;color:#768692;border-radius:6px;" hover="background:#eef1f2;">
              <Svg w={14} sw={2.4} style={s('transform:rotate(' + (open ? 90 : 0) + 'deg);transition:transform .15s;')}>{Icons.chevronRight}</Svg>
            </Hover>
          ) : (<span style={s('flex:none;width:22px;')} />)}
          <Hover tag="button" onClick={() => selectNote(n.id)} base={rowBase + 'flex:1;min-width:0;' + (isSel ? rowSel : '')} hover={isSel ? '' : 'background:#f7fbff;'}>
            <Svg w={15} sw={2} style={s('flex:none;color:#768692;')}>{child ? Icons.fileLines : Icons.book}</Svg>
            <span style={s('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{n.title || 'Untitled note'}</span>
          </Hover>
          {!child && (
            <Hover tag="button" onClick={() => newNote(n.id)} aria-label="Add sub-note" title="Add sub-note"
              base="flex:none;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;color:#768692;border-radius:6px;" hover="background:#e8f1f8;color:#005eb8;">
              <Svg w={15} sw={2.2}>{Icons.plus}</Svg>
            </Hover>
          )}
        </div>
        {!child && open && kids.map((k) => <NoteRow key={k.id} n={k} child />)}
      </div>
    );
  }

  return (
    <div style={s('display:flex;flex-direction:column;height:100vh;min-height:100vh;background:#f0f4f5;')}>
      <AppHeader subtitle="Notebook" />

      <div style={s('flex:1;min-height:0;display:flex;max-width:1100px;width:100%;margin:0 auto;')}>
        {/* Sidebar */}
        <aside className="riva-nb-side" style={s('flex:none;width:300px;border-right:1px solid #d8dde0;background:#fff;display:flex;flex-direction:column;min-height:0;')}>
          <div style={s('flex:none;padding:16px 16px 10px;')}>
            <Hover tag="button" onClick={() => newNote(null)} base="display:inline-flex;align-items:center;gap:8px;width:100%;justify-content:center;background:#005eb8;color:#fff;border:none;border-radius:10px;padding:11px 14px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;" hover="background:#003087;">
              <Svg w={17} sw={2.2}>{Icons.plus}</Svg>New note
            </Hover>
          </div>
          <div style={s('flex:1;overflow-y:auto;padding:0 10px 16px;')}>
            {status === 'loading' && <p style={s('color:#4c6272;font-size:15px;padding:10px 12px;')}>Loading…</p>}
            {status === 'error' && <p style={s('color:#d5281b;font-size:15px;padding:10px 12px;')}>Could not load notes. Is the database configured?</p>}
            {status === 'ready' && topLevel.length === 0 && <p style={s('color:#768692;font-size:15px;padding:10px 12px;line-height:1.5;')}>No notes yet. Create one — for example an “Instructions” note with sub-notes like “How to book appointments”.</p>}
            {topLevel.map((n) => <NoteRow key={n.id} n={n} />)}
          </div>
          <div style={s('flex:none;border-top:1px solid #eef1f2;padding:12px 16px;font-size:12.5px;color:#768692;line-height:1.45;')}>
            <span style={s('display:inline-flex;align-items:center;gap:6px;')}><Svg w={13} sw={2.2} stroke="#007f3b">{Icons.shield}</Svg>Notes here are used by the assistant automatically.</span>
          </div>
        </aside>

        {/* Editor */}
        <main style={s('flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;')}>
          {!selected && (
            <div style={s('flex:1;display:flex;align-items:center;justify-content:center;color:#768692;font-size:16px;text-align:center;padding:24px;')}>
              <div>
                <div style={s('margin-bottom:8px;')}><Svg w={30} stroke="#a3b1ba" sw={1.8}>{Icons.book}</Svg></div>
                Select a note, or create one to get started.
              </div>
            </div>
          )}
          {selected && (
            <>
              <div style={s('flex:none;display:flex;align-items:center;gap:12px;padding:16px 24px 6px;')}>
                <input
                  value={selected.title || ''}
                  onChange={(e) => editSelected({ title: e.target.value })}
                  placeholder="Note title"
                  style={s('flex:1;min-width:0;font:inherit;font-size:24px;font-weight:700;letter-spacing:-0.01em;border:none;outline:none;background:none;color:#212b32;')}
                />
                <span style={s('flex:none;font-size:13px;color:#768692;min-width:52px;text-align:right;')}>
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
                </span>
                <Hover tag="button" onClick={() => removeNote(selected.id)} aria-label="Delete note" title="Delete note"
                  base="flex:none;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:1px solid #d8dde0;background:#fff;border-radius:9px;cursor:pointer;color:#4c6272;" hover="border-color:#d5281b;color:#d5281b;">
                  <Svg w={17} sw={2}>{Icons.trash}</Svg>
                </Hover>
              </div>
              <div style={s('flex:1;min-height:0;padding:6px 24px 20px;display:flex;')}>
                <textarea
                  value={selected.body || ''}
                  onChange={(e) => editSelected({ body: e.target.value })}
                  placeholder="Write your note here. Plain text or markdown. Anything you write is used by the assistant to answer and to triage — for example ‘Sore throat → signpost to Pharmacy First’."
                  style={s('flex:1;width:100%;resize:none;font:inherit;font-size:16px;line-height:1.6;border:1px solid #d8dde0;border-radius:12px;background:#fff;padding:16px 18px;outline:none;color:#212b32;')}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
