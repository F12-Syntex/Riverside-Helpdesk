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
 * control heights (30 / 36 / 42) and a handful of radii, which is what
 * makes rows line up without anyone nudging a padding.
 *
 * It speaks the shell's language (globals.css, "THE SHELL"): glass for
 * what floats on the light, white paper for what is read, icons on
 * tiles, menus in the mode menu's surface. The theme's colours are used
 * only where the shell uses them - a hairline, a progress bar -
 * and every control stays NHS blue whichever theme is picked.
 * ------------------------------------------------------------------ */

import React from 'react';
import { Svg, Icons } from '../ui';

// The colours the JS side still needs (SVG fills, inline edge cases).
export const T = {
  ink: '#212b32', mut: '#4c6272', dim: '#768692', line: '#dde4e7', lineSoft: '#edf1f3',
  soft: '#f2f6f9', canvas: '#f8fafc', blue: '#005eb8', navy: '#003087', tint: '#eaf2fb',
  green: '#007f3b', red: '#d5281b', amber: '#a4610a', white: '#ffffff',
};

// Glyphs the kit needs that the shared set does not carry.
export const NBIcons = {
  dots: (<><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>),
  layers: (<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>),
  sidebar: (<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></>),
};

export const KIT_CSS = `
:root{
  --nbk-ink:#212b32;--nbk-mut:#4c6272;--nbk-dim:#768692;
  --nbk-line:#dde4e7;--nbk-line-soft:#edf1f3;--nbk-soft:#f2f6f9;--nbk-canvas:transparent;
  --nbk-blue:#005eb8;--nbk-navy:#003087;--nbk-tint:#eaf2fb;
  --nbk-green:#007f3b;--nbk-red:#d5281b;--nbk-amber:#a4610a;
  --nbk-r-xs:8px;--nbk-r-sm:11px;--nbk-r-md:14px;--nbk-r-lg:20px;--nbk-r-xl:22px;
  /* Edges, not glows: a hairline ring for where a surface ends, and a
     shadow only as deep as the thing is lifted. No coloured haze. */
  --nbk-ring:0 0 0 1px rgba(33,43,50,.08);
  --nbk-sh-1:0 0 0 1px rgba(33,43,50,.06),0 1px 2px rgba(33,43,50,.06);
  --nbk-sh-2:0 0 0 1px rgba(33,43,50,.07),0 4px 8px -2px rgba(33,43,50,.08),0 14px 28px -8px rgba(33,43,50,.14);
  --nbk-sh-3:0 0 0 1px rgba(33,43,50,.07),0 8px 16px -4px rgba(33,43,50,.1),0 28px 56px -12px rgba(33,43,50,.22);
  --nbk-sh-paper:0 0 0 1px rgba(33,43,50,.06),0 1px 2px rgba(33,43,50,.04),0 4px 12px -4px rgba(33,43,50,.07);
  /* A pressed-in top edge, for a solid button: it reads as a surface. */
  --nbk-bevel:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -1px 0 rgba(0,0,0,.12);
  --nbk-glass:rgba(255,255,255,.62);--nbk-glass-line:rgba(255,255,255,.9);
  --nbk-blur:saturate(160%) blur(14px);
  --nbk-ease:cubic-bezier(.2,.8,.3,1);
}

/* ------------------------------- shell ------------------------------ */
.nbk-scroll{scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.28) transparent;}
.nbk-scroll::-webkit-scrollbar{width:10px;height:10px;}
.nbk-scroll::-webkit-scrollbar-thumb{background:rgba(76,98,114,.28);border:3px solid transparent;background-clip:padding-box;border-radius:999px;}
.nbk-scroll::-webkit-scrollbar-thumb:hover{background:rgba(76,98,114,.45);background-clip:padding-box;}
.nbk-scroll::-webkit-scrollbar-track{background:transparent;}
.nbk-hide-scroll{scrollbar-width:none;-ms-overflow-style:none;}
.nbk-hide-scroll::-webkit-scrollbar{display:none;}

/* The two surfaces everything sits on. Glass for what floats on the light
   (the tree, the bar's cousins); paper for what is read and written. */
.nbk-glass{background:var(--nbk-glass);border:1px solid var(--nbk-glass-line);
  -webkit-backdrop-filter:var(--nbk-blur);backdrop-filter:var(--nbk-blur);
  box-shadow:var(--nbk-sh-paper);}
.nbk-paper{background:#fff;box-shadow:var(--nbk-sh-paper);}


/* ------------------------------ buttons ----------------------------- */
.nbk-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 14px;
  border:1px solid transparent;border-radius:var(--nbk-r-sm);background:none;font:inherit;font-size:13.5px;
  font-weight:650;line-height:1;letter-spacing:-.005em;white-space:nowrap;cursor:pointer;
  transition:background-color .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease,transform .1s ease;}
.nbk-btn:active:not([disabled]){transform:translateY(1px) scale(.99);}
.nbk-btn:focus-visible,.nbk-ibtn:focus-visible,.nbk-tab:focus-visible{outline:2px solid var(--nbk-blue);outline-offset:2px;}
.nbk-btn[disabled]{opacity:.5;cursor:default;transform:none;}
.nbk-btn--sm{height:30px;padding:0 11px;font-size:12.5px;gap:6px;border-radius:9px;}
.nbk-btn--lg{height:42px;padding:0 18px;font-size:15px;border-radius:13px;}
.nbk-btn--block{width:100%;}
.nbk-btn--primary{background:var(--nbk-blue);border-color:#004f9c;color:#fff;box-shadow:var(--nbk-bevel),0 1px 2px rgba(0,48,135,.25);}
.nbk-btn--primary:hover:not([disabled]){background:#0052a3;}
.nbk-btn--secondary{background:rgba(255,255,255,.88);border-color:var(--nbk-line);color:var(--nbk-ink);box-shadow:var(--nbk-sh-1);}
.nbk-btn--secondary:hover:not([disabled]){border-color:#aac7e0;background:#fff;color:var(--nbk-blue);}
.nbk-btn--ghost{color:var(--nbk-mut);}
.nbk-btn--ghost:hover:not([disabled]){background:rgba(33,43,50,.06);color:var(--nbk-ink);}
.nbk-btn--soft{background:var(--nbk-tint);color:var(--nbk-blue);}
.nbk-btn--soft:hover:not([disabled]){background:#dcebf8;color:var(--nbk-navy);}
.nbk-btn--success{background:var(--nbk-green);border-color:#006631;color:#fff;box-shadow:var(--nbk-bevel),0 1px 2px rgba(0,80,40,.25);}
.nbk-btn--success:hover:not([disabled]){background:#00612f;}
.nbk-btn--danger{background:var(--nbk-red);border-color:#b52216;color:#fff;box-shadow:var(--nbk-bevel),0 1px 2px rgba(120,20,10,.25);}
.nbk-btn--danger:hover:not([disabled]){background:#a81d13;}
.nbk-btn--quiet-danger{background:#fff;border-color:#f0cfcb;color:#a81d13;}
.nbk-btn--quiet-danger:hover:not([disabled]){background:#fdf4f3;border-color:#dfa49c;}

.nbk-ibtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;
  border:1px solid var(--nbk-line);border-radius:var(--nbk-r-sm);background:rgba(255,255,255,.88);color:var(--nbk-mut);
  cursor:pointer;box-shadow:var(--nbk-sh-1);
  transition:background-color .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease,transform .1s ease;}
.nbk-ibtn:active:not([disabled]){transform:translateY(1px);}
.nbk-ibtn[disabled]{opacity:.5;cursor:default;transform:none;}
.nbk-ibtn:hover:not([disabled]){color:var(--nbk-blue);border-color:#aac7e0;background:#fff;}
.nbk-ibtn--danger:hover:not([disabled]){color:var(--nbk-red);border-color:#e6b5af;background:#fdf4f3;}
.nbk-ibtn--plain{border-color:transparent;background:none;box-shadow:none;width:32px;height:32px;border-radius:10px;}
.nbk-ibtn--plain:hover:not([disabled]){background:rgba(33,43,50,.06);border-color:transparent;}
.nbk-ibtn--sm{width:26px;height:26px;border-radius:8px;}
.nbk-ibtn--on{background:var(--nbk-tint);border-color:#aac7e0;color:var(--nbk-blue);}

/* -------------------------------- tabs ------------------------------ */
/* A track with a white pill that slides to the chosen tab. */
.nbk-tabs{position:relative;display:inline-flex;align-items:center;gap:2px;padding:3px;
  background:rgba(33,43,50,.06);border-radius:12px;}
.nbk-tabs--block{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;width:100%;gap:0;}
.nbk-tabs__pill{position:absolute;top:3px;bottom:3px;left:3px;border-radius:9px;background:#fff;
  box-shadow:0 1px 2px rgba(33,43,50,.08),0 4px 10px -4px rgba(33,43,50,.16);
  transition:transform .32s var(--nbk-ease);pointer-events:none;}
.nbk-tab{position:relative;z-index:1;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;
  border:none;border-radius:9px;background:none;font:inherit;font-size:13px;font-weight:650;color:var(--nbk-mut);
  cursor:pointer;transition:background-color .15s ease,color .15s ease,box-shadow .15s ease;}
.nbk-tab:hover{color:var(--nbk-ink);}
.nbk-tab[aria-selected="true"]{color:var(--nbk-blue);}
.nbk-tabs:not(.nbk-tabs--block) .nbk-tab[aria-selected="true"]{background:#fff;box-shadow:0 1px 2px rgba(33,43,50,.1);}

/* ------------------------------- fields ----------------------------- */
.nbk-field{display:flex;align-items:center;gap:8px;height:38px;padding:0 6px 0 12px;background:rgba(255,255,255,.82);
  border:1px solid rgba(216,221,224,.9);border-radius:12px;
  transition:border-color .15s ease,box-shadow .15s ease,background-color .15s ease;}
.nbk-field:hover{background:#fff;}
.nbk-field:focus-within{background:#fff;border-color:var(--nbk-blue);box-shadow:0 0 0 3px rgba(0,94,184,.1);}
.nbk-field input{flex:1;min-width:0;border:none !important;outline:none !important;background:none !important;box-shadow:none !important;
  font:inherit;font-size:14px;color:var(--nbk-ink);padding:0;}
.nbk-field input::placeholder{color:var(--nbk-dim);}

.nbk-title-input{flex:1;min-width:80px;border:none;outline:none;background:none;font:inherit;font-size:17px;
  font-weight:700;letter-spacing:-.01em;color:var(--nbk-ink);padding:4px 6px;border-radius:8px;
  transition:background-color .15s ease,box-shadow .15s ease;}
.nbk-title-input:hover{background:var(--nbk-soft);}
.nbk-title-input:focus{background:#fff;box-shadow:0 0 0 2px var(--nbk-blue);}

/* ------------------------------- cards ------------------------------ */
.nbk-card{background:#fff;border:1px solid var(--nbk-line-soft);border-radius:var(--nbk-r-md);box-shadow:var(--nbk-sh-1);}
.nbk-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--nbk-dim);}

.nbk-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;
  font-size:11px;font-weight:700;letter-spacing:.01em;white-space:nowrap;}
.nbk-chip__dot{flex:none;width:7px;height:7px;border-radius:2px;}

.nbk-status{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;border-radius:999px;
  font-size:12px;font-weight:650;background:rgba(33,43,50,.05);color:var(--nbk-mut);animation:nbk-in .25s var(--nbk-ease) both;}
.nbk-status__dot{position:relative;width:7px;height:7px;border-radius:50%;background:currentColor;}
.nbk-status--saving{background:var(--nbk-tint);color:var(--nbk-blue);}
.nbk-status--saving .nbk-status__dot::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid currentColor;
  animation:nbk-ping 1.2s cubic-bezier(0,0,.2,1) infinite;}
.nbk-status--saved{background:#e6f4ec;color:#00612f;}
.nbk-status--error{background:#fdecea;color:#a81d13;}

/* ------------------------------ banners ----------------------------- */
.nbk-banner{display:flex;align-items:flex-start;gap:11px;padding:12px 14px;border-radius:var(--nbk-r-md);
  border:1px solid var(--nbk-line);background:#fff;font-size:13.5px;line-height:1.5;color:var(--nbk-mut);}
.nbk-banner--info{background:var(--nbk-tint);border-color:#c5dcef;color:var(--nbk-navy);}
.nbk-banner--warn{background:#fdf5e8;border-color:#ecd7ae;color:#7a4708;}
.nbk-banner--danger{background:#fdecea;border-color:#f0c6c1;color:#a81d13;}
.nbk-banner--success{background:#e8f5ed;border-color:#b9ddc8;color:#00612f;}

/* The empty state: a title, a line of explanation and an action. */
.nbk-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
  padding:48px 24px;text-align:center;color:var(--nbk-mut);animation:nbk-in .45s var(--nbk-ease) both;}
.nbk-empty__icon{display:flex;color:#aab7bf;margin-bottom:4px;}
.nbk-empty__title{font-size:17px;font-weight:750;letter-spacing:-.015em;color:var(--nbk-ink);}
.nbk-empty__body{max-width:380px;font-size:14px;line-height:1.6;margin-bottom:8px;}

/* Nothing open: the notebook's own pages, drifting up through a window
   that fades at both ends (the 21st.dev "Empty State with Marquee").
   Hover holds it still; any row opens its page. Before anything has
   loaded, and in an empty notebook, the rows are skeletons. */
.nbk-void{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:40px 24px;
  text-align:center;color:var(--nbk-mut);animation:nbk-in .45s var(--nbk-ease) both;}
.nbk-marquee{position:relative;width:min(400px,100%);height:236px;margin-bottom:18px;overflow:hidden;border-radius:16px;
  background:#f8fafb;box-shadow:inset 0 0 0 1px rgba(33,43,50,.06);
  -webkit-mask-image:linear-gradient(transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(transparent,#000 22%,#000 78%,transparent);}
.nbk-marquee__track{display:flex;flex-direction:column;gap:8px;padding:4px 10px;animation:nbk-marquee var(--nbk-marquee-s,20s) linear infinite;}
.nbk-marquee:hover .nbk-marquee__track,.nbk-marquee:focus-within .nbk-marquee__track{animation-play-state:paused;}
.nbk-mrow{flex:none;display:flex;align-items:center;gap:10px;width:100%;height:44px;padding:0 12px;border:none;border-radius:11px;
  background:#fff;box-shadow:var(--nbk-sh-1);font:inherit;text-align:left;cursor:pointer;
  transition:box-shadow .15s ease,transform .15s ease;}
.nbk-mrow:hover{box-shadow:0 0 0 1px #aac7e0,0 1px 2px rgba(33,43,50,.06);}
.nbk-mrow:focus-visible{outline:2px solid var(--nbk-blue);outline-offset:1px;}
.nbk-mrow__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:650;color:var(--nbk-ink);}
.nbk-mrow__meta{flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--nbk-dim);}
.nbk-mrow--skel{cursor:default;}
.nbk-mrow__icon{flex:none;display:flex;color:var(--nbk-dim);}
.nbk-mrow:hover .nbk-mrow__icon{color:var(--nbk-blue);}
.nbk-skel{display:block;height:9px;border-radius:999px;background:linear-gradient(90deg,#eef2f4 0%,#f6f8f9 40%,#eef2f4 80%);
  background-size:200% 100%;animation:nbk-skel 1.6s linear infinite;}
@keyframes nbk-marquee{from{transform:translateY(0);}to{transform:translateY(-50%);}}
@keyframes nbk-skel{from{background-position:100% 0;}to{background-position:-100% 0;}}

/* ------------------------------- modals ----------------------------- */
.nbk-overlay{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;
  padding:24px;background:rgba(20,36,48,.28);-webkit-backdrop-filter:blur(6px) saturate(120%);backdrop-filter:blur(6px) saturate(120%);
  overflow:auto;animation:nbk-fade .18s ease;}
.nbk-modal{position:relative;width:100%;max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:#fff;
  border:1px solid #e1e8ec;border-radius:var(--nbk-r-xl);box-shadow:var(--nbk-sh-3);overflow:hidden;animation:nbk-pop .26s var(--nbk-ease);}
.nbk-modal--sm{max-width:440px;}
.nbk-modal--md{max-width:620px;}
.nbk-modal--lg{max-width:940px;}
.nbk-modal--xl{max-width:1280px;}
.nbk-modal__head{flex:none;display:flex;align-items:flex-start;gap:14px;padding:22px 22px 14px;}
.nbk-modal__title{display:flex;align-items:center;gap:9px;margin:0;padding-top:1px;font-size:18.5px;font-weight:750;letter-spacing:-.015em;color:var(--nbk-ink);}
/* A small inline glyph beside a destructive title - no plate behind it. */
.nbk-modal__glyph{flex:none;display:flex;color:var(--nbk-mut);}
.nbk-modal__glyph--danger{color:var(--nbk-red);}
.nbk-modal__sub{margin:4px 0 0;font-size:13.5px;line-height:1.55;color:var(--nbk-mut);}
.nbk-modal__body{flex:1;min-height:0;overflow:auto;padding:4px 22px 8px;font-size:14px;line-height:1.6;color:var(--nbk-mut);}
.nbk-modal__body--flush{padding:0;}
.nbk-modal__foot{flex:none;display:flex;align-items:center;gap:8px;justify-content:flex-end;
  padding:12px 16px;margin-top:14px;border-top:1px solid var(--nbk-line-soft);background:#f8fafb;}
.nbk-modal__foot--split{justify-content:space-between;}
@media (max-width:640px){
  .nbk-overlay{align-items:flex-end;padding:0;}
  .nbk-modal{max-width:none !important;max-height:92vh;border-radius:22px 22px 0 0;animation:nbk-up .28s var(--nbk-ease);}
}

/* -------------------------------- menu ------------------------------ */
.nbk-menu{position:fixed;z-index:130;min-width:216px;max-width:300px;max-height:min(560px,80vh);overflow:auto;
  display:flex;flex-direction:column;padding:6px;background:#fff;border:1px solid #e1e8ec;
  border-radius:18px;box-shadow:var(--nbk-sh-2);animation:nbk-pop .2s var(--nbk-ease);}
.nbk-menu__item{display:flex;align-items:center;gap:11px;width:100%;border:none;background:none;border-radius:12px;
  min-height:38px;padding:5px 10px;font:inherit;font-size:14px;font-weight:600;color:var(--nbk-ink);text-align:left;cursor:pointer;
  transition:background-color .14s ease,color .14s ease;}
.nbk-menu__item:hover,.nbk-menu__item:focus-visible{background:var(--nbk-soft);outline:none;}
.nbk-menu__item--accent{color:var(--nbk-blue);}
.nbk-menu__item--accent:hover{background:var(--nbk-tint);}
.nbk-menu__item--danger{color:#a81d13;}
.nbk-menu__item--danger:hover{background:#fdf4f3;}
/* A menu item's glyph: a plain line icon in the muted ink, red for delete. */
.nbk-menu__icon{flex:none;display:flex;color:var(--nbk-dim);}
.nbk-menu__item--accent .nbk-menu__icon{color:var(--nbk-blue);}
.nbk-menu__item--danger .nbk-menu__icon{color:var(--nbk-red);}
.nbk-menu__item--open{background:var(--nbk-soft);}
.nbk-menu__hint{flex:none;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;color:var(--nbk-dim);}
.nbk-menu__sep{height:1px;background:var(--nbk-line-soft);margin:5px 6px;}
.nbk-menu__swatch{flex:none;width:9px;height:9px;border-radius:50%;margin:0 3.5px;}

/* ------------------------------ progress ---------------------------- */
/* The working card's bar: the theme's colours, a sheen, only forward. */
.nbk-bar{height:6px;border-radius:999px;background:rgba(33,43,50,.07);overflow:hidden;}
.nbk-bar__fill{position:relative;height:100%;border-radius:999px;overflow:hidden;transition:width .6s var(--nbk-ease);
  background:linear-gradient(90deg,var(--rv-sky-b,#005eb8),var(--rv-sky-a,#41b6e6),var(--rv-sky-c,#8fd3f4));}
.nbk-bar__fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);
  animation:nbk-sheen 1.5s ease-in-out infinite;}
.nbk-bar__fill--idle{width:38%;animation:nbk-slide 1.1s ease-in-out infinite;}

.nbk-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:140;display:flex;align-items:center;
  gap:12px;padding:10px 12px 10px 18px;border-radius:999px;background:rgba(23,37,46,.92);color:#fff;font-size:13.5px;
  -webkit-backdrop-filter:var(--nbk-blur);backdrop-filter:var(--nbk-blur);
  font-weight:600;box-shadow:var(--nbk-sh-2);animation:nbk-toast .3s var(--nbk-ease);max-width:min(680px,calc(100vw - 32px));}

/* ------------------------------ tree rows --------------------------- */
.nbk-row{position:relative;display:flex;align-items:center;gap:0;min-height:36px;border-radius:11px;padding:0 4px 0 0;
  transition:background-color .14s ease,box-shadow .14s ease;}
.nbk-row:hover{background:rgba(255,255,255,.66);}
.nbk-row--path .nbk-row__name{color:var(--nbk-ink);font-weight:650;}
.nbk-row--on,.nbk-row--on:hover{background:#fff;box-shadow:var(--nbk-sh-1);}
.nbk-row__btn{flex:1;min-width:0;display:flex;align-items:center;gap:9px;border:none;background:none;font:inherit;
  font-size:14px;color:var(--nbk-ink);text-align:left;padding:5px 2px;cursor:pointer;border-radius:9px;}
.nbk-row__btn:focus-visible{outline:2px solid var(--nbk-blue);outline-offset:1px;}
.nbk-row--on .nbk-row__btn{color:var(--nbk-blue);font-weight:650;}
/* Folder or page: a line glyph before the name, blue on the open row. */
.nbk-row__icon{flex:none;display:flex;color:var(--nbk-dim);}
.nbk-row--on .nbk-row__icon{color:var(--nbk-blue);}
.nbk-row--top>.nbk-row__btn{font-weight:650;}
.nbk-row__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nbk-row__twist{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:26px;
  border:none;background:none;border-radius:7px;color:var(--nbk-dim);cursor:pointer;padding:0;}
.nbk-row__twist:hover{color:var(--nbk-ink);background:rgba(33,43,50,.06);}
.nbk-row__twist svg{transition:transform .2s var(--nbk-ease);}
.nbk-row__twist[aria-expanded="true"] svg{transform:rotate(90deg);}
.nbk-row__actions{flex:none;display:flex;align-items:center;gap:1px;opacity:0;transition:opacity .14s ease;}
.nbk-row:hover .nbk-row__actions,.nbk-row:focus-within .nbk-row__actions{opacity:1;}
.nbk-row--drag{opacity:.45;}
.nbk-row--drop{background:var(--nbk-tint) !important;box-shadow:inset 0 0 0 2px var(--nbk-blue) !important;}
.nbk-kids{margin-left:11px;padding-left:9px;border-left:var(--nbk-edge-w,1.5px) solid var(--nbk-edge,rgba(33,43,50,.1));
  animation:nbk-kids .24s var(--nbk-ease) both;}
.nbk-kids>div>.nbk-row::before{content:"";position:absolute;left:-9px;top:50%;width:7px;
  height:var(--nbk-edge-w,1.5px);background:var(--nbk-edge,rgba(33,43,50,.1));}

/* ------------------------------ toolbar ----------------------------- */
/* One floating strip over the page, in the tree's glass: it stays put
   while the page scrolls under it. */
.nbk-toolbar{flex:none;display:flex;align-items:center;flex-wrap:wrap;justify-content:center;gap:1px;
  margin:0 auto;padding:4px;max-width:calc(100% - 24px);
  background:rgba(242,246,249,.92);border:1px solid #e6edf2;border-radius:14px;
  box-shadow:0 1px 2px rgba(33,43,50,.04);}
.nbk-tbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:32px;
  padding:0 7px;border:none;border-radius:10px;background:none;color:var(--nbk-mut);font:inherit;font-size:12.5px;
  font-weight:700;cursor:pointer;transition:background-color .14s ease,color .14s ease,box-shadow .14s ease;}
.nbk-tbtn:hover{background:#fff;color:var(--nbk-ink);box-shadow:0 1px 2px rgba(33,43,50,.08);}
.nbk-tbtn:focus-visible{outline:2px solid var(--nbk-blue);outline-offset:1px;}
.nbk-tbtn--on,.nbk-tbtn--on:hover{background:var(--nbk-blue);color:#fff;box-shadow:var(--nbk-bevel);}
.nbk-tbtn--accent{color:var(--nbk-blue);background:#fff;padding:0 11px 0 9px;box-shadow:0 1px 2px rgba(33,43,50,.08);}
.nbk-tbtn--accent:hover{background:var(--nbk-blue);color:#fff;}
.nbk-tsep{flex:none;width:1px;height:18px;background:#d9e2e8;margin:0 5px;}
.nbk-swatch{width:14px;height:14px;border-radius:999px;border:2px solid #fff;}

/* -------------------------------- diff ------------------------------ */
.nbk-diff{font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.6;background:#fbfcfd;}
.nbk-diff__line{display:flex;gap:10px;padding:1px 22px;white-space:pre-wrap;word-break:break-word;color:var(--nbk-mut);}
.nbk-diff__line--add{background:#e7f5ec;color:#00542b;box-shadow:inset 3px 0 0 #007f3b;}
.nbk-diff__line--del{background:#fbe9e7;color:#8a1206;text-decoration:line-through;box-shadow:inset 3px 0 0 #d5281b;}
.nbk-diff__gutter{flex:none;width:12px;user-select:none;opacity:.7;}

/* ------------------------- writing surface -------------------------- */
.nbk-prose{flex:1;outline:none;width:100%;max-width:780px;margin:0 auto;padding:6px 44px 160px;
  font-size:16.5px;line-height:1.72;color:var(--nbk-ink);caret-color:var(--nbk-blue);}
.nbk-prose:focus-visible{background:transparent !important;color:var(--nbk-ink) !important;box-shadow:none !important;outline:none !important;}
.nbk-prose>:first-child{margin-top:0;}
.nbk-prose p{margin:0 0 12px;}
.nbk-prose h1,.nbk-prose h2,.nbk-prose h3,.nbk-prose h4{margin:30px 0 10px;font-weight:750;letter-spacing:-.018em;line-height:1.3;color:var(--nbk-ink);}
.nbk-prose h1{font-size:27px;}
.nbk-prose h2{font-size:21.5px;padding-bottom:8px;border-bottom:1px solid var(--nbk-line-soft);}
.nbk-prose h3{font-size:18px;}
.nbk-prose h4{font-size:16.5px;color:var(--nbk-mut);}
.nbk-prose ul,.nbk-prose ol{margin:0 0 12px;padding-left:24px;}
.nbk-prose ul ul,.nbk-prose ol ol,.nbk-prose ul ol,.nbk-prose ol ul{margin-bottom:0;}
.nbk-prose li{margin:4px 0;padding-left:2px;}
.nbk-prose li>p{margin:0;}
.nbk-prose ul>li::marker{color:var(--nbk-blue);}
.nbk-prose ol>li::marker{color:var(--nbk-blue);font-weight:700;font-variant-numeric:tabular-nums;}
.nbk-prose ul[data-type="taskList"]{list-style:none;padding-left:2px;}
.nbk-prose ul[data-type="taskList"] li{display:flex;gap:10px;align-items:flex-start;}
.nbk-prose ul[data-type="taskList"] li>label{flex:none;margin-top:5px;}
.nbk-prose ul[data-type="taskList"] li>label input{width:16px;height:16px;accent-color:var(--nbk-blue);cursor:pointer;margin:0;}
.nbk-prose ul[data-type="taskList"] li>div{flex:1;min-width:0;}
.nbk-prose li[data-checked="true"]>div{text-decoration:line-through;color:var(--nbk-dim);}
.nbk-prose blockquote{margin:0 0 14px;border:none;background:var(--nbk-tint);
  padding:12px 16px 12px 18px;border-radius:12px;font-size:15.5px;color:#0b3a66;}
.nbk-prose blockquote p{margin:0;}
.nbk-prose blockquote p+p{margin-top:8px;}
.nbk-prose code{font-family:Consolas,Menlo,monospace;font-size:.88em;background:var(--nbk-soft);border:1px solid var(--nbk-line-soft);border-radius:6px;padding:1px 5px;}
.nbk-prose pre{margin:0 0 14px;background:#f5f8fa;border:1px solid var(--nbk-line-soft);border-radius:12px;padding:14px 16px;overflow-x:auto;}
.nbk-prose pre code{background:none;border:none;padding:0;}
.nbk-prose mark{background:#fff1b8;border-radius:4px;padding:0 3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;}
.nbk-prose kbd{font-family:Consolas,Menlo,monospace;font-size:.85em;background:#fff;
  border:1px solid var(--nbk-line);border-bottom-width:2px;border-radius:6px;padding:1px 6px;}
.nbk-prose img{max-width:100%;height:auto;display:block;margin:10px 0 18px;border-radius:14px;
  box-shadow:0 1px 2px rgba(33,43,50,.06),0 12px 28px -14px rgba(33,43,50,.3);}
.nbk-prose img.ProseMirror-selectednode{outline:2.5px solid var(--nbk-blue);outline-offset:2px;}
.nbk-prose hr{border:none;height:1px;margin:26px 0;background:linear-gradient(90deg,transparent,var(--nbk-line) 15%,var(--nbk-line) 85%,transparent);}
.nbk-prose hr.ProseMirror-selectednode{background:var(--nbk-blue);height:2px;}
.nbk-prose a{color:var(--nbk-blue);text-underline-offset:2px;}
.nbk-prose s{color:var(--nbk-dim);}
.nbk-prose table{border-collapse:separate;border-spacing:0;width:100%;margin:0 0 16px;
  border:1px solid var(--nbk-line);border-radius:12px;overflow:hidden;}
.nbk-prose th,.nbk-prose td{border:none;border-bottom:1px solid var(--nbk-line-soft);border-right:1px solid var(--nbk-line-soft);
  padding:9px 13px;font-size:15px;line-height:1.5;text-align:left;vertical-align:top;position:relative;min-width:48px;}
.nbk-prose th:last-child,.nbk-prose td:last-child{border-right:none;}
.nbk-prose tr:last-child>td{border-bottom:none;}
.nbk-prose th{background:#f5f8fa;font-size:13px;font-weight:700;letter-spacing:.01em;color:var(--nbk-mut);}
.nbk-prose th p,.nbk-prose td p{margin:0;}
.nbk-prose .selectedCell::after{content:"";position:absolute;inset:0;background:rgba(0,94,184,.08);pointer-events:none;}
.nbk-prose p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:var(--nbk-dim);float:left;
  height:0;pointer-events:none;white-space:pre-wrap;}
@media (max-width:760px){
  .nbk-prose{padding:4px 20px 120px;font-size:16px;}
  /* One row that scrolls sideways, rather than three rows of buttons
     standing over the first lines of the page. */
  .nbk-toolbar{flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;}
}

/* ----------------------------- animation ---------------------------- */
@keyframes nbk-fade{from{opacity:0;}to{opacity:1;}}
@keyframes nbk-pop{from{opacity:0;transform:translateY(8px) scale(.97);}to{opacity:1;transform:none;}}
@keyframes nbk-up{from{transform:translateY(100%);}to{transform:none;}}
@keyframes nbk-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@keyframes nbk-kids{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
@keyframes nbk-toast{from{opacity:0;transform:translate(-50%,12px);}to{opacity:1;transform:translate(-50%,0);}}
@keyframes nbk-ping{0%{transform:scale(.6);opacity:.8;}100%{transform:scale(1.9);opacity:0;}}
@keyframes nbk-sheen{from{transform:translateX(-100%);}to{transform:translateX(100%);}}
@keyframes nbk-slide{0%{margin-left:-38%;}100%{margin-left:100%;}}
@media (prefers-reduced-motion:reduce){
  .nbk-overlay,.nbk-modal,.nbk-menu,.nbk-toast,.nbk-empty,.nbk-void,.nbk-kids,.nbk-status,.nbk-skel{animation:none;}
  .nbk-marquee__track{animation:none;}
  .nbk-marquee{overflow-y:auto;}
  .nbk-tabs__pill,.nbk-row__twist svg{transition:none;}
  .nbk-bar__fill::after,.nbk-status--saving .nbk-status__dot::after{animation:none;}
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

/**
 * A segmented control. `items` is [{ id, label, icon }].
 *
 * `block` tabs share the width equally, so the white pill under the chosen
 * one can simply slide a whole tab's width at a time.
 */
export function Tabs({ items, value, onChange, block = false, ariaLabel }) {
  const at = Math.max(0, items.findIndex((t) => t.id === value));
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('nbk-tabs', block && 'nbk-tabs--block')}>
      {block && (
        <span className="nbk-tabs__pill"
          style={{ width: 'calc((100% - 6px) / ' + items.length + ')', transform: 'translateX(' + at * 100 + '%)' }} />
      )}
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
      {icon && <span className="nbk-empty__icon"><Svg w={28} sw={1.6}>{icon}</Svg></span>}
      {title && <div className="nbk-empty__title">{title}</div>}
      {body && <div className="nbk-empty__body">{body}</div>}
      {action}
    </div>
  );
}

/**
 * Nothing open, said with the notebook itself: its pages scrolling slowly
 * past, any of them a click away. `items` is [{ id, title, meta }]; with
 * none (still loading, or an empty notebook) the rows are skeletons.
 */
export function EmptyMarquee({ items = [], onPick, title, body, action }) {
  const rows = items.length ? items.slice(0, 14) : Array.from({ length: 6 }, (_, i) => ({ id: 'skel' + i, skel: true }));
  // Twice over, so the track can run to half way and start again unseen.
  const loop = rows.concat(rows);
  return (
    <div className="nbk-void">
      <div className="nbk-marquee" aria-hidden={items.length ? undefined : true}>
        <div className="nbk-marquee__track" style={{ '--nbk-marquee-s': Math.max(14, rows.length * 3.2) + 's' }}>
          {loop.map((r, i) => {
            const copy = i >= rows.length;
            if (r.skel) {
              return (
                <div key={i} className="nbk-mrow nbk-mrow--skel">
                  <span className="nbk-skel" style={{ width: 34 + ((i * 29) % 40) + '%' }} />
                </div>
              );
            }
            return (
              <button key={i} type="button" className="nbk-mrow" tabIndex={copy ? -1 : undefined} aria-hidden={copy || undefined}
                onClick={() => onPick && onPick(r.id)}>
                <span className="nbk-mrow__icon"><Svg w={15} sw={2}>{Icons.fileLines}</Svg></span>
                <span className="nbk-mrow__title">{r.title || 'Untitled'}</span>
                {r.meta && <span className="nbk-mrow__meta">{r.meta}</span>}
              </button>
            );
          })}
        </div>
      </div>
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
        {title && (
          <div className="nbk-modal__head">
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && (
                <h2 className="nbk-modal__title">
                  {icon && <span className={cx('nbk-modal__glyph', tone && 'nbk-modal__glyph--' + tone)}><Svg w={18} sw={2.1}>{icon}</Svg></span>}
                  {title}
                </h2>
              )}
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
export function ConfirmModal({ title, message, confirmLabel = 'Delete', tone = 'danger', soleButton = false, onConfirm, onClose, busy = false }) {
  return (
    <Modal size="sm" title={title} onClose={onClose}
      icon={tone === 'danger' ? Icons.triangle : undefined} tone={tone}
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
    <Modal size="sm" title={title} subtitle={message} dismissable={false}>
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
      {icon && <span className="nbk-menu__icon"><Svg w={16} sw={2}>{icon}</Svg></span>}
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </button>
  );
}

export function MenuSeparator() { return <div className="nbk-menu__sep" />; }

/**
 * A row that opens a second menu beside it - where a list of choices goes, so
 * the first menu stays one line per action. It opens on hover or click, sits
 * to the right of its row (left when the window has no room), and survives
 * the pointer crossing the gap between the two.
 */
export function MenuSub({ icon, label, hint, children }) {
  const ref = React.useRef(null);
  const timer = React.useRef(null);
  const [anchor, setAnchor] = React.useState(null);
  const open = () => {
    clearTimeout(timer.current);
    if (ref.current) setAnchor(ref.current.getBoundingClientRect());
  };
  const close = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setAnchor(null), 140); };
  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div onMouseEnter={open} onMouseLeave={close}>
      <button ref={ref} type="button" aria-haspopup="menu" aria-expanded={!!anchor} onClick={open}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') open(); if (e.key === 'ArrowLeft') setAnchor(null); }}
        className={cx('nbk-menu__item', anchor && 'nbk-menu__item--open')}>
        {icon && <span className="nbk-menu__icon"><Svg w={16} sw={2}>{icon}</Svg></span>}
        <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
        {hint && <span className="nbk-menu__hint">{hint}</span>}
        <span className="nbk-menu__icon"><Svg w={14} sw={2.2}>{Icons.chevronRight}</Svg></span>
      </button>
      {anchor && <SubPanel anchor={anchor} onMouseEnter={open}>{children}</SubPanel>}
    </div>
  );
}

function SubPanel({ anchor, children, onMouseEnter }) {
  const ref = React.useRef(null);
  const [box, setBox] = React.useState(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchor.right + 6;
    if (left + w > window.innerWidth - m) left = Math.max(m, anchor.left - w - 6);
    let top = anchor.top - 7;
    if (top + h > window.innerHeight - m) top = Math.max(m, window.innerHeight - h - m);
    setBox({ left, top });
  }, [anchor]);
  return (
    <div ref={ref} role="menu" className="nbk-menu" onMouseEnter={onMouseEnter}
      style={{ left: (box ? box.left : anchor.right) + 'px', top: (box ? box.top : anchor.top) + 'px',
        minWidth: '176px', visibility: box ? 'visible' : 'hidden' }}>
      {children}
    </div>
  );
}

/** One choice in a submenu: a coloured dot, its name, and a tick on the current one. */
export function MenuChoice({ colour, hollow = false, selected = false, children, ...rest }) {
  const ink = (colour && colour.ink) || T.mut;
  return (
    <button type="button" role="menuitemradio" aria-checked={selected} {...rest} className="nbk-menu__item">
      <span className="nbk-menu__swatch"
        style={{ background: hollow ? 'transparent' : ink, boxShadow: hollow ? 'inset 0 0 0 1.5px ' + T.line : 'none' }} />
      <span style={{ flex: 1, minWidth: 0, fontWeight: selected ? 700 : 600 }}>{children}</span>
      <span style={{ flex: 'none', width: '14px', display: 'flex', color: T.blue }}>
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
