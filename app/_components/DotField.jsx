'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * DotField: a field of floating particles behind the Q&A, in the manner
 * of Google Antigravity's hero.
 *
 * A few hundred tiny dashes scattered over the page, each floating on
 * its own slow orbit (the "antigravity"), each turned to point at a
 * focus, and each brightest when it sits in a ring round that focus. The
 * focus eases after the pointer, so the ring follows the reader around
 * the page; with no pointer (a phone) it sits behind the column and
 * wanders a little. Inside the ring the page is clear, which is where
 * the text is being read; outside it the dashes thin out to nothing.
 *
 * Three depths, for the layers of opacity: far dashes are small, faint
 * and barely move with the pointer or the scroll; near ones are larger,
 * stronger and move most. That difference in movement is the depth.
 *
 * Colour is by angle round the focus, through the theme's three colours
 * and NHS blue, so the ring reads as one sweep of colour and follows the
 * theme picker (the "riva-theme" event, as ShaderBackground does).
 *
 * While an answer is worked out (<html data-busy>) the ring turns and
 * breathes faster and draws in a little, the same cue the light behind
 * gives. With less motion wanted it is drawn once and left still. It
 * stops drawing while the tab is hidden.
 * ------------------------------------------------------------------ */

const DEPTHS = [
  { share: 0.45, len: 3.2, width: 1.3, alpha: 0.32, follow: 0.35, scroll: 0.04 }, // far
  { share: 0.35, len: 5, width: 1.7, alpha: 0.5, follow: 0.7, scroll: 0.1 },      // mid
  { share: 0.2, len: 7, width: 2.1, alpha: 0.62, follow: 1, scroll: 0.18 },        // near
];

function readColours() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
  return [pick('--rv-sky-a', '#41b6e6'), '#005eb8', pick('--rv-sky-c', '#8fd3f4'), pick('--rv-sky-b', '#003087')];
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return Number.isNaN(n) ? [0, 94, 184] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Colour at a point on the ring: the palette blended round the circle.
function ringColour(rgbs, angle) {
  const t = ((angle / (Math.PI * 2)) % 1 + 1) % 1 * rgbs.length;
  const i = Math.floor(t);
  const f = t - i;
  const a = rgbs[i];
  const b = rgbs[(i + 1) % rgbs.length];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export default function DotField({ scrollerId = 'riva-scroll' }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const scroller = document.getElementById(scrollerId);

    let w = 0; let h = 0; let dpr = 1;
    let parts = [];
    let rgbs = readColours().map(hexToRgb);
    const focus = { x: 0, y: 0, tx: 0, ty: 0, has: false };
    let busy = 0; // eased 0..1
    let raf = 0;
    let t0 = performance.now();

    // Scatter on a jittered grid so the field is even without looking
    // like a grid. Density is by area, capped for very large screens.
    function seed() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cell = w < 600 ? 34 : 30;
      parts = [];
      for (let y = -cell; y < h + cell; y += cell) {
        for (let x = -cell; x < w + cell; x += cell) {
          const r = Math.random();
          const depth = r < DEPTHS[0].share ? 0 : r < DEPTHS[0].share + DEPTHS[1].share ? 1 : 2;
          parts.push({
            x: x + Math.random() * cell, y: y + Math.random() * cell, depth,
            // Each floats on its own slow loop.
            ph: Math.random() * Math.PI * 2, sp: 0.25 + Math.random() * 0.5, amp: 3 + Math.random() * 6,
            k: 0.75 + Math.random() * 0.5,
          });
        }
      }
      if (!focus.has) {
        focus.x = focus.tx = w / 2; focus.y = focus.ty = h * 0.42;
      }
    }

    function draw(now) {
      const t = (now - t0) / 1000;
      const isBusy = document.documentElement.hasAttribute('data-busy');
      busy += ((isBusy ? 1 : 0) - busy) * 0.04;

      // No pointer: the focus sits behind the column and wanders a little.
      if (!focus.has) {
        focus.tx = w / 2 + Math.sin(t * 0.13) * w * 0.06;
        focus.ty = h * 0.42 + Math.cos(t * 0.11) * h * 0.05;
      }
      focus.x += (focus.tx - focus.x) * 0.06;
      focus.y += (focus.ty - focus.y) * 0.06;

      const scroll = scroller ? scroller.scrollTop : 0;
      const base = Math.min(w, h);
      // The ring: its radius breathes, and draws in while working.
      const R = base * (0.34 - busy * 0.05) * (1 + Math.sin(t * (0.6 + busy * 1.4)) * 0.035);
      const band = base * 0.2;
      const spin = t * (0.05 + busy * 0.35);

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const d = DEPTHS[p.depth];
        // Float, and move with the scroll by depth.
        let x = p.x + Math.cos(t * p.sp + p.ph) * p.amp;
        let y = p.y + Math.sin(t * p.sp * 0.8 + p.ph) * p.amp - ((scroll * d.scroll) % (h + 60));
        if (y < -30) y += h + 60;
        // The focus as this depth sees it: near dashes follow the pointer
        // most, far ones barely.
        const fx = w / 2 + (focus.x - w / 2) * d.follow;
        const fy = h * 0.42 + (focus.y - h * 0.42) * d.follow;
        const dx = x - fx; const dy = y - fy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Strongest on the ring, clear inside it, thinning outside.
        const off = (dist - R) / band;
        const inRing = Math.exp(-off * off * (off < 0 ? 2.2 : 0.9));
        const a = d.alpha * inRing * p.k;
        if (a < 0.02) continue;
        // Pulled a touch towards the ring, so it reads as a shape.
        const pull = (R - dist) * 0.08 * inRing;
        x += (dx / dist) * pull; y += (dy / dist) * pull;
        const ang = Math.atan2(dy, dx);
        const [r, g, b] = ringColour(rgbs, ang + spin);
        const len = d.len * (0.6 + inRing * 0.8);
        const ux = (dx / dist) * len * 0.5; const uy = (dy / dist) * len * 0.5;
        ctx.strokeStyle = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a.toFixed(3) + ')';
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(x - ux, y - uy);
        ctx.lineTo(x + ux, y + uy);
        ctx.stroke();
      }
    }

    function frame(now) {
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    function start() { if (!raf && !still && !document.hidden) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    const onMove = (e) => {
      if (coarse) return;
      const rect = canvas.getBoundingClientRect();
      focus.tx = e.clientX - rect.left; focus.ty = e.clientY - rect.top; focus.has = true;
    };
    const onLeave = () => { focus.has = false; };
    const onResize = () => { seed(); if (still) draw(performance.now()); };
    const onTheme = () => { rgbs = readColours().map(hexToRgb); if (still) draw(performance.now()); };
    const onVis = () => (document.hidden ? stop() : start());

    seed();
    if (still) draw(t0); else start();
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);
    window.addEventListener('riva-theme', onTheme);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('riva-theme', onTheme);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [scrollerId]);

  return <canvas ref={ref} aria-hidden="true" className="riva-dots" />;
}
