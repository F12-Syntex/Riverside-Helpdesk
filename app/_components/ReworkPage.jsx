'use client';

/* ------------------------------------------------------------------ *
 * TEMPORARY. The Q&A is being reworked after incorrect answers were
 * noticed, so this takes the place of the whole page and points people
 * at the Notebook, where the practice's own answers are kept.
 *
 * The design is the 21st.dev "Coming Soon Launch Teaser" (MIT, Mohammad
 * Shehadeh, hirael.com): a pill badge, a word-by-word serif headline and
 * a glowing planet horizon of sparkles. It is Tailwind there and this
 * project has none, so it is carried over as inline styles, in the
 * practice's blue, with a small canvas for the sparkles.
 *
 * To bring the Q&A back: set REWORK_ACTIVE to false (QaApp.jsx reads
 * it), or delete this file and the two lines that use it.
 * ------------------------------------------------------------------ */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { s, Hover, Svg, Icons } from './ui';

export const REWORK_ACTIVE = true;

const HEADLINE = 'The answers are being rebuilt';
const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Times New Roman',serif";

/* Slow twinkling points on a canvas. Still, when motion is reduced. */
function Sparkles({ reduce }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    let dots = [];

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 900);
      dots = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + Math.random() * 1.1,
        p: Math.random() * Math.PI * 2,
        sp: 0.6 + Math.random() * 1.6,
      }));
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        const a = reduce ? 0.55 : 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(d.p + (t / 1000) * d.sp));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#2f8bea';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    resize();
    draw(0);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

function Headline({ reduce }) {
  const words = HEADLINE.split(' ');
  const half = Math.floor(words.length / 2);
  return (
    <h1 style={{ ...s('margin:0;max-width:16ch;font-weight:500;line-height:1.04;letter-spacing:-0.025em;font-size:clamp(40px,7.2vw,76px);'), fontFamily: SERIF }}>
      {words.map((word, i) => (
        <motion.span key={word + i}
          style={{ display: 'inline-block', color: i < half ? '#7b8f9d' : '#212b32' }}
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 + i * 0.08 }}>
          {word}{i < words.length - 1 ? ' ' : null}
        </motion.span>
      ))}
    </h1>
  );
}

export default function ReworkPage() {
  const reduce = useReducedMotion();

  return (
    <main style={s('position:relative;isolation:isolate;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;overflow-x:hidden;overflow-y:auto;background:linear-gradient(180deg,#f0f4f5 0%,#f7fafb 55%,#eaf1f8 100%);')}>
      {/* A faint grid, fading out towards the edges. */}
      <div aria-hidden="true" style={s('position:absolute;inset:0;z-index:0;background-image:linear-gradient(rgba(33,43,50,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(33,43,50,.045) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(60% 55% at 50% 40%,#000,transparent);mask-image:radial-gradient(60% 55% at 50% 40%,#000,transparent);')} />

      <motion.div
        style={s('position:relative;z-index:2;width:100%;max-width:760px;margin:auto 0;padding:32px 24px 0;display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center;')}
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}>

        <motion.span
          style={s('display:inline-flex;align-items:center;gap:9px;height:30px;padding:0 15px;border-radius:15px;background:rgba(255,255,255,.75);border:1px solid #d5dee2;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#4c6272;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;')}
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}>
          <span style={s('position:relative;display:inline-flex;width:8px;height:8px;')}>
            <span style={s('position:absolute;inset:0;border-radius:50%;background:#e8a900;opacity:.45;animation:rivaReworkPing 1.8s ease-out infinite;')} />
            <span style={s('position:relative;width:8px;height:8px;border-radius:50%;background:#e8a900;')} />
          </span>
          Being reworked
        </motion.span>

        <Headline reduce={reduce} />

        <motion.p
          style={s('margin:4px 0 0;max-width:46ch;font-size:clamp(16px,2.1vw,19px);line-height:1.6;color:#4c6272;text-wrap:pretty;')}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}>
          Sorry — I noticed a lot of incorrect answers, so I’m changing how this works.
          Until it’s fixed, please don’t rely on it — check the practice notes
          for your answers instead.
        </motion.p>

        <motion.div
          style={s('margin-top:8px;display:flex;flex-direction:column;align-items:center;gap:12px;')}
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1 }}>
          <Hover tag="a" href="/notebook"
            base="display:inline-flex;align-items:center;gap:10px;height:52px;padding:0 26px;border-radius:26px;background:#005eb8;color:#fff;font:inherit;font-size:16.5px;font-weight:700;text-decoration:none;box-shadow:0 10px 28px rgba(0,94,184,.34);transition:background .15s ease,transform .15s ease,box-shadow .15s ease;"
            hover="background:#003087;transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,48,135,.36);">
            <Svg w={20} sw={2.2}>{Icons.book}</Svg>
            Open the practice notes
            <Svg w={18} sw={2.4}>{Icons.arrow}</Svg>
          </Hover>
        </motion.div>
      </motion.div>

      {/* The horizon: a planet's edge under a glow of sparkles. */}
      <div aria-hidden="true"
        style={s('position:relative;z-index:1;flex:none;width:100%;height:clamp(240px,34vh,380px);margin-top:-40px;overflow:hidden;-webkit-mask-image:radial-gradient(50% 55%,#000,transparent);mask-image:radial-gradient(50% 55%,#000,transparent);')}>
        <div style={s('position:absolute;left:-50%;top:48%;width:200%;aspect-ratio:1/.7;border-radius:100%;border-top:1px solid #aac7e0;background:linear-gradient(180deg,#fff,#eef4fa);')} />
        <div style={s('position:absolute;inset:0;background:radial-gradient(circle at 50% 100%,rgba(0,94,184,.42),transparent 70%);opacity:.5;')} />
        <div style={s('position:absolute;inset:0;-webkit-mask-image:radial-gradient(50% 55%,#000,transparent 85%);mask-image:radial-gradient(50% 55%,#000,transparent 85%);')}>
          <Sparkles reduce={reduce} />
        </div>
      </div>

      <style>{'@keyframes rivaReworkPing{0%{transform:scale(1);opacity:.5}80%,100%{transform:scale(2.6);opacity:0}}'}</style>
    </main>
  );
}
