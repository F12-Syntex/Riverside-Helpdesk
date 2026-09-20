'use client';

/* ------------------------------------------------------------------ *
 * The Notebook's UI kit.
 *
 * Every control the Notebook draws is defined once, here, as a real CSS
 * class rather than a string of inline styles pasted from the last
 * button. That is the whole reason this file exists: the old page had
 * nine slightly different button shapes, three modal styles and two
 * tab bars, because each one was written where it was needed. Here a
 * modal is a modal wherever it opens, a 36px control is 36px tall next
 * to every other one, and changing the hover colour is one line.
 *
 * Tokens are CSS custom properties so the classes stay short and the
 * palette is in one block. Geometry is on an 8px grid with three
 * control heights (30 / 36 / 42) and four radii, which is what makes
 * rows line up without anyone nudging a padding.
 * ------------------------------------------------------------------ */

import React from 'react';
import { Svg, Icons } from '../ui';

// The colours the JS side still needs (SVG fills, inline edge cases).
export const T = {
  ink: '#1c2b33', mut: '#4c6272', dim: '#7c8b94', line: '#dde5e9', lineSoft: '#eaeff2',
  soft: '#f1f5f7', canvas: '#f4f7f9', blue: '#005eb8', navy: '#003087', tint: '#e9f2fa',
  green: '#007f3b', red: '#d5281b', amber: '#a4610a', white: '#ffffff',
};

// Glyphs the kit needs that the shared set does not carry.
export const NBIcons = {
  dots: (<><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>),
  layers: (<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>),
};

