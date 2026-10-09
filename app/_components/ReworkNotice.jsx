'use client';

/* ------------------------------------------------------------------ *
 * TEMPORARY. The Q&A is being reworked after incorrect answers were
 * noticed, so for now this stands in front of it and points people at
 * the Notebook, which is where the practice's own answers are kept.
 *
 * To take it down: delete this file and the <ReworkNotice /> line in
 * QaApp.jsx. Nothing else depends on it.
 *
 * It is shown on every visit to the Q&A on purpose — a notice that is
 * dismissed once and then forgotten would let the next person trust an
 * answer they should be checking. "Continue anyway" only closes it for
 * this page view.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';

export default function ReworkNotice() {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="riva-rework-title"
      style={s('position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px 16px;overflow-y:auto;background:rgba(240,244,245,.72);backdrop-filter:blur(14px) saturate(1.1);-webkit-backdrop-filter:blur(14px) saturate(1.1);animation:rivaHeaderIn .35s ease both;')}
    >
      <div style={s('position:relative;width:100%;max-width:500px;background:#fff;border-radius:24px;border:1px solid rgba(213,222,226,.9);box-shadow:0 30px 80px rgba(33,43,50,.18),0 2px 6px rgba(33,43,50,.06);overflow:hidden;animation:rivaViewIn .45s cubic-bezier(.2,.7,.3,1) both;')}>
        {/* A soft wash of the practice blue across the top. */}
        <div aria-hidden="true" style={s('position:absolute;inset:0 0 auto 0;height:150px;background:radial-gradient(120% 100% at 50% 0%,rgba(0,94,184,.13),rgba(0,94,184,0) 70%);pointer-events:none;')} />

        <div style={s('position:relative;padding:38px 34px 30px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;')}>
          <span style={s('display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:18px;background:linear-gradient(145deg,#0a6fd6,#003087);color:#fff;box-shadow:0 10px 24px rgba(0,94,184,.32);')}>
            <Svg w={28} sw={2}>{Icons.edit}</Svg>
          </span>

          <span style={s('display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 11px;border-radius:13px;background:#fff7e0;border:1px solid #f5dd8f;color:#6b4e00;font-size:12.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;')}>
            <span style={s('width:7px;height:7px;border-radius:50%;background:#e8a900;')} />
            Being reworked
          </span>

          <h2 id="riva-rework-title" style={s('margin:2px 0 0;font-size:27px;line-height:1.2;letter-spacing:-0.02em;color:#212b32;')}>
            Sorry — I’m rebuilding this
          </h2>

          <p style={s('margin:0;font-size:16.5px;line-height:1.6;color:#4c6272;max-width:40ch;')}>
            I’ve noticed some of the answers here haven’t been right, so I’m reworking how it
            works. Until it’s fixed, please <strong style={s('color:#212b32;')}>don’t rely on these answers</strong> —
            check the <strong style={s('color:#212b32;')}>Practice notes</strong> instead.
          </p>

          <div style={s('width:100%;display:flex;flex-direction:column;gap:10px;margin-top:10px;')}>
            <Hover tag="a" href="/notebook"
              base="display:flex;align-items:center;justify-content:center;gap:9px;height:50px;border-radius:14px;background:#005eb8;color:#fff;font:inherit;font-size:16.5px;font-weight:700;text-decoration:none;box-shadow:0 8px 20px rgba(0,94,184,.28);transition:background .15s ease,transform .15s ease;"
              hover="background:#003087;transform:translateY(-1px);">
              <Svg w={19} sw={2.2}>{Icons.book}</Svg>
              Open the practice notes
            </Hover>
            <Hover tag="button" type="button" onClick={() => setOpen(false)}
              base="height:44px;border-radius:12px;border:none;background:transparent;color:#4c6272;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;"
              hover="background:#f0f4f5;color:#212b32;">
              Continue to the assistant anyway
            </Hover>
          </div>
        </div>
      </div>
    </div>
  );
}
