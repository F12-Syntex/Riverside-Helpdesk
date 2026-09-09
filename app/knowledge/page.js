'use client';

import React from 'react';
import AppHeader from '../_components/AppHeader';
import { s, Hover } from '../_components/ui';

const FIELD = 'width:100%;box-sizing:border-box;font:inherit;font-size:16px;border:2px solid #4c6272;border-radius:5px;padding:10px 12px;background:#fff;color:#212b32;';
const BTN = 'font:inherit;font-weight:700;border:none;border-radius:7px;padding:10px 16px;cursor:pointer;';
const KIND = { document: 'Document', note: 'Practice note', contact: 'Contact' };

function Editor({ value, onClose, onSaved }) {
  const [draft, setDraft] = React.useState(() => value || { kind: 'note', title: '', content: '', authority: 90, data: {} });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const contact = draft.kind === 'contact';
  const phones = (draft.data?.phones || []).map((p) => `${p.display || p.tel}|${p.tel || p.display}`).join('\n');
  const emails = (draft.data?.emails || []).join('\n');
  const set = (key, v) => setDraft((d) => ({ ...d, [key]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    let data = draft.data || {};
    let content = draft.content || '';
    if (contact) {
      const phoneRows = String(draft._phones ?? phones).split(/\n/).map((x) => x.trim()).filter(Boolean).map((line) => {
        const [display, tel] = line.split('|'); return { display: display.trim(), tel: String(tel || display).replace(/\D/g, '') };
      });
      const emailRows = String(draft._emails ?? emails).split(/\n/).map((x) => x.trim()).filter(Boolean);
      data = { ...data, phones: phoneRows, emails: emailRows };
      content = [draft.title, ...phoneRows.map((p) => p.display), ...emailRows].join('\n');
    }
    try {
      const res = await fetch('/api/knowledge', { method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, content, data }) });
      const out = await res.json(); if (!res.ok) throw new Error(out.error || 'Save failed');
      onSaved(out.entry);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div style={s('position:fixed;inset:0;z-index:90;background:rgba(33,43,50,.48);display:flex;justify-content:flex-end;')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <form onSubmit={save} style={s('width:min(680px,100%);height:100%;overflow:auto;background:#fff;padding:28px;box-shadow:-8px 0 30px rgba(0,0,0,.18);')}>
      <div style={s('display:flex;align-items:start;gap:16px;margin-bottom:22px;')}><div style={s('flex:1;')}><h2 style={s('margin:0;font-size:25px;')}>{draft.id ? 'Edit knowledge' : 'Add knowledge'}</h2><p style={s('margin:4px 0 0;color:#4c6272;')}>Saving reindexes this item and checks its claims for contradictions.</p></div><button type="button" onClick={onClose} style={s(BTN + 'background:#e8edee;color:#212b32;')}>Close</button></div>
      <label style={s('display:block;font-weight:700;margin-bottom:16px;')}>Type<select value={draft.kind} onChange={(e) => set('kind', e.target.value)} style={s(FIELD + 'margin-top:6px;')}><option value="note">Practice note</option><option value="contact">Contact</option><option value="document">Document</option></select></label>
      <label style={s('display:block;font-weight:700;margin-bottom:16px;')}>Title<input required value={draft.title} onChange={(e) => set('title', e.target.value)} style={s(FIELD + 'margin-top:6px;')} /></label>
      {contact ? <>
        <label style={s('display:block;font-weight:700;margin-bottom:16px;')}>Telephone numbers <span style={s('font-weight:400;color:#4c6272;')}>(one per line: display|digits)</span><textarea rows={6} value={draft._phones ?? phones} onChange={(e) => set('_phones', e.target.value)} style={s(FIELD + 'margin-top:6px;resize:vertical;')} /></label>
        <label style={s('display:block;font-weight:700;margin-bottom:16px;')}>Email addresses <span style={s('font-weight:400;color:#4c6272;')}>(one per line)</span><textarea rows={4} value={draft._emails ?? emails} onChange={(e) => set('_emails', e.target.value)} style={s(FIELD + 'margin-top:6px;resize:vertical;')} /></label>
      </> : <label style={s('display:block;font-weight:700;margin-bottom:16px;')}>Source text<textarea required rows={18} value={draft.content || ''} onChange={(e) => set('content', e.target.value)} style={s(FIELD + 'margin-top:6px;resize:vertical;line-height:1.5;')} /></label>}
      <label style={s('display:block;font-weight:700;margin-bottom:18px;')}>Authority: {draft.authority ?? 50}<input type="range" min="0" max="100" value={draft.authority ?? 50} onChange={(e) => set('authority', Number(e.target.value))} style={s('width:100%;margin-top:8px;')} /><span style={s('display:flex;justify-content:space-between;font-size:13px;color:#4c6272;')}><span>Reference only</span><span>Current practice instruction</span></span></label>
      {error && <p role="alert" style={s('color:#d5281b;font-weight:700;')}>{error}</p>}
      <button disabled={busy} style={s(BTN + 'background:#007f3b;color:#fff;min-width:150px;')}>{busy ? 'Saving and checking…' : 'Save knowledge'}</button>
    </form>
  </div>;
}

export default function KnowledgePage() {
  const [tab, setTab] = React.useState('library');
  const [entries, setEntries] = React.useState([]);
  const [conflicts, setConflicts] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState('');
  const [editor, setEditor] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [metrics, setMetrics] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([fetch(`/api/knowledge?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(query)}`).then((r) => r.json()), fetch('/api/knowledge/conflicts').then((r) => r.json()), fetch('/api/knowledge/status').then((r) => r.json())]);
      setEntries(a.entries || []); setConflicts(b.conflicts || []); setMetrics(c.status || null);
    } finally { setLoading(false); }
  }, [kind, query]);
  React.useEffect(() => { const t = setTimeout(load, 180); return () => clearTimeout(t); }, [load]);
  const sync = async () => {
    setStatus('Migrating contacts, documents and Notebook pages…');
    try { const r = await fetch('/api/knowledge/sync', { method: 'POST' }); const x = await r.json(); if (!r.ok) throw new Error(x.error); setStatus(x.summary.unchanged ? 'Knowledge is already current.' : `Reconciled ${x.summary.documents} documents, ${x.summary.notes} notes and ${x.summary.contacts} contacts.`); await load(); }
    catch (e) { setStatus(`Migration failed: ${e.message}`); }
  };
  const analyse = async () => {
    setStatus('Analysing sources and comparing claims…'); let total = 0;
    try {
      for (let batch = 0; batch < 500; batch++) { const r = await fetch('/api/knowledge/analyse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const x = await r.json(); if (!r.ok) throw new Error(x.error); total += (x.processed || []).length; setStatus(`Analysed ${total} sources…`); if (!x.remaining) break; }
      setStatus(`Analysis complete: ${total} sources checked.`); await load(); setTab('conflicts');
    } catch (e) { setStatus(`Analysis stopped: ${e.message}`); }
  };
  const resolve = async (id, state) => { await fetch('/api/knowledge/conflicts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: state }) }); await load(); };
  const editById = async (id) => { const found = entries.find((e) => e.id === id); if (found) { setEditor(found); return; } try { const data = await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`).then((r) => r.json()); if (data.entry) setEditor(data.entry); } catch (e) { setStatus('Could not open that source.'); } };
  return <div style={s('min-height:100vh;background:#f0f4f5;')}>
    <AppHeader subtitle="Knowledge manager" />
    <main style={s('max-width:1120px;margin:0 auto;padding:34px 22px 70px;')}>
      <div style={s('display:flex;gap:20px;align-items:end;justify-content:space-between;flex-wrap:wrap;margin-bottom:24px;')}><div><h1 style={s('font-size:32px;margin:0 0 5px;')}>One source of truth</h1><p style={s('margin:0;color:#4c6272;font-size:17px;')}>Documents, practice notes and contacts—searched together, corrected here.</p></div><div style={s('display:flex;gap:10px;flex-wrap:wrap;')}><Hover tag="button" onClick={sync} base={BTN + 'background:#005eb8;color:#fff;'} hover="background:#003087;">Sync all sources</Hover><Hover tag="button" onClick={analyse} base={BTN + 'background:#fff;color:#005eb8;border:2px solid #005eb8;'} hover="background:#e8f1f8;">Analyse contradictions</Hover></div></div>
      {status && <div style={s('background:#e8f1f8;border-left:5px solid #005eb8;padding:12px 15px;margin-bottom:20px;')}>{status}</div>}
      {metrics && <div style={s('display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-bottom:20px;')}>{[
        ['Active sources', metrics.entries], ['Searchable passages', metrics.passages], ['Verified claims', metrics.verifiedClaims], ['Awaiting analysis', metrics.pendingAnalysis],
      ].map(([label, value]) => <div key={label} style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;padding:12px;')}><strong style={s('display:block;font-size:22px;')}>{value}</strong><span style={s('font-size:13px;color:#4c6272;')}>{label}</span></div>)}</div>}
      <div style={s('display:flex;gap:4px;border-bottom:1px solid #aeb7bd;margin-bottom:20px;')}><button onClick={() => setTab('library')} style={s(BTN + `border-radius:7px 7px 0 0;background:${tab === 'library' ? '#fff' : 'transparent'};color:#005eb8;`)}>Library ({entries.length})</button><button onClick={() => setTab('conflicts')} style={s(BTN + `border-radius:7px 7px 0 0;background:${tab === 'conflicts' ? '#fff' : 'transparent'};color:${conflicts.length ? '#d5281b' : '#005eb8'};`)}>Contradictions ({conflicts.length})</button></div>
      {tab === 'library' ? <>
        <div style={s('display:grid;grid-template-columns:minmax(220px,1fr) 190px auto;gap:10px;margin-bottom:18px;')}><input aria-label="Search knowledge" placeholder="Search all knowledge" value={query} onChange={(e) => setQuery(e.target.value)} style={s(FIELD)} /><select value={kind} onChange={(e) => setKind(e.target.value)} style={s(FIELD)}><option value="">All types</option><option value="document">Documents</option><option value="note">Practice notes</option><option value="contact">Contacts</option></select><button onClick={() => setEditor('new')} style={s(BTN + 'background:#007f3b;color:#fff;')}>Add item</button></div>
        {loading ? <p>Loading…</p> : <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:13px;')}>{entries.map((e) => <article key={e.id} style={s('background:#fff;border:1px solid #d8dde0;border-radius:10px;padding:17px;display:flex;flex-direction:column;gap:8px;')}><div style={s('display:flex;justify-content:space-between;gap:10px;')}><span style={s('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#4c6272;')}>{KIND[e.kind]}{e.claimsStale ? ' · analysis pending' : ''}</span><span style={s('font-size:13px;color:#4c6272;')}>Authority {e.authority}</span></div><h2 style={s('font-size:19px;margin:0;')}>{e.title}</h2><p style={s('margin:0;color:#4c6272;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;')}>{e.kind === 'contact' ? [...(e.data?.phones || []).map((p) => p.display), ...(e.data?.emails || [])].join(' · ') : e.content}</p><div style={s('margin-top:auto;padding-top:7px;display:flex;justify-content:space-between;align-items:center;')}><span style={s('font-size:13px;color:#768692;')}>{e.passages} searchable passage{e.passages === 1 ? '' : 's'}</span><button onClick={() => setEditor(e)} style={s(BTN + 'padding:7px 12px;background:#e8f1f8;color:#005eb8;')}>Edit</button></div></article>)}</div>}
      </> : <div>{!conflicts.length ? <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:10px;padding:28px;')}><h2 style={s('margin:0 0 6px;')}>No open contradictions</h2><p style={s('margin:0;color:#4c6272;')}>New or changed sources are checked automatically.</p></div> : conflicts.map((c) => <article key={c.id} style={s('background:#fff;border-left:6px solid #d5281b;border-radius:8px;padding:20px;margin-bottom:14px;')}><h2 style={s('font-size:19px;margin:0 0 6px;')}>{c.subject}: {c.predicate}</h2><p style={s('margin:0 0 13px;color:#4c6272;line-height:1.45;')}>{c.reason} · {Math.round(Number(c.confidence || 0) * 100)}% confidence</p><div style={s('display:grid;grid-template-columns:1fr 1fr;gap:12px;')}><div style={s('background:#f0f4f5;padding:13px;border-radius:6px;')}><strong>{c.titleA}</strong><p style={s('margin:7px 0;')}>{c.valueA}</p>{c.quoteA && <blockquote style={s('margin:7px 0 11px;padding-left:9px;border-left:3px solid #768692;color:#4c6272;')}>{c.quoteA}</blockquote>}<button onClick={() => editById(c.entryA)} style={s(BTN + 'padding:7px 10px;background:#fff;color:#005eb8;')}>Edit this source</button></div><div style={s('background:#f0f4f5;padding:13px;border-radius:6px;')}><strong>{c.titleB}</strong><p style={s('margin:7px 0;')}>{c.valueB}</p>{c.quoteB && <blockquote style={s('margin:7px 0 11px;padding-left:9px;border-left:3px solid #768692;color:#4c6272;')}>{c.quoteB}</blockquote>}<button onClick={() => editById(c.entryB)} style={s(BTN + 'padding:7px 10px;background:#fff;color:#005eb8;')}>Edit this source</button></div></div><div style={s('display:flex;gap:10px;margin-top:13px;')}><button onClick={() => resolve(c.id, 'resolved')} style={s(BTN + 'background:#007f3b;color:#fff;')}>Mark resolved</button><button onClick={() => resolve(c.id, 'ignored')} style={s(BTN + 'background:#e8edee;color:#212b32;')}>Not a real conflict</button></div></article>)}</div>}
    </main>
    {editor && <Editor value={editor === 'new' ? null : editor} onClose={() => setEditor(false)} onSaved={() => { setEditor(false); load(); }} />}
  </div>;
}
