'use client';

import React from 'react';
import { Svg, Icons } from '../ui';
import TextShimmer from './TextShimmer';

/* ------------------------------------------------------------------ *
 * What the assistant is doing, while it does it — and only that.
 *
 * Everything on this card is something that actually happened on the
 * server, sent as it happened (app/api/agent/route.js, `progress`):
 *
 *   - the Notebook, one cell per page, in its sections. The cells light
 *     as the pass over every page for the question's words is shown, the
 *     count beside them is the real count, and the pages that use those
 *     words light up where they sit (lib/agent/note-scan.mjs);
 *   - the pages that matched, named, as the pass reaches them;
 *   - the page the turn settled on, marked when the model names it;
 *   - for a search of the practice documents, the documents it found.
 *
 * The pass itself takes milliseconds on the server; the sweep replays it
 * at a pace that can be watched. The count it lands on, and every page it
 * lights, are the real ones. While the model reads, a light passes over
 * the whole grid — because the model does read the whole Notebook.
 *
 * The bar is stages, not time: a segment fills when its stage is done
 * and the one in hand shimmers. It never moves for a clock.
 *
 * And the page behind joins in: while this card is up, <html data-busy>
 * is set, and the light (ShaderBackground) quickens and gathers.
 * ------------------------------------------------------------------ */

function BoxLoader() {
  return (
    <span className="riva-boxes" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={'riva-box riva-box-' + i}>
          <span className="riva-box-top" />
          <span className="riva-box-left" />
          <span className="riva-box-right" />
        </span>
      ))}
    </span>
  );
}

// Holds <html data-busy> for as long as any working card is on screen.
function useBusyPage() {
  React.useEffect(() => {
    const root = document.documentElement;
    root.__rivaBusy = (root.__rivaBusy || 0) + 1;
    root.dataset.busy = '1';
    return () => {
      root.__rivaBusy = Math.max(0, (root.__rivaBusy || 1) - 1);
      if (!root.__rivaBusy) delete root.dataset.busy;
    };
  }, []);
}

function useElapsed() {
  const [start] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(start);
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  return (now - start) / 1000;
}

// How far the shown pass has got, 0 → total. Starts when the scan arrives
// and runs at a watchable pace; with reduced motion it is simply done.
function useSweep(total) {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    if (!total) { setCount(0); return undefined; }
    const still = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { setCount(total); return undefined; }
    const ms = Math.max(700, Math.min(1800, total * 11));
    const start = performance.now();
    let raf = 0;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / ms);
      // Eased, so it sets off quickly and settles onto the last page.
      setCount(Math.round(total * (1 - Math.pow(1 - k, 2.2))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);
  return count;
}

// One cell per Notebook page, in its sections, lit as the pass reaches it.
function NoteGrid({ notes, swept, hits, chosen, reading }) {
  const cells = [];
  let i = 0;
  notes.sections.forEach((sec, si) => {
    for (let n = 0; n < sec.count; n += 1, i += 1) {
      const idx = i;
      let cls = 'riva-scan-cell';
      if (si % 2) cls += ' is-alt';
      if (n === 0 && si > 0) cls += ' is-first';
      if (idx < swept) cls += ' is-lit';
      if (idx === swept - 1 && swept < notes.total) cls += ' is-head';
      if (hits.has(idx) && idx < swept) cls += ' is-hit';
      if (chosen.has(idx)) cls += ' is-chosen';
      cells.push(<span key={idx} className={cls} title={sec.name} />);
    }
  });
  return (
    <div className={'riva-scan-grid' + (reading ? ' is-reading' : '')} aria-hidden="true">
      {cells}
    </div>
  );
}

function Segments({ stages }) {
  const current = stages.findIndex((st) => !st.done);
  return (
    <div className="riva-work-segs" aria-hidden="true">
      {stages.map((st, i) => (
        <span key={st.key} className={'riva-work-seg' + (st.done ? ' is-done' : i === current ? ' is-now' : '')} title={st.label} />
      ))}
    </div>
  );
}

const quoteTerms = (terms) => (terms || []).slice(0, 4).map((t) => '“' + t + '”').join(', ');

