'use client';

/* ------------------------------------------------------------------ *
 * /questions — the questions nobody has an answer for yet.
 *
 * ONE LIST, THREE WAYS IN. A question somebody asks here because the
 * practice has not written the answer down; one asked about words on a
 * Notebook page, with a link back to them; and every question the
 * assistant was asked and could not answer, filed on its own off the
 * question log (lib/questions/gaps.mjs). They are the same list read from
 * different ends: each is "the practice has not written this down yet".
 *
 * AN ANSWER HERE IS NOT THE RECORD. The Notebook is. An answer sits under
 * its question where the next person to ask can read it this afternoon,
 * and the row still says to write the page.
 *
 * ANSWERS INTO THE NOTEBOOK. "Add to Notebook" takes every answer not
 * yet written in to the page it belongs on and proposes each page's new
 * text - new facts added, contradictions corrected - for the reader to
 * check page by page before anything is saved (lib/questions/writein.js).
 *
 * ONE AT A TIME FIRST. A long list of questions is a wall; the page opens
 * on the open ones one by one, each with what it is about - the Notebook
 * paragraph round it, or the asker's note - and Answer or Skip.
 * "All questions" is the full list of compact cards. Asking is a button
 * that opens a box, not a form that is always there.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { gapReason } from '../../lib/questions/gaps.mjs';
import { machineCode } from '../../lib/audit/machine';
import { notebookHref } from '../../lib/notebook/links.mjs';
import { lineDiff } from '../../lib/notebook/diff.mjs';
import { stripQuestionMarks } from '../../lib/notebook/questions.mjs';
import { parseTemplate } from '../../lib/questions/template.mjs';

const STATUS = [
  { id: 'open', label: 'Open', match: (r) => r.status === 'open' },
  { id: 'answered', label: 'Answered', match: (r) => r.status === 'answered' },
  { id: 'all', label: 'All', match: () => true },
];

const SOURCES = [
  { id: '', short: 'Everything', label: 'Every source' },
  { id: 'asked', short: 'Staff', label: 'Asked by staff' },
  { id: 'notebook', short: 'Notebook', label: 'On Notebook pages' },
  { id: 'assistant', short: 'Assistant', label: 'The assistant could not answer' },
];

// Lucide "sparkles", the mark the Notebook's Format with AI button uses, so
// the AI actions in the app read as the same kind of thing.
const AI_ICON = (<><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></>);

const CSS = `
.rq{flex:1;width:100%;max-width:820px;margin:0 auto;padding:36px 20px 72px;color:#212b32;}

/* ---- the header, in the app's own language: a large title, a pill
   switch for the two views and a segmented control for the source ---- */
