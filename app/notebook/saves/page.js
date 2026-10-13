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
 * THE SHAPE is Referrals': one centred column on the light, the heading
 * with its one blue word, then two white cards - making a save, and the
 * saves themselves as rows, newest first. Only the list scrolls. It is
 * drawn with the notebook's own kit (../../_components/notebook/kit),
 * which is the shared page language, so a button, a row and a
 * confirmation here are the same as in the notebook itself.
 * ------------------------------------------------------------------ */

import React from 'react';
import NextLink from 'next/link';
import { MotionConfig, motion } from 'motion/react';
import { Svg, Icons } from '../../_components/ui';
import AppHeader from '../../_components/AppHeader';
import {
  NotebookStyles, NBIcons, Button, IconButton, Chip, Banner, ConfirmModal, ProgressModal, State,
} from '../../_components/notebook/kit';
import { phaseLabel, readProgress } from '@/lib/notebook/progress.mjs';

const EASE = [0.22, 1, 0.36, 1];
const LABEL_MAX = 120; // the snapshots route keeps this many characters of a name
const LABEL_COUNT_FROM = 100;

const PAGE_CSS = `
/* The page is the screen under the bar, and never scrolls: the list card
   takes what is left of the column and scrolls inside itself. On a screen
   too short for that the column scrolls rather than squash the list. */
.nbs-page{position:relative;height:100%;overflow:hidden;display:flex;flex-direction:column;}
.nbs{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;width:100%;max-width:760px;margin:0 auto;
  padding:clamp(16px,5vh,56px) 24px 24px;overflow-y:auto;scrollbar-width:none;}
.nbs::-webkit-scrollbar{display:none;}
.nbs > *{flex:none;}
.nbs > .nbs-listwrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}
.nbs-listwrap > *{flex:none;}
.nbs-back{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;margin:0 0 14px -8px;padding:6px 12px 6px 8px;border-radius:999px;
  font-size:14px;font-weight:600;color:var(--rv-accent);text-decoration:none;transition:background-color .15s ease;}
.nbs-back:hover{background:rgba(255,255,255,.7);}
.nbs-back:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.nbs .rv-h1{margin-bottom:14px;font-size:48px;}
.nbs-lede{margin:0 auto 26px;max-width:58ch;text-align:center;font-size:15px;line-height:1.55;color:var(--rv-ink-2);}

.nbs-make{padding:18px 18px 16px;}
.nbs-make__row{display:flex;align-items:flex-start;gap:10px;}
.nbs-make__field{flex:1;min-width:0;}
.nbs-make__field .rv-field{height:44px;}
.nbs-make__meta{display:flex;align-items:flex-start;gap:12px;margin-top:6px;min-height:0;}
.nbs-make__meta .rv-hint{flex:1;margin:0;}
.nbs-count{flex:none;margin-left:auto;font-size:12.5px;font-weight:600;color:var(--rv-ink-2);font-variant-numeric:tabular-nums;}
.nbs-count.is-max{color:var(--rv-danger-ink);}
.nbs-make__rule{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--rv-divider);}
.nbs-make__rule .rv-hint{flex:1 1 220px;margin:0 0 0 4px;}
.nbs-note{margin-top:14px;}

.nbs-cap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:22px;margin:22px 0 8px;padding:0 22px;
  font-size:13px;font-weight:550;color:var(--rv-ink-2);}
.nbs-listwrap > .nbs-list{flex:0 1 auto;min-height:150px;}
.nbs-list{overflow:hidden auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
/* So a list running past the foot of the card does not look finished, its
   last pixels fade out while there is more below - Referrals' and Contacts'
   veil: white, stuck to the foot of the scroller (a mask would clip the
   card's shadow). */
.nbs-list.is-more::after{content:"";position:sticky;bottom:0;display:block;height:36px;margin-top:-36px;pointer-events:none;
  background:linear-gradient(rgba(255,255,255,0),#fff);}
.nbs-list.is-more .nbs-row{scroll-margin-bottom:40px;}
.nbs-row{display:flex;align-items:center;gap:14px;min-height:72px;padding:12px 16px 12px 22px;}
.nbs-row + .nbs-row{border-top:1px solid var(--rv-divider);}
.nbs-row__main{flex:1;min-width:0;}
.nbs-row__top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.nbs-row__name{font-size:16.5px;font-weight:450;line-height:1.35;color:var(--rv-ink);overflow-wrap:anywhere;}
.nbs-row__meta{margin-top:3px;font-size:13px;color:var(--rv-ink-2);font-variant-numeric:tabular-nums;}
.nbs-row__acts{flex:none;display:flex;align-items:center;gap:6px;}
.nbs-skelrow{display:flex;align-items:center;gap:14px;min-height:72px;padding:0 22px;}
.nbs-skelrow + .nbs-skelrow{border-top:1px solid var(--rv-divider);}
.nbs-foot{margin:14px 22px 0;max-width:72ch;font-size:13px;line-height:1.55;color:var(--rv-ink-2);}

@media (max-width:700px){
  .nbs{padding:16px 16px 16px;}
  .nbs .rv-h1{font-size:36px;margin-bottom:10px;}
  .nbs-lede{font-size:14.5px;margin-bottom:18px;}
  .nbs-make{padding:16px 14px 14px;}
  .nbs-make__row{flex-direction:column;align-items:stretch;}
  .nbs-make__row .rv-btn{height:44px;}
  .nbs-cap{padding:0 16px;}
  /* A phone: the column scrolls as one, rather than a list squeezed in under the form. */
  .nbs > .nbs-listwrap{flex:none;}
  .nbs-listwrap > .nbs-list{min-height:0;overflow:visible;}
  .nbs-row{flex-wrap:wrap;padding:12px 14px 12px 16px;}
  .nbs-row__acts{width:100%;}
  .nbs-row__acts .rv-btn{height:40px;}
  .nbs-row__acts .rv-ibtn{width:40px;height:40px;margin-left:auto;}
  .nbs-foot{margin:12px 16px 0;}
}
@media (prefers-reduced-motion:reduce){.nbs-back{transition:none;}}
`;

