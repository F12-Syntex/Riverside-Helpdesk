'use client';

import React from 'react';
import { readTheme } from './theme';
import { SHADERS, quad, program, frame } from './backgrounds';
import ThinkingGradient from './ThinkingGradient';

/* ------------------------------------------------------------------ *
 * PageBackground — the light behind every page.
 *
 * ONE canvas, fixed behind the whole shell, drawing whichever
 * background the theme picker has chosen (theme.js) in Mist (the
 * shaders are in backgrounds.js). It used to be two: the metaballs
 * here, and on top of them a second full-screen shader that Referrals,
 * Ask, Contacts and Settings each drew for themselves, so every page
 * paid for two moving skies and showed one. The pages now draw no
 * background at all and sit on this.
 *
 * CHANGING IT. The picker fires `riva-background`; the canvas fades
 * out, the new programme is built on the same context, and it fades
 * back in. No second context, no reload.
 *
 * IT SAYS WHEN THE ASSISTANT IS WORKING. While an answer is being
 * worked out (<html data-busy>, set by WorkingState) the energy eases
 * up: the colour comes up a little, the clock runs a touch quicker,
 * and the metaballs gather towards the middle. A faint swirl turns
 * over the top at the same time (ThinkingGradient) and fades with the
 * answer. Eased, never switched.
 *
 * WHAT IT DOES WHEN IT CANNOT
 * ---------------------------
 * No WebGL, a lost context, or the Still background: the canvas stays
 * clear over a CSS gradient of the same palette (.riva-sky). Reduced
 * motion: one frame is drawn and nothing moves.
 *
 * A LOST CONTEXT COMES BACK: the loss is not treated as final
 * (preventDefault) and the programme is rebuilt on restore.
 *
 * COST
 * ----
 * One quad at a third to a half of the screen's resolution (each
 * background says which; all are soft), thirty frames a second,
 * paused whenever the tab is hidden.
 * ------------------------------------------------------------------ */

const FADE_MS = 260;

export default function PageBackground() {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const root = document.documentElement;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return undefined;

    let alive = true;
    let raf = 0;
    let last = 0;
    let prev = performance.now();
    let current = null; // the built programme being drawn
    let wanted = readTheme();
    let swapTimer = 0;
    // The clock is shared by every background, so switching does not
    // start the new one from its first frame; it eases with the energy,
    // so a change of pace never jumps.
    let time = 20 + Math.random() * 40;
    let energy = root.dataset.busy ? 1 : 0;

    function size() {
      const def = current.def;
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      const scale = Math.min(def.res || 0.5, 960 / cssW);
      const w = Math.max(160, Math.floor(cssW * scale));
      const h = Math.max(90, Math.floor(cssH * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      return { w, h, cssW, cssH };
    }

    function draw() {
      if (!current || gl.isContextLost()) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const target = root.dataset.busy ? 1 : 0;
      energy += (target - energy) * Math.min(1, dt * 1.6);
      time += dt * current.def.speed * (1 + 0.45 * energy);
      frame(gl, current, { ...size(), time, energy });
    }

    function loop(now) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      draw();
    }

    function stop() { cancelAnimationFrame(raf); raf = 0; }

    function run() {
      stop();
      prev = performance.now();
      if (!current) return;
      if (reduced) { draw(); return; }
      if (!document.hidden) raf = requestAnimationFrame(loop);
    }

    // Build the chosen background on this context, replacing whatever was
    // there. Still (no shader) leaves the canvas clear over the CSS light.
    function build(id) {
      if (current) { gl.deleteProgram(current.prog); current = null; }
      if (!SHADERS[id]) { stop(); canvas.style.opacity = '0'; return; }
      current = program(gl, id);
      if (!current) { stop(); canvas.style.opacity = '0'; return; }
      draw();
      canvas.style.opacity = '1';
      run();
    }

    function begin() {
      quad(gl);
      build(wanted);
    }

    function onTheme(e) {
      wanted = e.detail;
      clearTimeout(swapTimer);
      if (canvas.style.opacity === '0' || reduced) { build(wanted); return; }
      canvas.style.opacity = '0';
      swapTimer = setTimeout(() => { if (alive) build(wanted); }, FADE_MS);
    }

    function onLost(e) {
      e.preventDefault();
      stop();
      current = null;
      canvas.style.opacity = '0';
    }
    function visibility() {
      if (document.hidden) stop();
      else if (current) run();
    }
    function onResize() { if (reduced || !raf) draw(); }

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', begin);
    window.addEventListener('resize', onResize);
    window.addEventListener('riva-background', onTheme);
    document.addEventListener('visibilitychange', visibility);
    begin();

    return () => {
      alive = false;
      stop();
      clearTimeout(swapTimer);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', begin);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('riva-background', onTheme);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  return (
    <div aria-hidden="true" className="riva-sky">
      <canvas ref={ref} className="riva-sky-canvas" />
      <ThinkingGradient />
    </div>
  );
}