.rq-hero{margin:0 0 22px;}
.rq-hero__top{display:flex;align-items:flex-start;gap:16px;}
.rq-hero__text{flex:1;min-width:0;}
.rq-hero h1{margin:0;font-size:32px;font-weight:800;letter-spacing:-.03em;line-height:1.15;color:#212b32;}
.rq-hero p{margin:6px 0 0;font-size:16px;line-height:1.5;color:#4c6272;}
.rq-hero p b{color:#212b32;font-weight:750;}
.rq-hero__actions{flex:none;display:flex;align-items:center;gap:8px;padding-top:2px;}
.rq-hero__bar{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px;margin-top:18px;}
.rq-pills{display:flex;gap:6px;}
.rq-pill{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border:1px solid #dde4e7;border-radius:999px;background:#fff;
  font:inherit;font-size:14.5px;font-weight:700;color:#4c6272;cursor:pointer;transition:background-color .15s ease,color .15s ease,border-color .15s ease;}
.rq-pill:hover{color:#212b32;border-color:#c5d0d6;}
.rq-pill--on,.rq-pill--on:hover{background:#005eb8;border-color:#005eb8;color:#fff;box-shadow:0 1px 2px rgba(0,48,135,.25);}
.rq-pill span{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;
  background:rgba(33,43,50,.07);font-size:12px;font-weight:800;}
.rq-pill--on span{background:rgba(255,255,255,.22);}
.rq-seg{display:inline-flex;margin-left:auto;padding:3px;gap:2px;background:rgba(255,255,255,.7);border:1px solid #dde4e7;border-radius:12px;}
.rq-seg button{height:30px;padding:0 12px;border:none;border-radius:9px;background:none;font:inherit;font-size:13.5px;font-weight:650;color:#4c6272;cursor:pointer;}
.rq-seg button:hover{color:#212b32;}
.rq-seg .rq-seg--on{background:#fff;color:#005eb8;box-shadow:0 1px 3px rgba(33,43,50,.14);}
.rq-pill:focus-visible,.rq-seg button:focus-visible,.rq-nav:focus-visible{outline:2px solid #005eb8;outline-offset:2px;}

/* ---- one at a time ---- */
.rq-progress{display:flex;align-items:center;gap:12px;margin:0 0 12px;}
.rq-progress__text{font-size:14px;font-weight:650;color:#4c6272;white-space:nowrap;}
.rq-progress__text b{color:#212b32;}
.rq-progress__bar{flex:1;height:6px;border-radius:999px;background:#e3e9ec;overflow:hidden;}
.rq-progress__bar i{display:block;height:100%;border-radius:999px;background:#005eb8;transition:width .25s ease;}
.rq-nav{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid #dde4e7;border-radius:10px;background:#fff;
  color:#4c6272;cursor:pointer;}
.rq-nav:hover:not(:disabled){border-color:#005eb8;color:#005eb8;}
.rq-nav:disabled{opacity:.4;cursor:default;}
.rq-focus{background:#fff;border:1px solid #e1e8ec;border-radius:20px;box-shadow:0 1px 3px rgba(33,43,50,.05),0 12px 32px -18px rgba(33,43,50,.25);
  overflow:hidden;animation:rq-in .2s cubic-bezier(.2,.8,.3,1);}
.rq-ctx{padding:18px 24px;background:#f6f9fb;border-bottom:1px solid #e8eef1;}
.rq-ctx__head{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;font-size:13.5px;font-weight:650;color:#4c6272;}
.rq-ctx__head svg{flex:none;color:#005eb8;}
.rq-ctx__head > span:not(.rq-ctx__when){flex:1;min-width:0;}
.rq-ctx__head a{color:#005eb8;text-decoration:none;}
.rq-ctx__head a:hover{text-decoration:underline;}
.rq-ctx__when{margin-left:auto;font-weight:500;color:#768692;}
.rq-ctx__text{margin-top:10px;font-size:16px;line-height:1.6;color:#4c6272;overflow-wrap:anywhere;}
.rq-ctx__text mark{background:#fff1b8;color:#212b32;border-radius:3px;padding:1px 3px;box-shadow:inset 0 -2px 0 #f0b429;}
.rq-ctx__label{display:block;margin:12px 0 4px;font-size:11.5px;font-weight:800;letter-spacing:.06em;color:#768692;}
.rq-fbody{padding:22px 24px 22px;}
.rq-fbody__label{font-size:11.5px;font-weight:800;letter-spacing:.06em;color:#768692;}
.rq-fbody h2{margin:6px 0 0;font-size:25px;font-weight:800;line-height:1.3;letter-spacing:-.02em;color:#212b32;overflow-wrap:anywhere;}
.rq-fbody .rq-area{margin-top:16px;font-size:16px;}
.rq-factions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:18px;}
.rq-big{height:44px;padding:0 20px;font-size:15.5px;border-radius:11px;}
.rq-skip{height:44px;padding:0 16px;font-size:15px;}
.rq-keys{margin:12px 0 0;text-align:center;font-size:13px;color:#768692;}
.rq-keys kbd{display:inline-block;min-width:18px;padding:1px 6px;border:1px solid #d3dce1;border-bottom-width:2px;border-radius:5px;background:#fff;
  font:inherit;font-size:12px;font-weight:700;color:#4c6272;}
.rq-clear-state{padding:48px 24px;text-align:center;background:#fff;border:1px solid #e1e8ec;border-radius:20px;}
.rq-clear-state__icon{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#e6f4ec;color:#007f3b;}
.rq-clear-state h2{margin:14px 0 4px;font-size:21px;font-weight:800;}
.rq-clear-state p{margin:0;font-size:15px;color:#4c6272;}
.rq-clear-state .rq-factions{justify-content:center;}

.rq-primary{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 16px 0 13px;border:1px solid #004f9c;border-radius:10px;
  background:#005eb8;color:#fff;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 1px 2px rgba(0,48,135,.25);transition:background-color .15s ease;}
.rq-primary:hover:not(:disabled){background:#0052a3;}
.rq-primary:disabled{opacity:.5;cursor:default;}
.rq-primary--sm{height:32px;padding:0 13px;font-size:13.5px;border-radius:9px;}
.rq-ghost{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border:none;border-radius:9px;background:none;
  font:inherit;font-size:13.5px;font-weight:650;color:#4c6272;cursor:pointer;transition:background-color .15s ease,color .15s ease;}
.rq-ghost:hover:not(:disabled){background:rgba(33,43,50,.06);color:#212b32;}
.rq-ghost:disabled{opacity:.5;cursor:default;}
.rq-icon{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid #dde4e7;border-radius:10px;
  background:#fff;color:#4c6272;cursor:pointer;transition:border-color .15s ease,color .15s ease;}
.rq-icon:hover:not(:disabled){border-color:#005eb8;color:#005eb8;}
.rq-icon:disabled{opacity:.45;cursor:default;}
.rq-icon--done{border-color:#007f3b;color:#007f3b;}
.rq-link{display:inline-flex;align-items:center;gap:5px;border:none;background:none;padding:4px 2px;font:inherit;font-size:13px;font-weight:650;
  color:#005eb8;cursor:pointer;}
.rq-link:hover{text-decoration:underline;}
.rq-link:disabled{opacity:.5;cursor:default;text-decoration:none;}
.rq-primary:focus-visible,.rq-ghost:focus-visible,.rq-icon:focus-visible,.rq-link:focus-visible,.rq-tab:focus-visible,.rq-answer-btn:focus-visible,.rq-ico:focus-visible{
  outline:2px solid #005eb8;outline-offset:2px;}

/* ---- asking ---- */
.rq-compose{margin:0 0 22px;padding:14px;background:#fff;border:1px solid #dde4e7;border-radius:16px;
  box-shadow:0 0 0 1px rgba(33,43,50,.02),0 6px 18px -8px rgba(33,43,50,.18);animation:rq-in .18s cubic-bezier(.2,.8,.3,1);}
@keyframes rq-in{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
.rq-input,.rq-area{display:block;width:100%;box-sizing:border-box;border:1px solid #dde4e7;border-radius:10px;background:#fff;
  font:inherit;color:#212b32;outline:none;transition:border-color .15s ease,box-shadow .15s ease;}
.rq-input{height:44px;padding:0 13px;font-size:16px;}
.rq-area{padding:10px 13px;font-size:15px;line-height:1.5;resize:vertical;}
.rq-input:focus,.rq-area:focus{border-color:#005eb8;box-shadow:0 0 0 3px rgba(0,94,184,.14);}
.rq-input + .rq-area{margin-top:8px;}
.rq-compose__bar{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;margin-top:10px;}
.rq-grow{flex:1;}
.rq-hint{font-size:12.5px;color:#768692;}
.rq-err{margin-top:8px;font-size:13.5px;font-weight:600;color:#a51b0f;}
.rq-found{display:flex;flex-direction:column;gap:10px;max-height:min(60vh,640px);overflow:auto;padding-right:2px;}
.rq-found__item{display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid #e3e9ec;border-radius:12px;background:#fbfcfd;}
.rq-found__item input[type=checkbox]{flex:none;width:17px;height:17px;margin:10px 0 0;accent-color:#005eb8;cursor:pointer;}
.rq-found__fields{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}
.rq-found__fields .rq-input{height:38px;font-size:15px;}
.rq-found__fields .rq-area{margin:0;}
.rq-found__item--off{opacity:.5;}
.rq-input--title{font-weight:700;}
.rq-area--points{font-size:14.5px;line-height:1.5;field-sizing:content;min-height:44px;max-height:260px;}
.rq-compose > .rq-input,.rq-compose > .rq-area{margin-top:8px;}
.rq-compose > :first-child{margin-top:0;}
.rq-found__fail{margin:2px 0 4px 27px;font-size:12.5px;color:#a51b0f;}
.rq-scan{display:flex;flex-direction:column;gap:9px;padding:6px 2px;}
.rq-scan i{display:block;height:9px;border-radius:5px;background:linear-gradient(90deg,#e8edf0 0%,#d3e3f3 50%,#e8edf0 100%);
  background-size:200% 100%;animation:rq-shine 1.4s linear infinite;}
@keyframes rq-shine{from{background-position:100% 0;}to{background-position:-100% 0;}}

/* ---- the filter bar ---- */
.rq-bar{display:flex;align-items:center;gap:10px;border-bottom:1px solid #dde4e7;}
.rq-tabs{display:flex;gap:2px;}
.rq-tab{position:relative;border:none;background:none;padding:9px 10px 11px;font:inherit;font-size:14px;font-weight:650;color:#768692;cursor:pointer;}
.rq-tab:hover{color:#212b32;}
.rq-tab--on{color:#212b32;}
.rq-tab--on::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:#005eb8;}
.rq-tab span{margin-left:5px;font-weight:600;color:#9aa8b1;font-variant-numeric:tabular-nums;}

.rq-notice{margin:10px 0 0;font-size:13.5px;color:#005eb8;}
.rq-empty{padding:44px 12px;text-align:center;font-size:14.5px;line-height:1.55;color:#768692;}

/* ---- the list: one compact card per question ---- */
.rq-list{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;}
.rq-list:empty{display:none;}
.rq-card{padding:14px 14px 14px 18px;background:#fff;border:1px solid #e1e8ec;border-radius:14px;box-shadow:0 1px 2px rgba(33,43,50,.04);}
.rq-card__row{display:flex;align-items:flex-start;gap:12px;}
.rq-card__main{flex:1;min-width:0;}
.rq-card__title{margin:0 0 2px;font-size:13px;font-weight:750;color:#005eb8;overflow-wrap:anywhere;}
.rq-points{list-style:disc;margin:8px 0 0;padding:0 0 0 18px;font-size:14px;line-height:1.5;color:#4c6272;overflow-wrap:anywhere;}
.rq-points li{margin:2px 0;}
.rq-points li::marker{color:#9aa8b1;}
.rq-ctx .rq-points{margin-top:2px;font-size:15px;line-height:1.55;}
.rq-fbody__label--title{font-size:15px;letter-spacing:0;color:#005eb8;}
.rq-card__q{margin:0;font-size:17px;font-weight:700;line-height:1.4;color:#212b32;overflow-wrap:anywhere;}
.rq-card__meta{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;margin-top:4px;font-size:13px;color:#768692;}
.rq-card__meta a{color:#005eb8;font-weight:650;text-decoration:none;}
.rq-card__meta a:hover{text-decoration:underline;}
.rq-status{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:750;}
.rq-status--open{background:#fff4dc;color:#8a5a00;}
.rq-status--done{background:#e6f4ec;color:#00612f;}
.rq-src--bot{color:#a13a00;font-weight:650;}
.rq-quote{margin-top:6px;padding-left:10px;border-left:3px solid #f0c674;font-size:14px;line-height:1.45;color:#4c6272;overflow-wrap:anywhere;}
.rq-detail{margin-top:6px;font-size:14.5px;line-height:1.5;color:#4c6272;white-space:pre-wrap;overflow-wrap:anywhere;}
.rq-reply{margin-top:10px;padding:2px 0 2px 12px;border-left:3px solid #6fbf8f;font-size:15.5px;line-height:1.5;color:#212b32;white-space:pre-wrap;overflow-wrap:anywhere;}
.rq-reply__note{display:block;margin-top:3px;font-size:12.5px;white-space:normal;}
.rq-card__acts{flex:none;display:flex;align-items:center;gap:2px;}
.rq-answer-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:1px solid #cfe0ee;border-radius:9px;background:#eaf2fb;
  color:#005eb8;font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background-color .15s ease;}
.rq-answer-btn:hover{background:#dcebf8;color:#003087;}
.rq-answer-btn--quiet{background:#fff;border-color:#dde4e7;color:#4c6272;}
.rq-answer-btn--quiet:hover{background:#f4f7f9;color:#212b32;}
.rq-ico{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;border-radius:9px;background:none;
  color:#768692;cursor:pointer;text-decoration:none;}
.rq-ico:hover:not(:disabled){background:rgba(33,43,50,.06);color:#212b32;}
.rq-ico--red:hover:not(:disabled){background:#fdeeec;color:#a51b0f;}
.rq-ico:disabled{opacity:.5;cursor:default;}
.rq-answerbox{margin-top:10px;}
.rq-answerbox .rq-area{font-size:15.5px;}
.rq-answerbox .rq-compose__bar{margin-top:8px;}

.rq-sub{display:flex;align-items:center;flex-wrap:wrap;gap:4px 14px;margin:10px 0 0;font-size:13px;color:#768692;}
.rq-sub .rq-grow{min-width:8px;}
.rq-link--red{color:#a51b0f;}
.rq-soft{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px 0 12px;border:1px solid #cfe0ee;border-radius:10px;
  background:#eaf2fb;color:#005eb8;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:background-color .15s ease;}
.rq-soft:hover{background:#dcebf8;color:#003087;}
.rq-soft b{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;
  background:#005eb8;color:#fff;font-size:11.5px;font-weight:800;}

/* ---- writing answers into the Notebook ---- */
.rq-overlay{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(33,43,50,.38);backdrop-filter:blur(2px);animation:rq-fade .15s ease;}
@keyframes rq-fade{from{opacity:0;}to{opacity:1;}}
.rq-modal{display:flex;flex-direction:column;width:min(780px,100%);max-height:calc(100vh - 32px);background:#fff;border-radius:18px;
  box-shadow:0 30px 60px -12px rgba(33,43,50,.35);animation:rq-in .2s cubic-bezier(.2,.8,.3,1);overflow:hidden;}
.rq-modal__head{flex:none;display:flex;align-items:flex-start;gap:12px;padding:18px 18px 12px 22px;}
.rq-modal__head h2{margin:0;font-size:19px;font-weight:800;letter-spacing:-.015em;}
.rq-modal__head p{margin:4px 0 0;font-size:13.5px;line-height:1.45;color:#4c6272;}
.rq-modal__body{flex:1;min-height:0;overflow:auto;padding:4px 22px 18px;}
.rq-modal__foot{flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;padding:12px 18px 12px 22px;border-top:1px solid #edf1f3;background:#fafcfd;}
.rq-x{flex:none;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:9px;
  background:none;color:#768692;cursor:pointer;}
.rq-x:hover{background:rgba(33,43,50,.06);color:#212b32;}
.rq-wp{padding:14px 0;border-bottom:1px solid #edf1f3;}
.rq-wp:last-child{border-bottom:none;}
.rq-wp__head{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;cursor:pointer;}
.rq-wp__head input{flex:none;width:17px;height:17px;margin:0;accent-color:#005eb8;cursor:pointer;}
.rq-wp__title{font-size:15.5px;font-weight:700;}
.rq-wp__path{flex-basis:100%;margin-left:27px;font-size:12.5px;color:#768692;}
.rq-tag{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;background:#eaf2fb;color:#005eb8;font-size:11.5px;font-weight:700;}
.rq-wp__qs{margin:8px 0 0 27px;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px;font-size:13.5px;line-height:1.45;color:#4c6272;}
.rq-wp__qs li::before{content:"?";display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin-right:7px;
  border-radius:50%;background:#005eb8;color:#fff;font-size:10px;font-weight:800;vertical-align:1px;}
.rq-wp__warn{margin:8px 0 0 27px;padding:6px 10px;border-radius:8px;background:#fff6e5;color:#8a5a00;font-size:12.5px;line-height:1.45;}
.rq-wp__more{margin:6px 0 0 25px;}
.rq-diff{margin:8px 0 0 27px;border:1px solid #e3e9ec;border-radius:10px;overflow:hidden;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;}
.rq-diff div{display:flex;gap:8px;padding:1px 10px;white-space:pre-wrap;overflow-wrap:anywhere;color:#4c6272;}
.rq-diff i{flex:none;width:10px;font-style:normal;color:#9aa8b1;}
.rq-diff .rq-diff--add{background:#eaf6ef;color:#14532d;}
.rq-diff .rq-diff--del{background:#fdeeec;color:#7f1d1d;text-decoration:line-through;text-decoration-color:rgba(127,29,29,.35);}
.rq-diff .rq-diff--gap{justify-content:center;color:#9aa8b1;background:#fafcfd;}
.rq-tidy{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 0 27px;}
.rq-tidy__side{padding:10px 12px;border-radius:10px;background:#f4f7f9;font-size:14px;line-height:1.5;color:#4c6272;min-width:0;overflow-wrap:anywhere;}
.rq-tidy__side--after{background:#eef6fd;border:1px solid #d3e5f5;}
.rq-tidy__side > b{display:block;margin-bottom:4px;font-size:11px;letter-spacing:.06em;color:#768692;}
.rq-tidy__q{font-weight:700;color:#212b32;}
.rq-tidy__note{margin-top:4px;white-space:pre-wrap;}
.rq-tidy .rq-points{margin-top:4px;}
@media (max-width:640px){.rq-tidy{grid-template-columns:1fr;margin-left:0;}}
.rq-done{display:flex;align-items:flex-start;gap:9px;padding:9px 0;font-size:14.5px;line-height:1.45;}
.rq-done a{color:#005eb8;font-weight:650;text-decoration:none;}
.rq-done a:hover{text-decoration:underline;}

@media (max-width:560px){
  .rq-soft span{display:none;}
  .rq{padding-top:24px;}
  .rq-hero h1{font-size:26px;}
  .rq-hero p{font-size:14.5px;}
  .rq-hero__actions .rq-primary span{display:none;}
  .rq-seg{margin-left:0;}
  .rq-ctx,.rq-fbody{padding-left:16px;padding-right:16px;}
  .rq-fbody h2{font-size:21px;}
  .rq-ctx__head{align-items:flex-start;}
  .rq-ctx__when,.rq-keys{display:none;}
  .rq-hint{display:none;}
  .rq-card{padding:12px 10px 12px 14px;}
  .rq-card__q{font-size:16px;}
  .rq-answer-btn{padding:0 11px;}
  /* No room beside the question: the buttons go on a line under it. */
  .rq-card__row{flex-wrap:wrap;row-gap:8px;}
  .rq-card__main{flex-basis:100%;}
  .rq-card__acts{order:2;margin-left:-4px;}
}
@media (prefers-reduced-motion:reduce){.rq-compose,.rq-scan i,.rq-overlay,.rq-modal{animation:none;}}
`;

function when(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

async function send(method, body, query = '') {
  const res = await fetch('/api/questions/open' + query, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/* ------------------------------------------------------------------ *
 * Asking: one question, or a paste the AI picks the questions out of.
 * The model only proposes - what it found is a list to tick and
 * correct, each one added through the same POST as a typed question,
 * so one already on the list is counted as asked again.
 * ------------------------------------------------------------------ */
function Composer({ onClose, onAdded }) {
  const [mode, setMode] = useState('one');           // one | paste | reading | review | saving
  // The template: a title, the context points (one per line, word for word)
  // and the question - lib/questions/template.mjs.
  const [title, setTitle] = useState('');
  const [pointsText, setPointsText] = useState('');
  const [question, setQuestion] = useState('');
  const [paste, setPaste] = useState('');
  const [found, setFound] = useState([]);            // [{ title, pointsText, question, keep, failed }]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy && mode !== 'saving') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, mode, onClose]);

  async function askOne(e) {
    e.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      const { ok, data } = await send('POST', { title: title.trim(), points: pointsText, question: text });
      // Only cleared once stored: a box emptied by a failed save is a
      // question somebody has to type twice.
      if (!ok) { setError(data.error || 'The question could not be saved.'); return; }
      onAdded(data.repeat ? 'Already on the list — counted as asked again.' : 'Asked. It stays open until somebody answers it.');
    } catch (err) {
      setError('The question could not be saved — nothing was stored.');
    } finally {
      setBusy(false);
    }
  }

  // Something pasted in the template's own shape - a title, bullet points,
  // "Question: …" - is split into the three boxes rather than dropped into one.
  function pasteTemplate(e) {
    const parsed = parseTemplate(e.clipboardData ? e.clipboardData.getData('text') : '');
    if (!parsed) return;
    e.preventDefault();
    setTitle(parsed.title);
    setPointsText(parsed.points.join('\n'));
    setQuestion(parsed.question);
  }

  async function findQuestions() {
    if (!paste.trim()) return;
    setMode('reading');
    setError('');
    try {
      const res = await fetch('/api/questions/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: paste }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'The text could not be read.'); setMode('paste'); return; }
      if (!data.questions || !data.questions.length) {
        setError('No questions found in that. Paste more of it, or ask one at a time.');
        setMode('paste');
        return;
      }
      setFound(data.questions.map((q) => ({
        title: q.title || '', pointsText: (q.points || []).join('\n'), question: q.question || '', keep: true, failed: '',
      })));
      setMode('review');
    } catch (err) {
      setError('The text could not be read.');
      setMode('paste');
    }
  }

  const chosen = found.filter((q) => q.keep && q.question.trim());
  const edit = (i, patch) => setFound((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function addFound() {
    if (!chosen.length) return;
    setMode('saving');
    setError('');
    let added = 0;
    let repeats = 0;
    const left = [];
    // One at a time, in order: a failure part-way leaves exactly the unsaved ones.
    for (const q of found) {
      if (!q.keep || !q.question.trim()) continue;
      try {
        const { ok, data } = await send('POST', { title: q.title.trim(), points: q.pointsText, question: q.question.trim() });
        if (!ok) left.push({ ...q, failed: data.error || 'Not saved.' });
        else if (data.repeat) repeats += 1;
        else added += 1;
      } catch (err) {
        left.push({ ...q, failed: 'Not saved.' });
      }
    }
    const parts = [];
    if (added) parts.push(plural(added, 'question added', 'questions added'));
    if (repeats) parts.push(plural(repeats, 'was already listed', 'were already listed') + ' and counted again');
    if (left.length) {
      setFound(left);
      setMode('review');
      setError(plural(left.length, 'question', 'questions') + ' could not be saved.');
      if (parts.length) onAdded(parts.join(', ') + '.', true);
      return;
    }
    onAdded(parts.join(', ') + '.');
  }

  if (mode === 'one') {
    return (
      <form className="rq-compose" onSubmit={askOne}>
        <input className="rq-input rq-input--title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onPaste={pasteTemplate}
          placeholder="Title — what it is about, e.g. Chest pain clinic type (C15)" aria-label="Title" maxLength={120} />
        <textarea className="rq-area rq-area--points" rows={Math.min(Math.max(pointsText.split('\n').length, 2), 8)} value={pointsText}
          onChange={(e) => setPointsText(e.target.value)} onPaste={pasteTemplate}
          placeholder="Context — one point per line, word for word as you found it" aria-label="Context points, one per line" />
        <input className="rq-input" value={question} onChange={(e) => setQuestion(e.target.value)} onPaste={pasteTemplate}
          placeholder="The question — e.g. Which clinic type do we select?" aria-label="Your question" maxLength={400} />
        {error && <div className="rq-err">{error}</div>}
        <div className="rq-compose__bar">
          <button type="button" className="rq-link" onClick={() => { setMode('paste'); setError(''); }}>
            <Svg w={14} sw={2}>{AI_ICON}</Svg>Paste lots of text
          </button>
          <span className="rq-grow" />
          <span className="rq-hint">Pasting a title, bullets and "Question: …" fills all three</span>
          <button type="button" className="rq-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="rq-primary rq-primary--sm" disabled={!question.trim() || busy}>
            {busy ? 'Asking…' : 'Ask'}
          </button>
        </div>
      </form>
    );
  }

  if (mode === 'reading') {
    return (
      <div className="rq-compose" role="status" aria-label="Finding the questions">
        <div className="rq-scan" aria-hidden="true">
          {['92%', '70%', '84%', '58%'].map((w, i) => <i key={i} style={{ width: w, animationDelay: i * 0.12 + 's' }} />)}
        </div>
        <div className="rq-compose__bar"><span className="rq-hint" style={{ display: 'inline' }}>Finding the questions…</span></div>
      </div>
    );
  }

  if (mode === 'review' || mode === 'saving') {
    const saving = mode === 'saving';
    return (
      <div className="rq-compose">
        <div className="rq-found">
          {found.map((q, i) => (
            <div key={i}>
              <div className={'rq-found__item' + (q.keep ? '' : ' rq-found__item--off')}>
                <input type="checkbox" checked={q.keep} disabled={saving} onChange={(e) => edit(i, { keep: e.target.checked })}
                  aria-label={'Keep: ' + q.question} />
                <div className="rq-found__fields">
                  <input className="rq-input rq-input--title" value={q.title} disabled={saving} placeholder="Title"
                    onChange={(e) => edit(i, { title: e.target.value })} aria-label="Title" />
                  {(q.pointsText || !saving) && (
                    <textarea className="rq-area rq-area--points" value={q.pointsText} disabled={saving} placeholder="Context — one point per line"
                      rows={Math.min(Math.max(q.pointsText.split('\n').length, 1), 8)}
                      onChange={(e) => edit(i, { pointsText: e.target.value })} aria-label="Context points, one per line" />
                  )}
                  <input className="rq-input" value={q.question} disabled={saving}
                    onChange={(e) => edit(i, { question: e.target.value })} aria-label="Question" />
                </div>
              </div>
              {q.failed && <div className="rq-found__fail">{q.failed}</div>}
            </div>
          ))}
        </div>
        {error && <div className="rq-err">{error}</div>}
        <div className="rq-compose__bar">
          <button type="button" className="rq-link" disabled={saving} onClick={() => { setFound([]); setMode('paste'); setError(''); }}>
            Back to the text
          </button>
          <span className="rq-grow" />
          <button type="button" className="rq-ghost" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="button" className="rq-primary rq-primary--sm" disabled={saving || !chosen.length} onClick={addFound}>
            {saving ? 'Adding…' : 'Add ' + plural(chosen.length, 'question', 'questions')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rq-compose">
      <textarea className="rq-area" autoFocus rows={7} value={paste} onChange={(e) => setPaste(e.target.value)}
        aria-label="Text to find questions in"
        placeholder="Paste meeting notes, an email or a list. The AI picks out every question, including the implied ones, and you check them before anything is added." />
      {error && <div className="rq-err">{error}</div>}
      <div className="rq-compose__bar">
        <button type="button" className="rq-link" onClick={() => { setMode('one'); setError(''); }}>Ask one instead</button>
        <span className="rq-grow" />
        <span className="rq-hint">No patient information</span>
        <button type="button" className="rq-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="rq-primary rq-primary--sm" disabled={!paste.trim()} onClick={findQuestions}>
          <Svg w={15} sw={1.9}>{AI_ICON}</Svg>Find questions
        </button>
      </div>
    </div>
  );
}

/* The words on a Notebook page a question was asked about. */
const pageHref = (row) => (row.origin === 'notebook' && row.noteTitle
  ? notebookHref({ id: row.noteId, title: row.noteTitle }) + '?q=' + encodeURIComponent(row.anchor || '')
  : '');

/* Where a question came from, in the line above it. */
function Source({ row }) {
  if (row.origin === 'notebook') {
    if (!row.noteTitle) return <span>On a deleted Notebook page</span>;
    return <span>On <Link href={pageHref(row)} title="Go to the words it was asked about">{row.noteTitle}</Link></span>;
  }
  if (row.origin === 'assistant') {
    const reason = gapReason(row.reason);
    return (
      <span className="rq-src--bot">
        {reason ? 'The assistant could not answer — ' + reason.label.toLowerCase() : 'The assistant could not answer'}
      </span>
    );
  }
  return <span>Asked by staff</span>;
}

/* One question, as a compact card: the question, one grey line saying
   where it came from, and its answer under it once it has one. Answering
   is a button; the box to write in opens only when it is pressed. */
function Row({ row, onAnswer, onRemove, busy }) {
  const answered = row.status === 'answered';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.answer || '');
  const onPage = row.origin === 'notebook';
  // Asked again since it was answered: the answer evidently never reached
  // the Notebook. Worth saying, quietly.
  const stale = answered && row.answeredAt && new Date(row.lastAt) > new Date(row.answeredAt);
  const href = pageHref(row);

  const open = () => { setDraft(row.answer || ''); setEditing(true); };
  const cancel = () => { setDraft(row.answer || ''); setEditing(false); };
  const save = () => {
    if (!draft.trim() || busy) return;
    onAnswer(row, draft).then((ok) => { if (ok) setEditing(false); });
  };

  return (
    <li className="rq-card">
      <div className="rq-card__row">
        <div className="rq-card__main">
          {row.title && <div className="rq-card__title">{row.title}</div>}
          <h3 className="rq-card__q">{row.question}</h3>
          <div className="rq-card__meta">
            <span className={'rq-status ' + (answered ? 'rq-status--done' : 'rq-status--open')}>
              {answered && <Svg w={11} sw={3}>{Icons.check}</Svg>}{answered ? 'Answered' : 'Open'}
            </span>
            <Source row={row} />
            <span>
              {when(row.lastAt || row.at)}
              {row.askedCount > 1 ? ' · asked ' + row.askedCount + ' times' : ''}
            </span>
          </div>
        </div>
        {!editing && (
          <div className="rq-card__acts">
            <button type="button" className={'rq-answer-btn' + (answered ? ' rq-answer-btn--quiet' : '')} onClick={open}>
              {answered ? 'Edit' : 'Answer'}
            </button>
            {onPage
              ? href && <Link className="rq-ico" href={href} title="Go to the text" aria-label="Go to the text"><Svg w={16} sw={2.1}>{Icons.external}</Svg></Link>
              : <Link className="rq-ico" href="/notebook" title="Write the page in the Notebook" aria-label="Write the page"><Svg w={16} sw={2.1}>{Icons.book}</Svg></Link>}
            {answered && (
              <button type="button" className="rq-ico" disabled={busy} onClick={() => onAnswer(row, '')} title="Reopen" aria-label="Reopen">
                <Svg w={16} sw={2.1}>{Icons.undo}</Svg>
              </button>
            )}
            <button type="button" className="rq-ico rq-ico--red" disabled={busy} onClick={() => onRemove(row)} title="Remove" aria-label="Remove">
              <Svg w={16} sw={2.1}>{Icons.trash}</Svg>
            </button>
          </div>
        )}
      </div>

      {row.quote && <div className="rq-quote">“{row.quote}”</div>}
      <Points points={row.points} />
      {row.detail && <div className="rq-detail">{row.detail}</div>}

      {answered && !editing && row.answer && (
        <div className="rq-reply">
          {row.answer}
          {onPage && row.writtenAt && <span className="rq-reply__note" style={{ color: '#007f3b' }}>Written into the page.</span>}
          {stale && <span className="rq-reply__note" style={{ color: '#a13a00' }}>Asked again since — it may not be in the Notebook yet.</span>}
        </div>
      )}

      {editing && (
        <div className="rq-answerbox">
          <textarea className="rq-area" rows={3} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            aria-label={'Answer: ' + row.question} placeholder="Write the answer…" maxLength={4000}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
            }} />
          <div className="rq-compose__bar">
            <span className="rq-hint">Ctrl + Enter to save · Esc to cancel</span>
            <span className="rq-grow" />
            <button type="button" className="rq-ghost" onClick={cancel}>Cancel</button>
            <button type="button" className="rq-primary rq-primary--sm" disabled={busy || !draft.trim()} onClick={save}>Save answer</button>
          </div>
        </div>
      )}
    </li>
  );
}

// A diff with long unchanged stretches folded away, so a page with one new
// line reads as one new line.
function foldDiff(diff, around = 1) {
  const keep = diff.map((l, i) => l.t !== ' ' || diff.slice(Math.max(0, i - around), i + around + 1).some((x) => x.t !== ' '));
  const out = [];
  diff.forEach((l, i) => {
    if (keep[i]) out.push(l);
    else if (out.length === 0 || out[out.length - 1].t !== 'gap') out.push({ t: 'gap', s: '' });
  });
  return out;
}

function PageChange({ page, on, onToggle }) {
  const [open, setOpen] = useState(false);
  const diff = useMemo(
    () => (open ? foldDiff(lineDiff(stripQuestionMarks(page.before || ''), stripQuestionMarks(page.after || ''))) : []),
    [open, page.before, page.after],
  );
  const usable = !page.error;
  return (
    <div className="rq-wp">
      <label className="rq-wp__head">
        <input type="checkbox" checked={usable && on} disabled={!usable} onChange={onToggle} aria-label={'Write into ' + page.title} />
        <span className="rq-wp__title">{page.title}</span>
        {page.isNew && <span className="rq-tag">New page</span>}
        <span className="rq-wp__path">{page.path}</span>
      </label>
      <ul className="rq-wp__qs">
        {page.questions.map((q) => <li key={q.id}>{q.question}</li>)}
      </ul>
      {page.error && <div className="rq-err" style={{ marginLeft: 27 }}>{page.error}</div>}
      {page.warnings.map((w) => <div key={w} className="rq-wp__warn">{w}</div>)}
      {usable && (
        <div className="rq-wp__more">
          <button type="button" className="rq-link" onClick={() => setOpen((o) => !o)}>{open ? 'Hide changes' : 'Show changes'}</button>
        </div>
      )}
      {open && (
        <div className="rq-diff">
          {diff.map((l, i) => (l.t === 'gap'
            ? <div key={i} className="rq-diff--gap">⋯</div>
            : <div key={i} className={l.t === '+' ? 'rq-diff--add' : l.t === '-' ? 'rq-diff--del' : ''}><i>{l.t === ' ' ? '' : l.t}</i>{l.s || ' '}</div>))}
        </div>
      )}
    </div>
  );
}

/* Every answered question not yet in the Notebook, written into the page it
   belongs on. Proposed, read, then applied - nothing is saved before the
   reader presses the button. */
function WriteIn({ onClose, onDone }) {
  const [step, setStep] = useState({ name: 'planning' }); // planning | review | applying | done | error
  const [chosen, setChosen] = useState({});

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/questions/writein', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'plan' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) { setStep({ name: 'error', message: data.error || 'The answers could not be placed.' }); return; }
        const pages = Array.isArray(data.pages) ? data.pages : [];
        setChosen(Object.fromEntries(pages.map((p) => [p.key, !p.error])));
        setStep({ name: 'review', pages, more: !!data.more });
      } catch (e) {
        if (live) setStep({ name: 'error', message: 'The answers could not be placed.' });
      }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && step.name !== 'applying' && step.name !== 'planning') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step.name, onClose]);

  const pages = step.pages || [];
  const kept = pages.filter((p) => chosen[p.key] && !p.error);
  const answers = kept.reduce((n, p) => n + p.questions.length, 0);

  async function apply() {
    const body = kept.map((p) => ({ noteId: p.noteId, title: p.title, body: p.after, sourceHash: p.sourceHash, questionIds: p.questions.map((q) => q.id) }));
    setStep((s) => ({ ...s, name: 'applying' }));
    try {
      const res = await fetch('/api/questions/writein', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply', pages: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStep({ name: 'error', message: data.error || 'The answers could not be written in.' }); return; }
      setStep({ name: 'done', results: data.results || [], more: step.more });
      onDone();
    } catch (e) {
      setStep({ name: 'error', message: 'The answers could not be written in.' });
    }
  }

  const busy = step.name === 'planning' || step.name === 'applying';
  return (
    <div className="rq-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="rq-modal" role="dialog" aria-modal="true" aria-labelledby="rq-wi-title">
        <div className="rq-modal__head">
          <div>
            <h2 id="rq-wi-title">Add answers to the Notebook</h2>
            <p>
              {step.name === 'done'
                ? 'Done. The assistant answers from these pages now.'
                : 'Each answer goes into the page it belongs on — new facts added, anything it contradicts corrected. Check each page before writing it in.'}
            </p>
          </div>
          {!busy && <button type="button" className="rq-x" aria-label="Close" onClick={onClose}><Svg w={17} sw={2.2}>{Icons.close}</Svg></button>}
        </div>

        <div className="rq-modal__body">
          {step.name === 'planning' && (
            <div role="status">
              <div className="rq-scan" aria-hidden="true" style={{ padding: '10px 0' }}>
                {['88%', '64%', '76%', '52%', '70%'].map((w, i) => <i key={i} style={{ width: w, animationDelay: i * 0.12 + 's' }} />)}
              </div>
              <p className="rq-hint" style={{ display: 'block', margin: '6px 0 0' }}>Finding the page for each answer and writing it in. This can take a minute.</p>
            </div>
          )}
          {step.name === 'error' && <div className="rq-err">{step.message}</div>}
          {(step.name === 'review' || step.name === 'applying') && !pages.length && (
            <div className="rq-empty" style={{ padding: '24px 0' }}>Every answer is already in the Notebook.</div>
          )}
          {(step.name === 'review' || step.name === 'applying') && pages.map((p) => (
            <PageChange key={p.key} page={p} on={!!chosen[p.key]}
              onToggle={() => setChosen((c) => ({ ...c, [p.key]: !c[p.key] }))} />
          ))}
          {step.name === 'done' && step.results.map((r, i) => (
            <div key={i} className="rq-done">
              <Svg w={16} sw={2.4} style={{ flex: 'none', marginTop: 2, color: r.error ? '#a51b0f' : '#007f3b' }}>{r.error ? Icons.close : Icons.check}</Svg>
              <span>
                {r.noteId && !r.error ? <Link href={notebookHref({ id: r.noteId, title: r.title })}>{r.title}</Link> : <strong>{r.title}</strong>}
                {r.error ? ' — ' + r.error : ' — ' + plural(r.written || 0, 'answer', 'answers') + ' written in' + (r.isNew ? ', as a new page in Uncategorised' : '')}
              </span>
            </div>
          ))}
        </div>

        <div className="rq-modal__foot">
          {step.name === 'done' ? (
            <>
              <span className="rq-hint" style={{ display: 'inline' }}>
                {step.more ? 'More answers are waiting — run it again. ' : ''}A save was taken first: Notebook › Saves can put it back.
              </span>
              <span className="rq-grow" />
              <button type="button" className="rq-primary rq-primary--sm" onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <span className="rq-hint" style={{ display: 'inline' }}>
                {step.name === 'review' && pages.length
                  ? plural(answers, 'answer', 'answers') + ' into ' + plural(kept.length, 'page', 'pages') + (step.more ? ' · more wait for the next run' : '')
                  : ''}
              </span>
              <span className="rq-grow" />
              <button type="button" className="rq-ghost" disabled={busy} onClick={onClose}>Cancel</button>
              <button type="button" className="rq-primary rq-primary--sm" disabled={step.name !== 'review' || !kept.length} onClick={apply}>
                {step.name === 'applying' ? 'Writing…' : 'Write into ' + plural(kept.length, 'page', 'pages')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* The template's context points, word for word, as a list. */
function Points({ points, label = false }) {
  if (!Array.isArray(points) || !points.length) return null;
  return (
    <>
      {label && <span className="rq-ctx__label">CONTEXT</span>}
      <ul className="rq-points">{points.map((p, i) => <li key={i}>{p}</li>)}</ul>
    </>
  );
}

/* What a question is about, so it can be answered without going to look:
   the Notebook paragraph with the asked-about words marked, how often the
   assistant was asked it, or the asker's own note. */
function Context({ row }) {
  const ctx = row.context;
  if (row.origin === 'notebook') {
    return (
      <div className="rq-ctx">
        <div className="rq-ctx__head">
          <Svg w={16} sw={2}>{Icons.book}</Svg>
          {row.noteTitle
            ? <span>Asked on the Notebook page <Link href={pageHref(row)}>{row.noteTitle}</Link>{ctx && ctx.section ? ' › ' + ctx.section : ''}</span>
            : <span>Asked on a Notebook page that has since been deleted</span>}
          <span className="rq-ctx__when">{when(row.at)}</span>
        </div>
        {ctx ? (
          <div className="rq-ctx__text">{ctx.before}<mark>{ctx.quote}</mark>{ctx.after}</div>
        ) : row.quote ? (
          <div className="rq-ctx__text"><mark>{row.quote}</mark> <em style={{ fontSize: 13.5 }}>— no longer on the page</em></div>
        ) : null}
        <Points points={row.points} label />
      </div>
    );
  }
  if (row.origin === 'assistant') {
    return (
      <div className="rq-ctx">
        <div className="rq-ctx__head">
          <Svg w={16} sw={2}>{Icons.chat}</Svg>
          <span>Asked of the assistant{row.askedCount > 1 ? ' ' + row.askedCount + ' times' : ''}</span>
          <span className="rq-ctx__when">{when(row.lastAt || row.at)}</span>
        </div>
        <Points points={row.points} label />
      </div>
    );
  }
  return (
    <div className="rq-ctx">
      <div className="rq-ctx__head">
        <Svg w={16} sw={2}>{Icons.question}</Svg>
        <span>Asked by staff{row.machineId ? ' on machine ' + machineCode(row.machineId) : ''}{row.askedCount > 1 ? ' · ' + row.askedCount + ' times' : ''}</span>
        <span className="rq-ctx__when">{when(row.lastAt || row.at)}</span>
      </div>
      <Points points={row.points} label />
      {row.detail && (<><span className="rq-ctx__label">THEIR NOTE</span><div className="rq-ctx__text" style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{row.detail}</div></>)}
      {!row.detail && !(row.points && row.points.length) && <div className="rq-ctx__text" style={{ fontSize: 14.5 }}>No more detail was given.</div>}
    </div>
  );
}

/* The open questions, one at a time: where it came from and what it is
   about, the question large, and Answer or Skip. Saving moves straight on
   to the next. */
function Focus({ rows, onAnswer, onRemove, busy, onShowAll, onAsk }) {
  const [index, setIndex] = useState(0);
  const [answering, setAnswering] = useState(false);
  const [draft, setDraft] = useState('');
  const total = rows.length;
  const at = Math.min(index, Math.max(total - 1, 0));
  const row = rows[at];

  const go = useCallback((to) => {
    if (!total) return;
    setIndex(((to % total) + total) % total);
    setAnswering(false);
    setDraft('');
  }, [total]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(at + 1);
      if (e.key === 'ArrowLeft') go(at - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, at]);

  if (!row) {
    return (
      <div className="rq-clear-state">
        <span className="rq-clear-state__icon"><Svg w={28} sw={2.6}>{Icons.check}</Svg></span>
        <h2>No open questions</h2>
        <p>Everything asked so far has an answer.</p>
        <div className="rq-factions">
          <button type="button" className="rq-ghost rq-skip" onClick={onShowAll}>See all questions</button>
          <button type="button" className="rq-primary rq-big" onClick={onAsk}><Svg w={17} sw={2.4}>{Icons.plus}</Svg>Ask a question</button>
        </div>
      </div>
    );
  }

  const save = () => {
    if (!draft.trim() || busy) return;
    onAnswer(row, draft).then((ok) => { if (ok) { setAnswering(false); setDraft(''); } });
  };

  return (
    <div>
      <div className="rq-progress">
        <span className="rq-progress__text">Question <b>{at + 1}</b> of {total}</span>
        <span className="rq-progress__bar"><i style={{ width: ((at + 1) / total) * 100 + '%' }} /></span>
        <button type="button" className="rq-nav" aria-label="Previous question" disabled={total < 2} onClick={() => go(at - 1)}>
          <Svg w={17} sw={2.4}>{Icons.chevronLeft}</Svg>
        </button>
        <button type="button" className="rq-nav" aria-label="Next question" disabled={total < 2} onClick={() => go(at + 1)}>
          <Svg w={17} sw={2.4}>{Icons.chevronRight}</Svg>
        </button>
      </div>

      <article className="rq-focus" key={row.id}>
        <Context row={row} />
        <div className="rq-fbody">
          <div className={'rq-fbody__label' + (row.title ? ' rq-fbody__label--title' : '')}>{row.title || 'THE QUESTION'}</div>
          <h2>{row.question}</h2>

          {answering && (
            <textarea className="rq-area" rows={4} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              aria-label={'Answer: ' + row.question} placeholder="Write the answer, as you would tell somebody at the desk…" maxLength={4000}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setAnswering(false); setDraft(''); }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
              }} />
          )}

          <div className="rq-factions">
            {answering ? (
              <>
                <button type="button" className="rq-primary rq-big" disabled={busy || !draft.trim()} onClick={save}>
                  <Svg w={16} sw={2.6}>{Icons.check}</Svg>Save answer
                </button>
                <button type="button" className="rq-ghost rq-skip" onClick={() => { setAnswering(false); setDraft(''); }}>Cancel</button>
                <span className="rq-grow" />
                <span className="rq-hint">Ctrl + Enter to save</span>
              </>
            ) : (
              <>
                <button type="button" className="rq-primary rq-big" onClick={() => setAnswering(true)}>
                  <Svg w={16} sw={2.2}>{Icons.edit}</Svg>Answer
                </button>
                {total > 1 && (
                  <button type="button" className="rq-ghost rq-skip" onClick={() => go(at + 1)}>
                    Skip<Svg w={15} sw={2.4}>{Icons.chevronRight}</Svg>
                  </button>
                )}
                <span className="rq-grow" />
                {row.origin === 'notebook' && pageHref(row) && (
                  <Link className="rq-ico" href={pageHref(row)} title="Go to the text" aria-label="Go to the text"><Svg w={17} sw={2.1}>{Icons.external}</Svg></Link>
                )}
                <button type="button" className="rq-ico rq-ico--red" disabled={busy} onClick={() => onRemove(row)} title="Remove this question" aria-label="Remove this question">
                  <Svg w={17} sw={2.1}>{Icons.trash}</Svg>
                </button>
              </>
            )}
          </div>
        </div>
      </article>
      {total > 1 && !answering && <p className="rq-keys"><kbd>←</kbd> <kbd>→</kbd> to move between questions</p>}
    </div>
  );
}

/* Older questions, tidied into the template by the AI: each shown as it is
   now beside the proposed title, word-for-word points and question, ticked
   to keep. Nothing is saved before "Save". A question left unticked is
   left as it is and not offered again. */
function Tidy({ onClose, onDone }) {
  const [step, setStep] = useState({ name: 'planning' }); // planning | review | saving | done | error
  const [chosen, setChosen] = useState({});

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/questions/reformat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'plan' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) { setStep({ name: 'error', message: data.error || 'The questions could not be tidied.' }); return; }
        const items = Array.isArray(data.items) ? data.items : [];
        setChosen(Object.fromEntries(items.map((it) => [it.id, !!it.after])));
        setStep({ name: 'review', items, more: !!data.more });
      } catch (e) {
        if (live) setStep({ name: 'error', message: 'The questions could not be tidied.' });
      }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && step.name !== 'saving' && step.name !== 'planning') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step.name, onClose]);

  const items = step.items || [];
  const kept = items.filter((it) => it.after && chosen[it.id]);

  async function save() {
    const skipIds = items.filter((it) => it.after && !chosen[it.id]).map((it) => it.id);
    setStep((st) => ({ ...st, name: 'saving' }));
    try {
      const res = await fetch('/api/questions/reformat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', items: kept.map((it) => ({ id: it.id, ...it.after })), skipIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStep({ name: 'error', message: data.error || 'The questions could not be saved.' }); return; }
      setStep({ name: 'done', saved: data.saved || 0, more: step.more });
      onDone();
    } catch (e) {
      setStep({ name: 'error', message: 'The questions could not be saved.' });
    }
  }

  const busy = step.name === 'planning' || step.name === 'saving';
  return (
    <div className="rq-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="rq-modal" role="dialog" aria-modal="true" aria-labelledby="rq-tidy-title">
        <div className="rq-modal__head">
          <div>
            <h2 id="rq-tidy-title">Tidy questions into the template</h2>
            <p>
              {step.name === 'done'
                ? 'Done.'
                : 'Each older question gets a short title, its context as word-for-word points, and the question itself. Check each one before saving.'}
            </p>
          </div>
          {!busy && <button type="button" className="rq-x" aria-label="Close" onClick={onClose}><Svg w={17} sw={2.2}>{Icons.close}</Svg></button>}
        </div>

        <div className="rq-modal__body">
          {step.name === 'planning' && (
            <div role="status">
              <div className="rq-scan" aria-hidden="true" style={{ padding: '10px 0' }}>
                {['88%', '64%', '76%', '52%'].map((w, i) => <i key={i} style={{ width: w, animationDelay: i * 0.12 + 's' }} />)}
              </div>
              <p className="rq-hint" style={{ display: 'block', margin: '6px 0 0' }}>Reading the questions…</p>
            </div>
          )}
          {step.name === 'error' && <div className="rq-err">{step.message}</div>}
          {(step.name === 'review' || step.name === 'saving') && !items.length && (
            <div className="rq-empty" style={{ padding: '24px 0' }}>Every question is already in the template.</div>
          )}
          {(step.name === 'review' || step.name === 'saving') && items.map((it) => (
            <div key={it.id} className="rq-wp">
              <label className="rq-wp__head">
                <input type="checkbox" checked={!!(it.after && chosen[it.id])} disabled={!it.after || step.name === 'saving'}
                  onChange={() => setChosen((c) => ({ ...c, [it.id]: !c[it.id] }))} aria-label={'Tidy: ' + it.before.question} />
                <span className="rq-wp__title">{it.after ? (it.after.title || it.after.question) : it.before.question}</span>
              </label>
              <div className="rq-tidy">
                <div className="rq-tidy__side">
                  <b>NOW</b>
                  <div className="rq-tidy__q">{it.before.question}</div>
                  {it.before.detail && <div className="rq-tidy__note">{it.before.detail}</div>}
                </div>
                <div className="rq-tidy__side rq-tidy__side--after">
                  <b>TIDIED</b>
                  {it.after ? (
                    <>
                      {it.after.title && <div className="rq-card__title">{it.after.title}</div>}
                      <Points points={it.after.points} />
                      <div className="rq-tidy__q" style={{ marginTop: 6 }}>{it.after.question}</div>
                    </>
                  ) : <div className="rq-tidy__note">The AI did not return this one — it will be offered again next time.</div>}
                </div>
              </div>
            </div>
          ))}
          {step.name === 'done' && (
            <div className="rq-done">
              <Svg w={16} sw={2.4} style={{ flex: 'none', marginTop: 2, color: '#007f3b' }}>{Icons.check}</Svg>
              <span>{plural(step.saved, 'question', 'questions')} tidied into the template.{step.more ? ' More are waiting — run it again.' : ''}</span>
            </div>
          )}
        </div>

        <div className="rq-modal__foot">
          {step.name === 'done' ? (
            <>
              <span className="rq-grow" />
              <button type="button" className="rq-primary rq-primary--sm" onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <span className="rq-hint" style={{ display: 'inline' }}>
                {step.name === 'review' && items.length ? plural(kept.length, 'question', 'questions') + ' to save' + (step.more ? ' · more wait for the next run' : '') : ''}
              </span>
              <span className="rq-grow" />
              <button type="button" className="rq-ghost" disabled={busy} onClick={onClose}>Cancel</button>
              <button type="button" className="rq-primary rq-primary--sm" disabled={step.name !== 'review' || !items.length} onClick={save}>
                {step.name === 'saving' ? 'Saving…' : 'Save ' + plural(kept.length, 'question', 'questions')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [status, setStatus] = useState('open');
  const [source, setSource] = useState('');
  const [view, setView] = useState('one'); // one | all
  const [composing, setComposing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [tidying, setTidying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    // The whole list, filtered in the browser: tens of rows, and a filter
    // that redraws instantly is worth more than a query per tab.
    fetch('/api/questions/open?limit=200')
      .then((r) => r.json())
      .then((d) => setState({ loading: false, rows: d.rows || [], error: d.error || '' }))
      .catch((e) => setState({ loading: false, rows: [], error: String(e) }));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const sourceLabel = (SOURCES.find((x) => x.id === source) || SOURCES[0]).label;
  const fromSource = useMemo(() => state.rows.filter((r) => !source || r.origin === source), [state.rows, source]);
  const counts = useMemo(() => Object.fromEntries(STATUS.map((f) => [f.id, fromSource.filter(f.match).length])), [fromSource]);
  const rows = useMemo(() => fromSource.filter((STATUS.find((f) => f.id === status) || STATUS[0]).match), [fromSource, status]);

  // Not in the template yet: what "Tidy with AI" would offer.
  const untidy = useMemo(() => state.rows.filter((r) => !r.formattedAt).length, [state.rows]);
  const openAll = useMemo(() => state.rows.filter((r) => r.status === 'open').length, [state.rows]);
  const answeredAll = state.rows.length - openAll;

  // Answered, with an answer, and not yet in the Notebook: what "Add to
  // Notebook" would write in.
  const unwritten = useMemo(() => state.rows.filter((r) => r.status === 'answered' && !r.writtenAt && String(r.answer || '').trim()).length, [state.rows]);

  async function clearAnswered() {
    const answeredHere = fromSource.filter((r) => r.status === 'answered');
    const notIn = answeredHere.filter((r) => !r.writtenAt).length;
    const what = plural(answeredHere.length, 'answered question', 'answered questions') + (source ? ' (' + sourceLabel.toLowerCase() + ')' : '');
    if (!window.confirm('Clear ' + what + ' off the list? Their answers go with them.'
      + (notIn ? '\n\n' + notIn + ' of them ' + (notIn === 1 ? 'is' : 'are') + ' not in the Notebook yet — "Add to Notebook" first keeps those answers.' : ''))) return;
    setBusy(true);
    try {
      const { ok, data } = await send('DELETE', null, '?status=answered' + (source ? '&origin=' + encodeURIComponent(source) : ''));
      if (!ok) { setNotice(data.error || 'The answered questions could not be cleared.'); return; }
      setNotice('Cleared ' + plural(data.removed || 0, 'answered question', 'answered questions') + '.');
      load();
    } catch (err) {
      setNotice('The answered questions could not be cleared.');
    } finally {
      setBusy(false);
    }
  }

  // Export: the questions shown, as a numbered list ready for an email or an agenda.
  async function copyList() {
    const text = rows.map((r, i) => (i + 1) + '. ' + (r.title ? r.title + ' — ' : '') + String(r.question || '').replace(/\s+/g, ' ').trim()).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // No clipboard API (an http page, an older browser): the old way.
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      if (!ok) { setNotice('Could not copy — the browser blocked it.'); return; }
    }
    setCopied(true);
    setNotice('Copied ' + plural(rows.length, 'question', 'questions') + ' as a numbered list.');
    setTimeout(() => setCopied(false), 2000);
  }

  async function answer(row, text) {
    setBusy(true);
    try {
      const { ok, data } = await send('PATCH', { id: row.id, answer: text });
      if (!ok) { setNotice(data.error || 'The answer could not be saved.'); return false; }
      setNotice(text ? 'Answer saved.' : 'Reopened.');
      load();
      return true;
    } catch (err) {
      setNotice('The answer could not be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!window.confirm('Remove this question? Answering is what closes a question — this deletes it.')) return;
    setBusy(true);
    try {
      const { ok, data } = await send('DELETE', null, '?id=' + row.id);
      if (!ok) { setNotice(data.error || 'The question could not be removed.'); return; }
      load();
    } catch (err) {
      setNotice('The question could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  const closeComposer = useCallback(() => setComposing(false), []);
  const closeWriting = useCallback(() => setWriting(false), []);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f5', display: 'flex', flexDirection: 'column' }}>
      <style data-rq="1" dangerouslySetInnerHTML={{ __html: CSS }} />
      <AppHeader subtitle="Questions" />

      <main className="rq">
        <header className="rq-hero">
          <div className="rq-hero__top">
            <div className="rq-hero__text">
              <h1>Questions</h1>
              <p>
                {state.loading ? 'Loading…' : (
                  <><b>{openAll} open</b> · {answeredAll} answered</>
                )}
              </p>
            </div>
            <div className="rq-hero__actions">
              {untidy > 0 && (
                <button type="button" className="rq-soft" onClick={() => setTidying(true)}
                  title="Give older questions a title and their context as word-for-word points — you check each one first">
                  <Svg w={16} sw={1.9}>{AI_ICON}</Svg><span>Tidy with AI</span><b>{untidy}</b>
                </button>
              )}
              {unwritten > 0 && (
                <button type="button" className="rq-soft" onClick={() => setWriting(true)}
                  title="Write the answered questions into the Notebook pages they belong on — you check every change first">
                  <Svg w={16} sw={1.9}>{AI_ICON}</Svg><span>Add to Notebook</span><b>{unwritten}</b>
                </button>
              )}
              <button type="button" className="rq-primary" onClick={() => setComposing(true)} disabled={composing}>
                <Svg w={17} sw={2.4}>{Icons.plus}</Svg><span>Ask a question</span>
              </button>
            </div>
          </div>
          <div className="rq-hero__bar">
            <div className="rq-pills" role="tablist" aria-label="How to show the questions">
              <button type="button" role="tab" aria-selected={view === 'one'} className={'rq-pill' + (view === 'one' ? ' rq-pill--on' : '')}
                onClick={() => setView('one')}>One at a time<span>{counts.open || 0}</span></button>
              <button type="button" role="tab" aria-selected={view === 'all'} className={'rq-pill' + (view === 'all' ? ' rq-pill--on' : '')}
                onClick={() => setView('all')}>All questions</button>
            </div>
            <div className="rq-seg" role="group" aria-label="Where the questions came from">
              {SOURCES.map((x) => (
                <button key={x.id} type="button" aria-pressed={source === x.id} className={source === x.id ? 'rq-seg--on' : ''}
                  onClick={() => setSource(x.id)} title={x.label}>{x.short}</button>
              ))}
            </div>
          </div>
        </header>

        {composing && (
          <Composer onClose={closeComposer}
            onAdded={(msg, keepOpen) => {
              setNotice(msg);
              setStatus('open');
              if (!keepOpen) setComposing(false);
              load();
            }} />
        )}

        {notice && view === 'one' && <p className="rq-notice" role="status" style={{ margin: '0 0 12px' }}>{notice}</p>}

        {view === 'one' && !state.loading && !state.error && (
          <Focus rows={fromSource.filter((r) => r.status === 'open')} onAnswer={answer} onRemove={remove} busy={busy}
            onShowAll={() => { setView('all'); setStatus('all'); }} onAsk={() => setComposing(true)} />
        )}

        {view === 'all' && (<>
        <div className="rq-bar">
          <div className="rq-tabs" role="tablist" aria-label="Which questions">
            {STATUS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={status === f.id}
                className={'rq-tab' + (status === f.id ? ' rq-tab--on' : '')} onClick={() => setStatus(f.id)}>
                {f.label}<span>{counts[f.id] || 0}</span>
              </button>
            ))}
          </div>
          <button type="button" className={'rq-icon' + (copied ? ' rq-icon--done' : '')} disabled={!rows.length} onClick={copyList}
            style={{ marginLeft: 'auto', width: 34, height: 34 }}
            aria-label="Copy these questions as a list" title="Copy these questions as a numbered list">
            <Svg w={16} sw={2}>{copied ? Icons.check : Icons.copy}</Svg>
          </button>
        </div>

        {status !== 'open' && counts.answered > 0 && (
          <div className="rq-sub">
            <span>
              {plural(counts.answered, 'answered', 'answered')}
              {(() => {
                const notIn = fromSource.filter((r) => r.status === 'answered' && !r.writtenAt).length;
                return notIn ? ' · ' + notIn + ' not in the Notebook yet' : ' · all in the Notebook';
              })()}
            </span>
            <span className="rq-grow" />
            <button type="button" className="rq-link rq-link--red" disabled={busy} onClick={clearAnswered}>Clear answered</button>
          </div>
        )}

        {notice && <p className="rq-notice" role="status">{notice}</p>}
        </>)}

        {state.loading && <div className="rq-empty">Loading…</div>}
        {state.error && <div className="rq-empty" style={{ color: '#a51b0f' }}>{state.error}</div>}
        {view === 'all' && !state.loading && !state.error && !rows.length && (
          <div className="rq-empty">
            {status === 'open'
              ? (source ? 'Nothing open from ' + sourceLabel.toLowerCase() + '.' : 'Nothing open. Everything asked so far has an answer.')
              : 'Nothing here yet.'}
          </div>
        )}

        <ul className="rq-list">
          {view === 'all' && rows.map((row) => (
            <Row key={row.id + ':' + row.status + ':' + (row.answer || '').length} row={row} onAnswer={answer} onRemove={remove} busy={busy} />
          ))}
        </ul>
      </main>

      {writing && <WriteIn onClose={closeWriting} onDone={load} />}
      {tidying && <Tidy onClose={() => setTidying(false)} onDone={load} />}
    </div>
  );
}