// What a save is, said as a chip: one the reader took, one taken for them
// before a load, or a file they brought in.
const KINDS = {
  manual: { label: 'Saved', tone: 'accent' },
  auto: { label: 'Before a load', tone: 'warn' },
  import: { label: 'Imported file', tone: 'ok' },
};

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

const rise = (delay) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: EASE } });

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
  // Whether there is more of the list below the foot of its card, for the
  // veil. Never on a phone, where the list does not scroll by itself (the
  // column does, and its foot is the screen's).
  const listRef = React.useRef(null);
  const [more, setMore] = React.useState(false);
  const measure = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const scrolls = getComputedStyle(el).overflowY !== 'visible';
    setMore(scrolls && el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);
  React.useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  // The rows changing inside a card that has stopped growing resizes nothing;
  // and a row rising in (below) is lower than it lands until it has.
  React.useLayoutEffect(measure, [measure, snapshots, status]);

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
        body: JSON.stringify({ label: label.trim() }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save the notebook.');
      setLabel('');
      await load();
      done('Saved - ' + plural(out.snapshot.noteCount, 'page') + ' kept as “' + out.snapshot.label + '”.');
    } catch (e) { fail(String(e.message || e)); } finally { setBusy(''); }
  }

  function askLoad(snap) {
    setConfirm({
      title: 'Load “' + snap.label + '”?',
      message: 'The notebook is replaced by what this save held - ' + plural(snap.noteCount, 'page') + ', saved ' + when(snap.createdAt) + '.\n\n'
        + 'Anything written since is removed, and the assistant answers from the saved pages. The notebook as it stands now is saved first, so this can be undone from the top of the list.',
      confirmLabel: 'Load save',
      icon: Icons.undo,
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
      done('Loaded “' + snap.label + '” - the notebook now holds ' + plural(n, 'page') + '. What it held before is at the top of this list.');
    } catch (e) { fail(String(e.message || e)); } finally { setBusy(''); setProgress(null); }
  }

  function askDelete(snap) {
    setConfirm({
      title: 'Delete “' + snap.label + '”?',
      message: 'The save is forgotten, so the notebook can no longer go back to it. The notebook itself is not touched.',
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
      if (!count) { fail('“' + file.name + '” is not a notebook backup - there are no notes in it.'); return; }
      setBusy('import');
      setNote(null);
      try {
        const res = await fetch('/api/notebook/snapshots/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, label: file.name.replace(/\.json$/i, '').slice(0, LABEL_MAX) }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || 'Could not import that file.');
        await load();
        done('Imported “' + out.snapshot.label + '” (' + plural(out.snapshot.noteCount, 'page')
          + '). Nothing has changed in the notebook - press Load on it when you want it.');
      } catch (err) { fail(String(err.message || err)); } finally { setBusy(''); }
    };
    reader.readAsText(file);
  }

  const working = !!busy;
  const count = label.length;

  return (
    <MotionConfig reducedMotion="user">
    <div className="nbs-page riva-page-fill">
      <NotebookStyles />
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <AppHeader subtitle="Notebook saves" />

      <main className="nbs">
        <motion.div {...rise(0)} style={{ display: 'flex', flexDirection: 'column' }}>
          <NextLink className="nbs-back" href="/notebook">
            <Svg w={16} sw={2.2}>{Icons.arrowLeft}</Svg>Practice notes
          </NextLink>
          <h1 className="rv-h1">Notebook <em>saves</em></h1>
          <p className="nbs-lede">
            A save is the whole notebook at one moment - every page and attachment. Loading one puts the
            notebook back exactly as it was; the state you leave is saved first, so a load can be undone.
          </p>
        </motion.div>

        {/* Make a save, or bring one in from a file. */}
        <motion.section className="rv-card nbs-make" aria-label="Make a save" {...rise(0.07)}>
          <form className="nbs-make__row" onSubmit={(e) => { e.preventDefault(); if (!working) saveNow(); }}>
            <div className="nbs-make__field">
              <input
                className="rv-field"
                value={label} maxLength={LABEL_MAX}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Name this save - for example “before the winter rewrite”"
                aria-label="Name this save (optional)"
                aria-describedby="nbs-label-hint"
              />
              <div className="nbs-make__meta">
                <p className="rv-hint" id="nbs-label-hint">Optional. Without one it is listed as “Save”, with the date it was taken.</p>
                {count >= LABEL_COUNT_FROM && (
                  <span className={'nbs-count' + (count >= LABEL_MAX ? ' is-max' : '')}>{count + ' / ' + LABEL_MAX}</span>
                )}
              </div>
            </div>
            <Button variant="primary" type="submit" icon={Icons.check} disabled={working} loading={busy === 'save'}>
              {busy === 'save' ? 'Saving…' : 'Save the notebook now'}
            </Button>
          </form>
          <div className="nbs-make__rule">
            <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
            <Button size="sm" icon={NBIcons.upload} disabled={working} loading={busy === 'import'}
              onClick={() => fileInput.current && fileInput.current.click()}>
              {busy === 'import' ? 'Importing…' : 'Import a save (.json)'}
            </Button>
            <a className="rv-btn rv-btn--quiet rv-btn--sm" href="/api/notebook/export" download>
              <Svg w={14} sw={2.2}>{NBIcons.download}</Svg>Download the notebook
            </a>
            <p className="rv-hint">An imported file is added to the list - nothing changes until you load it.</p>
          </div>
          {working && busy !== 'save' && busy !== 'import' && (
            <p className="rv-hint" role="status" style={{ marginTop: 12 }}>
              {busy.startsWith('load:') ? 'Loading a save - the other buttons wait until it has finished.' : 'Deleting a save - one moment.'}
            </p>
          )}
          {note && (
            <div className="nbs-note" role={note.tone === 'danger' ? 'alert' : 'status'}>
              <Banner tone={note.tone} icon={note.tone === 'danger' ? Icons.alertCircle : Icons.check}>{note.text}</Banner>
            </div>
          )}
        </motion.section>

        {/* The saves themselves, newest first. */}
        <motion.div className="nbs-listwrap" {...rise(0.14)}>
          <div className="nbs-cap">
            {status === 'ready' && snapshots.length
              ? <span>{plural(snapshots.length, 'save') + ', newest first'}</span>
              : status === 'loading' ? <span className="rv-skel" style={{ width: 160, height: 9 }} aria-hidden="true" /> : <span />}
          </div>
          <section ref={listRef} className={'rv-card nbs-list' + (more ? ' is-more' : '')} onScroll={measure}
            aria-label="Saves" aria-busy={status === 'loading' ? 'true' : undefined}>
            {status === 'loading' && (
              <div aria-hidden="true">
                {['52%', '38%', '46%', '30%'].map((w, i) => (
                  <div key={i} className="nbs-skelrow">
                    <div style={{ flex: 1 }}>
                      <span className="rv-skel" style={{ width: w }} />
                      <span className="rv-skel" style={{ width: '28%', height: 9, marginTop: 10 }} />
                    </div>
                    <span className="rv-skel" style={{ width: 64, height: 28, borderRadius: 999 }} />
                  </div>
                ))}
              </div>
            )}
            {status === 'loading' && <span className="rv-sr" role="status">Loading the saves</span>}
            {status === 'error' && (
              <State icon={Icons.alertCircle} title="The saves could not be loaded."
                text="Reload the page in a moment. Nothing in the notebook has been changed.">
                <Button variant="primary" icon={Icons.refresh} onClick={() => { setStatus('loading'); load(); }}>Try again</Button>
              </State>
            )}
            {status === 'ready' && snapshots.length === 0 && (
              <State icon={NBIcons.layers} title="No saves yet."
                text="Take the first one above - then there is always a way back to the notebook as it is now." />
            )}
            {status === 'ready' && snapshots.map((snap, i) => {
              const kind = KINDS[snap.kind] || KINDS.manual;
              const loadingThis = busy === 'load:' + snap.id;
              return (
                <motion.div key={snap.id} className="nbs-row" onAnimationComplete={measure}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: 0.2 + Math.min(i, 10) * 0.03, ease: EASE }}>
                  <div className="nbs-row__main">
                    <div className="nbs-row__top">
                      <span className="nbs-row__name">{snap.label}</span>
                      <Chip tone={kind.tone}>{kind.label}</Chip>
                    </div>
                    <div className="nbs-row__meta">
                      {when(snap.createdAt)} &middot; {plural(snap.noteCount, 'page')}
                      {snap.attachmentCount ? ' · ' + plural(snap.attachmentCount, 'file') : ''}
                    </div>
                  </div>
                  <div className="nbs-row__acts">
                    <Button variant="primary" icon={Icons.undo} size="sm" disabled={working}
                      loading={loadingThis} onClick={() => askLoad(snap)}
                      title="Replace the notebook with this save">
                      {loadingThis ? 'Loading…' : 'Load'}
                    </Button>
                    <a className="rv-btn rv-btn--quiet rv-btn--sm" title="Download this save as a JSON file"
                      href={'/api/notebook/snapshots?id=' + snap.id + '&download=1'} download>
                      <Svg w={14} sw={2.2}>{NBIcons.download}</Svg>Download
                    </a>
                    <IconButton tone="danger" icon={Icons.trash} disabled={working}
                      label={'Delete save ' + snap.label} onClick={() => askDelete(snap)} />
                  </div>
                </motion.div>
              );
            })}
          </section>
          <p className="nbs-foot">
            Saves taken automatically before a load are kept for the last ten loads; the ones you take yourself
            are kept until you delete them. Attached files are not copied - a save records which file belongs to
            which page, and the files themselves stay where they are.
          </p>
        </motion.div>
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
          icon={confirm.icon} onConfirm={confirm.onConfirm} onClose={() => setConfirm(null)} />
      )}
    </div>
    </MotionConfig>
  );
}
