'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * SonarGrid — the dot grid over the light, answering back.
 *
 * Ported from n1m4mz's "Sonar Grid" (21st.dev, MIT). A canvas of dots in
 * the theme's colour; rings of brighter, larger dots spread out from
 * wherever somebody clicks, and an ambient ping now and then keeps it
 * alive. One ring is already mid-flight at first paint.
 *
 * It sits behind the shell with pointer-events off, so clicks are heard
 * on the window rather than on the canvas: a click anywhere on the page
 * sends a ring out from under it. While an answer is being worked out
 * (<html data-busy>) the pings come three times as often.
 *
 * COST
 * ----
 * Idles between rings (a timeout, not a frame loop), pauses in a hidden
 * tab, and draws a still grid under reduced motion.
 * ------------------------------------------------------------------ */

const MAX_DPR = 2;
const TAU = Math.PI * 2;
const AREA = [0.12, 0.15, 0.88, 0.85];

export default function SonarGrid({
  spacing = 24,
  dotRadius = 1.2,
  baseOpacity = 0.4,
  pingEvery = 3.2,
  speed = 240,
  ringWidth = 90,
  amplitude = 2.2,
  maxRings = 6,
  pingArea = AREA,
  className,
}) {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rings = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let timer = 0;
    let fill = '';

    const every = () => pingEvery * 1000 / (document.documentElement.dataset.busy ? 3 : 1);
    let nextPing = performance.now() + every();

    const readColor = () => { fill = getComputedStyle(canvas).color; };

    const addRing = (x, y, born) => {
      rings.push({ x, y, born });
      while (rings.length > maxRings) rings.shift();
    };

    const draw = (now) => {
      const lifetime = (Math.hypot(width, height) + ringWidth) / speed;
      rings = rings.filter((r) => (now - r.born) / 1000 < lifetime);
      const live = rings.map((r) => {
        const age = (now - r.born) / 1000;
        const radius = age * speed;
        return { x: r.x, y: r.y, radius, reach: radius + ringWidth, fade: 1 - age / lifetime };
      });

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = fill;

      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      const offsetX = (width - (cols - 1) * spacing) / 2;
      const offsetY = (height - (rows - 1) * spacing) / 2;

      // Pass 1: every resting dot in one path and one fill.
      const hot = [];
      ctx.globalAlpha = baseOpacity;
      ctx.beginPath();
      for (let i = 0; i < cols; i++) {
        const cx = offsetX + i * spacing;
        for (let j = 0; j < rows; j++) {
          const cy = offsetY + j * spacing;
          let energy = 0;
          for (const r of live) {
            if (Math.abs(cx - r.x) > r.reach || Math.abs(cy - r.y) > r.reach) continue;
            const dist = Math.abs(Math.hypot(cx - r.x, cy - r.y) - r.radius);
            if (dist >= ringWidth) continue;
            const t = 1 - dist / ringWidth;
            const k = t * t * (3 - 2 * t) * r.fade;
            if (k > energy) energy = k;
          }
          if (energy < 0.01) {
            ctx.moveTo(cx + dotRadius, cy);
            ctx.arc(cx, cy, dotRadius, 0, TAU);
          } else {
            hot.push(cx, cy, energy);
          }
        }
      }
      ctx.fill();

      // Pass 2: only the dots on a wavefront get their own alpha and size.
      for (let k = 0; k < hot.length; k += 3) {
        const energy = hot[k + 2];
        ctx.globalAlpha = baseOpacity + (1 - baseOpacity) * energy;
        ctx.beginPath();
        ctx.arc(hot[k], hot[k + 1], dotRadius * (1 + amplitude * energy), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now) => {
      raf = 0;
      if (document.hidden) return;
      if (reduceMotion.matches) { rings = []; draw(now); return; }
      if (now >= nextPing) {
        const [x0, y0, x1, y1] = pingArea;
        addRing(width * (x0 + Math.random() * (x1 - x0)), height * (y0 + Math.random() * (y1 - y0)), now);
        nextPing = now + every();
      }
      draw(now);
      if (rings.length > 0) raf = requestAnimationFrame(tick);
      else {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => tick(performance.now()), Math.max(16, nextPing - now));
      }
    };

    const wake = () => {
      if (raf) return;
      window.clearTimeout(timer);
      raf = requestAnimationFrame(tick);
    };

    let seeded = false;
    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!seeded) {
        seeded = true;
        const [x0, y0, x1, y1] = pingArea;
        if (!reduceMotion.matches) addRing(width * (x0 + (x1 - x0) * 0.68), height * (y0 + (y1 - y0) * 0.34), performance.now() - 500);
      }
      draw(performance.now());
    };

    const onDown = (e) => {
      if (reduceMotion.matches) return;
      const rect = host.getBoundingClientRect();
      addRing(e.clientX - rect.left, e.clientY - rect.top, performance.now());
      wake();
    };
    const onVisibility = () => { if (!document.hidden) wake(); };
    const onTheme = () => { readColor(); wake(); };
    // Busy flips the ping rate; pull the next ping in so it answers at once.
    const mo = new MutationObserver(() => {
      nextPing = Math.min(nextPing, performance.now() + every());
      readColor();
      wake();
    });

    const ro = new ResizeObserver(resize);
    readColor();
    resize();
    ro.observe(host);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-busy', 'data-theme', 'class', 'style'] });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('riva-theme', onTheme);
    document.addEventListener('visibilitychange', onVisibility);
    reduceMotion.addEventListener('change', wake);
    wake();

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('riva-theme', onTheme);
      document.removeEventListener('visibilitychange', onVisibility);
      reduceMotion.removeEventListener('change', wake);
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [spacing, dotRadius, baseOpacity, pingEvery, speed, ringWidth, amplitude, maxRings, pingArea]);

  return (
    <div ref={hostRef} aria-hidden="true" className={className}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
