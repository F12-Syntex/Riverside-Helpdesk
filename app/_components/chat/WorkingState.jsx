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
 *   - for a question, the whole Notebook going to the model: "Reading the
 *     Notebook — N pages", N being the real count (lib/agent/
 *     notebook-progress.mjs). Every page is read, so there is no shortlist
 *     to show; the pages the answer used are named on the answer itself, as
 *     links.
 *   - for a search of the practice documents (/practice), the documents it
 *     found.
 *   - for anything else, the steps the server reported, as they ran.
 *
 * The hairline is stages, not time: a segment fills when its stage is done
 * and the one in hand shimmers. It never moves for a clock.
 *
 * And the page behind joins in: while this card is up, <html data-busy>
 * is set, and the light (PageBackground) quickens and gathers.
 * ------------------------------------------------------------------ */

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

export default function WorkingState({ steps = [], statusText = '', progress = null }) {
  useBusyPage();
  const elapsed = useElapsed();

  const notes = progress && progress.notes && progress.notes.total ? progress.notes : null;
  const docs = progress && progress.documents ? progress.documents : null;
  const reading = notes ? 'Reading the Notebook — ' + notes.total + (notes.total === 1 ? ' page' : ' pages') : '';
  // The status line as it stood when the Notebook arrived. The title keeps
  // saying the Notebook is being read until the server says something new
  // ("Writing the answer", "Checking the answer"), never going back to a
  // line from before the read.
  const statusAtNotes = React.useRef(null);
  if (notes && statusAtNotes.current === null) statusAtNotes.current = statusText;
  const movedOn = !!notes && !!statusText && statusText !== statusAtNotes.current;

  const rows = steps.map((st, i) => ({
    key: st.id || i,
    done: st.status === 'done',
    label: st.label || st.detail || 'Working',
    detail: st.detail && st.detail !== st.label ? st.detail : '',
  }));
  const running = rows.find((r) => !r.done);
  const done = rows.filter((r) => r.done).length;

  // The line that says what is happening now, from what has actually
  // happened — never from the clock.
  let now;
  if (notes) now = movedOn ? statusText : reading;
  else if (docs) now = statusText || 'Reading what the documents say';
  else now = (running && running.label) || statusText || (rows.length ? 'Putting the answer together' : 'Reading the practice documents');

  // Real stages, each done when it is done.
  let stages;
  if (notes) {
    stages = [
      { key: 'open', label: 'Notebook opened', done: true },
      { key: 'read', label: 'Every page read', done: movedOn },
      { key: 'answer', label: 'Answer ready', done: false },
    ];
  } else if (rows.length) {
    stages = rows.map((r) => ({ key: r.key, label: r.label, done: r.done }))
      .concat([{ key: 'answer', label: 'Answer ready', done: false }]);
  } else {
    stages = [{ key: 'start', label: 'Starting', done: false }, { key: 'answer', label: 'Answer ready', done: false }];
  }

  const secs = elapsed < 10 ? elapsed.toFixed(1) : String(Math.round(elapsed));

  const meta = [
    secs + 's',
    !notes && docs ? docs.matched + ' passages' : '',
    !notes && !docs && rows.length > 0 ? done + '/' + rows.length + ' lookups' : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="riva-work" role="status" aria-live="polite">
      {/* Keyed on the line, so a new stage slides in rather than the
          words changing under the shimmer. */}
      <div key={now} className="riva-work-title"><TextShimmer>{now}</TextShimmer></div>
      <div className="riva-work-meta">{meta}</div>

      <Segments stages={stages} />

      {notes && (
        <div className="riva-scan-note">Every page goes to the model; the answer links the pages it used</div>
      )}

      {!notes && docs && docs.matches.length > 0 && (
        <ol className="riva-scan-list">
          {docs.matches.map((d, i) => (
            <li key={d.title} className="riva-scan-item" style={{ animationDelay: (i * 0.09) + 's' }}>
              <span className="riva-scan-doc"><Svg w={13} sw={2}>{Icons.fileLines}</Svg></span>
              <span className="riva-scan-title">{d.title}</span>
            </li>
          ))}
        </ol>
      )}

      {!notes && rows.length > 0 && (
        <ol className="riva-work-steps">
          {rows.map((r) => (
            <li key={r.key} className={'riva-work-step' + (r.done ? ' is-done' : '')}>
              <span className="riva-work-mark">{r.done ? <Svg w={11} sw={3}>{Icons.check}</Svg> : '·'}</span>
              <span>{r.label}{r.detail && <span className="riva-work-detail"> — {r.detail}</span>}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
