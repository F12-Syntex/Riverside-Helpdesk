'use client';

/* ------------------------------------------------------------------ *
 * The Notebook's UI kit.
 *
 * Every control the Notebook draws is defined once, here, as a real CSS
 * class rather than a string of inline styles pasted from the last
 * button. That is the whole reason this file exists: the old page had
 * nine slightly different button shapes, three modal styles and two
 * tab bars, because each one was written where it was needed. Here a
 * modal is a modal wherever it opens, and changing a hover colour is
 * one line.
 *
 * IT SPEAKS THE PAGE LANGUAGE NOW, not a dialect of it. Referrals set
 * the look every tool has — white cards on the light, pill buttons,
 * round icon buttons, a state in the middle of a card when there is
 * nothing to show — and those parts are shared, as rv- classes at the
 * foot of globals.css. So a kit Button is an rv-btn, an IconButton an
 * rv-ibtn, a Chip an rv-chip, and a State the rv-state; what is left in
 * this file is only what the Notebook has and the other tools do not
 * (the tree, the formatting strip, the writing surface, the diff). The
 * --nbk-* names are kept as aliases of the --rv-* tokens, so nothing
 * that still says --nbk-ink draws a second palette.
 *
 * Dialogs are the app's one dialog (globals.css, "popups: one look"),
 * which already knows .nbk-overlay and .nbk-modal: this only sizes them,
 * and makes them behave — focus goes in, stays in, and comes back out.
 * ------------------------------------------------------------------ */

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Svg, Icons } from '../ui';

const EASE = [0.22, 1, 0.36, 1];

// The colours the JS side still needs (SVG fills, inline edge cases). The
// same values as the --rv-* tokens; `dim` is for icons, never for words.
export const T = {
  ink: '#212b32', mut: '#4c6272', dim: '#768692', line: '#d8dde0', lineSoft: '#eef1f3',
  soft: '#f4f7f9', canvas: '#f8fafc', blue: '#005eb8', navy: '#003087', tint: '#e8f1f8',
  green: '#007f3b', red: '#d5281b', amber: '#a4610a', white: '#ffffff',
};

// Glyphs the kit needs that the shared set does not carry.
export const NBIcons = {
  dots: (<><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>),
  layers: (<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>),
  sidebar: (<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></>),
  // Referrals' "nothing matches": the glass with a cross in it.
  searchX: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="m8.5 8.5 5 5" /><path d="m13.5 8.5-5 5" /></>),
};

