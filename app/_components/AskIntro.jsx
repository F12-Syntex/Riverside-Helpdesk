'use client';

import React from 'react';
import { Svg, Icons } from './ui';
import { TOP_MODES, MODE_FOLDER } from '../../lib/commands.mjs';

/* ------------------------------------------------------------------ *
 * The first look at the Q&A: how to ask, shown once.
 *
 * Reception were opening the page and not knowing what the box was
 * for — that it takes a question in plain words, that the pill under
 * it changes the KIND of answer, and that Enter is the whole of
 * sending. So the first time the page is opened in a browser session
 * it walks the three, quickly, over the real controls: a spotlight on
 * each, a caption beside it, and the modes listed as they are in the
 * menu. About seven seconds, and any click or key ends it.
 *
 * IT WAITS FOR THE PAGE. Nothing starts until the window has finished
 * loading and the pill has read its kept mode back (`ready`), then a
 * moment more for the header and dock to land — a spotlight measured
 * while the dock is still sliding into the middle points at nothing.
 *
 * ONCE PER SESSION. The flag is in sessionStorage, written as the tour
 * starts rather than when it ends, so a reload half-way through does
 * not play it again. A new browser session gets it once more: a shared
 * reception machine is used by whoever is on, and the next person may
 * not have seen it.
 * ------------------------------------------------------------------ */

const SEEN_KEY = 'riva-ask-intro-v1';
const EXAMPLE = 'District nurses phone number';

// The three stops, each a control found on the page by its class. `ms` is
// how long it holds before moving on.
const STEPS = [
  { sel: '.riva-composer-input', ms: 2700, title: 'Type your question', body: 'Plain words, as you would ask a colleague. A name gets you its number.' },
  { sel: '.riva-modes-btn', ms: 3000, title: 'Choose the kind of answer', body: 'Q&A works most things out. The others write something up or look something up.' },
  { sel: '.riva-dock-send', ms: 2000, title: 'Press Enter to ask', body: 'Or the arrow. Esc in the box puts the mode back to Q&A.' },
];

const seen = () => {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return true; }
};