export const KIT_CSS = `
:root{
  --nbk-ink:#1c2b33;--nbk-mut:#4c6272;--nbk-dim:#7c8b94;
  --nbk-line:#dde5e9;--nbk-line-soft:#eaeff2;--nbk-soft:#f1f5f7;--nbk-canvas:#f4f7f9;
  --nbk-blue:#005eb8;--nbk-navy:#003087;--nbk-tint:#e9f2fa;
  --nbk-green:#007f3b;--nbk-red:#d5281b;--nbk-amber:#a4610a;
  --nbk-r-xs:6px;--nbk-r-sm:9px;--nbk-r-md:12px;--nbk-r-lg:16px;
  --nbk-sh-1:0 1px 2px rgba(20,40,55,.07);
  --nbk-sh-2:0 10px 30px rgba(20,40,55,.14);
  --nbk-sh-3:0 28px 70px rgba(14,30,42,.3);
}

/* ------------------------------- shell ------------------------------ */
.nbk-scroll{scrollbar-width:thin;scrollbar-color:#cfd9de transparent;}
.nbk-scroll::-webkit-scrollbar{width:10px;height:10px;}
.nbk-scroll::-webkit-scrollbar-thumb{background:#cfd9de;border:3px solid transparent;background-clip:padding-box;border-radius:999px;}
.nbk-scroll::-webkit-scrollbar-thumb:hover{background:#b3c1c9;background-clip:padding-box;}
.nbk-scroll::-webkit-scrollbar-track{background:transparent;}
.nbk-hide-scroll{scrollbar-width:none;-ms-overflow-style:none;}
.nbk-hide-scroll::-webkit-scrollbar{display:none;}

/* ------------------------------ buttons ----------------------------- */
.nbk-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 14px;
  border:1px solid transparent;border-radius:var(--nbk-r-sm);background:none;font:inherit;font-size:13.5px;
  font-weight:600;line-height:1;letter-spacing:-.005em;white-space:nowrap;cursor:pointer;
  transition:background-color .14s ease,border-color .14s ease,color .14s ease,box-shadow .14s ease,transform .08s ease;}
.nbk-btn:active:not([disabled]){transform:translateY(1px);}
.nbk-btn[disabled]{opacity:.5;cursor:default;transform:none;}
.nbk-btn--sm{height:30px;padding:0 11px;font-size:12.5px;gap:6px;}
.nbk-btn--lg{height:42px;padding:0 18px;font-size:15px;}
.nbk-btn--block{width:100%;}
.nbk-btn--primary{background:var(--nbk-blue);color:#fff;box-shadow:var(--nbk-sh-1);}
.nbk-btn--primary:hover:not([disabled]){background:var(--nbk-navy);}
.nbk-btn--secondary{background:#fff;border-color:var(--nbk-line);color:var(--nbk-ink);box-shadow:var(--nbk-sh-1);}
.nbk-btn--secondary:hover:not([disabled]){border-color:#a9c3d6;background:#fafdff;color:var(--nbk-navy);}
.nbk-btn--ghost{color:var(--nbk-mut);}
.nbk-btn--ghost:hover:not([disabled]){background:var(--nbk-soft);color:var(--nbk-ink);}
.nbk-btn--success{background:var(--nbk-green);color:#fff;box-shadow:var(--nbk-sh-1);}
.nbk-btn--success:hover:not([disabled]){background:#00612f;}
.nbk-btn--danger{background:var(--nbk-red);color:#fff;box-shadow:var(--nbk-sh-1);}
.nbk-btn--danger:hover:not([disabled]){background:#a81d13;}
.nbk-btn--quiet-danger{background:#fff;border-color:#f0cfcb;color:#a81d13;}
.nbk-btn--quiet-danger:hover:not([disabled]){background:#fdf4f3;border-color:#dfa49c;}

.nbk-ibtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;
  border:1px solid var(--nbk-line);border-radius:var(--nbk-r-sm);background:#fff;color:var(--nbk-mut);
  cursor:pointer;box-shadow:var(--nbk-sh-1);
  transition:background-color .14s ease,border-color .14s ease,color .14s ease,transform .08s ease;}
.nbk-ibtn:active:not([disabled]){transform:translateY(1px);}
.nbk-ibtn[disabled]{opacity:.5;cursor:default;transform:none;}
.nbk-ibtn:hover:not([disabled]){color:var(--nbk-blue);border-color:#a9c3d6;background:#f8fcff;}
.nbk-ibtn--danger:hover:not([disabled]){color:var(--nbk-red);border-color:#e6b5af;background:#fdf4f3;}
.nbk-ibtn--plain{border-color:transparent;background:none;box-shadow:none;width:32px;height:32px;}
.nbk-ibtn--plain:hover:not([disabled]){background:var(--nbk-soft);border-color:transparent;}
.nbk-ibtn--sm{width:28px;height:28px;}
.nbk-ibtn--on{background:var(--nbk-tint);border-color:#a9c3d6;color:var(--nbk-navy);}

/* -------------------------------- tabs ------------------------------ */
.nbk-tabs{display:inline-flex;align-items:center;gap:2px;padding:3px;background:var(--nbk-soft);
  border:1px solid var(--nbk-line);border-radius:11px;}
.nbk-tabs--block{display:flex;width:100%;}
.nbk-tab{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;
  border:none;border-radius:8px;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--nbk-mut);
  cursor:pointer;transition:background-color .14s ease,color .14s ease,box-shadow .14s ease;}
.nbk-tab:hover{color:var(--nbk-ink);}
.nbk-tab[aria-selected="true"]{background:#fff;color:var(--nbk-navy);box-shadow:var(--nbk-sh-1);}

/* ------------------------------- fields ----------------------------- */
.nbk-field{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;background:#fff;
  border:1px solid var(--nbk-line);border-radius:var(--nbk-r-sm);
  transition:border-color .14s ease,box-shadow .14s ease;}
.nbk-field:focus-within{border-color:var(--nbk-blue);box-shadow:0 0 0 3px rgba(0,94,184,.13);}
.nbk-field input{flex:1;min-width:0;border:none;outline:none;background:none;font:inherit;font-size:14px;color:var(--nbk-ink);}
.nbk-field input::placeholder{color:var(--nbk-dim);}

.nbk-title-input{flex:1;min-width:80px;border:none;outline:none;background:none;font:inherit;font-size:17px;
  font-weight:700;letter-spacing:-.01em;color:var(--nbk-ink);padding:4px 6px;border-radius:7px;
  transition:background-color .14s ease,box-shadow .14s ease;}
.nbk-title-input:hover{background:var(--nbk-soft);}
.nbk-title-input:focus{background:#fff;box-shadow:0 0 0 2px var(--nbk-blue);}

/* ------------------------------- cards ------------------------------ */
.nbk-card{background:#fff;border:1px solid var(--nbk-line);border-radius:var(--nbk-r-md);box-shadow:var(--nbk-sh-1);}
.nbk-label{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--nbk-dim);}

.nbk-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;
  font-size:11px;font-weight:700;letter-spacing:.01em;white-space:nowrap;}
.nbk-chip__dot{flex:none;width:7px;height:7px;border-radius:2px;}

.nbk-status{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;
  font-size:12px;font-weight:600;background:var(--nbk-soft);color:var(--nbk-mut);}
.nbk-status__dot{width:7px;height:7px;border-radius:50%;background:currentColor;}
.nbk-status--saving{background:var(--nbk-tint);color:var(--nbk-navy);}
.nbk-status--saved{background:#e6f4ec;color:#00612f;}
.nbk-status--error{background:#fdecea;color:#a81d13;}

/* ------------------------------ banners ----------------------------- */
.nbk-banner{display:flex;align-items:flex-start;gap:11px;padding:12px 14px;border-radius:var(--nbk-r-md);
  border:1px solid var(--nbk-line);background:#fff;font-size:13.5px;line-height:1.5;color:var(--nbk-mut);}
.nbk-banner--info{background:var(--nbk-tint);border-color:#c5dcef;color:var(--nbk-navy);}
.nbk-banner--warn{background:#fdf5e8;border-color:#ecd7ae;color:#7a4708;}
.nbk-banner--danger{background:#fdecea;border-color:#f0c6c1;color:#a81d13;}
.nbk-banner--success{background:#e8f5ed;border-color:#b9ddc8;color:#00612f;}

.nbk-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  padding:40px 24px;text-align:center;color:var(--nbk-mut);}
.nbk-empty__icon{width:52px;height:52px;border-radius:15px;display:flex;align-items:center;justify-content:center;
  background:var(--nbk-soft);color:#9fb0bb;}
.nbk-empty__title{font-size:16px;font-weight:700;color:var(--nbk-ink);}
.nbk-empty__body{max-width:380px;font-size:13.5px;line-height:1.55;}

/* ------------------------------- modals ----------------------------- */
.nbk-overlay{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;
  padding:24px;background:rgba(16,32,43,.5);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
  overflow:auto;animation:nbk-fade .14s ease;}
.nbk-modal{width:100%;max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:#fff;
  border-radius:var(--nbk-r-lg);box-shadow:var(--nbk-sh-3);overflow:hidden;animation:nbk-pop .16s ease;}
.nbk-modal--sm{max-width:440px;}
.nbk-modal--md{max-width:620px;}
.nbk-modal--lg{max-width:940px;}
.nbk-modal--xl{max-width:1280px;}
.nbk-modal__head{flex:none;display:flex;align-items:flex-start;gap:13px;padding:20px 22px 14px;}
.nbk-modal__icon{flex:none;width:38px;height:38px;border-radius:11px;display:flex;align-items:center;
  justify-content:center;background:var(--nbk-tint);color:var(--nbk-blue);}
.nbk-modal__icon--danger{background:#fdecea;color:var(--nbk-red);}
.nbk-modal__icon--warn{background:#fdf5e8;color:var(--nbk-amber);}
.nbk-modal__icon--success{background:#e8f5ed;color:var(--nbk-green);}
.nbk-modal__title{margin:0;font-size:18.5px;font-weight:700;letter-spacing:-.012em;color:var(--nbk-ink);}
.nbk-modal__sub{margin:4px 0 0;font-size:13.5px;line-height:1.55;color:var(--nbk-mut);}
.nbk-modal__body{flex:1;min-height:0;overflow:auto;padding:4px 22px 6px;font-size:14px;line-height:1.6;color:var(--nbk-mut);}
.nbk-modal__body--flush{padding:0;}
.nbk-modal__foot{flex:none;display:flex;align-items:center;gap:8px;justify-content:flex-end;
  padding:14px 18px;margin-top:14px;border-top:1px solid var(--nbk-line-soft);background:#fbfdfe;}
.nbk-modal__foot--split{justify-content:space-between;}
@media (max-width:640px){
  .nbk-overlay{align-items:flex-end;padding:0;}
  .nbk-modal{max-width:none !important;max-height:92vh;border-radius:18px 18px 0 0;animation:nbk-up .2s ease;}
}

/* -------------------------------- menu ------------------------------ */
.nbk-menu{position:fixed;z-index:130;min-width:216px;max-width:300px;max-height:min(560px,80vh);overflow:auto;
  display:flex;flex-direction:column;padding:6px;background:#fff;border:1px solid var(--nbk-line);
  border-radius:var(--nbk-r-md);box-shadow:var(--nbk-sh-2);animation:nbk-pop .12s ease;}
.nbk-menu__item{display:flex;align-items:center;gap:10px;width:100%;border:none;background:none;border-radius:8px;
  padding:8px 10px;font:inherit;font-size:14px;color:var(--nbk-ink);text-align:left;cursor:pointer;
  transition:background-color .12s ease,color .12s ease;}
.nbk-menu__item:hover{background:var(--nbk-soft);}
.nbk-menu__item--accent{color:var(--nbk-blue);}
.nbk-menu__item--accent:hover{background:var(--nbk-tint);}
.nbk-menu__item--danger{color:var(--nbk-red);}
.nbk-menu__item--danger:hover{background:#fdf4f3;}
.nbk-menu__label{padding:9px 10px 4px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--nbk-dim);}
.nbk-menu__sep{height:1px;background:var(--nbk-line-soft);margin:5px 4px;}
.nbk-menu__opt{display:flex;align-items:flex-start;gap:10px;width:100%;border:none;background:none;border-radius:9px;
  padding:8px 10px;margin:1px 0;font:inherit;text-align:left;cursor:pointer;transition:background-color .12s ease;}
.nbk-menu__opt:hover{background:var(--nbk-soft);}
.nbk-menu__swatch{flex:none;margin-top:3px;width:11px;height:11px;border-radius:3px;}

/* ------------------------------ progress ---------------------------- */
.nbk-bar{height:8px;border-radius:999px;background:var(--nbk-soft);overflow:hidden;}
.nbk-bar__fill{height:100%;border-radius:999px;background:var(--nbk-blue);transition:width .25s ease;}
.nbk-bar__fill--idle{width:38%;animation:nbk-slide 1.1s ease-in-out infinite;}

.nbk-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:140;display:flex;align-items:center;
  gap:12px;padding:10px 12px 10px 18px;border-radius:999px;background:#17252e;color:#fff;font-size:13.5px;
  font-weight:600;box-shadow:var(--nbk-sh-2);animation:nbk-pop .16s ease;max-width:min(680px,calc(100vw - 32px));}

/* ------------------------------ tree rows --------------------------- */
.nbk-row{position:relative;display:flex;align-items:center;gap:2px;border-radius:9px;padding:0 4px 0 2px;
  transition:background-color .12s ease;}
.nbk-row:hover{background:#f2f7fb;}
.nbk-row--path{background:#f6fafd;}
.nbk-row--on{background:var(--nbk-tint);}
.nbk-row__btn{flex:1;min-width:0;display:flex;align-items:center;gap:8px;border:none;background:none;font:inherit;
  font-size:14px;color:var(--nbk-ink);text-align:left;padding:7px 2px;cursor:pointer;}
.nbk-row--on .nbk-row__btn{color:var(--nbk-navy);font-weight:600;}
.nbk-row__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nbk-row__actions{flex:none;display:flex;align-items:center;gap:1px;opacity:0;transition:opacity .12s ease;}
.nbk-row:hover .nbk-row__actions,.nbk-row:focus-within .nbk-row__actions{opacity:1;}
.nbk-row--drag{opacity:.45;}
.nbk-row--drop{background:var(--nbk-tint) !important;box-shadow:inset 0 0 0 2px var(--nbk-blue);}
.nbk-kids{margin-left:14px;padding-left:8px;border-left:var(--nbk-edge-w,1.5px) solid var(--nbk-edge,var(--nbk-line));}
.nbk-kids>div>.nbk-row::before{content:"";position:absolute;left:-8px;top:50%;width:6px;
  height:var(--nbk-edge-w,1.5px);background:var(--nbk-edge,var(--nbk-line));}

/* ------------------------------ toolbar ----------------------------- */
.nbk-toolbar{flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:1px;padding:6px 16px;background:#fff;
  border-bottom:1px solid var(--nbk-line-soft);}
.nbk-tbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:32px;
  padding:0 7px;border:none;border-radius:8px;background:none;color:var(--nbk-mut);font:inherit;font-size:12.5px;
  font-weight:700;cursor:pointer;transition:background-color .12s ease,color .12s ease;}
.nbk-tbtn:hover{background:var(--nbk-soft);color:var(--nbk-ink);}
.nbk-tbtn--on{background:var(--nbk-tint);color:var(--nbk-navy);}
.nbk-tbtn--accent{color:var(--nbk-blue);}
.nbk-tbtn--accent:hover{background:var(--nbk-tint);}
.nbk-tsep{flex:none;width:1px;height:18px;background:var(--nbk-line);margin:0 7px;}
.nbk-swatch{width:14px;height:14px;border-radius:999px;border:1.5px solid #fff;}

/* -------------------------------- diff ------------------------------ */
.nbk-diff{font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.6;background:#fbfdfe;}
.nbk-diff__line{display:flex;gap:10px;padding:1px 18px;white-space:pre-wrap;word-break:break-word;color:var(--nbk-mut);}
.nbk-diff__line--add{background:#e7f5ec;color:#00542b;}
.nbk-diff__line--del{background:#fbe9e7;color:#8a1206;text-decoration:line-through;}
.nbk-diff__gutter{flex:none;width:12px;user-select:none;opacity:.7;}

/* ------------------------- writing surface -------------------------- */
.nbk-prose{flex:1;outline:none;width:100%;max-width:880px;margin:0 auto;padding:28px 32px 160px;
  font-size:16px;line-height:1.68;color:var(--nbk-ink);caret-color:var(--nbk-blue);}
.nbk-prose:focus-visible{background:#fff !important;color:var(--nbk-ink) !important;box-shadow:none !important;}
.nbk-prose>:first-child{margin-top:0;}
.nbk-prose p{margin:0 0 11px;}
.nbk-prose h1,.nbk-prose h2,.nbk-prose h3,.nbk-prose h4{margin:26px 0 10px;font-weight:700;letter-spacing:-.015em;color:var(--nbk-ink);}
.nbk-prose h1{font-size:27px;padding-bottom:7px;border-bottom:1px solid var(--nbk-line-soft);}
.nbk-prose h2{font-size:22px;padding-bottom:6px;border-bottom:1px solid var(--nbk-line-soft);}
.nbk-prose h3{font-size:18.5px;}
.nbk-prose h4{font-size:16.5px;}
.nbk-prose ul,.nbk-prose ol{margin:0 0 12px;padding-left:24px;}
.nbk-prose ul ul,.nbk-prose ol ol,.nbk-prose ul ol,.nbk-prose ol ul{margin-bottom:0;}
.nbk-prose li{margin:3px 0;}
.nbk-prose li>p{margin:0;}
.nbk-prose ul>li::marker{color:var(--nbk-blue);}
.nbk-prose ol>li::marker{color:var(--nbk-blue);font-weight:600;font-variant-numeric:tabular-nums;}
.nbk-prose ul[data-type="taskList"]{list-style:none;padding-left:2px;}
.nbk-prose ul[data-type="taskList"] li{display:flex;gap:9px;align-items:flex-start;}
.nbk-prose ul[data-type="taskList"] li>label{flex:none;margin-top:5px;}
.nbk-prose ul[data-type="taskList"] li>label input{width:15px;height:15px;accent-color:var(--nbk-blue);cursor:pointer;margin:0;}
.nbk-prose ul[data-type="taskList"] li>div{flex:1;min-width:0;}
.nbk-prose li[data-checked="true"]>div{text-decoration:line-through;color:var(--nbk-dim);}
.nbk-prose blockquote{margin:0 0 12px;border-left:3px solid var(--nbk-blue);background:var(--nbk-tint);
  padding:11px 15px;border-radius:0 10px 10px 0;font-size:15.5px;}
.nbk-prose blockquote p{margin:0;}
.nbk-prose code{font-family:Consolas,Menlo,monospace;font-size:.9em;background:var(--nbk-soft);border-radius:5px;padding:1px 5px;}
.nbk-prose pre{margin:0 0 12px;background:var(--nbk-soft);border-radius:10px;padding:13px 15px;overflow-x:auto;}
.nbk-prose pre code{background:none;padding:0;}
.nbk-prose mark{background:#fff3c4;border-radius:3px;padding:0 3px;}
.nbk-prose kbd{font-family:Consolas,Menlo,monospace;font-size:.85em;background:var(--nbk-soft);
  border:1px solid var(--nbk-line);border-bottom-width:2px;border-radius:6px;padding:1px 6px;}
.nbk-prose img{max-width:100%;height:auto;display:block;margin:8px 0 16px;border-radius:10px;border:1px solid var(--nbk-line-soft);}
.nbk-prose img.ProseMirror-selectednode{outline:2.5px solid var(--nbk-blue);outline-offset:1px;}
.nbk-prose hr{border:none;border-top:1px solid var(--nbk-line);margin:22px 0;}
.nbk-prose hr.ProseMirror-selectednode{border-top:2px solid var(--nbk-blue);}
.nbk-prose a{color:var(--nbk-blue);}
.nbk-prose s{color:var(--nbk-dim);}
.nbk-prose .tableWrapper{margin:0 0 14px;overflow-x:auto;}
.nbk-prose table{border-collapse:collapse;min-width:50%;}
.nbk-prose th,.nbk-prose td{border:1px solid var(--nbk-line);padding:9px 12px;font-size:15px;line-height:1.5;
  text-align:left;vertical-align:top;position:relative;min-width:48px;}
.nbk-prose th{background:var(--nbk-soft);font-weight:700;}
.nbk-prose th p,.nbk-prose td p{margin:0;}
.nbk-prose .selectedCell::after{content:"";position:absolute;inset:0;background:rgba(0,94,184,.08);pointer-events:none;}
.nbk-prose p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:var(--nbk-dim);float:left;
  height:0;pointer-events:none;white-space:pre-wrap;}

/* ----------------------------- animation ---------------------------- */
@keyframes nbk-fade{from{opacity:0;}to{opacity:1;}}
@keyframes nbk-pop{from{opacity:0;transform:translateY(8px) scale(.985);}to{opacity:1;transform:none;}}
@keyframes nbk-up{from{transform:translateY(100%);}to{transform:none;}}
@keyframes nbk-slide{0%{margin-left:-38%;}100%{margin-left:100%;}}
@media (prefers-reduced-motion:reduce){
  .nbk-overlay,.nbk-modal,.nbk-menu,.nbk-toast{animation:none;}
  .nbk-bar__fill--idle{animation:none;margin-left:0;width:100%;opacity:.45;}
}
`;

