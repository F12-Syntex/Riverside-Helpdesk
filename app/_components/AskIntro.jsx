'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * The first look at the Q&A: how to ask, shown once.
 *
 * Reception were opening the page and not knowing what the box was
 * for — that it takes a question in plain words, that the pill under
 * it changes the KIND of answer, and that Enter is the whole of
 * sending. So the first time the page is opened in a browser session
 * it walks the three, quickly, over the real controls: a spotlight on
 * each and a short note beside it, on the same surface as the mode
 * menu. The modes stop opens the real menu rather than drawing a copy
 * of it. About six seconds end to end.
 *
 * Escape or a click moves on a stop; typing anything else ends it, as
 * does the page leaving the empty state.
 *
 * IT WAITS FOR THE PAGE. Nothing starts until the window has finished
 * loading and the pill has read its kept mode back (`active`), then a
 * beat more for the dock to land — a spotlight measured while the dock
 * is still sliding into the middle points at nothing.
 *
 * ONCE PER SESSION. The flag is in sessionStorage, written as the tour
 * starts rather than when it ends, so a reload half-way through does
 * not play it again. A new browser session gets it once more: a shared
 * reception machine is used by whoever is on, and the next person may
 * not have seen it.
 * ------------------------------------------------------------------ */

const SEEN_KEY = 'riva-ask-intro-v1';

// The three stops. `sel` is the control (the first must be there; the rest
// widen the spotlight when they are, like the open menu). `ms` is how long
// it holds before moving on by itself.
const STEPS = [
  { sel: ['.riva-composer-input'], ms: 1800, title: 'Type your question', body: 'Plain words, as you would ask a colleague — “district nurses phone number”.' },
  { sel: ['.riva-modes-btn', '.riva-modes-list'], ms: 2600, menu: true, title: 'Choose the kind of answer', body: 'Q&A works most things out. The others write something up or look something up.' },
  { sel: ['.riva-dock-send'], ms: 1500, title: 'Press Enter to ask', body: 'Esc in the box puts the mode back to Q&A.' },
];

const seen = () => {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return true; }
};

// The mode menu is opened by its own pill and closed the way any click
// elsewhere closes it, so the tour never holds the menu's state itself.
const openMenu = () => {
  if (document.querySelector('.riva-modes-open')) return;
  const btn = document.querySelector('.riva-modes-btn');
  if (btn) btn.click();
};
const closeMenu = () => {
  if (!document.querySelector('.riva-modes-open')) return;
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
};