export default function WorkingState({ steps = [], statusText = '', progress = null }) {
  useBusyPage();
  const elapsed = useElapsed();

  const notes = progress && progress.notes && progress.notes.total ? progress.notes : null;
  const chosenList = (progress && progress.chosen && progress.chosen.chosen) || [];
  const docs = progress && progress.documents ? progress.documents : null;
  const swept = useSweep(notes ? notes.total : 0);
  const scanned = !!notes && swept >= notes.total;

  const rows = steps.map((st, i) => ({
    key: st.id || i,
    done: st.status === 'done',
    label: st.label || st.detail || 'Working',
    detail: st.detail && st.detail !== st.label ? st.detail : '',
  }));
  const running = rows.find((r) => !r.done);
  const done = rows.filter((r) => r.done).length;
  const selectDone = steps.some((st) => st.id === 'select' && st.status === 'done');

  const hits = new Set(notes ? notes.matches.map((m) => m.index) : []);
  // Marked only once the pass has been shown reaching the end, so the
  // story on screen keeps the order it happened in.
  const chosen = new Set(scanned ? chosenList.map((c) => c.index) : []);
  // The matched pages, as the pass reaches them; the chosen page leads once
  // it is known, whether or not it used the question's own words.
  const shown = notes ? notes.matches.filter((m) => m.index < swept) : [];
  const listed = chosen.size
    ? chosenList.map((c) => Object.assign({}, c, shown.find((m) => m.index === c.index)))
      .concat(shown.filter((m) => !chosen.has(m.index)))
    : shown;

  // The line that says what is happening now, from what has actually
  // happened — never from the clock.
  let now;
  if (notes && !scanned) now = 'Checking every page of the Notebook';
  else if (notes && chosen.size) now = selectDone && statusText ? statusText : 'Opening ' + chosenList[0].title;
  else if (notes && !selectDone) now = 'Reading the Notebook for the right page';
  else if (notes) now = statusText || 'Putting the answer together';
  else if (docs) now = statusText || 'Reading what the documents say';
  else now = (running && running.label) || statusText || (rows.length ? 'Putting the answer together' : 'Reading the practice documents');

  // Real stages, each done when it is done.
  let stages;
  if (notes) {
    stages = [
      { key: 'open', label: 'Notebook opened', done: true },
      { key: 'scan', label: 'Every page checked', done: scanned },
      { key: 'pick', label: 'Page chosen', done: scanned && (chosen.size > 0 || selectDone) },
      { key: 'answer', label: 'Answer ready', done: false },
    ];
  } else if (rows.length) {
    stages = rows.map((r) => ({ key: r.key, label: r.label, done: r.done }))
      .concat([{ key: 'answer', label: 'Answer ready', done: false }]);
  } else {
    stages = [{ key: 'start', label: 'Starting', done: false }, { key: 'answer', label: 'Answer ready', done: false }];
  }

  const secs = elapsed < 10 ? elapsed.toFixed(1) : String(Math.round(elapsed));

  return (
    <div className="riva-work" role="status" aria-live="polite">
      <div className="riva-work-head">
        {!notes && <BoxLoader />}
        <div className="riva-work-now">
          <div className="riva-work-kicker">
            <span className="riva-work-pulse" />
            {notes ? 'Notebook' : docs ? 'Practice documents' : 'Working on it'}
            <span className="riva-work-clock">{secs}s</span>
            {notes && (
              <span className="riva-work-count">{Math.min(swept, notes.total)} / {notes.total} pages</span>
            )}
            {!notes && docs && <span className="riva-work-count">{docs.matched} passages</span>}
            {!notes && !docs && rows.length > 0 && <span className="riva-work-count">{done}/{rows.length} lookups</span>}
          </div>
          {/* Keyed on the line, so a new stage slides in rather than the
              words changing under the shimmer. */}
          <div key={now} className="riva-work-title"><TextShimmer>{now}</TextShimmer></div>
        </div>
      </div>

      {notes && (
        <div className="riva-scan">
          <NoteGrid notes={notes} swept={swept} hits={hits} chosen={chosen} reading={scanned && !chosen.size && !selectDone} />
          <div className="riva-scan-note">
            {!notes.terms.length
              ? 'Every page goes to the model to read for meaning'
              : !scanned
                ? 'Looking for ' + quoteTerms(notes.terms)
                : notes.matched
                  ? notes.matched + ' of ' + notes.total + ' pages mention ' + quoteTerms(notes.terms) + ' — the model reads them all'
                  : 'No page uses these words exactly — the model reads them all for meaning'}
          </div>
          {listed.length > 0 && (
            <ol className={'riva-scan-list' + (chosen.size ? ' has-chosen' : '')}>
              {listed.map((m) => (
                <li key={m.index} className={'riva-scan-item' + (chosen.has(m.index) ? ' is-chosen' : '')}>
                  <span className="riva-scan-mark">
                    {chosen.has(m.index) ? <Svg w={11} sw={3.2}>{Icons.check}</Svg> : null}
                  </span>
                  <span className="riva-scan-sec">{m.section}</span>
                  <span className="riva-scan-title">{m.title}</span>
                  {chosen.has(m.index) && <span className="riva-scan-badge">Chosen</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {!notes && docs && docs.matches.length > 0 && (
        <ol className="riva-scan-list is-docs">
          {docs.matches.map((d, i) => (
            <li key={d.title} className="riva-scan-item" style={{ animationDelay: (i * 0.09) + 's' }}>
              <span className="riva-scan-doc"><Svg w={13} sw={2}>{Icons.fileLines}</Svg></span>
              <span className="riva-scan-title">{d.title}</span>
            </li>
          ))}
        </ol>
      )}

      <Segments stages={stages} />

      {!notes && rows.length > 0 && (
        <ol className="riva-work-steps">
          {rows.map((r) => (
            <li key={r.key} className={'riva-work-step' + (r.done ? ' is-done' : ' is-running')}>
              <span className="riva-work-dot">
                {r.done ? <Svg w={11} sw={3.2}>{Icons.check}</Svg> : null}
              </span>
              <span className="riva-work-text">
                <span className="riva-work-label">{r.label}</span>
                {r.detail && <span className="riva-work-detail">{r.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