/**
 * The kit's stylesheet.
 *
 * dangerouslySetInnerHTML rather than a text child: a plain child is
 * HTML-escaped on the server and not on the client, which is a hydration
 * mismatch on every > and " in the CSS.
 */
export function NotebookStyles() {
  return <style data-nbk-kit="1" dangerouslySetInnerHTML={{ __html: KIT_CSS }} />;
}

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Spinner({ w = 15 }) {
  return <Svg w={w} sw={2.4} style={{ animation: 'rivaSpin 1s linear infinite' }}>{Icons.spinner}</Svg>;
}

export function Button({ variant = 'secondary', size = 'md', icon, trailing, loading = false, block = false, className = '', children, ...rest }) {
  const gl = size === 'sm' ? 14 : 16;
  return (
    <button type="button" {...rest} className={cx('nbk-btn', 'nbk-btn--' + variant, size !== 'md' && 'nbk-btn--' + size, block && 'nbk-btn--block', className)}>
      {loading ? <Spinner w={gl} /> : icon ? <Svg w={gl} sw={2.2}>{icon}</Svg> : null}
      {children}
      {trailing && <Svg w={gl - 2} sw={2.2}>{trailing}</Svg>}
    </button>
  );
}

export function IconButton({ icon, label, tone = '', plain = false, size = 'md', on = false, className = '', ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={cx('nbk-ibtn', plain && 'nbk-ibtn--plain', size === 'sm' && 'nbk-ibtn--sm', tone && 'nbk-ibtn--' + tone, on && 'nbk-ibtn--on', className)}>
      <Svg w={size === 'sm' ? 14 : 16} sw={2.1}>{icon}</Svg>
    </button>
  );
}