export default function AskIntro({ active }) {
  // -1 is waiting to start; STEPS.length is finished.
  const [step, setStep] = React.useState(-1);
  const [rect, setRect] = React.useState(null);
  // The caption's own height, so it can go below the stop when there is no
  // room above it (the open menu is tall, and the dock can sit high).
  const capRef = React.useRef(null);
  const [capH, setCapH] = React.useState(0);
  React.useLayoutEffect(() => {
    const h = capRef.current ? capRef.current.offsetHeight : 0;
    if (h !== capH) setCapH(h);
  });
  const done = step >= STEPS.length;
  const next = React.useCallback(() => setStep((i) => i + 1), []);
  const end = React.useCallback(() => setStep(STEPS.length), []);

  // Start once the window has loaded and the page is in a state to be shown.
  React.useEffect(() => {
    if (!active || step !== -1 || seen()) return undefined;
    let timer;
    const go = () => {
      timer = setTimeout(() => {
        if (seen()) return;
        try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
        setStep(0);
      }, 300);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => { clearTimeout(timer); window.removeEventListener('load', go); };
  }, [active, step]);

  // The modes stop shows the real menu, and puts it away on the way out.
  React.useEffect(() => {
    if (step < 0 || done || !STEPS[step].menu) return undefined;
    openMenu();
    return closeMenu;
  }, [step, done]);

  // Over: back to the field, ready to type.
  React.useEffect(() => {
    if (!done || !active) return;
    const input = document.querySelector('.riva-composer-input');
    if (input) input.focus();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the current stop every frame rather than measuring it once: the
  // dock can still be settling into the middle of the page, the menu is
  // still opening, and the window can be resized under it. State is only
  // set when the box actually moves.
  React.useLayoutEffect(() => {
    if (step < 0 || done) return undefined;
    let frame;
    let last = '';
    const measure = () => {
      const els = STEPS[step].sel.map((q) => document.querySelector(q));
      if (!els[0]) { end(); return; }
      const rs = els.filter(Boolean).map((el) => el.getBoundingClientRect());
      const top = Math.min(...rs.map((r) => r.top));
      const left = Math.min(...rs.map((r) => r.left));
      const width = Math.max(...rs.map((r) => r.right)) - left;
      const height = Math.max(...rs.map((r) => r.bottom)) - top;
      const key = [top, left, width, height].map(Math.round).join(',');
      if (key !== last) {
        last = key;
        setRect({ top, left, width, height });
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step, done, end]);

  // Move on by itself.
  React.useEffect(() => {
    if (step < 0 || done) return undefined;
    const t = setTimeout(next, STEPS[step].ms);
    return () => clearTimeout(t);
  }, [step, done, next]);

  // Escape moves on a stop. Caught on the way down, before the open menu's
  // own Escape handler can swallow it. Any other key is somebody already
  // typing, who does not need telling how.
  React.useEffect(() => {
    if (step < 0 || done) return undefined;
    const onKey = (e) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        next();
      } else {
        end();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, done, next, end]);
  React.useEffect(() => {
    if (!active && step >= 0 && !done) end();
  }, [active, step, done, end]);

  if (step < 0 || done || !rect) return null;

  const cur = STEPS[step];
  const pad = 6;
  const hole = {
    top: rect.top - pad, left: rect.left - pad,
    width: rect.width + pad * 2, height: rect.height + pad * 2,
  };
  // The caption sits above the stop: the dock is at the middle or the foot
  // of the page, so above is usually where the room is. When it is not, it
  // goes below. On a short window with neither, it goes beside the stop, so
  // it never covers the control it is pointing at. Clamped to the window.
  const W = window.innerWidth;
  const H = window.innerHeight;
  const capW = Math.min(300, W - 32);
  const clampTop = (t) => Math.max(16, Math.min(t, H - capH - 16));
  let capPos;
  if (hole.top - 10 - capH >= 16) {
    capPos = { left: Math.max(16, Math.min(hole.left, W - capW - 16)), bottom: H - hole.top + 10 };
  } else if (hole.top + hole.height + 10 + capH <= H - 16) {
    capPos = { left: Math.max(16, Math.min(hole.left, W - capW - 16)), top: hole.top + hole.height + 10 };
  } else if (hole.left + hole.width + 10 + capW <= W - 16) {
    capPos = { left: hole.left + hole.width + 10, top: clampTop(hole.top + hole.height / 2 - capH / 2) };
  } else {
    capPos = { left: Math.max(16, hole.left - 10 - capW), top: clampTop(hole.top + hole.height / 2 - capH / 2) };
  }

  return (
    <div className="riva-intro" role="dialog" aria-label="How to ask a question" onClick={next}>
      <div className="riva-intro-hole" style={hole} />
      <div key={step} ref={capRef} className="riva-intro-cap" style={{ width: capW, ...capPos }}>
        <div className="riva-modes-title">{step + 1} of {STEPS.length}</div>
        <div className="riva-intro-text">
          <div className="riva-mode-label">{cur.title}</div>
          <div className="riva-intro-body">{cur.body}</div>
        </div>
        <div className="riva-modes-foot">
          <span><kbd>Esc</kbd> next</span>
          <button type="button" className="riva-intro-skip" onClick={(e) => { e.stopPropagation(); end(); }}>Skip</button>
        </div>
      </div>
    </div>
  );
}
