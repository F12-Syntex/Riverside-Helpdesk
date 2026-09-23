'use client';

import React from 'react';
import { Svg, Icons } from '../ui';
import TextShimmer from './TextShimmer';

/* ------------------------------------------------------------------ *
 * What the assistant is doing, while it does it.
 *
 * A wait that looks static reads as a wait that is stuck, so everything
 * on this card is visibly moving forward:
 *
 *   - the box loader (the 21st.dev "box loader": isometric cubes rising
 *     and settling in turn) says work is happening;
 *   - the headline is the step being worked on NOW, shimmering;
 *   - the clock counts up, so a long wait is a known length;
 *   - the bar only ever moves forward — it creeps with time and jumps
 *     each time a lookup finishes, and never claims to be finished;
 *   - every lookup gets its own line on a timeline, arriving as it starts
 *     and ticking over when it returns.
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

export default function WorkingState({ steps = [], statusText = '' }) {
  useBusyPage();
  const elapsed = useElapsed();

  const rows = steps.map((st, i) => ({
    key: st.id || i,
    done: st.status === 'done',
    label: st.label || st.detail || 'Working',
    detail: st.detail && st.detail !== st.label ? st.detail : '',
  }));
  const running = rows.find((r) => !r.done);
  const done = rows.filter((r) => r.done).length;

  // What is happening now: the lookup in flight, else what the agent says
  // it is about to do, else the opening line.
  const now = (running && running.label) || statusText || (rows.length ? 'Putting the answer together' : 'Reading the practice documents');

  // Forward only. Time alone approaches but never reaches the end; each
  // finished lookup buys a step. Capped short of full — the answer
  // arriving is what finishes it.
  const byTime = 1 - Math.exp(-elapsed / 10);
  const bySteps = rows.length ? done / (rows.length + 1) : 0;
  const target = Math.min(0.94, 0.06 + byTime * 0.5 + bySteps * 0.4);
  const high = React.useRef(0);
  high.current = Math.max(high.current, target);

  const secs = elapsed < 10 ? elapsed.toFixed(1) : String(Math.round(elapsed));

  return (
    <div className="riva-work" role="status" aria-live="polite">
      <div className="riva-work-head">
        <BoxLoader />
        <div className="riva-work-now">
          <div className="riva-work-kicker">
            <span className="riva-work-pulse" />
            Working on it
            <span className="riva-work-clock">{secs}s</span>
            {rows.length > 0 && <span className="riva-work-count">{done}/{rows.length} lookups</span>}
          </div>
          {/* Keyed on the line, so a new step slides in rather than the
              words changing under the shimmer. */}
          <div key={now} className="riva-work-title"><TextShimmer>{now}</TextShimmer></div>
        </div>
      </div>

      <div className="riva-work-bar"><span style={{ transform: 'scaleX(' + high.current.toFixed(3) + ')' }} /></div>

      {rows.length > 0 && (
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