/** A segmented control. `items` is [{ id, label, icon }]. */
export function Tabs({ items, value, onChange, block = false, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('nbk-tabs', block && 'nbk-tabs--block')}>
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className="nbk-tab" onClick={() => onChange(t.id)}>
          {t.icon && <Svg w={14} sw={2.2}>{t.icon}</Svg>}{t.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = 'Search', onClear }) {
  return (
    <div className="nbk-field">
      <Svg w={16} sw={2} style={{ flex: 'none', color: T.dim }}>{Icons.search}</Svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value ? <IconButton plain size="sm" icon={Icons.close} label="Clear search" onClick={() => (onClear ? onClear() : onChange(''))} /> : null}
    </div>
  );
}

export function Chip({ colour, children, dot = false, title }) {
  const c = colour || { ink: T.mut, tint: T.soft, edge: T.line };
  return (
    <span className="nbk-chip" title={title}
      style={{ color: c.ink, background: c.tint, boxShadow: 'inset 0 0 0 1px ' + c.edge }}>
      {dot && <span className="nbk-chip__dot" style={{ background: c.ink }} />}
      {children}
    </span>
  );
}

/** Saving / Saved / Not saved, as one pill that never changes width abruptly. */
export function StatusPill({ state }) {
  if (!state) return null;
  const map = {
    saving: ['nbk-status--saving', 'Saving'],
    saved: ['nbk-status--saved', 'Saved'],
    unsaved: ['nbk-status--error', 'Not saved'],
  };
  const hit = map[state];
  if (!hit) return null;
  return <span className={cx('nbk-status', hit[0])}><span className="nbk-status__dot" />{hit[1]}</span>;
}