export const KIT_CSS = `
:root{
  /* Aliases of the shared tokens (globals.css :root). The Notebook used to
     carry a palette of its own; it carries names for the shared one. */
  --nbk-ink:var(--rv-ink);--nbk-mut:var(--rv-ink-2);--nbk-dim:var(--rv-ink-3);
  --nbk-line:var(--rv-line);--nbk-line-soft:var(--rv-divider);--nbk-soft:var(--rv-hl);--nbk-canvas:transparent;
  --nbk-blue:var(--rv-accent);--nbk-navy:var(--rv-accent-hi);--nbk-tint:var(--rv-accent-dim);
  --nbk-green:var(--rv-green);--nbk-red:var(--rv-danger);--nbk-amber:#a4610a;
  --nbk-r-xs:8px;--nbk-r-sm:11px;--nbk-r-md:14px;--nbk-r-lg:22px;--nbk-r-xl:22px;
  /* Two lifts, as Referrals has: a card on the light, and what floats over
     everything (a menu, the card beside a question, a dialog). */
  --nbk-sh-1:var(--rv-sh-card);--nbk-sh-paper:var(--rv-sh-card);
  --nbk-sh-2:var(--rv-sh-pop);--nbk-sh-3:var(--rv-sh-pop);
  --nbk-ease:var(--rv-ease);
}

/* ------------------------------- shell ------------------------------ */
.nbk-scroll{scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
.nbk-scroll::-webkit-scrollbar{width:10px;height:10px;}
.nbk-scroll::-webkit-scrollbar-thumb{background:rgba(76,98,114,.25);border:3px solid transparent;background-clip:padding-box;border-radius:999px;}
.nbk-scroll::-webkit-scrollbar-thumb:hover{background:rgba(76,98,114,.42);background-clip:padding-box;}
.nbk-scroll::-webkit-scrollbar-track{background:transparent;}
.nbk-hide-scroll{scrollbar-width:none;-ms-overflow-style:none;}
.nbk-hide-scroll::-webkit-scrollbar{display:none;}

/* What is read and written: a white card on the light. */
.nbk-paper{background:#fff;border-radius:var(--rv-r-card,22px);box-shadow:var(--rv-sh-card);}

/* ------------------------------ buttons ----------------------------- */
/* A Button is an rv-btn (globals.css); these are the Notebook's extras. */
.rv-btn.nbk-btn{line-height:1;}
.rv-btn.nbk-btn--soft{color:var(--rv-accent);}
.rv-btn.nbk-btn--danger{background:var(--rv-danger);color:#fff;}
.rv-btn.nbk-btn--danger:hover:not(:disabled){background:#b81f14;}
.rv-btn.nbk-btn--lg{height:48px;padding:0 22px;font-size:15.5px;}
.rv-btn.nbk-btn--block{width:100%;}
.rv-btn.nbk-btn[disabled]{cursor:default;}
/* In a dialog's foot the shared dialog draws the button (tall, radius 12);
   the pill's hover hairline does not belong on it, and Apply is a primary. */
html body .nbk-modal__foot .nbk-btn:hover{box-shadow:none;}
html body .nbk-modal__foot .nbk-btn--success{background:var(--rv-accent);color:#fff;box-shadow:none;}
html body .nbk-modal__foot .nbk-btn--success:hover:not(:disabled){background:var(--rv-accent-hi);}

/* An IconButton is an rv-ibtn: round, no edge, grey until it is under the pointer. */
.rv-ibtn.nbk-ibtn{position:relative;}
.rv-ibtn.nbk-ibtn--sm{width:28px;height:28px;}
.rv-ibtn.nbk-ibtn--danger:hover:not(:disabled){background:var(--rv-danger-bg);color:var(--rv-danger-ink);}
@media (hover:none){
  /* A thumb's worth of target round the small ones. */
  .rv-ibtn.nbk-ibtn--sm::after{content:"";position:absolute;inset:-8px;}
}

/* -------------------------------- tabs ------------------------------ */
/* On a white card: a filled track with a white pill that slides to the
   chosen tab, as the top bar's does on the light. */
.nbk-tabs{position:relative;display:inline-flex;align-items:center;gap:2px;padding:3px;background:var(--rv-surface-3);border-radius:999px;}
.nbk-tabs--block{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;width:100%;gap:0;}
.nbk-tabs__pill{position:absolute;top:3px;bottom:3px;left:3px;border-radius:999px;background:#fff;
  box-shadow:0 1px 2px rgba(33,43,50,.08),0 2px 8px -2px rgba(33,43,50,.1);transition:transform .5s var(--rv-ease);pointer-events:none;}
.nbk-tab{position:relative;z-index:1;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;
  border:none;border-radius:999px;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--rv-ink-2);cursor:pointer;transition:color .15s ease;}
.nbk-tab:hover{color:var(--rv-ink);}
.nbk-tab[aria-selected="true"]{color:var(--rv-accent);}
.nbk-tabs:not(.nbk-tabs--block) .nbk-tab[aria-selected="true"]{background:#fff;box-shadow:0 1px 2px rgba(33,43,50,.08);}
.nbk-tab:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}

/* ------------------------------- fields ----------------------------- */
/* The search on a white card: a filled pill (the Settings field), which
   whitens and takes a blue ring when it has the caret. The input inside
   draws nothing of its own — not even the global yellow focus outline. */
.nbk-field{display:flex;align-items:center;gap:2px;height:40px;padding:0 7px 0 14px;background:var(--rv-surface-3);
  border:1px solid transparent;border-radius:999px;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease;}
.nbk-field:hover{background:#e9eef0;}
.nbk-field:focus-within{background:#fff;border-color:var(--rv-accent);box-shadow:0 0 0 3px rgba(0,94,184,.18);}
.nbk-field.is-disabled{opacity:.6;}
.nbk-field__ico{flex:none;display:flex;color:var(--rv-ink-3);transition:color .15s ease;}
.nbk-field:focus-within .nbk-field__ico{color:var(--rv-accent);}
.nbk-field input,.nbk-field input:focus,.nbk-field input:focus-visible{flex:1;min-width:0;height:100%;border:none !important;outline:none !important;
  background:none !important;box-shadow:none !important;font:inherit;font-size:14.5px;color:var(--rv-ink);padding:0 8px;}
.nbk-field input::placeholder{color:var(--rv-ink-4);}
/* Referrals' clear: a small grey disc with a white cross. */
.nbk-clear{flex:none;position:relative;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:none;border-radius:50%;
  background:var(--rv-ink-3);color:#fff;cursor:pointer;transition:background-color .15s ease;}
.nbk-clear:hover{background:var(--rv-ink-2);}
.nbk-clear:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.nbk-clear::after{content:"";position:absolute;inset:-9px;}

/* ------------------------------- labels ----------------------------- */
.nbk-label{font-size:13px;font-weight:600;color:var(--rv-ink-3);}
.nbk-chip{flex:none;}
.nbk-chip__dot{flex:none;width:6px;height:6px;border-radius:50%;}

/* The autosave, as a caption: a dot and a word, no pill behind it. */
.nbk-status{display:inline-flex;align-items:center;gap:7px;min-height:28px;font-size:13px;font-weight:550;color:var(--rv-ink-2);white-space:nowrap;}
.nbk-status__dot{position:relative;flex:none;width:7px;height:7px;border-radius:50%;background:var(--rv-green);}
.nbk-status--saving .nbk-status__dot{background:var(--rv-accent);}
.nbk-status--saving .nbk-status__dot::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--rv-accent);
  animation:nbk-ping 1.2s cubic-bezier(0,0,.2,1) infinite;}
.nbk-status--error{color:var(--rv-danger-ink);}
.nbk-status--error .nbk-status__dot{background:var(--rv-danger);}
.nbk-status__retry{padding:2px 4px;margin:0 -4px;border:none;border-radius:6px;background:none;font:inherit;font-weight:650;color:var(--rv-accent);cursor:pointer;}
.nbk-status__retry:hover{text-decoration:underline;text-underline-offset:3px;}
.nbk-status__retry:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}

/* ------------------------------ banners ----------------------------- */
/* An inset note inside the card: tinted, rounded, no edge. */
.nbk-banner{display:flex;align-items:flex-start;gap:11px;padding:13px 16px;border-radius:16px;
  background:var(--rv-hl);font-size:14px;line-height:1.5;color:var(--rv-ink-2);}
.nbk-banner--info{background:var(--rv-accent-dim);color:var(--rv-accent-hi);}
.nbk-banner--warn{background:var(--rv-warn-bg);color:var(--rv-warn-ink);}
.nbk-banner--danger{background:var(--rv-danger-bg);color:#912018;}
.nbk-banner--success{background:#e6f4ec;color:#00612f;}

/* Loading rows: the shared shimmer, in a row's shape. */
.nbk-skelrow{display:flex;align-items:center;gap:12px;min-height:40px;padding:0 12px;}

/* ------------------------------- modals ----------------------------- */
/* The overlay, the panel, the head, the foot and the buttons in it are
   the shared dialog (globals.css). What is the Notebook's: the widths. */
.nbk-modal{width:100%;outline:none;}
/* A dialog with nothing to press (a progress sheet) takes focus itself, so
   a screen reader is inside it; it draws no ring round the whole panel. */
html body .nbk-modal:focus,html body .nbk-modal:focus-visible{outline:none;}
.nbk-modal--sm{max-width:440px;}
.nbk-modal--md{max-width:620px;}
.nbk-modal--lg{max-width:940px;}
.nbk-modal--xl{max-width:1280px;}
.nbk-modal__glyph{flex:none;display:flex;color:var(--rv-ink-2);}
html body .nbk-modal .nbk-modal__sub{color:var(--rv-ink-2);}
/* An alert (a deletion): the red disc over the title, and no close — Cancel says it. */
html body .nbk-modal__head.nbk-modal__head--alert{flex-direction:column;padding-top:28px;}
html body .nbk-modal__head--alert .ap-alert__ico{margin-bottom:12px;}
.nbk-modal__body{flex:1;min-height:0;overflow:auto;padding-top:6px;padding-bottom:4px;font-size:15px;line-height:1.55;color:var(--rv-ink-2);}
html body .nbk-modal__body.nbk-modal__body--flush{padding:0;}
html body .nbk-modal__body.nbk-modal__body--center{text-align:center;}
/* A field in a dialog is the shared .ap-field; wrong, it says so in red. */
html body .nbk-modal .ap-field[aria-invalid="true"]{background:#fff;box-shadow:0 0 0 3px rgba(213,40,27,.3);}
.nbk-modal .rv-err,.nbk-modal .rv-hint{text-align:left;}

/* -------------------------------- menu ------------------------------ */
/* The mode menu's surface: white, radius 18, the popover shadow. */
.nbk-menu{position:fixed;z-index:130;min-width:216px;max-width:300px;max-height:min(560px,80vh);overflow:auto;
  display:flex;flex-direction:column;padding:6px;background:#fff;border:none;
  border-radius:18px;box-shadow:var(--rv-sh-pop);animation:nbk-pop .2s var(--rv-ease);}
.nbk-menu__item{display:flex;align-items:center;gap:11px;width:100%;border:none;background:none;border-radius:12px;
  min-height:40px;padding:6px 10px;font:inherit;font-size:14px;font-weight:600;color:var(--rv-ink);text-align:left;cursor:pointer;
  transition:background-color .14s ease,color .14s ease;}
.nbk-menu__item:hover,.nbk-menu__item:focus-visible{background:var(--rv-hl);}
.nbk-menu__item:focus{outline:none;}
.nbk-menu__item:focus-visible{box-shadow:inset 0 0 0 2px var(--rv-accent);}
.nbk-menu__item--accent{color:var(--rv-accent);}
.nbk-menu__item--accent:hover{background:var(--rv-accent-dim);}
.nbk-menu__item--danger{color:var(--rv-danger-ink);}
.nbk-menu__item--danger:hover,.nbk-menu__item--danger:focus-visible{background:var(--rv-danger-bg);}
.nbk-menu__icon{flex:none;display:flex;color:var(--rv-ink-3);}
.nbk-menu__item--accent .nbk-menu__icon{color:var(--rv-accent);}
.nbk-menu__item--danger .nbk-menu__icon{color:var(--rv-danger);}
.nbk-menu__item--open{background:var(--rv-hl);}
.nbk-menu__hint{flex:none;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;color:var(--rv-ink-2);}
.nbk-menu__sep{flex:none;height:1px;background:var(--rv-divider);margin:5px 6px;}
.nbk-menu__swatch{flex:none;width:9px;height:9px;border-radius:50%;margin:0 3.5px;}
@media (max-width:700px){
  /* A phone: every menu is a sheet from the bottom, as the shell's are. */
  .nbk-menu{left:8px !important;right:8px !important;top:auto !important;bottom:calc(8px + env(safe-area-inset-bottom)) !important;
    min-width:0 !important;max-width:none;max-height:82vh !important;border-radius:22px;
    box-shadow:0 0 0 100vmax rgba(20,28,36,.38),0 24px 60px rgba(0,0,0,.3);animation:rivaSheetUp .32s cubic-bezier(.2,.9,.3,1) backwards;}
  .nbk-menu::before{content:"";display:block;flex:none;width:36px;height:5px;margin:4px auto 8px;border-radius:999px;background:rgba(60,70,80,.22);}
  .nbk-menu__item{min-height:48px;font-size:15px;}
}

/* ------------------------------ progress ---------------------------- */
/* The working card's bar: the theme's colours, a sheen, only forward. */
.nbk-bar{height:6px;border-radius:999px;background:rgba(33,43,50,.07);overflow:hidden;}
.nbk-bar__fill{position:relative;height:100%;border-radius:999px;overflow:hidden;transition:width .6s var(--rv-ease);
  background:linear-gradient(90deg,var(--rv-sky-b,#005eb8),var(--rv-sky-a,#41b6e6),var(--rv-sky-c,#8fd3f4));}
.nbk-bar__fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);
  animation:nbk-sheen 1.5s ease-in-out infinite;}
.nbk-bar__fill--idle{width:38%;animation:nbk-slide 1.1s ease-in-out infinite;}

/* The shared toast (.rv-toast), with a button in it. */
.rv-toast.nbk-toast{pointer-events:auto;padding:8px 8px 8px 16px;gap:10px;animation:nbk-toast .3s var(--rv-ease);max-width:min(620px,calc(100vw - 32px));}
.nbk-toast__btn{flex:none;display:inline-flex;align-items:center;justify-content:center;height:30px;min-width:30px;padding:0 10px;border:none;border-radius:999px;
  background:rgba(255,255,255,.12);color:#fff;font:inherit;font-size:13px;font-weight:650;cursor:pointer;}
.nbk-toast__btn:hover{background:rgba(255,255,255,.22);}
.nbk-toast__btn:focus-visible{outline:2px solid #fff;outline-offset:1px;}

/* ------------------------------ tree rows --------------------------- */
/* Referrals' rows, made a tree: 40px, radius 12, the open page in the
   selected tint. The pointer and the keys move one soft shape behind the
   rows (.nbk-tree__hl, placed by the page) rather than repainting each. */
.nbk-tree__hl{position:absolute;left:0;top:0;height:40px;width:0;border-radius:12px;background:var(--rv-hl);pointer-events:none;opacity:0;
  transition:transform .32s var(--rv-ease),height .32s var(--rv-ease),width .32s var(--rv-ease),opacity .15s ease;}
.nbk-tree__hl.is-on{opacity:1;}
[role="treeitem"]{outline:none;}
.nbk-tree [role="treeitem"]:focus-visible{outline:none;}
.nbk-row{position:relative;display:flex;align-items:center;gap:0;min-height:40px;border-radius:12px;padding:0 4px 0 0;}
.nbk-row--on{background:var(--rv-accent-dim);}
[role="treeitem"]:focus-visible>.nbk-row{box-shadow:inset 0 0 0 2px var(--rv-accent);}
.nbk-row__btn{flex:1;min-width:0;display:flex;align-items:center;gap:10px;align-self:stretch;border:none;background:none;font:inherit;
  font-size:14.5px;font-weight:450;color:var(--rv-ink);text-align:left;padding:0 4px;cursor:pointer;border-radius:10px;}
.nbk-row__btn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.nbk-row--top>.nbk-row__btn{font-weight:600;}
.nbk-row--path .nbk-row__name{color:var(--rv-ink);}
.nbk-row--on .nbk-row__btn{color:var(--rv-accent);font-weight:600;}
/* Folder or page: a line glyph before the name, blue on the open row. */
.nbk-row__icon{flex:none;display:flex;color:var(--rv-ink-3);}
.nbk-row--on .nbk-row__icon{color:var(--rv-accent);}
.nbk-row__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nbk-row__clip{flex:none;display:flex;color:var(--rv-ink-3);}
.nbk-row__twist{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:28px;
  border:none;background:none;border-radius:8px;color:var(--rv-ink-3);cursor:pointer;padding:0;}
.nbk-row__twist:hover{color:var(--rv-ink);background:rgba(33,43,50,.06);}
.nbk-row__twist svg{transition:transform .2s var(--rv-ease);}
.nbk-row__twist[aria-expanded="true"] svg{transform:rotate(90deg);}
/* The + and ... come in over the end of the row under the pointer, on the
   row's own tint, rather than holding a gap open on every row for them -
   which is room a page's title needs more. */
.nbk-row__actions{position:absolute;right:4px;top:50%;display:flex;align-items:center;gap:0;padding-left:16px;transform:translateY(-50%);
  opacity:0;pointer-events:none;transition:opacity .14s ease;
  background:linear-gradient(90deg,rgba(244,247,249,0),var(--rv-hl) 14px);}
.nbk-row--on .nbk-row__actions{background:linear-gradient(90deg,rgba(232,241,248,0),var(--rv-accent-dim) 14px);}
.nbk-row:hover .nbk-row__actions,.nbk-row:focus-within .nbk-row__actions,[role="treeitem"]:focus-visible>.nbk-row .nbk-row__actions{opacity:1;pointer-events:auto;}
.nbk-row--drag{opacity:.45;}
.nbk-row--drop{background:var(--rv-accent-dim) !important;box-shadow:inset 0 0 0 2px var(--rv-accent) !important;}
/* A plain guide down the left of what a folder holds. */
.nbk-kids{margin-left:12px;padding-left:9px;border-left:1px solid #e3e8eb;}
@media (hover:none){
  /* No pointer to bring them in: always there, in the row's flow. */
  .nbk-row__actions{position:static;transform:none;opacity:1;pointer-events:auto;padding-left:0;background:none !important;}
  .nbk-row,.nbk-row__btn{min-height:44px;}
}

/* ------------------------------ toolbar ----------------------------- */
/* One strip of formatting, a filled pill on the page's card: the button
   that is on is the white pill with the blue glyph, as the top bar's tab is. */
.nbk-toolbar{flex:none;display:flex;align-items:center;flex-wrap:nowrap;gap:1px;
  margin:0 auto;padding:4px;max-width:calc(100% - 24px);overflow-x:auto;
  background:var(--rv-hl);border-radius:999px;}
.nbk-tbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;min-width:30px;
  padding:0 7px;border:none;border-radius:999px;background:none;color:var(--rv-ink-2);font:inherit;font-size:12.5px;
  font-weight:650;cursor:pointer;transition:background-color .14s ease,color .14s ease,box-shadow .14s ease;}
.nbk-tbtn:hover{background:rgba(255,255,255,.8);color:var(--rv-ink);}
.nbk-tbtn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.nbk-tbtn--on,.nbk-tbtn--on:hover{background:#fff;color:var(--rv-accent);box-shadow:0 1px 2px rgba(33,43,50,.08),0 2px 8px -2px rgba(33,43,50,.1);}
.nbk-tsep{flex:none;width:1px;height:16px;background:#dfe5e9;margin:0 4px;}
.nbk-swatch{width:14px;height:14px;border-radius:999px;border:2px solid #fff;}
/* Format with AI: a round white button in the page's bottom-right corner,
   lifted like the search box, the sparkles in blue. It fills blue under
   the pointer and while it works, when its sparkles twinkle. */
.nbk-ai-fab{position:absolute;right:20px;bottom:18px;z-index:3;display:inline-flex;align-items:center;justify-content:center;
  width:46px;height:46px;padding:0;border:none;border-radius:999px;background:#fff;color:var(--rv-accent);cursor:pointer;
  box-shadow:0 0 0 1px rgba(33,43,50,.06),var(--rv-sh-box);
  transition:background-color .15s ease,color .15s ease,transform .15s var(--rv-ease),box-shadow .15s ease;}
.nbk-ai-fab:hover{background:var(--rv-accent);color:#fff;transform:translateY(-1px);}
.nbk-ai-fab:focus-visible{outline:2px solid var(--rv-accent);outline-offset:3px;}
.nbk-ai-fab--busy{background:var(--rv-accent);color:#fff;cursor:progress;}
.nbk-ai-fab--busy svg{animation:nbk-twinkle 1.1s ease-in-out infinite;}
.nbk-ai-fab--busy::after{content:"";position:absolute;inset:0;border-radius:inherit;
  border:2px solid var(--rv-accent);animation:nbk-ping 1.4s ease-out infinite;pointer-events:none;}
@media (max-width:700px){.nbk-ai-fab{right:14px;bottom:14px;}}

/* ------------------------- formatting animation --------------------- */
/* A miniature page that tidies itself on a loop while the AI works: plain
   grey lines become a blue heading, a bulleted list and a table, as a scan
   line passes over them, then fall back and go again. */
.nbk-fmt{position:relative;overflow:hidden;width:220px;margin:8px auto 14px;padding:16px 18px 18px;
  background:#fff;border-radius:16px;box-shadow:inset 0 0 0 1px var(--rv-divider),0 1px 2px rgba(33,43,50,.04);}
.nbk-fmt__scan{position:absolute;left:0;right:0;top:0;height:34px;pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(0,94,184,.13) 60%,rgba(0,94,184,.35) 96%,transparent);
  animation:nbk-fmt-scan 3.2s ease-in-out infinite;}
.nbk-fmt__h{display:block;height:7px;width:82%;border-radius:4px;background:#dde4e7;margin-bottom:12px;
  animation:nbk-fmt-h 3.2s ease-in-out infinite;}
.nbk-fmt__li{display:flex;align-items:center;margin-bottom:8px;}
.nbk-fmt__dot{flex:none;width:0;height:6px;margin-right:0;border-radius:999px;background:var(--rv-accent);transform:scale(0);
  animation:nbk-fmt-dot 3.2s ease-in-out infinite;animation-delay:calc(var(--i) * .12s);}
.nbk-fmt__line{display:block;height:6px;width:var(--w);border-radius:4px;background:#dde4e7;}
.nbk-fmt__tbl{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:12px;border-radius:6px;overflow:hidden;
  animation:nbk-fmt-tbl 3.2s ease-in-out infinite;}
.nbk-fmt__td{height:9px;background:#e8edf0;animation:nbk-fmt-cell 3.2s ease-in-out infinite;}
.nbk-fmt__th{height:9px;background:#e8edf0;animation:nbk-fmt-head 3.2s ease-in-out infinite;}
@keyframes nbk-fmt-scan{0%{transform:translateY(-40px);opacity:0;}8%{opacity:1;}45%{transform:translateY(150px);opacity:1;}52%,100%{transform:translateY(150px);opacity:0;}}
@keyframes nbk-fmt-h{0%,12%{height:7px;width:82%;background:#dde4e7;}30%,82%{height:11px;width:56%;background:var(--rv-accent);}96%,100%{height:7px;width:82%;background:#dde4e7;}}
@keyframes nbk-fmt-dot{0%,18%{width:0;margin-right:0;transform:scale(0);}34%,82%{width:6px;margin-right:8px;transform:scale(1);}96%,100%{width:0;margin-right:0;transform:scale(0);}}
@keyframes nbk-fmt-tbl{0%,28%{gap:0;}42%,82%{gap:2px;}96%,100%{gap:0;}}
@keyframes nbk-fmt-cell{0%,28%{background:#e8edf0;}42%,82%{background:#eef3f7;}96%,100%{background:#e8edf0;}}
@keyframes nbk-fmt-head{0%,28%{background:#e8edf0;}42%,82%{background:#b9d3ee;}96%,100%{background:#e8edf0;}}
@keyframes nbk-twinkle{0%,100%{transform:scale(1) rotate(0);}50%{transform:scale(1.14) rotate(12deg);}}

/* -------------------------------- diff ------------------------------ */
.nbk-diff{font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.6;background:#fbfcfd;}
.nbk-diff__line{display:flex;gap:10px;padding:1px 24px;white-space:pre-wrap;word-break:break-word;color:var(--rv-ink-2);}
.nbk-diff__line--add{background:#e7f5ec;color:#00542b;box-shadow:inset 3px 0 0 #007f3b;}
.nbk-diff__line--del{background:#fbe9e7;color:#8a1206;text-decoration:line-through;box-shadow:inset 3px 0 0 #d5281b;}
.nbk-diff__gutter{flex:none;width:12px;user-select:none;opacity:.7;}

/* ------------------------- writing surface -------------------------- */
/* A comfortable reading measure: 720px of text, centred in the card. */
.nbk-prose{flex:1;outline:none;width:100%;max-width:800px;margin:0 auto;padding:6px 40px 160px;
  font-size:16.5px;line-height:1.7;color:var(--rv-ink);caret-color:var(--rv-accent);}
.nbk-prose:focus,.nbk-prose:focus-visible{background:transparent !important;color:var(--rv-ink) !important;box-shadow:none !important;outline:none !important;}
.nbk-prose>:first-child{margin-top:0;}
.nbk-prose p{margin:0 0 12px;}
.nbk-prose h1,.nbk-prose h2,.nbk-prose h3,.nbk-prose h4{margin:30px 0 10px;font-weight:750;letter-spacing:-.018em;line-height:1.3;color:var(--rv-ink);}
.nbk-prose h1{font-size:27px;letter-spacing:-.025em;}
.nbk-prose h2{font-size:21.5px;padding-bottom:8px;border-bottom:1px solid var(--rv-divider);}
.nbk-prose h3{font-size:18px;}
.nbk-prose h4{font-size:16.5px;color:var(--rv-ink-2);}
.nbk-prose ul,.nbk-prose ol{margin:0 0 12px;padding-left:24px;}
.nbk-prose ul ul,.nbk-prose ol ol,.nbk-prose ul ol,.nbk-prose ol ul{margin-bottom:0;}
.nbk-prose li{margin:4px 0;padding-left:2px;}
.nbk-prose li>p{margin:0;}
.nbk-prose ul>li::marker{color:var(--rv-accent);}
.nbk-prose ol>li::marker{color:var(--rv-accent);font-weight:700;font-variant-numeric:tabular-nums;}
.nbk-prose ul[data-type="taskList"]{list-style:none;padding-left:2px;}
.nbk-prose ul[data-type="taskList"] li{display:flex;gap:10px;align-items:flex-start;}
.nbk-prose ul[data-type="taskList"] li>label{flex:none;margin-top:5px;}
.nbk-prose ul[data-type="taskList"] li>label input{width:16px;height:16px;accent-color:var(--rv-accent);cursor:pointer;margin:0;}
.nbk-prose ul[data-type="taskList"] li>div{flex:1;min-width:0;}
.nbk-prose li[data-checked="true"]>div{text-decoration:line-through;color:var(--rv-ink-2);}
.nbk-prose blockquote{margin:0 0 14px;border:none;background:var(--rv-accent-dim);
  padding:12px 16px 12px 18px;border-radius:14px;font-size:15.5px;color:#0b3a66;}
.nbk-prose blockquote p{margin:0;}
.nbk-prose blockquote p+p{margin-top:8px;}
.nbk-prose code{font-family:Consolas,Menlo,monospace;font-size:.88em;background:var(--rv-surface-3);border-radius:6px;padding:1px 5px;}
.nbk-prose pre{margin:0 0 14px;background:var(--rv-hl);border-radius:14px;padding:14px 16px;overflow-x:auto;}
.nbk-prose pre code{background:none;border:none;padding:0;}
.nbk-prose mark{background:#fff1b8;border-radius:4px;padding:0 3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;}
.nbk-prose kbd{font-family:Consolas,Menlo,monospace;font-size:.85em;background:#fff;
  border:1px solid var(--rv-line);border-bottom-width:2px;border-radius:6px;padding:1px 6px;}
.nbk-prose img{max-width:100%;height:auto;display:block;margin:10px 0 18px;border-radius:14px;
  box-shadow:0 1px 2px rgba(33,43,50,.06),0 12px 28px -14px rgba(33,43,50,.3);}
.nbk-prose img.ProseMirror-selectednode{outline:2.5px solid var(--rv-accent);outline-offset:2px;}
.nbk-prose hr{border:none;height:1px;margin:26px 0;background:var(--rv-divider);}
.nbk-prose hr.ProseMirror-selectednode{background:var(--rv-accent);height:2px;}
.nbk-prose a{color:var(--rv-accent);text-underline-offset:2px;}
.nbk-prose s{color:var(--rv-ink-2);}
.nbk-prose table{border-collapse:separate;border-spacing:0;width:100%;margin:0 0 16px;
  border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px #e3e8eb;}
.nbk-prose th,.nbk-prose td{border:none;border-bottom:1px solid var(--rv-divider);border-right:1px solid var(--rv-divider);
  padding:9px 13px;font-size:15px;line-height:1.5;text-align:left;vertical-align:top;position:relative;min-width:48px;}
.nbk-prose th:last-child,.nbk-prose td:last-child{border-right:none;}
.nbk-prose tr:last-child>td{border-bottom:none;}
.nbk-prose th{background:var(--rv-hl);font-size:13px;font-weight:650;color:var(--rv-ink-2);}
.nbk-prose th p,.nbk-prose td p{margin:0;}
.nbk-prose .selectedCell::after{content:"";position:absolute;inset:0;background:rgba(0,94,184,.08);pointer-events:none;}
.nbk-prose p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:var(--rv-ink-4);float:left;
  height:0;pointer-events:none;white-space:pre-wrap;}
@media (max-width:1000px){
  /* Where the strip is wider than the card it scrolls sideways, and fades
     at its ends so a button cut in half reads as "more this way". */
  .nbk-toolbar{justify-content:flex-start;
    -webkit-mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent);
    mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent);}
}
@media (max-width:700px){
  .nbk-prose{padding:4px 18px 120px;font-size:16px;}
  /* Still one row that scrolls sideways (above), rather than three rows of
     buttons standing over the first lines of the page; thumb-sized. */
  .nbk-toolbar{max-width:calc(100% - 16px);}
  .nbk-tbtn{position:relative;height:40px;min-width:40px;}
  .nbk-tbtn::after{content:"";position:absolute;inset:-2px 0;}
}

/* ----------------------------- animation ---------------------------- */
@keyframes nbk-fade{from{opacity:0;}to{opacity:1;}}
@keyframes nbk-pop{from{opacity:0;transform:translateY(-6px) scale(.97);}to{opacity:1;transform:none;}}
@keyframes nbk-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@keyframes nbk-toast{from{opacity:0;transform:translate(-50%,10px) scale(.96);}to{opacity:1;transform:translate(-50%,0);}}
@keyframes nbk-ping{0%{transform:scale(.6);opacity:.8;}100%{transform:scale(1.9);opacity:0;}}
@keyframes nbk-sheen{from{transform:translateX(-100%);}to{transform:translateX(100%);}}
@keyframes nbk-slide{0%{margin-left:-38%;}100%{margin-left:100%;}}
@media (prefers-reduced-motion:reduce){
  .nbk-menu,.nbk-toast,.nbk-status{animation:none;}
  .nbk-fmt *,.nbk-ai-fab--busy svg,.nbk-ai-fab--busy::after{animation:none !important;}
  .nbk-tabs__pill,.nbk-row__twist svg,.nbk-tree__hl{transition:none;}
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

// Which shared button each of the kit's variants is. `success` was a green
// button; the page language has one primary, and Apply is it.
const BTN = {
  primary: 'rv-btn--primary', success: 'rv-btn--primary', secondary: 'rv-btn--quiet', soft: 'rv-btn--quiet',
  ghost: 'rv-btn--plain', 'quiet-danger': 'rv-btn--danger', danger: '',
};

export function Button({ variant = 'secondary', size = 'md', icon, trailing, loading = false, block = false, className = '', children, ...rest }) {
  const gl = size === 'sm' ? 14 : 15;
  return (
    <button type="button" {...rest}
      className={cx('rv-btn', BTN[variant], 'nbk-btn', 'nbk-btn--' + variant, size === 'sm' && 'rv-btn--sm', size === 'lg' && 'nbk-btn--lg', block && 'nbk-btn--block', className)}>
      {loading ? <Spinner w={gl} /> : icon ? <Svg w={gl} sw={2.2}>{icon}</Svg> : null}
      {children}
      {trailing && <Svg w={gl - 1} sw={2.2}>{trailing}</Svg>}
    </button>
  );
}

export function IconButton({ icon, label, tone = '', plain = false, size = 'md', on = false, className = '', ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={cx('rv-ibtn', 'nbk-ibtn', on && 'is-on', size === 'sm' && 'nbk-ibtn--sm', tone && 'nbk-ibtn--' + tone, className)}>
      <Svg w={size === 'sm' ? 15 : 17} sw={2.1}>{icon}</Svg>
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

/**
 * The search box on a card. Esc clears it (and only then lets Esc go on);
 * Enter and ↓ are the page's to decide — open the best match, go to the list.
 */
export function SearchField({ value, onChange, placeholder = 'Search', label, onClear, onEnter, onArrowDown, inputRef, disabled = false }) {
  const clear = () => (onClear ? onClear() : onChange(''));
  return (
    <div className={cx('nbk-field', disabled && 'is-disabled')}>
      <span className="nbk-field__ico" aria-hidden="true"><Svg w={17} sw={2}>{Icons.search}</Svg></span>
      <input ref={inputRef} type="text" value={value} disabled={disabled} enterKeyHint="search"
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); }
          if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); onChange(''); }
          if (e.key === 'ArrowDown' && onArrowDown) { e.preventDefault(); onArrowDown(); }
        }} />
      <AnimatePresence initial={false}>
        {value ? (
          <motion.button key="clear" type="button" className="nbk-clear" aria-label="Clear search" onClick={clear}
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.16, ease: EASE }}>
            <Svg w={11} sw={3}>{Icons.close}</Svg>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * A small label: the shared rv-chip, in a tone (warn, accent, ok, danger)
 * or in a kind's own colour ({ ink, tint }).
 */
export function Chip({ colour, tone = '', children, dot = false, title }) {
  const c = tone ? null : (colour || { ink: T.mut, tint: '#f0f4f5' });
  return (
    <span className={cx('rv-chip', 'nbk-chip', tone && 'rv-chip--' + tone)} title={title}
      style={c ? { color: c.ink, background: c.tint } : undefined}>
      {dot && <span className="nbk-chip__dot" style={{ background: 'currentColor' }} />}
      {children}
    </span>
  );
}

// "just now", "4 min ago", "3 hr ago", "on 12 Oct": when, said the short way.
function ago(at, now) {
  const t = typeof at === 'number' ? at : Date.parse(at || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' hr ago';
  return 'on ' + new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// The time, ticking over every half minute — in the caption's own state, so
// it is the caption that redraws and not the page round it.
function useNow(every = 30000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/**
 * The autosave, said plainly where the page's actions are.
 *
 * `state` is '' (nothing changed since it was opened), 'pending' or
 * 'saving' (an edit is on its way — the autosave waits for a quiet moment,
 * then sends it), 'saved', or 'error' (the last try failed; it tries again
 * by itself, and Retry tries now). `at` is when it was last saved. The time
 * is not read out: a screen reader hears the state change, not the clock.
 */
export function StatusPill({ state, at, onRetry }) {
  const now = useNow();
  const when = at ? ago(at, now) : '';
  const stamp = at ? new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  let cls = 'nbk-status--saved';
  let word = 'Saved';
  if (state === 'pending' || state === 'saving') { cls = 'nbk-status--saving'; word = 'Saving…'; }
  if (state === 'error') { cls = 'nbk-status--error'; word = 'Couldn’t save'; }
  return (
    <span className={cx('nbk-status', cls)} role="status" aria-live="polite" title={stamp ? 'Last saved ' + stamp : undefined}>
      <span className="nbk-status__dot" aria-hidden="true" />
      <span>{word}</span>
      {state === 'error' && onRetry ? (
        <><span aria-hidden="true">·</span><button type="button" className="nbk-status__retry" onClick={onRetry}>Retry</button></>
      ) : null}
      {state !== 'error' && state !== 'pending' && state !== 'saving' && when ? (
        <span className="nbk-status__when" aria-hidden="true">· {when}</span>
      ) : null}
    </span>
  );
}

export function Banner({ tone = 'info', icon, children, actions }) {
  return (
    <div className={cx('nbk-banner', 'nbk-banner--' + tone)}>
      {icon && <Svg w={17} sw={2} style={{ flex: 'none', marginTop: '2px' }}>{icon}</Svg>}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {actions && <div style={{ flex: 'none', display: 'flex', gap: '8px', alignSelf: 'center' }}>{actions}</div>}
    </div>
  );
}

/**
 * A state in the middle of a card — nothing yet, nothing found, it went
 * wrong: the shared rv-state. An icon in a disc, a sentence, a line of
 * help, what to do. It rises in once, as Referrals' does.
 */
export function State({ icon, title, text, children, className = '', compact = false }) {
  return (
    <motion.div className={cx('rv-state', compact && 'nbk-state--compact', className)}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
      {icon && <span className="rv-state__ico" aria-hidden="true"><Svg w={20} sw={2}>{icon}</Svg></span>}
      {title && <p className="rv-state__title">{title}</p>}
      {text ? <p className="rv-state__text">{text}</p> : null}
      {children ? <div className="rv-state__acts">{children}</div> : null}
    </motion.div>
  );
}

/** The old name for a State, for anything still calling it. */
export function EmptyState({ icon, title, body, action }) {
  return <State icon={icon} title={title} text={body}>{action}</State>;
}

/** Shimmering bars where the rows will be. Hidden from screen readers; say "loading" once, elsewhere. */
export function SkeletonRows({ rows = 6, widths = ['62%', '48%', '70%', '54%', '40%', '58%'], indent = false }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="nbk-skelrow" style={indent && i % 3 ? { paddingLeft: 34 } : undefined}>
          <span className="rv-skel" style={{ flex: 'none', width: 15, height: 15, borderRadius: 5 }} />
          <span className="rv-skel" style={{ flex: 'none', width: widths[i % widths.length] }} />
        </div>
      ))}
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

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The one modal.
 *
 * Every dialogue in the Notebook is this component: the app's shared
 * dialog chrome (globals.css), the same header/body/footer rhythm, the
 * primary action last where a reader's eye finishes. `size` is the only
 * thing that changes between a delete confirmation and a full diff.
 *
 * IT KEEPS THE KEYBOARD. On opening, focus goes to the field marked
 * data-autofocus, else the first field, else — for a destructive one —
 * Cancel (so Enter does not delete), else the primary. Tab goes round
 * inside it, Esc closes it, and on closing focus goes back to whatever
 * had it before. The title and subtitle are its name and description.
 */
export function Modal({ title, subtitle, icon, tone = '', size = 'md', onClose, footer, footerSplit = false, children, flush = false, center = false, dismissable = true, alert = false, labelledBy }) {
  const panel = React.useRef(null);
  const uid = React.useId();
  const titleId = 'nbk-m-' + uid + '-t';
  const subId = 'nbk-m-' + uid + '-s';

  React.useEffect(() => {
    if (!dismissable || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissable, onClose]);

  React.useEffect(() => {
    const el = panel.current;
    if (!el) return undefined;
    const before = document.activeElement;
    const first = el.querySelector('[data-autofocus]')
      || el.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([disabled]),textarea:not([disabled]),select:not([disabled])')
      || (tone === 'danger' ? el.querySelector('[data-cancel]') : null)
      || Array.from(el.querySelectorAll('.nbk-modal__foot button:not([disabled])')).pop()
      || el;
    first.focus({ preventScroll: true });
    return () => {
      if (before && before.focus && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const trap = (e) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const list = Array.from(panel.current.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    if (!panel.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const isAlert = alert && icon;
  return (
    <div className="nbk-overlay" onMouseDown={(e) => { if (dismissable && onClose && e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role={isAlert ? 'alertdialog' : 'dialog'} aria-modal="true" tabIndex={-1}
        aria-labelledby={labelledBy || (title ? titleId : undefined)} aria-label={!labelledBy && !title ? 'Dialog' : undefined}
        aria-describedby={subtitle ? subId : undefined}
        className={cx('nbk-modal', 'nbk-modal--' + size)} onMouseDown={(e) => e.stopPropagation()} onKeyDown={trap}>
        {title && (
          <div className={cx('nbk-modal__head', isAlert && 'nbk-modal__head--alert')}>
            {isAlert && <span className="ap-alert__ico" aria-hidden="true"><Svg w={24} sw={2}>{icon}</Svg></span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 id={titleId} className="nbk-modal__title">
                {icon && !isAlert && <span className={cx('nbk-modal__glyph', tone && 'nbk-modal__glyph--' + tone)}><Svg w={18} sw={2.1}>{icon}</Svg></span>}
                {title}
              </h2>
              {subtitle && <p id={subId} className="nbk-modal__sub">{subtitle}</p>}
            </div>
            {dismissable && onClose && !isAlert && (
              <button type="button" aria-label="Close" title="Close" onClick={onClose}><Svg w={15} sw={2.4}>{Icons.close}</Svg></button>
            )}
          </div>
        )}
        <div className={cx('nbk-modal__body', flush && 'nbk-modal__body--flush', center && 'nbk-modal__body--center')}>{children}</div>
        {footer && <div className={cx('nbk-modal__foot', footerSplit && 'nbk-modal__foot--split')}>{footer}</div>}
      </div>
    </div>
  );
}

/**
 * A destructive (or one-button) confirmation, in the shape of an alert: the
 * red disc, the question as the title, what happens underneath, Cancel and
 * the act. `message` may be text (line breaks kept) or elements.
 */
export function ConfirmModal({ title, message, confirmLabel = 'Delete', tone = 'danger', icon, soleButton = false, onConfirm, onClose, busy = false }) {
  const danger = tone === 'danger';
  return (
    <Modal size="sm" title={title} onClose={onClose} alert={danger} tone={tone} center
      icon={danger ? (icon || Icons.trash) : undefined}
      footer={<>
        {!soleButton && <Button variant="ghost" data-cancel="" onClick={onClose}>Cancel</Button>}
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} disabled={busy}>{confirmLabel}</Button>
      </>}>
      {typeof message === 'string' ? <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{message}</p> : message}
    </Modal>
  );
}

/** Work that must finish before the reader touches anything else. */
export function ProgressModal({ title, message, done, total, unit = '', footnote }) {
  const known = total > 0;
  return (
    <Modal size="sm" title={title} subtitle={message} dismissable={false}>
      <div role="status" aria-live="polite" style={{ padding: '8px 0 10px', textAlign: 'left' }}>
        <ProgressBar done={done} total={total} />
        <div style={{ marginTop: '10px', fontSize: '13.5px', color: T.mut, fontVariantNumeric: 'tabular-nums' }}>
          {known ? done + ' of ' + total + (unit ? ' ' + unit : '') : 'Working…'}
        </div>
        {footnote && <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.5, color: T.mut }}>{footnote}</div>}
      </div>
    </Modal>
  );
}

/* --------------------------------- menu --------------------------------- */

// The choices of one menu, in order — not those of a submenu drawn inside it.
function menuItems(root) {
  return Array.from(root.querySelectorAll('[role="menuitem"],[role="menuitemradio"]'))
    .filter((el) => el.closest('.nbk-menu') === root && !el.disabled);
}

// ↑ ↓ Home End move through a menu's choices, round at the ends.
function moveInMenu(e, root) {
  const items = menuItems(root);
  if (!items.length) return false;
  const at = items.indexOf(document.activeElement);
  let next = null;
  if (e.key === 'ArrowDown') next = items[(at + 1) % items.length];
  else if (e.key === 'ArrowUp') next = items[(at - 1 + items.length) % items.length];
  else if (e.key === 'Home') next = items[0];
  else if (e.key === 'End') next = items[items.length - 1];
  if (!next) return false;
  e.preventDefault();
  e.stopPropagation();
  next.focus();
  return true;
}

/**
 * A floating menu, placed where it actually fits.
 *
 * `x`/`y` is where it would like its top-left corner to be - the pointer for
 * a right-click, the bottom-left of the button for a "..." - and `flipY` is
 * where its BOTTOM goes when there is no room below: the pointer again, or
 * the top of the button, so a flipped menu never lands on top of the thing
 * that opened it. Off the right-hand edge it slides left, and a menu taller
 * than the window keeps its own scrollbar rather than running off the bottom.
 * On a phone it is a sheet from the bottom instead (the CSS above).
 *
 * It is measured after mounting rather than guessed at, because the list is a
 * different height on a page than on a section, and offsetHeight is read
 * rather than a rect so the open animation's scale cannot skew it. Until that
 * measurement it is hidden: one frame in the wrong place is a jump.
 *
 * IT IS A MENU TO THE KEYBOARD TOO: focus goes to its first choice, the
 * arrows move through them, Tab (via onClose) and Esc (the opener's) close
 * it, and focus goes back to whatever opened it.
 */
export function Menu({ x, y, flipY, width = 216, children, onMouseDown, onClose, label }) {
  const ref = React.useRef(null);
  const opener = React.useRef(null);
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

  // Where focus was, so it can go back there; and, once placed, into the menu.
  React.useLayoutEffect(() => {
    opener.current = document.activeElement;
    const el = ref.current;
    return () => {
      const back = opener.current;
      const lost = !document.activeElement || document.activeElement === document.body || (el && el.contains(document.activeElement));
      if (lost && back && back.focus && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, []);
  const placed = !!box;
  React.useEffect(() => {
    if (!placed || !ref.current) return;
    const first = menuItems(ref.current)[0];
    if (first) first.focus({ preventScroll: true });
  }, [placed]);

  return (
    <div ref={ref} className="nbk-menu" role="menu" aria-label={label}
      style={{
        left: (box ? box.left : x) + 'px',
        top: (box ? box.top : y) + 'px',
        minWidth: width + 'px',
        maxHeight: box ? box.maxHeight + 'px' : undefined,
        visibility: box ? 'visible' : 'hidden',
      }}
      onKeyDown={(e) => {
        if (moveInMenu(e, ref.current)) return;
        if (e.key === 'Tab' && onClose) { e.preventDefault(); onClose(); }
      }}
      onClick={(e) => e.stopPropagation()} onMouseDown={onMouseDown}>
      {children}
    </div>
  );
}

export function MenuItem({ icon, tone = '', children, ...rest }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} {...rest} className={cx('nbk-menu__item', tone && 'nbk-menu__item--' + tone)}>
      {icon && <span className="nbk-menu__icon"><Svg w={16} sw={2}>{icon}</Svg></span>}
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </button>
  );
}

export function MenuSeparator() { return <div className="nbk-menu__sep" role="separator" />; }

/**
 * A row that opens a second menu beside it - where a list of choices goes, so
 * the first menu stays one line per action. It opens on hover or click, sits
 * to the right of its row (left when the window has no room), and survives
 * the pointer crossing the gap between the two. From the keyboard, → or
 * Enter opens it with focus on its first choice, and ← or Esc comes back.
 */
export function MenuSub({ icon, label, hint, children }) {
  const ref = React.useRef(null);
  const timer = React.useRef(null);
  const [anchor, setAnchor] = React.useState(null);
  const [byKey, setByKey] = React.useState(false);
  const open = (key = false) => {
    clearTimeout(timer.current);
    setByKey(key);
    if (ref.current) setAnchor(ref.current.getBoundingClientRect());
  };
  const close = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setAnchor(null), 140); };
  const back = () => { clearTimeout(timer.current); setAnchor(null); if (ref.current) ref.current.focus(); };
  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div onMouseEnter={() => open(false)} onMouseLeave={close}>
      <button ref={ref} type="button" role="menuitem" tabIndex={-1} aria-haspopup="menu" aria-expanded={!!anchor} onClick={() => open(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(true); }
          if (e.key === 'ArrowLeft') setAnchor(null);
        }}
        className={cx('nbk-menu__item', anchor && 'nbk-menu__item--open')}>
        {icon && <span className="nbk-menu__icon"><Svg w={16} sw={2}>{icon}</Svg></span>}
        <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
        {hint && <span className="nbk-menu__hint">{hint}</span>}
        <span className="nbk-menu__icon"><Svg w={14} sw={2.2}>{Icons.chevronRight}</Svg></span>
      </button>
      {anchor && <SubPanel anchor={anchor} label={label} focusFirst={byKey} onBack={back} onMouseEnter={() => open(false)}>{children}</SubPanel>}
    </div>
  );
}

function SubPanel({ anchor, children, label, focusFirst, onBack, onMouseEnter }) {
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
  const placed = !!box;
  React.useEffect(() => {
    if (!placed || !focusFirst || !ref.current) return;
    const first = menuItems(ref.current)[0];
    if (first) first.focus({ preventScroll: true });
  }, [placed, focusFirst]);
  return (
    <div ref={ref} role="menu" aria-label={label} className="nbk-menu" onMouseEnter={onMouseEnter}
      onKeyDown={(e) => {
        if (moveInMenu(e, ref.current)) return;
        if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onBack(); }
      }}
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
    <button type="button" role="menuitemradio" aria-checked={selected} tabIndex={-1} {...rest} className="nbk-menu__item">
      <span className="nbk-menu__swatch"
        style={{ background: hollow ? 'transparent' : ink, boxShadow: hollow ? 'inset 0 0 0 1.5px ' + T.dim : 'none' }} />
      <span style={{ flex: 1, minWidth: 0, fontWeight: selected ? 700 : 600 }}>{children}</span>
      <span style={{ flex: 'none', width: '14px', display: 'flex', color: T.blue }}>
        {selected ? <Svg w={14} sw={2.8}>{Icons.check}</Svg> : null}
      </span>
    </button>
  );
}

/** A message at the foot of the screen: the shared toast, with room for a button. */
export function Toast({ children, actions, onClose }) {
  return (
    <div className="rv-toast nbk-toast" role="status" aria-live="polite">
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {actions}
      {onClose && (
        <button type="button" className="nbk-toast__btn" aria-label="Dismiss" onClick={onClose}>
          <Svg w={13} sw={2.6}>{Icons.close}</Svg>
        </button>
      )}
    </div>
  );
}