export default function AskIntro({ active }) {
  // -1 is waiting to start; STEPS.length is finished.
  const [step, setStep] = React.useState(-1);
  const [rect, setRect] = React.useState(null);
  const [typed, setTyped] = React.useState(0);
  // The caption's own height, so it can go below the stop when there is no
  // room above it (the modes list is tall, and the dock can sit high).
  const capRef = React.useRef(null);
  const [capH, setCapH] = React.useState(0);
  React.useLayoutEffect(() => {
    const h = capRef.current ? capRef.current.offsetHeight : 0;
    if (h !== capH) setCapH(h);
  });
  const done = step >= STEPS.length;

  // Start once the window has loaded and the page is in a state to be shown.
  React.useEffect(() => {
    if (!active || step !== -1 || seen()) return undefined;
    let timer;
    const go = () => {
      timer = setTimeout(() => {
        if (seen()) return;
        try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
        setStep(0);
      }, 700);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => { clearTimeout(timer); window.removeEventListener('load', go); };
  }, [active, step]);

  // Follow the current stop every frame rather than measuring it once: the
  // dock can still be settling into the middle of the page, and the window
  // can be resized under it. State is only set when the box actually moves.
  React.useLayoutEffect(() => {
    if (step < 0 || done) return undefined;
    let frame;
    let last = '';
    const measure = () => {
      const el = document.querySelector(STEPS[step].sel);
      if (!el) { setStep(STEPS.length); return; }
      const r = el.getBoundingClientRect();
      const key = [r.top, r.left, r.width, r.height].map(Math.round).join(',');
      if (key !== last) {
        last = key;
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step, done]);

  // Move on by itself.
  React.useEffect(() => {
    if (step < 0 || done) return undefined;
    const t = setTimeout(() => setStep((i) => i + 1), STEPS[step].ms);
    return () => clearTimeout(t);
  }, [step, done]);

  // The example question types itself into the first caption.
  React.useEffect(() => {
    if (step !== 0) return undefined;
    setTyped(0);
    const t = setInterval(() => setTyped((n) => (n >= EXAMPLE.length ? n : n + 1)), 45);
    return () => clearInterval(t);
  }, [step]);

  // Any key ends it, and so does the page leaving the empty state — somebody
  // who has already asked does not need telling how.
  React.useEffect(() => {
    if (step < 0 || done) return undefined;
    const end = () => setStep(STEPS.length);
    window.addEventListener('keydown', end);
    return () => window.removeEventListener('keydown', end);
  }, [step, done]);
  React.useEffect(() => {
    if (!active && step >= 0 && !done) setStep(STEPS.length);
  }, [active, step, done]);

  if (step < 0 || done || !rect) return null;

  const cur = STEPS[step];
  const pad = 8;
  const hole = {
    top: rect.top - pad, left: rect.left - pad,
    width: rect.width + pad * 2, height: rect.height + pad * 2,
  };
  // The caption sits above the stop: the dock is at the middle or the foot
  // of the page, so above is usually where the room is. When it is not, it
  // goes below. Clamped to the window either way.
  // On a short window with neither, it goes beside the stop, so it never
  // covers the control it is pointing at.
  const W = window.innerWidth;
  const H = window.innerHeight;
  const capW = Math.min(340, W - 32);
  const clampTop = (t) => Math.max(16, Math.min(t, H - capH - 16));
  let capPos;
  if (hole.top - 12 - capH >= 16) {
    capPos = { left: Math.max(16, Math.min(hole.left, W - capW - 16)), bottom: H - hole.top + 12 };
  } else if (hole.top + hole.height + 12 + capH <= H - 16) {
    capPos = { left: Math.max(16, Math.min(hole.left, W - capW - 16)), top: hole.top + hole.height + 12 };
  } else if (hole.left + hole.width + 12 + capW <= W - 16) {
    capPos = { left: hole.left + hole.width + 12, top: clampTop(hole.top + hole.height / 2 - capH / 2) };
  } else {
    capPos = { left: Math.max(16, hole.left - 12 - capW), top: clampTop(hole.top + hole.height / 2 - capH / 2) };
  }

  return (
    <div className="riva-intro" role="dialog" aria-label="How to ask a question" onClick={() => setStep(STEPS.length)}>
      <div className="riva-intro-hole" style={hole} />
      <div key={step} ref={capRef} className="riva-intro-cap" style={{ width: capW, ...capPos }}>
        <div className="riva-intro-count">{step + 1} of {STEPS.length}</div>
        <div className="riva-intro-title">{cur.title}</div>
        <div className="riva-intro-body">{cur.body}</div>

        {step === 0 && (
          <div className="riva-intro-field" aria-hidden="true">
            <span>{EXAMPLE.slice(0, typed)}</span>
            <span className="riva-intro-caret" />
          </div>
        )}

        {step === 1 && (
          <div className="riva-intro-modes" aria-hidden="true">
            {[...TOP_MODES, { label: MODE_FOLDER.label, icon: MODE_FOLDER.icon, summary: MODE_FOLDER.summary }].map((m, i) => (
              <div key={m.label} className="riva-intro-mode" style={{ animationDelay: 120 + i * 90 + 'ms' }}>
                <span className={'riva-mode-tile' + (i === 0 ? ' is-on' : '')}>
                  <Svg w={14} sw={2.1}>{Icons[m.icon] || Icons.search}</Svg>
                </span>
                <span className="riva-intro-mode-text">
                  <span className="riva-intro-mode-label">{m.label}</span>
                  <span className="riva-intro-mode-summary">{m.summary}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="riva-intro-keys" aria-hidden="true">
            <kbd>Enter</kbd><span>asks</span><kbd>Esc</kbd><span>back to Q&amp;A</span>
          </div>
        )}

        <div className="riva-intro-foot">
          <span className="riva-intro-dots">
            {STEPS.map((_, i) => <span key={i} className={i === step ? 'is-on' : ''} />)}
          </span>
          <button type="button" className="riva-intro-skip" onClick={() => setStep(STEPS.length)}>Got it</button>
        </div>
        <span key={'bar' + step} className="riva-intro-bar" style={{ animationDuration: cur.ms + 'ms' }} />
      </div>
    </div>
  );
}