export function Banner({ tone = 'info', icon, children, actions }) {
  return (
    <div className={cx('nbk-banner', 'nbk-banner--' + tone)}>
      {icon && <Svg w={17} sw={2} style={{ flex: 'none', marginTop: '1px' }}>{icon}</Svg>}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {actions && <div style={{ flex: 'none', display: 'flex', gap: '8px' }}>{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="nbk-empty">
      {icon && <div className="nbk-empty__icon"><Svg w={26} sw={1.8}>{icon}</Svg></div>}
      {title && <div className="nbk-empty__title">{title}</div>}
      {body && <div className="nbk-empty__body">{body}</div>}
      {action}
    </div>
  );
}

export function ProgressBar({ done = 0, total = 0 }) {
  const known = total > 0;
  const pct = known ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="nbk-bar">
      <div className={cx('nbk-bar__fill', !known && 'nbk-bar__fill--idle')} style={known ? { width: pct + '%' } : undefined} />
    </div>
  );
}

/**
 * The one modal.
 *
 * Every dialogue in the Notebook is this component: same overlay, same
 * radius, same header/body/footer rhythm, same Escape-to-close, and the
 * primary action last on the right where a reader's eye finishes. `size`
 * is the only thing that changes between a delete confirmation and a
 * full side-by-side diff.
 */
export function Modal({ title, subtitle, icon, tone = '', size = 'md', onClose, footer, footerSplit = false, children, flush = false, dismissable = true, labelledBy }) {
  React.useEffect(() => {
    if (!dismissable || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissable, onClose]);

  return (
    <div className="nbk-overlay" onMouseDown={(e) => { if (dismissable && onClose && e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title}
        className={cx('nbk-modal', 'nbk-modal--' + size)} onMouseDown={(e) => e.stopPropagation()}>
        {(title || icon) && (
          <div className="nbk-modal__head">
            {icon && <div className={cx('nbk-modal__icon', tone && 'nbk-modal__icon--' + tone)}><Svg w={19} sw={2}>{icon}</Svg></div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && <h2 className="nbk-modal__title">{title}</h2>}
              {subtitle && <p className="nbk-modal__sub">{subtitle}</p>}
            </div>
            {dismissable && onClose && <IconButton plain icon={Icons.close} label="Close" onClick={onClose} />}
          </div>
        )}
        <div className={cx('nbk-modal__body', flush && 'nbk-modal__body--flush')}>{children}</div>
        {footer && <div className={cx('nbk-modal__foot', footerSplit && 'nbk-modal__foot--split')}>{footer}</div>}
      </div>
    </div>
  );
}

/** A destructive (or one-button) confirmation, in the shape of the Modal. */
export function ConfirmModal({ title, message, confirmLabel = 'Delete', tone = 'danger', icon, soleButton = false, onConfirm, onClose, busy = false }) {
  return (
    <Modal size="sm" tone={tone} icon={icon || (tone === 'danger' ? Icons.triangle : Icons.infoCircle)} title={title} onClose={onClose}
      footer={<>
        {!soleButton && <Button variant="ghost" onClick={onClose}>Cancel</Button>}
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} disabled={busy}>{confirmLabel}</Button>
      </>}>
      <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{message}</p>
    </Modal>
  );
}

/** Work that must finish before the reader touches anything else. */
export function ProgressModal({ title, message, done, total, unit = '', footnote }) {
  const known = total > 0;
  return (
    <Modal size="sm" icon={Icons.refresh} title={title} subtitle={message} dismissable={false}>
      <div role="status" aria-live="polite" style={{ paddingBottom: '6px' }}>
        <ProgressBar done={done} total={total} />
        <div style={{ marginTop: '10px', fontSize: '13px', color: T.dim }}>
          {known ? done + ' of ' + total + (unit ? ' ' + unit : '') : 'Working...'}
        </div>
        {footnote && <div style={{ marginTop: '8px', fontSize: '12.5px', lineHeight: 1.5, color: T.dim }}>{footnote}</div>}
      </div>
    </Modal>
  );
}

/* --------------------------------- menu --------------------------------- */

/**
 * A floating menu, placed where it actually fits.
 *
 * `x`/`y` is where it would like its top-left corner to be - the pointer for
 * a right-click, the bottom-left of the button for a "..." - and `flipY` is
 * where its BOTTOM goes when there is no room below: the pointer again, or
 * the top of the button, so a flipped menu never lands on top of the thing
 * that opened it. Off the right-hand edge it slides left, and a menu taller
 * than the window keeps its own scrollbar rather than running off the bottom.
 *
 * It is measured after mounting rather than guessed at, because the list is a
 * different height on a page than on a section, and offsetHeight is read
 * rather than a rect so the open animation's scale cannot skew it. Until that
 * measurement it is hidden: one frame in the wrong place is a jump.
 */
export function Menu({ x, y, flipY, width = 216, children, onMouseDown }) {
  const ref = React.useRef(null);
  const [box, setBox] = React.useState(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const place = () => {
      const m = 8; // the gap it keeps from every window edge
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left = x;
      if (left + w > vw - m) left = vw - w - m;
      if (left < m) left = m;
      let top = y;
      if (top + h > vh - m) {
        const above = (flipY == null ? y : flipY) - h;
        // Above if it fits there; otherwise sit on the bottom edge and let the
        // menu scroll inside itself.
        top = above >= m ? above : Math.max(m, vh - h - m);
      }
      if (top < m) top = m;
      setBox({ left, top, maxHeight: vh - m * 2 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [x, y, flipY, children]);

  return (
    <div ref={ref} className="nbk-menu"
      style={{
        left: (box ? box.left : x) + 'px',
        top: (box ? box.top : y) + 'px',
        minWidth: width + 'px',
        maxHeight: box ? box.maxHeight + 'px' : undefined,
        visibility: box ? 'visible' : 'hidden',
      }}
      onClick={(e) => e.stopPropagation()} onMouseDown={onMouseDown}>
      {children}
    </div>
  );
}

export function MenuItem({ icon, tone = '', children, ...rest }) {
  return (
    <button type="button" {...rest} className={cx('nbk-menu__item', tone && 'nbk-menu__item--' + tone)}>
      {icon && <Svg w={15} sw={2.2} style={{ flex: 'none' }}>{icon}</Svg>}
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </button>
  );
}

export function MenuLabel({ children }) { return <div className="nbk-menu__label">{children}</div>; }
export function MenuSeparator() { return <div className="nbk-menu__sep" />; }

/** A menu row that is a choice: swatch, name, one line of help, and a tick. */
export function MenuOption({ swatch, hollow = false, label, help, selected = false, colour, ...rest }) {
  const c = colour || { ink: T.mut, tint: T.soft, edge: T.line };
  return (
    <button type="button" {...rest} className="nbk-menu__opt" style={selected ? { background: c.tint } : undefined}>
      <span className="nbk-menu__swatch"
        style={{ background: hollow ? '#fff' : swatch || c.ink, boxShadow: 'inset 0 0 0 1px ' + (hollow ? T.line : swatch || c.ink) }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '14px', fontWeight: selected ? 700 : 500, color: selected ? c.ink : T.ink }}>{label}</span>
        {help && <span style={{ display: 'block', marginTop: '1px', fontSize: '11.5px', lineHeight: 1.45, color: T.dim }}>{help}</span>}
      </span>
      <span style={{ flex: 'none', width: '14px', marginTop: '2px', display: 'flex', color: c.ink }}>
        {selected ? <Svg w={14} sw={2.8}>{Icons.check}</Svg> : null}
      </span>
    </button>
  );
}

export function Toast({ children, actions, onClose }) {
  return (
    <div className="nbk-toast">
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {actions}
      {onClose && (
        <button type="button" aria-label="Dismiss" onClick={onClose}
          style={{ flex: 'none', display: 'inline-flex', border: 'none', background: 'none', color: '#fff', padding: '4px', cursor: 'pointer' }}>
          <Svg w={14} sw={2.4}>{Icons.close}</Svg>
        </button>
      )}
    </div>
  );
}
