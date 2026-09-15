'use client';

/* ------------------------------------------------------------------ *
 * Notebook saves — the whole notebook at a moment, and the way back.
 *
 * A save is every page and attachment record as one JSON document, kept
 * in Postgres (notebook_snapshots). Loading one REPLACES the notebook
 * with what it held; because a load saves the state it is about to
 * discard first, the load can itself be undone from the row above it.
 *
 * A save and the file /api/notebook/export downloads are the same
 * thing, so Download here writes a file that Import here takes back —
 * on this deployment or any other. Import only adds the file to the
 * list; nothing changes in the notebook until the save is loaded.
 *
 * The additive door is still /api/notebook/import (Import in the
 * notebook sidebar): that one adds a backup's pages alongside what is
 * already there. This page is the destructive, exact one.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../../_components/ui';
import AppHeader from '../../_components/AppHeader';

const C = {
  ink: '#212b32', mut: '#4c6272', dim: '#768692', line: '#d8dde0',
  soft: '#eef1f2', blue: '#005eb8', navy: '#003087', sel: '#e8f1f8',
  bg: '#f0f4f5', red: '#d5281b', green: '#007f3b',
};

const KINDS = {
  manual: { label: 'Saved', tone: C.blue, bg: C.sel },
  auto: { label: 'Before a load', tone: '#8a6d00', bg: '#fff4d6' },
  import: { label: 'Imported file', tone: C.green, bg: '#eef7ee' },
};

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Sheet({ onClose, children, maxWidth = 460 }) {
  return (
    <div className="riva-modal-overlay" onClick={onClose}>
      <div className="riva-sheet" style={{ maxWidth: maxWidth + 'px' }} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// Same confirmation sheet as the notebook itself, so a destructive action
// looks the same wherever it is asked for.
function ConfirmSheet({ confirm, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <div style={s('padding:26px 26px 8px;')}>
        <h2 style={s('font-size:21px;font-weight:700;margin:0 0 8px;color:' + C.ink + ';')}>{confirm.title}</h2>
        <p style={s('font-size:16px;line-height:1.5;margin:0;color:' + C.mut + ';white-space:pre-line;')}>{confirm.message}</p>
      </div>
      <div style={s('display:flex;align-items:center;gap:10px;padding:20px 26px 24px;')}>
        <Hover tag="button" onClick={confirm.onConfirm}
          base={'font-family:inherit;font-size:16px;font-weight:700;color:#fff;background:' + (confirm.tone || C.red) + ';border:none;border-radius:8px;padding:11px 22px;cursor:pointer;box-shadow:0 4px 0 ' + (confirm.shadow || '#7a160d') + ';'}
          active="transform:translateY(4px);box-shadow:none;">{confirm.confirmLabel || 'Confirm'}</Hover>
        {!confirm.soleButton && (
          <Hover tag="button" onClick={onClose}
            base={'font-family:inherit;font-size:16px;font-weight:600;color:' + C.mut + ';background:transparent;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;'}
            hover={'color:' + C.ink + ';'}>Cancel</Hover>
        )}
      </div>
    </Sheet>
  );
}

const BTN = 'display:inline-flex;align-items:center;gap:7px;border-radius:8px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:9px 15px;';
const GHOST = BTN + 'border:1px solid ' + C.line + ';background:#fff;color:' + C.mut + ';';
const GHOST_HOVER = 'border-color:' + C.blue + ';color:' + C.blue + ';';

export default function NotebookSavesPage() {
  const [snapshots, setSnapshots] = React.useState([]);
  const [status, setStatus] = React.useState('loading'); // loading | ready | error
  const [busy, setBusy] = React.useState('');             // what is running, for the buttons
  const [note, setNote] = React.useState(null);           // { tone, text }
  const [label, setLabel] = React.useState('');
  const [confirm, setConfirm] = React.useState(null);
  const fileInput = React.useRef(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/notebook/snapshots');
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  function fail(text) { setNote({ tone: C.red, text }); }
  function done(text) { setNote({ tone: C.green, text }); }

  async function saveNow() {
    setBusy('save');
    setNote(null);
    try {
      const res = await fetch('/api/notebook/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save the notebook.');
      setLabel('');
      await load();
      done('Saved — ' + out.snapshot.noteCount + ' page' + (out.snapshot.noteCount === 1 ? '' : 's') + ' kept as “' + out.snapshot.label + '”.');
    } catch (e) { fail(String(e.message || e)); } finally { setBusy(''); }
  }

  function askLoad(snap) {
    setConfirm({
      title: 'Load this save?',
      message: 'The notebook is replaced by what “' + snap.label + '” held — ' + snap.noteCount + ' page'
        + (snap.noteCount === 1 ? '' : 's') + ', saved ' + when(snap.createdAt) + '.\n\n'
        + 'Anything written since is removed. The notebook as it stands now is saved first, so this can be undone from the top of the list.',
      confirmLabel: 'Load save',
      onConfirm: () => { setConfirm(null); doLoad(snap); },
    });
  }

  async function doLoad(snap) {
    setBusy('load:' + snap.id);
    setNote(null);
    try {
      const res = await fetch('/api/notebook/snapshots/load', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: snap.id }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not load that save.');
      await load();
      const n = (out.restored && out.restored.notes) || 0;
      done('Loaded “' + snap.label + '” — the notebook now holds ' + n + ' page' + (n === 1 ? '' : 's') + '. What it held before is at the top of this list.');
    } catch (e) { fail(String(e.message || e)); } finally { setBusy(''); }
  }

  function askDelete(snap) {
    setConfirm({
      title: 'Delete this save?',
      message: '“' + snap.label + '” is forgotten. The notebook itself is not touched.',
      confirmLabel: 'Delete save',
      onConfirm: async () => {
        setConfirm(null);
        setBusy('del:' + snap.id);
        setNote(null);
        try {
          const res = await fetch('/api/notebook/snapshots?id=' + snap.id, { method: 'DELETE' });
          const out = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(out.error || 'Could not delete that save.');
          await load();
          done('Deleted “' + snap.label + '”.');
        } catch (e) { fail(String(e.message || e)); } finally { setBusy(''); }
      },
    });
  }

  // A JSON file — one downloaded from here, or a backup from
  // /api/notebook/export — becomes a save in the list. Nothing is loaded yet.
  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (err) { data = null; }
      const count = data && Array.isArray(data.notes) ? data.notes.length : 0;
      if (!count) { fail('That file is not a notebook backup — no notes in it.'); return; }
      setBusy('import');
      setNote(null);
      try {
        const res = await fetch('/api/notebook/snapshots/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, label: file.name.replace(/\.json$/i, '').slice(0, 120) }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || 'Could not import that file.');
        await load();
        done('Imported “' + out.snapshot.label + '” (' + out.snapshot.noteCount + ' page'
          + (out.snapshot.noteCount === 1 ? '' : 's') + '). Nothing has changed in the notebook — press Load on it when you want it.');
      } catch (err) { fail(String(err.message || err)); } finally { setBusy(''); }
    };
    reader.readAsText(file);
  }

  const working = !!busy;

  return (
    <div style={s('min-height:100vh;background:' + C.bg + ';display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Notebook saves" />

      <main style={s('flex:1;width:100%;max-width:860px;margin:0 auto;padding:28px 24px 56px;')}>
        <a href="/notebook" style={s('display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:' + C.blue + ';text-decoration:none;margin-bottom:14px;')}>
          <Svg w={14} sw={2.4}>{Icons.arrowLeft}</Svg>Back to the notebook
        </a>

        <h1 style={s('font-size:26px;margin:0 0 4px;letter-spacing:-0.02em;color:' + C.ink + ';')}>Saves</h1>
        <p style={s('font-size:15px;color:' + C.mut + ';margin:0 0 20px;line-height:1.5;')}>
          A save is the whole notebook at one moment — every page and attachment. Loading one puts the
          notebook back exactly as it was; the state you leave is saved first, so a load can be undone.
        </p>

        {/* Make a save, or bring one in from a file. */}
        <section style={s('background:#fff;border:1px solid #d8e1e5;border-radius:12px;padding:18px 20px;margin-bottom:18px;')}>
          <div style={s('display:flex;flex-wrap:wrap;gap:10px;align-items:center;')}>
            <input
              value={label} onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !working) saveNow(); }}
              placeholder="Name this save (optional) — e.g. “before the winter rewrite”"
              aria-label="Name this save"
              style={s('flex:1 1 280px;min-width:0;box-sizing:border-box;padding:9px 12px;font:inherit;font-size:15px;border:2px solid ' + C.line + ';border-radius:8px;background:#fff;color:' + C.ink + ';')}
            />
            <Hover tag="button" type="button" disabled={working} onClick={saveNow}
              base={BTN + 'border:none;color:#fff;background:' + (working ? '#aab7bd' : C.green) + ';padding:11px 18px;font-size:15px;'}
              hover={working ? '' : 'background:#00662f;'}>
              <Svg w={15} sw={2.4}>{Icons.check}</Svg>{busy === 'save' ? 'Saving…' : 'Save the notebook now'}
            </Hover>
          </div>
          <div style={s('display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid ' + C.soft + ';')}>
            <input ref={fileInput} type="file" accept=".json,application/json" style={s('display:none;')} onChange={onFile} />
            <Hover tag="button" type="button" disabled={working} onClick={() => fileInput.current && fileInput.current.click()}
              base={GHOST} hover={GHOST_HOVER}>
              <Svg w={14} sw={2.2}>{Icons.up}</Svg>{busy === 'import' ? 'Importing…' : 'Import a save (.json)'}
            </Hover>
            <Hover tag="a" href="/api/notebook/export" base={GHOST + 'text-decoration:none;'} hover={GHOST_HOVER}>
              <Svg w={14} sw={2.2}>{Icons.external}</Svg>Download the notebook as it is now
            </Hover>
            <span style={s('flex:1 1 220px;font-size:13px;color:' + C.dim + ';line-height:1.45;')}>
              An imported file is added to the list — nothing changes until you load it.
            </span>
          </div>
          {note && (
            <p style={s('margin:14px 0 0;font-size:14.5px;font-weight:600;line-height:1.5;color:' + note.tone + ';')}>{note.text}</p>
          )}
        </section>

        {/* The saves themselves, newest first. */}
        <section style={s('background:#fff;border:1px solid #d8e1e5;border-radius:12px;overflow:hidden;')}>
          {status === 'loading' && <p style={s('margin:0;padding:22px;font-size:15px;color:' + C.mut + ';')}>Loading saves…</p>}
          {status === 'error' && <p style={s('margin:0;padding:22px;font-size:15px;color:' + C.red + ';')}>Could not load the saves. Is the database configured?</p>}
          {status === 'ready' && snapshots.length === 0 && (
            <p style={s('margin:0;padding:22px;font-size:15px;color:' + C.mut + ';line-height:1.5;')}>
              No saves yet. Press <strong>Save the notebook now</strong> above to take the first one — then you always have a way back.
            </p>
          )}
          {snapshots.map((snap, i) => {
            const kind = KINDS[snap.kind] || KINDS.manual;
            return (
              <div key={snap.id} style={s('display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 18px;' + (i ? 'border-top:1px solid ' + C.soft + ';' : ''))}>
                <div style={s('flex:1 1 260px;min-width:0;')}>
                  <div style={s('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
                    <span style={s('font-size:15.5px;font-weight:600;color:' + C.ink + ';overflow-wrap:anywhere;')}>{snap.label}</span>
                    <span style={s('flex:none;font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;border-radius:4px;padding:2px 7px;background:' + kind.bg + ';color:' + kind.tone + ';')}>{kind.label}</span>
                  </div>
                  <div style={s('font-size:13px;color:' + C.dim + ';margin-top:3px;')}>
                    {when(snap.createdAt)} · {snap.noteCount} page{snap.noteCount === 1 ? '' : 's'}
                    {snap.attachmentCount ? ' · ' + snap.attachmentCount + ' file' + (snap.attachmentCount === 1 ? '' : 's') : ''}
                  </div>
                </div>
                <div style={s('flex:none;display:flex;align-items:center;gap:8px;')}>
                  <Hover tag="button" type="button" disabled={working} onClick={() => askLoad(snap)}
                    title="Replace the notebook with this save"
                    base={BTN + 'border:none;color:#fff;background:' + (working ? '#aab7bd' : C.blue) + ';'}
                    hover={working ? '' : 'background:' + C.navy + ';'}>
                    <Svg w={14} sw={2.4}>{Icons.undo}</Svg>{busy === 'load:' + snap.id ? 'Loading…' : 'Load'}
                  </Hover>
                  <Hover tag="a" href={'/api/notebook/snapshots?id=' + snap.id + '&download=1'}
                    title="Download this save as a JSON file"
                    base={GHOST + 'padding:9px 12px;text-decoration:none;'} hover={GHOST_HOVER}>
                    <Svg w={14} sw={2.2}>{Icons.external}</Svg>Download
                  </Hover>
                  <Hover tag="button" type="button" disabled={working} onClick={() => askDelete(snap)}
                    title="Forget this save" aria-label={'Delete save ' + snap.label}
                    base={GHOST + 'padding:9px 12px;'} hover={'border-color:' + C.red + ';color:' + C.red + ';'}>
                    <Svg w={14} sw={2.2}>{Icons.trash}</Svg>
                  </Hover>
                </div>
              </div>
            );
          })}
        </section>

        <p style={s('margin:16px 2px 0;font-size:13px;color:' + C.dim + ';line-height:1.5;')}>
          Saves taken automatically before a load are kept for the last ten loads; the ones you take yourself
          are kept until you delete them. Attached files are not copied — a save records which file belongs to
          which page, and the files themselves stay where they are.
        </p>
      </main>

      {confirm && <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
