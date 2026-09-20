'use client';

/* ------------------------------------------------------------------ *
 * Notebook saves - the whole notebook at a moment, and the way back.
 *
 * A save is every page and attachment record as one JSON document, kept
 * in Postgres (notebook_snapshots). Loading one REPLACES the notebook
 * with what it held; because a load saves the state it is about to
 * discard first, the load can itself be undone from the row above it.
 *
 * A save and the file /api/notebook/export downloads are the same
 * thing, so Download here writes a file that Import here takes back -
 * on this deployment or any other. Import only adds the file to the
 * list; nothing changes in the notebook until the save is loaded.
 *
 * The additive door is still /api/notebook/import (Import in the
 * notebook sidebar): that one adds a backup's pages alongside what is
 * already there. This page is the destructive, exact one.
 *
 * It is drawn with the notebook's own kit (../../_components/notebook/kit),
 * so a button, a card and a confirmation here are the same button, card
 * and confirmation as in the notebook itself.
 * ------------------------------------------------------------------ */

import React from 'react';
import { Svg, Icons } from '../../_components/ui';
import AppHeader from '../../_components/AppHeader';
import {
  NotebookStyles, T, NBIcons, Button, IconButton, Chip, Banner, ConfirmModal, ProgressModal,
} from '../../_components/notebook/kit';
import { phaseLabel, readProgress } from '@/lib/notebook/progress.mjs';

const PAGE_CSS = `
.nbs-page{min-height:100vh;display:flex;flex-direction:column;background:var(--nbk-canvas);}
.nbs-main{flex:1;width:100%;max-width:900px;margin:0 auto;padding:26px 24px 56px;}
.nbs-back{display:inline-flex;align-items:center;gap:6px;margin-bottom:16px;font-size:13.5px;font-weight:600;
  color:var(--nbk-blue);text-decoration:none;}
.nbs-back:hover{text-decoration:underline;}
.nbs-h1{margin:0 0 6px;font-size:27px;font-weight:700;letter-spacing:-.02em;color:var(--nbk-ink);}
.nbs-lede{margin:0 0 20px;max-width:64ch;font-size:14.5px;line-height:1.6;color:var(--nbk-mut);}
.nbs-card{background:#fff;border:1px solid var(--nbk-line);border-radius:var(--nbk-r-md);
  box-shadow:var(--nbk-sh-1);overflow:hidden;}
.nbs-card+.nbs-card{margin-top:16px;}
.nbs-card__body{padding:16px 18px;}
.nbs-card__split{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
.nbs-card__rule{margin-top:14px;padding-top:14px;border-top:1px solid var(--nbk-line-soft);}
.nbs-input{flex:1 1 280px;min-width:0;box-sizing:border-box;height:36px;padding:0 12px;font:inherit;
  font-size:14px;color:var(--nbk-ink);background:#fff;border:1px solid var(--nbk-line);
  border-radius:var(--nbk-r-sm);outline:none;transition:border-color .14s ease,box-shadow .14s ease;}
.nbs-input:focus{border-color:var(--nbk-blue);box-shadow:0 0 0 3px rgba(0,94,184,.13);}
.nbs-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 18px;}
.nbs-row+.nbs-row{border-top:1px solid var(--nbk-line-soft);}
.nbs-row:hover{background:#fafcfe;}
.nbs-row__name{font-size:15px;font-weight:600;color:var(--nbk-ink);overflow-wrap:anywhere;}
.nbs-row__meta{margin-top:3px;font-size:12.5px;color:var(--nbk-dim);}
.nbs-note{margin:0;padding:20px;font-size:14.5px;line-height:1.6;color:var(--nbk-mut);}
.nbs-foot{margin:16px 2px 0;max-width:72ch;font-size:12.5px;line-height:1.6;color:var(--nbk-dim);}
`;

