'use client';

import React from 'react';
import { Svg, Icons } from '../ui';
import RollingLine, { useHeldValue } from './RollingLine';

/* ------------------------------------------------------------------ *
 * What the assistant is doing, while it does it — and only that.
 *
 * Everything on this line is something that actually happened, sent as
 * it happened (app/api/agent/route.js, `progress`):
 *
 *   - before anything is sent, the message being checked for patient
 *     details (lib/safety/patient-data.mjs) — the one wait that happens
 *     in this browser rather than on the server, and said as what it is.
 *   - for a question, the whole Notebook going to the model: "Reading the
 *     Notebook — N pages", N being the real count (lib/agent/
 *     notebook-progress.mjs). Every page is read, so there is no shortlist
 *     to show; the pages the answer used are named on the answer itself, as
 *     links.
 *   - for a search of the practice documents (/practice), the documents it
 *     found.
 *   - for anything else, the steps the server reported, as they ran.
 *
 * The line rolls over to each new stage and holds every stage long enough
 * to be read (RollingLine). The hairline is stages, not time: a segment
 * fills when its stage is done and the one in hand shimmers. It never moves
 * for a clock — the seconds beside it are the only clock, and they say only
 * how long it has been.
 *
 * It sits in the answer's own card (AiAnswer), in the place the answer
 * will be written, so the wait and the answer are the same object.
 * ------------------------------------------------------------------ */

// Holds <html data-busy> while `active`, and the light (PageBackground)
// quickens and gathers. Used by AiAnswer for as long as the answer is being
// worked out, not just while this line is up: the check after the last word
// is written is still work, and the page went quiet over it.
export function useBusyPage(active = true) {
  React.useEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    root.__rivaBusy = (root.__rivaBusy || 0) + 1;
    root.dataset.busy = '1';
    return () => {
      root.__rivaBusy = Math.max(0, (root.__rivaBusy || 1) - 1);
      if (!root.__rivaBusy) delete root.dataset.busy;
    };
  }, [active]);
}

// Whole seconds since the line appeared. Tenths ticking five times a second
// read as urgency; a second at a time reads as a clock.
function useElapsed() {
  const [start] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(start);
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return Math.floor((now - start) / 1000);
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

export default function WorkingState({ steps = [], statusText = '', progress = null, screening = false }) {
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
  if (screening) now = 'Checking for patient details';
  else if (notes) now = movedOn ? statusText : reading;
  else if (docs) now = statusText || 'Reading what the documents say';
  else now = (running && running.label) || statusText || (rows.length ? 'Putting the answer together' : 'Reading the practice documents');
  // What the screen reader is told: the same line, held the same way, so it
  // hears each stage once rather than every swap the eye sees.
  const said = useHeldValue(now);

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

  const meta = [
    elapsed >= 1 ? elapsed + 's' : '',
    !notes && docs ? docs.matched + ' passages' : '',
    !notes && !docs && rows.length > 0 ? done + '/' + rows.length + ' lookups' : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="riva-work">
      <span className="rv-sr" role="status" aria-live="polite">{said}</span>
      <div className="riva-work-head">
        <span className="riva-live-dot" aria-hidden="true" />
        <RollingLine text={now} className="riva-work-title" />
        <span className="riva-work-meta" aria-hidden="true">{meta}</span>
      </div>

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