// What a save is, said as a chip: one the reader took, one taken for them
// before a load, or a file they brought in.
const KINDS = {
  manual: { label: 'Saved', colour: { ink: '#00437e', tint: '#e9f2fa', edge: '#c5dcef' } },
  auto: { label: 'Before a load', colour: { ink: '#7a4708', tint: '#fdf5e8', edge: '#ecd7ae' } },
  import: { label: 'Imported file', colour: { ink: '#00612f', tint: '#e8f5ed', edge: '#b9ddc8' } },
};

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NotebookSavesPage() {
  const [snapshots, setSnapshots] = React.useState([]);
  const [status, setStatus] = React.useState('loading'); // loading | ready | error
  const [busy, setBusy] = React.useState('');             // what is running, for the buttons
  // Where a load has got to: { phase, done, total }, or null when none is
  // running. A load rewrites every page in the notebook, and it used to do it
  // behind a button that only said "Loading...".
  const [progress, setProgress] = React.useState(null);
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

  function fail(text) { setNote({ tone: 'danger', text }); }
  function done(text) { setNote({ tone: 'success', text }); }

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
      done('Saved - ' + out.snapshot.noteCount + ' page' + (out.snapshot.noteCount === 1 ? '' : 's') + ' kept as "' + out.snapshot.label + '".');
    } catch (e) { fail(String(e.message || e)); } finally { setBusy(''); }
  }

  function askLoad(snap) {
    setConfirm({
      title: 'Load this save?',
      message: 'The notebook is replaced by what "' + snap.label + '" held - ' + snap.noteCount + ' page'
        + (snap.noteCount === 1 ? '' : 's') + ', saved ' + when(snap.createdAt) + '.\n\n'
        + 'Anything written since is removed. The notebook as it stands now is saved first, so this can be undone from the top of the list.',
      confirmLabel: 'Load save',
      onConfirm: () => { setConfirm(null); doLoad(snap); },
    });
  }

  // Loading REPLACES the notebook - the save is written back page by page - so
  // it is the one action here worth watching rather than waiting out. The route
  // streams where it has got to; see lib/notebook/progress.mjs.
  async function doLoad(snap) {
    setBusy('load:' + snap.id);
    setNote(null);
    setProgress({ phase: 'saving', done: 0, total: 0 });
    try {
      const res = await fetch('/api/notebook/snapshots/load', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: snap.id }),
      });
      const out = await readProgress(res, (step) => {
        if (step.phase === 'done' || step.phase === 'ready') return;
        setProgress({ phase: step.phase, done: Number(step.done) || 0, total: Number(step.total) || 0 });
      });
      await load();
      const n = (out.restored && out.restored.notes) || 0;
      done('Loaded "' + snap.label + '" - the notebook now holds ' + n + ' page' + (n === 1 ? '' : 's') + '. What it held before is at the top of this list.');
    } catch (e) { fail(String(e.message || e)); } finally { setBusy(''); setProgress(null); }
  }

  function askDelete(snap) {
    setConfirm({
      title: 'Delete this save?',
      message: '"' + snap.label + '" is forgotten. The notebook itself is not touched.',
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
          done('Deleted "' + snap.label + '".');
        } catch (e) { fail(String(e.message || e)); } finally { setBusy(''); }
      },
    });
  }

  // A JSON file - one downloaded from here, or a backup from
  // /api/notebook/export - becomes a save in the list. Nothing is loaded yet.
  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (err) { data = null; }
      const count = data && Array.isArray(data.notes) ? data.notes.length : 0;
      if (!count) { fail('That file is not a notebook backup - no notes in it.'); return; }
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
        done('Imported "' + out.snapshot.label + '" (' + out.snapshot.noteCount + ' page'
          + (out.snapshot.noteCount === 1 ? '' : 's') + '). Nothing has changed in the notebook - press Load on it when you want it.');
      } catch (err) { fail(String(err.message || err)); } finally { setBusy(''); }
    };
    reader.readAsText(file);
  }

  const working = !!busy;

  return (
    <div className="nbs-page">
      <NotebookStyles />
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <AppHeader subtitle="Notebook saves" />

      <main className="nbs-main">
        <a className="nbs-back" href="/notebook">
          <Svg w={14} sw={2.4}>{Icons.arrowLeft}</Svg>Back to the notebook
        </a>

        <h1 className="nbs-h1">Saves</h1>
        <p className="nbs-lede">
          A save is the whole notebook at one moment - every page and attachment. Loading one puts the
          notebook back exactly as it was; the state you leave is saved first, so a load can be undone.
        </p>

        {/* Make a save, or bring one in from a file. */}
        <section className="nbs-card">
          <div className="nbs-card__body">
            <div className="nbs-card__split">
              <input
                className="nbs-input"
                value={label} onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !working) saveNow(); }}
                placeholder='Name this save (optional) - for example "before the winter rewrite"'
                aria-label="Name this save"
              />
              <Button variant="success" icon={Icons.check} disabled={working} loading={busy === 'save'} onClick={saveNow}>
                {busy === 'save' ? 'Saving...' : 'Save the notebook now'}
              </Button>
            </div>
            <div className="nbs-card__split nbs-card__rule">
              <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
              <Button icon={NBIcons.upload} disabled={working} loading={busy === 'import'}
                onClick={() => fileInput.current && fileInput.current.click()}>
                {busy === 'import' ? 'Importing...' : 'Import a save (.json)'}
              </Button>
              <Button icon={NBIcons.download} onClick={() => { window.location.href = '/api/notebook/export'; }}>
                Download the notebook as it is now
              </Button>
              <span style={{ flex: '1 1 220px', fontSize: '12.5px', lineHeight: 1.5, color: T.dim }}>
                An imported file is added to the list - nothing changes until you load it.
              </span>
            </div>
            {note && (
              <div style={{ marginTop: '14px' }}>
                <Banner tone={note.tone} icon={note.tone === 'danger' ? Icons.alertCircle : Icons.check}>{note.text}</Banner>
              </div>
            )}
          </div>
        </section>

        {/* The saves themselves, newest first. */}
        <section className="nbs-card">
          {status === 'loading' && <p className="nbs-note">Loading saves...</p>}
          {status === 'error' && <p className="nbs-note" style={{ color: T.red }}>Could not load the saves. Is the database configured?</p>}
          {status === 'ready' && snapshots.length === 0 && (
            <p className="nbs-note">
              No saves yet. Press <strong>Save the notebook now</strong> above to take the first one - then you always have a way back.
            </p>
          )}
          {snapshots.map((snap) => {
            const kind = KINDS[snap.kind] || KINDS.manual;
            return (
              <div key={snap.id} className="nbs-row">
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="nbs-row__name">{snap.label}</span>
                    <Chip colour={kind.colour} dot>{kind.label}</Chip>
                  </div>
                  <div className="nbs-row__meta">
                    {when(snap.createdAt)} &middot; {snap.noteCount} page{snap.noteCount === 1 ? '' : 's'}
                    {snap.attachmentCount ? ' \u00b7 ' + snap.attachmentCount + ' file' + (snap.attachmentCount === 1 ? '' : 's') : ''}
                  </div>
                </div>
                <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button variant="primary" icon={Icons.undo} size="sm" disabled={working}
                    loading={busy === 'load:' + snap.id} onClick={() => askLoad(snap)}
                    title="Replace the notebook with this save">
                    {busy === 'load:' + snap.id ? 'Loading...' : 'Load'}
                  </Button>
                  <Button size="sm" icon={NBIcons.download} title="Download this save as a JSON file"
                    onClick={() => { window.location.href = '/api/notebook/snapshots?id=' + snap.id + '&download=1'; }}>
                    Download
                  </Button>
                  <IconButton size="sm" tone="danger" icon={Icons.trash} disabled={working}
                    label={'Delete save ' + snap.label} onClick={() => askDelete(snap)} />
                </div>
              </div>
            );
          })}
        </section>

        <p className="nbs-foot">
          Saves taken automatically before a load are kept for the last ten loads; the ones you take yourself
          are kept until you delete them. Attached files are not copied - a save records which file belongs to
          which page, and the files themselves stay where they are.
        </p>
      </main>

      {/* A load rewrites every page, so it happens behind the same blocking
          progress sheet an import does rather than under a button. */}
      {progress && (
        <ProgressModal title="Loading the save" message={phaseLabel(progress.phase)}
          done={Math.min(Number(progress.done) || 0, Number(progress.total) || Infinity)}
          total={Number(progress.total) || 0}
          unit={progress.phase === 'attachments' ? 'files' : 'pages'} />
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}