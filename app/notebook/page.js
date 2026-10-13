'use client';

import React from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { flushSync } from 'react-dom';
import { MotionConfig, motion } from 'motion/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import TipTapImage from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Mark, mergeAttributes } from '@tiptap/core';
import { Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import MapView from '../_components/notebook/MapView';
import CardEditor from '../_components/notebook/CardEditor';
import { QuestionLayer, QuestionMark, QuestionsChip, pageQuestions } from '../_components/notebook/Questions';
import {
  NotebookStyles, T, NBIcons, Banner, Button, IconButton, SearchField, Chip, StatusPill,
  State, SkeletonRows, Modal, ConfirmModal, ProgressModal, Menu, MenuItem, MenuSeparator,
  MenuSub, MenuChoice, Spinner, Toast,
} from '../_components/notebook/kit';
import { lineDiff } from '@/lib/notebook/diff.mjs';
import { hasQuestionAnchor, questionAnchorsIn, stripQuestionMarks } from '@/lib/notebook/questions.mjs';
import {
  CREATABLE_KINDS, emptyFields, isTypedKind, noteIssues, noteKind, normaliseFields, suggestKind,
} from '@/lib/notebook/kinds.mjs';
import { notebookHref, noteSegment, resolveNote } from '@/lib/notebook/links.mjs';
import { phaseLabel, readProgress } from '@/lib/notebook/progress.mjs';
import { TITLE_MAX, checkTitle, fallbackTitle, shownTitle } from '@/lib/notebook/title-check.mjs';

/* ------------------------------------------------------------------ *
 * Practice notes - the notes the assistant reads to answer.
 *
 * The screen is two white cards on the light, in the page language
 * Referrals set (globals.css, "The page language, shared"): at the left
 * the sections and pages, under the heading with its one blue word; at
 * the right the page itself - a slim bar of where it is and whether it
 * is saved, one strip of formatting, and the page's own title set large
 * at the head of what it says. The page draws no background of its own:
 * it sits on the light behind every page (PageBackground). On a phone it
 * is one card at a time - the list, then the page, with a pill back.
 * Everything that interrupts - a deletion, a reformat to review, a backup
 * being restored - arrives as the app's one dialog, from the kit next
 * door (kit.jsx), so a dialogue here always looks like the last one.
 *
 * NOTHING IS LEFT TO GUESS. Loading, nothing written, nothing found and
 * could-not-load each have their own state in the card, rather than one
 * "Nothing written yet" whatever happened. The autosave says what it is
 * doing (Saving... / Saved / Couldn't save, Retry). A title cannot be
 * saved empty, is told when it repeats a neighbour's, and stops at the
 * 200 characters the server keeps. A deletion says what goes with it and
 * that the assistant stops answering from it. Leaving with an edit not
 * yet sent sends it first.
 *
 * THE TREE IS A TREE to a keyboard and a screen reader as well: one tab
 * stop, the arrows to move, open and close, Enter to open a page, F2 to
 * rename, Delete to delete, the context-menu key for the rest.
 *
 * What is stored and how has not moved: notes and their tree live in
 * Postgres (/api/notebook), files in Vercel Blob
 * (/api/notebook/attachments), bodies are markdown plus the small HTML
 * subset TipTap round-trips, and saving is still the quiet-period
 * autosave below. This file is the presentation of all that.
 * ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1];

// Layout and the handful of page-only shapes. Everything reusable - buttons,
// modals, menus, rows, the writing surface - is in kit.jsx.
const PAGE_CSS = `
/* The page is the screen under the bar and never scrolls: each card takes
   what is left, and scrolls inside itself past that. */
.nbk-shell{position:relative;height:100%;overflow:hidden;display:flex;flex-direction:column;}
.nbk-body{position:relative;flex:1;min-height:0;display:flex;gap:16px;width:100%;padding:8px 28px 24px;}

/* ---- the sections and pages: a white card ---- */
.nbk-sidebar{flex:none;width:300px;min-height:0;display:flex;flex-direction:column;overflow:hidden;
  background:#fff;border-radius:22px;box-shadow:var(--rv-sh-card);}
/* Folded away on a wide screen, it narrows to nothing and the page card
   widens into the room; then it is hidden, so Tab does not walk into it. */
.nbk-body.is-ready .nbk-sidebar{transition:width .45s var(--rv-ease),margin-right .45s var(--rv-ease),visibility 0s linear 0s;}
.nbk-body.is-collapsed .nbk-sidebar{width:0;margin-right:-16px;visibility:hidden;}
.nbk-body.is-ready.is-collapsed .nbk-sidebar{transition:width .45s var(--rv-ease),margin-right .45s var(--rv-ease),visibility 0s linear .45s;}
.nbk-sidebar__inner{flex:1;min-height:0;width:300px;display:flex;flex-direction:column;}
.nbk-sidebar__top{flex:none;display:flex;flex-direction:column;gap:14px;padding:22px 16px 10px 18px;}
.nbk-h1{margin:0;font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1.1;color:var(--rv-ink);user-select:none;}
.nbk-h1 em{font-style:normal;color:var(--rv-accent);}
.nbk-meta{display:flex;align-items:center;min-height:18px;margin:6px 0 0;font-size:13px;font-weight:550;color:var(--rv-ink-2);font-variant-numeric:tabular-nums;}
.nbk-sidebar__row{display:flex;align-items:center;gap:8px;}
.nbk-sidebar__row .nbk-field{flex:1;min-width:0;}
.nbk-tree{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:2px 10px 14px;}
.nbk-tree__inner{position:relative;display:flex;flex-direction:column;gap:1px;}
.nbk-tree__label{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 6px;}
.nbk-tree__note{margin:0;padding:10px;font-size:13.5px;line-height:1.55;color:var(--rv-ink-2);}
.nbk-state--compact{padding:22px 8px 18px;}
.nbk-state--compact .rv-state__title{font-size:15px;}
.nbk-state--compact .rv-state__text{font-size:13.5px;}
.nbk-sidebar__foot{flex:none;display:flex;flex-direction:column;gap:10px;padding:12px 16px 16px 18px;border-top:1px solid var(--rv-divider);}
.nbk-foot-note{display:flex;align-items:flex-start;gap:7px;margin:0;font-size:13px;line-height:1.45;color:var(--rv-ink-2);}
.nbk-foot-note svg{flex:none;margin-top:2px;color:var(--rv-ink-3);}
.nbk-foot-row{display:flex;gap:6px;}
.nbk-foot-row .rv-btn{flex:1 1 0;min-width:0;padding:0 8px;}

/* ---- the page: a white card ---- */
.nbk-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;
  background:#fff;border-radius:22px;box-shadow:var(--rv-sh-card);}
.nbk-head{flex:none;display:flex;align-items:center;gap:10px;min-height:60px;padding:10px 12px 6px 12px;}
.nbk-head__left{flex:1;min-width:0;display:flex;align-items:center;gap:4px;}
.nbk-head__crumbs{min-width:0;display:flex;align-items:center;gap:0;overflow:hidden;white-space:nowrap;}
.nbk-crumb{flex:none;max-width:220px;overflow:hidden;text-overflow:ellipsis;border:none;background:none;padding:6px 9px;font:inherit;font-size:13.5px;font-weight:550;
  color:var(--rv-ink-2);cursor:pointer;border-radius:999px;transition:background-color .14s ease,color .14s ease;}
.nbk-crumb:hover{color:var(--rv-accent);background:var(--rv-hl);}
.nbk-crumb:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.nbk-crumb--here,.nbk-crumb--here:hover{color:var(--rv-ink);background:none;cursor:default;flex:0 1 auto;}
.nbk-crumb-sep{flex:none;display:flex;color:var(--rv-icon-mute);}
.nbk-head__actions{flex:none;display:flex;align-items:center;gap:2px;}
.nbk-head__actions .nbk-status{margin-right:10px;}
.nbk-head__actions .rv-btn{margin-right:6px;}
/* A phone: the page covers the list, so the way back to it is said. */
.nbk-back{display:none;align-items:center;gap:6px;height:36px;margin-left:-2px;padding:0 12px 0 8px;border:none;border-radius:999px;background:none;
  font:inherit;font-size:14.5px;font-weight:600;color:var(--rv-accent);cursor:pointer;transition:background-color .15s ease;}
.nbk-back:hover{background:var(--rv-hl);}
.nbk-back:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}

.nbk-tools{flex:none;position:relative;z-index:2;display:flex;padding:0 0 8px;}
.nbk-editor-wrap{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;}
.nbk-editor{flex:1;min-height:0;overflow-y:auto;cursor:text;display:flex;flex-direction:column;animation:nbk-page-in .32s var(--rv-ease) both;}
@keyframes nbk-page-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
.nbk-qopt{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:14px;background:var(--rv-hl);
  font-size:14.5px;line-height:1.5;color:var(--rv-ink);cursor:pointer;text-align:left;}
.nbk-qopt input{flex:none;width:18px;height:18px;margin:2px 0 0;accent-color:var(--rv-accent);cursor:pointer;}
.nbk-qopt small{display:block;margin-top:4px;font-size:13px;color:var(--rv-ink-2);}

/* The page's own heading, inside the card: what it is and where it sits,
   then its name set large - the title is the page's, not the bar's, and
   it scrolls with the text it names. */
.nbk-doc-head{width:100%;max-width:800px;margin:0 auto;padding:26px 40px 16px;cursor:auto;}
.nbk-kicker{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;margin-bottom:10px;font-size:13px;font-weight:550;color:var(--rv-ink-2);}
.nbk-kicker__dot{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.6;}
.nbk-doc-title{display:block;width:calc(100% + 16px);margin:0 0 0 -8px;padding:2px 8px 4px;border:none;outline:none;background:none;border-radius:12px;
  resize:none;overflow:hidden;field-sizing:content;min-height:0;
  font:inherit;font-size:36px;font-weight:800;letter-spacing:-.03em;line-height:1.16;color:var(--rv-ink);
  transition:background-color .15s ease,box-shadow .15s ease;}
.nbk-doc-title::placeholder{color:var(--rv-ink-4);}
.nbk-doc-title:hover{background:var(--rv-hl);}
.nbk-doc-title:focus,.nbk-doc-title:focus-visible{background:transparent !important;outline:none !important;border:none !important;box-shadow:inset 0 -2px 0 var(--rv-accent) !important;}
.nbk-doc-title[aria-invalid="true"],.nbk-doc-title[aria-invalid="true"]:focus{box-shadow:inset 0 -2px 0 var(--rv-danger) !important;}
.nbk-title-foot{display:flex;align-items:flex-start;gap:12px;margin-top:8px;}
.nbk-title-msg{flex:1;min-width:0;display:flex;align-items:flex-start;gap:7px;margin:0;font-size:13.5px;font-weight:550;line-height:1.45;}
.nbk-title-msg svg{flex:none;margin-top:1px;}
.nbk-title-msg.is-bad{color:var(--rv-danger-ink);}
.nbk-title-msg.is-warn{color:var(--rv-warn-ink);}
.nbk-title-msg.is-hint{color:var(--rv-ink-2);}
.nbk-title-count{flex:none;margin-left:auto;font-size:12.5px;font-weight:600;color:var(--rv-ink-2);font-variant-numeric:tabular-nums;}
.nbk-title-count.is-max{color:var(--rv-danger-ink);}
.nbk-section__lede{margin:12px 0 0;max-width:62ch;font-size:14.5px;line-height:1.55;color:var(--rv-ink-2);}

/* ---- the files on a page, under it ---- */
.nbk-dock{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px 12px;border-top:1px solid var(--rv-divider);}
.nbk-dock__label{margin-right:2px;}
.nbk-attach{display:inline-flex;align-items:center;gap:7px;max-width:300px;height:34px;padding:0 3px 0 12px;background:#fff;border-radius:999px;
  box-shadow:inset 0 0 0 1px var(--rv-line);color:var(--rv-ink-3);animation:nbk-in .3s var(--rv-ease) both;}
.nbk-attach a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:600;color:var(--rv-ink);text-decoration:none;}
.nbk-attach a:hover{color:var(--rv-accent);text-decoration:underline;text-underline-offset:2px;}
.nbk-attach a:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;border-radius:4px;}
.nbk-dock__busy{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:550;color:var(--rv-ink-2);}
.nbk-dock__err{flex-basis:100%;display:flex;align-items:flex-start;gap:8px;}
.nbk-dock__err .rv-alert{flex:1;display:flex;align-items:flex-start;gap:8px;}

.nbk-dropzone{position:absolute;inset:10px;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:12px;border:2px dashed var(--rv-accent);border-radius:18px;background:rgba(232,241,248,.92);
  font-size:16px;font-weight:650;color:var(--rv-accent-hi);pointer-events:none;animation:nbk-fade .15s ease;}

/* ---- a section: its pages as rows, as Referrals lists ---- */
.nbk-section{flex:1;min-height:0;overflow-y:auto;padding:0 0 40px;animation:nbk-page-in .32s var(--rv-ease) both;}
.nbk-pages{width:100%;max-width:800px;margin:4px auto 0;padding:0 26px;}
.nbk-pages__list{position:relative;}
.nbk-glide{position:absolute;left:0;top:0;width:0;height:0;border-radius:14px;background:var(--rv-hl);pointer-events:none;opacity:0;
  transition:transform .32s var(--rv-ease),height .32s var(--rv-ease),width .32s var(--rv-ease),opacity .15s ease;}
.nbk-glide.is-on{opacity:1;}
.nbk-prow{position:relative;display:flex;align-items:center;gap:14px;width:100%;min-height:62px;padding:11px 14px;border:none;background:none;
  font:inherit;text-align:left;color:inherit;cursor:pointer;border-radius:14px;}
.nbk-prow + .nbk-prow::before{content:"";position:absolute;left:14px;right:14px;top:0;height:1px;background:var(--rv-divider);}
.nbk-prow:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.nbk-prow__icon{flex:none;display:flex;color:var(--rv-ink-3);}
.nbk-prow__text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.nbk-prow__name{font-size:16px;font-weight:550;line-height:1.35;color:var(--rv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nbk-prow__sub{font-size:13.5px;line-height:1.45;color:var(--rv-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nbk-prow__chev{flex:none;display:flex;color:var(--rv-icon-mute);transition:transform .2s var(--rv-ease),color .15s ease;}
.nbk-prow:hover .nbk-prow__chev,.nbk-prow:focus-visible .nbk-prow__chev{transform:translateX(2px);color:var(--rv-ink-2);}
.nbk-prow--add{min-height:54px;color:var(--rv-accent);font-size:15px;font-weight:600;}
.nbk-prow--add .nbk-prow__icon{color:var(--rv-accent);}

/* ---- nothing open: a state, then the pages edited last ---- */
.nbk-void{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:clamp(24px,9vh,90px) 20px 32px;}
.nbk-void .nbk-pages{max-width:560px;padding:0;margin-top:4px;}
.nbk-void__cap{width:100%;max-width:560px;padding:0 14px 6px;}
.nbk-docskel{width:100%;max-width:800px;margin:0 auto;padding:30px 40px;}

/* The typed card. The screen itself is drawn by the same components the chat
   uses (app/_components/templates), which carry their own styling - there is
   deliberately no second set of card styles here to drift from them. What is
   left is the space the screen sits in and the heading over the page's own
   writing underneath it. */
.nbk-card-banner,.nbk-card-wrap,.nbk-card__prose{width:100%;max-width:800px;margin:0 auto;padding:0 40px;cursor:auto;}
.nbk-card-banner{padding-bottom:14px;}
.nbk-card-wrap{padding-top:4px;}
.nbk-card__prose{margin-top:24px;margin-bottom:10px;}
.nbk-card__prose > span{display:block;padding-top:12px;border-top:1px solid var(--rv-divider);font-size:13px;font-weight:600;color:var(--rv-ink-2);}

.nbk-plan__note{padding:12px 0 6px;border-top:1px solid var(--rv-divider);text-align:left;}
.nbk-map-lede{font-size:13px;color:var(--rv-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nbk-plan__part{display:flex;gap:10px;align-items:flex-start;margin:9px 0 9px 23px;}

/* ---- the new-section dialog ---- */
.nbk-form{display:flex;flex-direction:column;gap:16px;padding:4px 0 2px;text-align:left;}
.nbk-form .rv-err,.nbk-form .rv-hint{margin-top:7px;}
.nbk-form .rv-hint.is-warn{color:var(--rv-warn-ink);font-weight:550;}

@media (max-width:1000px){
  .nbk-body{padding:4px 16px 16px;}
  .nbk-sidebar,.nbk-sidebar__inner{width:264px;}
  /* "Saved" is enough in the bar here: when is in its tooltip, and the room
     goes to the crumb, which a tablet otherwise squeezes to "How t...". */
  .nbk-status__when{display:none;}
  .nbk-doc-head,.nbk-card-banner,.nbk-card-wrap,.nbk-card__prose,.nbk-docskel{padding-left:28px;padding-right:28px;}
  .nbk-pages{padding-left:14px;padding-right:14px;}
  .nbk-prose{padding-left:28px;padding-right:28px;}
}
/* A phone: one card at a time - the list, then the page over it, with a
   pill back to the list. Targets are a thumb's size. */
@media (max-width:700px){
  /* 16px in from the screen's edges, as Referrals, Contacts and Settings
     are, so the card does not change width from one tool to the next. */
  .nbk-body{padding:4px 16px 16px;gap:0;}
  .nbk-sidebar,.nbk-body.is-collapsed .nbk-sidebar{flex:1;width:auto;margin-right:0;visibility:visible;}
  .nbk-sidebar__inner{width:auto;}
  .nbk-body.is-list .nbk-main{display:none;}
  .nbk-body:not(.is-list) .nbk-sidebar{display:none;}
  .nbk-sidebar,.nbk-main{animation:nbk-pane-in .4s var(--rv-ease) both;}
  .nbk-sidebar__top{padding:18px 14px 10px 16px;}
  .nbk-h1{font-size:30px;}
  .nbk-field,.nbk-sidebar__row .rv-btn{height:44px;}
  .nbk-field input{font-size:16px;}
  .nbk-tree{padding:2px 8px 12px;}
  .nbk-row,.nbk-row__btn{min-height:44px;}
  .nbk-row__actions{position:static;transform:none;opacity:1;pointer-events:auto;padding-left:0;background:none !important;}
  .nbk-foot-row .rv-btn{height:44px;}
  .nbk-side-toggle,.nbk-head__crumbs{display:none !important;}
  .nbk-back{display:inline-flex;height:44px;}
  .nbk-head{min-height:56px;padding:6px 6px 4px 8px;}
  .nbk-head .rv-ibtn{width:40px;height:40px;}
  .nbk-head .rv-ibtn::after,.nbk-row__actions .rv-ibtn::after,.nbk-attach .rv-ibtn::after{content:"";position:absolute;inset:-4px;}
  .nbk-head__actions .nbk-status{margin-right:4px;}
  .nbk-doc-head{padding:14px 18px 8px;}
  .nbk-doc-title{font-size:28px;}
  .nbk-card-banner,.nbk-card-wrap,.nbk-card__prose,.nbk-docskel{padding-left:16px;padding-right:16px;}
  .nbk-pages{padding:0 6px;}
  .nbk-prow{min-height:60px;padding:10px 12px;}
  .nbk-prose{padding-left:18px;padding-right:18px;}
  .nbk-dock{padding:8px 12px 10px;}
}
@keyframes nbk-pane-in{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){
  .nbk-editor,.nbk-section,.nbk-attach,.nbk-sidebar,.nbk-main{animation:none !important;}
  .nbk-body.is-ready .nbk-sidebar,.nbk-glide,.nbk-prow__chev{transition:none !important;}
}
`;

const MAX_DEPTH = 4; // sections + 3 levels of pages keeps the tree sane
const QUIET_MS = 1800; // the autosave waits for this long a pause in the typing
const MAX_UPLOAD = 20 * 1024 * 1024; // the attachments route's limit, said before the upload rather than after
const SAVES_HREF = '/notebook/saves';
const LIST = 'list'; // the last address was the phone's list (/notebook), not a page

const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 700px)').matches;

// A line of what a page says, for its row: the markdown and HTML taken out.
function excerpt(body, max = 140) {
  const text = String(body || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*>`|_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + '...' : text;
}

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

// Whether a typed card has anything in it that changing its kind would lose:
// a value other than the one an empty card of that kind starts with.
function hasValues(kind, fields) {
  const empty = emptyFields(kind);
  const f = fields && typeof fields === 'object' ? fields : {};
  return Object.keys(empty).some((key) => {
    const v = f[key];
    if (Array.isArray(v)) return v.some((x) => String(x == null ? '' : x).trim());
    return typeof v === 'string' && v.trim() !== '' && v.trim() !== String(empty[key] || '').trim();
  });
}

/**
 * One soft shape behind a list's rows that glides to the row under the
 * pointer, or the one the keys are on - Referrals' highlight. It is moved by
 * hand rather than by state: the page redraws on every keystroke in the
 * editor, and a highlight in state would redraw it on every mouse move too.
 */
function useGlide(boxRef, hlRef, selector, key = null) {
  React.useEffect(() => {
    const box = boxRef.current;
    const hl = hlRef.current;
    if (!box || !hl) return undefined;
    let current = null;
    const place = (row, jump) => {
      current = row;
      if (!row || !box.contains(row)) { hl.classList.remove('is-on'); current = null; return; }
      const b = box.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const first = !hl.classList.contains('is-on');
      if (first || jump) hl.style.transition = 'none';
      hl.style.transform = 'translate(' + (r.left - b.left) + 'px,' + (r.top - b.top) + 'px)';
      hl.style.width = r.width + 'px';
      hl.style.height = r.height + 'px';
      if (first || jump) { void hl.offsetWidth; hl.style.transition = ''; }
      hl.classList.add('is-on');
    };
    const rowOf = (el) => (el && el.closest ? el.closest(selector) : null);
    // Whether focus is moving by the keys (follow it) or by a click (the
    // pointer is already saying where it is).
    let byKeys = false;
    const onKeyDown = () => { byKeys = true; };
    const onDown = () => { byKeys = false; };
    const onMove = (e) => { const row = rowOf(e.target); if (row && row !== current) place(row); };
    const onLeave = () => {
      const f = document.activeElement;
      place(byKeys && box.contains(f) ? rowOf(f) || rowOf(f.firstElementChild) : null);
    };
    const onFocus = (e) => {
      if (!byKeys) return;
      place(rowOf(e.target) || rowOf(e.target.firstElementChild));
    };
    const onBlur = (e) => { if (!box.contains(e.relatedTarget) && !box.matches(':hover')) place(null); };
    // The list changing under it (a folder opening above) moves the row; follow.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (current) place(current, true); }) : null;
    if (ro) ro.observe(box);
    box.addEventListener('keydown', onKeyDown, true);
    box.addEventListener('pointerdown', onDown, true);
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerleave', onLeave);
    box.addEventListener('focusin', onFocus);
    box.addEventListener('focusout', onBlur);
    return () => {
      if (ro) ro.disconnect();
      box.removeEventListener('keydown', onKeyDown, true);
      box.removeEventListener('pointerdown', onDown, true);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerleave', onLeave);
      box.removeEventListener('focusin', onFocus);
      box.removeEventListener('focusout', onBlur);
    };
  }, [boxRef, hlRef, selector, key]);
}

// Formatting-toolbar glyphs (the same 24x24 stroke style as the shared set,
// geometry from Lucide). Local to the notebook: no other page needs them.
const TIcons = {
  h1: (<><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="m17 12 3-2v8" /></>),
  h2: (<><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" /></>),
  h3: (<><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2 2 2 0 0 1 2 2c0 1.5-1.8 2.5-3.5 1.5" /></>),
  bold: (<><path d="M14 12a4 4 0 0 0 0-8H6v8" /><path d="M15 20a4 4 0 0 0 0-8H6v8Z" /></>),
  italic: (<><line x1="19" x2="10" y1="4" y2="4" /><line x1="14" x2="5" y1="20" y2="20" /><line x1="15" x2="9" y1="4" y2="20" /></>),
  strike: (<><path d="M16 4H9a3 3 0 0 0-2.83 4" /><path d="M14 12a4 4 0 0 1 0 8H6" /><line x1="4" x2="20" y1="12" y2="12" /></>),
  code: (<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>),
  list: (<><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></>),
  listOrdered: (<><line x1="10" x2="21" y1="6" y2="6" /><line x1="10" x2="21" y1="12" y2="12" /><line x1="10" x2="21" y1="18" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>),
  listChecks: (<><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></>),
  indent: (<><polyline points="3 8 7 12 3 16" /><line x1="21" x2="11" y1="12" y2="12" /><line x1="21" x2="11" y1="6" y2="6" /><line x1="21" x2="11" y1="18" y2="18" /></>),
  outdent: (<><polyline points="7 8 3 12 7 16" /><line x1="21" x2="11" y1="12" y2="12" /><line x1="21" x2="11" y1="6" y2="6" /><line x1="21" x2="11" y1="18" y2="18" /></>),
  quote: (<><path d="M17 6H3" /><path d="M21 12H8" /><path d="M21 18H8" /><path d="M3 12v6" /></>),
  divider: (<><line x1="5" x2="19" y1="12" y2="12" /><circle cx="12" cy="6" r="0.5" /><circle cx="12" cy="18" r="0.5" /></>),
  underline: (<><path d="M6 4v6a6 6 0 0 0 12 0V4" /><line x1="4" x2="20" y1="20" y2="20" /></>),
  highlighter: (<><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8Z" /></>),
  table: (<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M12 3v18" /></>),
  // Lucide "sparkles": the widely recognised mark for an AI action.
  ai: (<><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></>),
};

// Text-colour swatches for the toolbar (NHS palette).
const TEXT_COLORS = [
  { name: 'Red', hex: '#d5281b' },
  { name: 'Green', hex: '#007f3b' },
  { name: 'Blue', hex: '#005eb8' },
];

/* --------------------------- Page editor ----------------------------- *
 * Notion-style writing surface: the note is always rendered formatted and
 * edited in place - no raw-markdown flip. TipTap drives the editing (with
 * live shortcuts: "## ", "- ", "1. ", "> ", "**bold**", "---"); the
 * Markdown extension keeps the stored format exactly what it was before -
 * markdown plus the small HTML subset - so autosave, the AI formatter,
 * export/import and the assistant's RAG chunking are all untouched.      */

// <kbd> mark - a couple of notes use it for keyboard keys; supporting it
// keeps the editor lossless for existing content.
const Kbd = Mark.create({
  name: 'kbd',
  parseHTML() { return [{ tag: 'kbd' }]; },
  renderHTML({ HTMLAttributes }) { return ['kbd', mergeAttributes(HTMLAttributes), 0]; },
});

const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
  Underline, Kbd, Highlight, TextStyle, Color,
  // Words somebody has asked a question about (../_components/notebook/Questions).
  QuestionMark,
  TaskList, TaskItem.configure({ nested: true }),
  Table, TableRow, TableHeader, TableCell,
  Link.configure({ openOnClick: false, autolink: true }),
  // Inline images ("![alt](url)" in the stored markdown). inline:true matches
  // how markdown treats images (inside paragraphs), so the body round-trips
  // cleanly; CSS still displays them as blocks. Pasted pictures are uploaded
  // to blob storage first (see PageEditor's handlePaste) - data URLs would
  // bloat the note body and the assistant's index.
  TipTapImage.configure({ inline: true, allowBase64: false }),
  Placeholder.configure({ placeholder: 'Write here. Headings, lists and tables format as you type ("## ", "- ", "1. ", "> "). Everything you write is used by the assistant to answer and triage.' }),
  // html:true keeps the <mark>/<u>/<span style="color:...">/<kbd> subset intact
  // in both directions (stored markdown to editor, editor to stored markdown).
  Markdown.configure({ html: true, linkify: true }),
];

// Keyed by note id in the parent, so switching pages gets a fresh editor and
// its own undo history - and, being a fresh element, the sheet fades the new
// page in. onChange receives the serialized markdown on every edit and feeds
// the existing dirty -> interval-save pipeline.
function PageEditor({ initialBody, onChange, onReady, uploadImage, header = null }) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const uploadRef = React.useRef(uploadImage);
  uploadRef.current = uploadImage;
  const editorRef = React.useRef(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: EXTENSIONS,
    content: initialBody || '',
    editorProps: {
      attributes: { class: 'nbk-prose', 'aria-label': 'The page', 'aria-multiline': 'true', role: 'textbox' },
      // Pasted pictures: upload to blob storage (tracked as attachments of
      // this note), then insert inline at the caret as an image node.
      handlePaste: (view, event) => {
        const files = Array.from((event.clipboardData && event.clipboardData.files) || [])
          .filter((f) => /^image\//.test(f.type));
        if (!files.length || !uploadRef.current) return false;
        event.preventDefault();
        (async () => {
          for (const f of files) {
            const url = await uploadRef.current(f);
            const ed = editorRef.current;
            if (url && ed) ed.chain().focus().setImage({ src: url, alt: f.name || '' }).run();
          }
        })();
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => onChangeRef.current(ed.storage.markdown.getMarkdown()),
  });
  editorRef.current = editor;
  // Hand the instance up for the toolbar (and take it back on unmount).
  React.useEffect(() => {
    onReady(editor || null);
    return () => onReady(null);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nbk-editor nbk-scroll"
      onMouseDown={(e) => { if (e.target === e.currentTarget && editor) { e.preventDefault(); editor.chain().focus('end').run(); } }}>
      {header}
      <EditorContent editor={editor} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} />
    </div>
  );
}

/**
 * What a note is, as a chip.
 *
 * The short name in the kind's own colour (the shared rv-chip). `full`
 * spells the whole name out, with a dot - used where there is room; the
 * tree uses the short one so a chip never pushes a page title out of view.
 * A plain note wears nothing: almost every page is one, and a chip on all
 * of them is a chip on none.
 *
 * A DRAFT SAYS SO. An incomplete card is not served, and the tree is where
 * somebody notices that without opening it.
 */
function KindChip({ kind, draft = false, full = false, hidden = false }) {
  const def = noteKind(kind);
  if (!isTypedKind(def.id)) return null;
  const chip = (
    <Chip colour={draft ? null : def.colour} tone={draft ? 'warn' : ''} dot={full}
      title={draft
        ? def.label + ' - not finished, so the assistant does not answer from it yet.'
        : def.label + ' - the assistant answers from its recorded values.'}>
      {(full ? def.label : def.short) + (draft ? ' · draft' : '')}
    </Chip>
  );
  return hidden ? <span aria-hidden="true" style={{ display: 'contents' }}>{chip}</span> : chip;
}

// What a row says to a screen reader beyond its name: its files and kind.
function rowExtras(n, fileCount) {
  const bits = [];
  const def = noteKind(n.kind);
  if (isTypedKind(def.id)) bits.push(def.label + (String(n.status || 'live') === 'draft' ? ', draft' : ''));
  if (fileCount) bits.push(plural(fileCount, 'file'));
  return bits.length ? ', ' + bits.join(', ') : '';
}

// One tree row; children render recursively inside .nbk-kids, which draws the
// guide line down the left. Defined at module level (not inside the page
// component) so React keeps the same component identity across renders -
// defining it inline remounted the whole tree on every state change, which is
// what made the sidebar blink.
//
// A TREE ITEM, to the keyboard. The row is one stop: role=treeitem with its
// level, whether it is open and whether it is the page on screen; the keys
// are handled once, on the tree (onTreeKey in the page). The chevron, + and
// ... inside it are for the pointer, so they are not tab stops of their own -
// everything they do is a key or a menu item from the row.
function SideRow({ n, depth, ctx }) {
  const { selectedId, ancestors, expanded, setExpanded, q, childrenOf, treeMatch, attachments, selectNote, newNote, openMenu,
    dragId, setDragId, dropId, setDropId, canDropOn, moveNoteTo, tabId, setFocusId, openMenuAt } = ctx;
  const isSel = selectedId === n.id;
  const onPath = ancestors.some((a) => a.id === n.id);
  const kids = q ? childrenOf(n.id).filter(treeMatch) : childrenOf(n.id);
  const open = !!expanded[n.id] || (!!q && kids.length > 0);
  const fileCount = attachments.filter((a) => a.noteId === n.id).length;
  const draft = String(n.status || 'live') === 'draft';
  // Drag a note (anything below the root) onto a section row to move it there.
  const draggable = !!n.parentId;
  const dropOk = dragId != null && canDropOn(dragId, n.id);
  const cls = ['nbk-row',
    depth === 0 ? 'nbk-row--top' : '',
    isSel ? 'nbk-row--on' : onPath ? 'nbk-row--path' : '',
    dragId === n.id ? 'nbk-row--drag' : '',
    dropOk && dropId === n.id ? 'nbk-row--drop' : ''].filter(Boolean).join(' ');
  return (
    <div role="treeitem" id={'nbk-ti-' + n.id} data-id={n.id} tabIndex={tabId === n.id ? 0 : -1}
      aria-level={depth + 1} aria-selected={isSel} aria-expanded={kids.length > 0 ? open : undefined}
      aria-labelledby={'nbk-tn-' + n.id}
      onFocus={(e) => { if (e.target === e.currentTarget) setFocusId(n.id); }}
      onContextMenu={(e) => {
        // From the keyboard (the context-menu key, Shift+F10) the event is on
        // the row itself, with no pointer to open at: open under the row.
        if (e.target === e.currentTarget) openMenuAt(e, n.id, e.currentTarget.firstElementChild.getBoundingClientRect());
        else openMenu(e, n.id);
      }}>
      <div className={cls}
        draggable={draggable}
        onDragStart={draggable ? (e) => {
          e.dataTransfer.setData('application/x-nb-note', String(n.id));
          e.dataTransfer.effectAllowed = 'move';
          setDragId(n.id);
        } : undefined}
        onDragEnd={draggable ? () => { setDragId(null); setDropId(null); } : undefined}
        onDragOver={(e) => {
          if (!dropOk) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (dropId !== n.id) setDropId(n.id);
        }}
        onDragLeave={() => { if (dropId === n.id) setDropId(null); }}
        onDrop={(e) => {
          if (!dropOk) return;
          e.preventDefault();
          e.stopPropagation();
          setDropId(null);
          setDragId(null);
          moveNoteTo(dragId, n.id);
        }}>
        {kids.length > 0 ? (
          <button type="button" className="nbk-row__twist" aria-expanded={open} tabIndex={-1}
            aria-label={(open ? 'Collapse ' : 'Expand ') + shownTitle(n.title)}
            onClick={() => setExpanded((e) => ({ ...e, [n.id]: !open }))}>
            <Svg w={13} sw={2.6}>{Icons.chevronRight}</Svg>
          </button>
        ) : (<span style={{ flex: 'none', width: '24px' }} />)}
        <button type="button" className="nbk-row__btn" tabIndex={-1}
          onClick={() => { setFocusId(n.id); selectNote(n.id); }} aria-current={isSel ? 'page' : undefined}>
          <span className="nbk-row__icon" aria-hidden="true"><Svg w={16} sw={2}>{depth === 0 || n.isSection ? Icons.folder
            : isTypedKind(n.kind) ? (Icons[noteKind(n.kind).icon] || Icons.fileLines)
              : Icons.fileLines}</Svg></span>
          <span className="nbk-row__name" id={'nbk-tn-' + n.id}>
            {shownTitle(n.title)}<span className="rv-sr">{rowExtras(n, fileCount)}</span>
          </span>
          {fileCount > 0 && <span className="nbk-row__clip" title={plural(fileCount, 'file')} aria-hidden="true"><Svg w={13} sw={2.2}>{Icons.paperclip}</Svg></span>}
          {/* What this note is, where it is not the ordinary page. A draft says
              so here, because a card nobody finished is one the assistant is
              not answering from and the tree is where that gets noticed. */}
          <KindChip kind={n.kind} draft={draft} hidden />
        </button>
        <span className="nbk-row__actions">
          {depth < MAX_DEPTH - 1 && (
            <IconButton size="sm" icon={Icons.plus} label={'Add a page to ' + shownTitle(n.title)} tabIndex={-1} onClick={() => newNote(n.id)} />
          )}
          <IconButton size="sm" icon={NBIcons.dots} label={'More for ' + shownTitle(n.title)} tabIndex={-1} onClick={(e) => openMenu(e, n.id, true)} />
        </span>
      </div>
      {open && kids.length > 0 && (
        // A PLAIN GUIDE LINE. It used to take the colour of the folder's tag,
        // because a tag was a property of the folder and everything beneath it
        // inherited one. A kind is a property of the note, so the folder has no
        // colour to lend and a coloured line here would say something untrue
        // about the pages under it.
        <div className="nbk-kids" role="group">
          {kids.map((k) => <SideRow key={k.id} n={k} depth={depth + 1} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

// A page as a row in a list (a section's pages, the ones edited last):
// what it is called, a line of what it says, its kind, and where it goes.
function PageRow({ p, sub, delay, onOpen }) {
  const typed = isTypedKind(p.kind);
  const text = sub != null ? sub : excerpt(p.body);
  return (
    <motion.button type="button" className="nbk-prow" onClick={onOpen}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay, ease: EASE }}>
      <span className="nbk-prow__icon" aria-hidden="true">
        <Svg w={18} sw={2}>{typed ? (Icons[noteKind(p.kind).icon] || Icons.fileLines) : Icons.fileLines}</Svg>
      </span>
      <span className="nbk-prow__text">
        <span className="nbk-prow__name">{shownTitle(p.title)}</span>
        {/* "Nothing written" is about a page with nothing on it. A card's
            writing is optional - its values are the page - so it is never
            said of one. */}
        {text ? <span className="nbk-prow__sub">{text}</span>
          : typed ? null : <span className="nbk-prow__sub">Nothing written yet</span>}
      </span>
      <KindChip kind={p.kind} draft={String(p.status || 'live') === 'draft'} />
      <span className="nbk-prow__chev" aria-hidden="true"><Svg w={18} sw={2}>{Icons.chevronRight}</Svg></span>
    </motion.button>
  );
}

export default function NotebookPage() {
  const [notes, setNotes] = React.useState([]);
  const [attachments, setAttachments] = React.useState([]);
  const [status, setStatus] = React.useState('loading'); // loading | ready | error
  const [selectedId, setSelectedId] = React.useState(null);
  // Which sections are open - persisted so the tree doesn't collapse on reload.
  const [expanded, setExpanded] = React.useState(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(window.localStorage.getItem('nb-expanded') || '{}') || {}; } catch (e) { return {}; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem('nb-expanded', JSON.stringify(expanded)); } catch (e) { /* ignore */ }
  }, [expanded]);
  // The list: open or folded away on a wide screen (remembered), and on a
  // phone the card shown instead of the page, until a page is picked.
  // Read after mounting rather than in the initial state: the class it sets
  // is on server-rendered markup, and a first render that disagreed with the
  // server's would keep the server's. `ready` turns the fold's animation on
  // only after that, so a remembered fold does not play on arrival.
  const [sideOpen, setSideOpen] = React.useState(true);
  const [layoutReady, setLayoutReady] = React.useState(false);
  React.useEffect(() => {
    try { if (window.localStorage.getItem('nb-side') === '0') setSideOpen(false); } catch (e) { /* ignore */ }
    const t = setTimeout(() => setLayoutReady(true), 60);
    return () => clearTimeout(t);
  }, []);
  const [phoneList, setPhoneList] = React.useState(false);
  // Whether the address is the notebook's own (/notebook) rather than a
  // page's. On a phone that opens on the list, so the list is what stands in
  // the card while the notes load, rather than a page's skeleton swapped for
  // the list as they arrive. From the router, not window, so the server's
  // markup and the browser's first render agree; only read while loading.
  const atNotebook = !noteSegment(usePathname() || '');
  const [search, setSearch] = React.useState('');
  // The autosave, for the caption in the page's bar: '' | 'pending' (edited,
  // waiting for a pause) | 'saving' | 'saved' | 'error'.
  const [saveState, setSaveState] = React.useState('');
  const [view, setView] = React.useState('pages');           // 'pages' - the editor; 'map' - the treemap
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState('');
  // Where an import has got to: { phase, done, total } or null when none is
  // running. The import used to finish in silence - a file was posted and
  // nothing happened on screen until it was over, which looked broken on a big
  // notebook and got clicked twice. See /api/notebook/import, which streams.
  const [importing, setImporting] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null);       // { title, message, confirmLabel, onConfirm, tone?, icon? }
  const [menu, setMenu] = React.useState(null);              // { id, x, y } - the note menu
  const [dragId, setDragId] = React.useState(null);           // note being dragged in the sidebar
  const [dropId, setDropId] = React.useState(null);           // section row currently hovered as a drop target
  const [aiFmt, setAiFmt] = React.useState(null);            // null | {status:'loading'} | {status:'error',message} | {status:'ready',formatted,diff}
  const [aiOrg, setAiOrg] = React.useState(null);             // AI organise (sections)
  const [editor, setEditor] = React.useState(null);           // TipTap instance of the open page
  // The formatting strip is one tab stop, as a toolbar is (WAI-ARIA): the
  // arrows, Home and End move along it, and this is the button that holds it.
  const [tbAt, setTbAt] = React.useState(0);
  // The table's actions, open under the strip's table button: { x, y, flipY }.
  const [tableMenu, setTableMenu] = React.useState(null);
  // The row of the tree that is the tree's one tab stop (the arrows move it).
  const [focusId, setFocusId] = React.useState(null);
  // A new section being named: { name, page, touched, tried, busy, error }.
  const [newSec, setNewSec] = React.useState(null);
  // A title that was left empty and put back: said under it until it is edited.
  const [titleHint, setTitleHint] = React.useState(null);     // { id, text }
  // One message at the foot of the screen - a thing that did not work, or did.
  const [toast, setToast] = React.useState(null);              // { text, at }
  // Questions asked about words on the open page (Questions.jsx): the rows,
  // tagged with the page they were read for; the one whose card is open; and
  // a question to jump to, from a /questions link (?q=<anchor>).
  const [pageQs, setPageQs] = React.useState({ noteId: null, rows: [] });
  const [qOpen, setQOpen] = React.useState(null);
  const [jumpQ, setJumpQ] = React.useState(null);
  const dragDepth = React.useRef(0);
  const saved = React.useRef(new Map());   // id -> { title, body } last persisted
  const dirty = React.useRef(new Set());   // ids edited since their last save
  const dirtyAt = React.useRef(new Map()); // id -> last edit time (quiet-period debounce)
  const saving = React.useRef(new Set());  // prevent overlapping/out-of-order PATCHes
  const failCount = React.useRef(0);       // saves failed in a row (the retry backs off)
  const retryAt = React.useRef(0);         // not before this, after a failure (a Retry ignores it)
  const notesRef = React.useRef([]);
  const fileInput = React.useRef(null);
  const titleInput = React.useRef(null);
  const searchInput = React.useRef(null);
  const backRef = React.useRef(null);
  const treeBox = React.useRef(null);
  const treeHl = React.useRef(null);
  const pagesBox = React.useRef(null);
  const pagesHl = React.useRef(null);
  const toastTimer = React.useRef(null);
  const pendingTitle = React.useRef(null); // a page just made: its title gets the caret
  const nameInput = React.useRef(null);
  const pageInput = React.useRef(null);
  notesRef.current = notes;

  useGlide(treeBox, treeHl, '.nbk-row');

  const say = React.useCallback((text) => {
    clearTimeout(toastTimer.current);
    setToast({ text, at: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 5200);
  }, []);
  React.useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Re-render on every editor transaction so the toolbar's active states
  // (bold on, "in a table", ...) track the caret.
  const [, onEditorTx] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (!editor) return;
    editor.on('transaction', onEditorTx);
    return () => { editor.off('transaction', onEditorTx); };
  }, [editor]);

  // A link to a question (/notebook/<page>?q=<anchor>): remember it and take
  // it off the address, which otherwise follows the reader from page to page.
  React.useEffect(() => {
    const anchor = new URLSearchParams(window.location.search).get('q');
    if (!anchor) return;
    setJumpQ(anchor);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notebook');
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        const list = Array.isArray(data.notes) ? data.notes : [];
        for (const n of list) saved.current.set(n.id, { title: n.title || '', body: n.body || '', fields: JSON.stringify(n.fields || {}) });
        setNotes(list);
        setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
        setStatus('ready');
        // Open the page the address names (/notebook/<title>-<id>), else the
        // first page (sections are name-only), else the first section.
        if (list.length) {
          const named = resolveNote(list, noteSegment(window.location.pathname));
          const first = named || list.find((n) => n.parentId && !n.isSection) || list[0];
          setSelectedId(first.id);
          const open = {};
          const ids = new Map(list.map((n) => [n.id, n]));
          for (let cur = first; cur && cur.parentId; cur = ids.get(cur.parentId)) open[cur.parentId] = true;
          setExpanded((e) => ({ ...e, ...open }));
          // A phone that came to the notes rather than to a page: the list
          // first, as a notes app opens on its list.
          if (!named && isPhone()) setPhoneList(true);
        }
      } catch (e) {
        setStatus('error');
      }
    })();
  }, []);

  const byId = React.useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  /* ------------------------------ Addresses --------------------------- *
   * Every page has its own URL (lib/notebook/links.mjs). Opening a page
   * pushes its address, so the back button walks the pages read; renaming
   * one only rewrites the address in place, since it is the same page.
   *
   * THE LIST ON A PHONE IS /notebook. A page is still chosen behind it (it
   * is what a wider screen shows), but the address is the list's own, so a
   * reload or a shared link opens the list, and Back from a page opened off
   * it comes back to it rather than to a page nobody opened. A page opened
   * from the list says so in its history entry (nbFromList), so the way back
   * to the list from it is Back itself; anywhere else, the list is pushed.  */
  const selTitle = (byId.get(selectedId) || {}).title || '';
  const lastUrlId = React.useRef(null);
  React.useEffect(() => {
    if (status !== 'ready' || selectedId == null) return;
    const here = window.location.pathname;
    if (phoneList && isPhone()) {
      // (Already LIST with a page's address: the step Back is on its way.)
      if (here !== '/notebook' && lastUrlId.current !== LIST) {
        const open = resolveNote(notesRef.current, noteSegment(here));
        if (window.history.state && window.history.state.nbFromList) window.history.back();
        // From a page: a new entry, so Back returns to it. From an address
        // that names no page (a stale link): put right in place.
        else window.history[open && open.id === selectedId ? 'pushState' : 'replaceState'](null, '', '/notebook');
      }
      lastUrlId.current = LIST;
      document.title = 'Practice notes';
      return;
    }
    const href = notebookHref({ id: selectedId, title: selTitle });
    if (here !== href) {
      const fromList = lastUrlId.current === LIST;
      const samePage = lastUrlId.current === selectedId || lastUrlId.current === null;
      window.history[samePage ? 'replaceState' : 'pushState'](fromList ? { nbFromList: true } : null, '', href + window.location.search);
    }
    lastUrlId.current = selectedId;
    document.title = shownTitle(selTitle) + ' · Practice notes';
  }, [status, selectedId, selTitle, phoneList]);
  // Bound once, calling the handler of the latest render (so selectNote sees
  // the current tree). Re-binding it on every render lost the event: the
  // router answers a popstate first, which redraws this page, and a listener
  // swapped while the event is being dispatched is not called for it.
  const onPop = React.useRef(null);
  onPop.current = () => {
    const segment = noteSegment(window.location.pathname);
    // Back to /notebook: on a phone, that is the list.
    if (!segment) {
      if (isPhone()) { lastUrlId.current = LIST; setPhoneList(true); }
      return;
    }
    const hit = resolveNote(notesRef.current, segment);
    if (!hit) return;
    lastUrlId.current = hit.id; // arriving here is not a new visit to push
    selectNote(hit.id, { focus: false });
  };
  React.useEffect(() => {
    const pop = () => onPop.current();
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);

  const [copied, setCopied] = React.useState(false);
  async function copyLink(id) {
    const n = byId.get(id);
    if (!n) return;
    const url = window.location.origin + notebookHref(n);
    try { await navigator.clipboard.writeText(url); } catch (e) { window.prompt('Copy this link', url); return; }
    setCopied(true);
    say('Link to “' + shownTitle(n.title) + '” copied.');
    setTimeout(() => setCopied(false), 1600);
  }
  const childrenOf = React.useCallback((id) => notes.filter((n) => n.parentId === id), [notes]);
  const selected = byId.get(selectedId) || null;
  const isSection = !!selected && (!selected.parentId || !!selected.isSection);
  // The open page's typed values, always complete for its kind: an editor
  // handed an undefined value renders an uncontrolled box that React then
  // complains about the first time somebody types in it.
  //
  // WHAT IS BEING TYPED IS KEPT AS TYPED. normaliseFields trims, which run on
  // every keystroke ate the space at the end of a box before the next word
  // could follow it, and dropped a list's new empty row. So it only supplies
  // the shape: a stored value of the right type wins, untrimmed. The server
  // coerces on save (updateNote).
  const selectedFields = React.useMemo(() => {
    if (!selected || !isTypedKind(selected.kind)) return {};
    const shape = { ...emptyFields(selected.kind), ...normaliseFields(selected.kind, selected.fields) };
    const raw = selected.fields && typeof selected.fields === 'object' ? selected.fields : {};
    for (const key of Object.keys(shape)) {
      const value = raw[key];
      if (Array.isArray(shape[key]) ? Array.isArray(value) : typeof value === 'string') {
        shape[key] = Array.isArray(value) ? value.map((v) => String(v == null ? '' : v)) : value;
      }
    }
    return shape;
  }, [selected]);
  // WHAT IS MISSING, WORKED OUT HERE AS WELL AS ON THE SERVER. The server
  // decides whether the note is servable; this is the same rules run against
  // what is on screen, so a box turns red as it is emptied rather than 1.8
  // seconds later when the autosave comes back.
  const selectedIssues = React.useMemo(
    () => (selected && isTypedKind(selected.kind) ? noteIssues(selected.kind, selectedFields) : []),
    [selected, selectedFields],
  );
  const suggested = React.useMemo(
    () => (selected && !isSection && !isTypedKind(selected.kind) ? suggestKind(selected.body) : ''),
    [selected, isSection],
  );
  // Files docked below the page. Images embedded inline in the text are shown
  // there, not repeated here - a chip reappears if its image is deleted from
  // the text, so the file can still be removed (or re-embedded) from the strip.
  const selectedFiles = attachments.filter((a) => a.noteId === selectedId
    && !(selected && (selected.body || '').includes(a.url)));

  // THE OPEN PAGE'S QUESTIONS. Read once per page opened; everything after is
  // kept in step locally by whatever changed it (asking, answering, removing).
  const selectedPageId = selected && !isSection ? selected.id : null;
  React.useEffect(() => {
    if (selectedPageId == null) return undefined;
    let live = true;
    fetch('/api/notebook/questions?noteId=' + selectedPageId)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => { if (live) setPageQs({ noteId: selectedPageId, rows: Array.isArray(d.rows) ? d.rows : [] }); })
      .catch(() => {});
    return () => { live = false; };
  }, [selectedPageId]);
  const qRows = pageQs.noteId === selectedPageId ? pageQs.rows : [];
  const setQRows = React.useCallback((fn) => {
    setPageQs((p) => (p.noteId === selectedPageId ? { ...p, rows: fn(p.rows) } : p));
  }, [selectedPageId]);
  const selectedBody = selected ? selected.body || '' : '';
  const shownQs = React.useMemo(() => pageQuestions(qRows, questionAnchorsIn(selectedBody)), [qRows, selectedBody]);
  // Answered, and still marked on the page: what Format with AI can write in.
  const answeredOnPage = shownQs.filter((q) => q.status === 'answered' && !q.detached);
  // A question picked from the chip's list: its card opens with focus in it
  // (`focus`), since the reader is not in the words it sits beside.
  function pickQuestion(q, rect) {
    const el = !q.detached && editor ? editor.view.dom.querySelector('[data-q="' + q.anchor + '"]') : null;
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setQOpen({ anchor: q.anchor, focus: true }); }
    else setQOpen({ anchor: q.anchor, rect, focus: true });
  }

  // Ancestor chain of the selection, root first (breadcrumb + auto-expand).
  const ancestors = React.useMemo(() => {
    const chain = [];
    for (let cur = selected && byId.get(selected.parentId); cur && chain.length < 12; cur = byId.get(cur.parentId)) {
      chain.unshift(cur);
    }
    return chain;
  }, [selected, byId]);

  // Descendants of a note (for delete bookkeeping).
  const descendantIds = React.useCallback((id) => {
    const out = new Set([id]);
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      for (const n of notes) if (frontier.includes(n.parentId) && !out.has(n.id)) { out.add(n.id); next.push(n.id); }
      frontier = next;
    }
    return out;
  }, [notes]);

  // Search: a page matches when every word is in its title, its typed fields
  // or its writing. The tree is filtered to those pages, each keeping its
  // ancestor chain so it is found where it lives; nothing is previewed.
  const q = search.trim().toLowerCase();

  // THE MATCHES, BEST FIRST. Every word has to appear somewhere in the page;
  // a word in the title counts for most, in its typed fields (service,
  // aliases, form) next, in the writing least. The order decides which page
  // Enter opens; the set decides what the tree shows.
  const searchWords = React.useMemo(() => q.split(/\s+/).filter(Boolean), [q]);
  const hits = React.useMemo(() => {
    if (!searchWords.length) return [];
    const out = [];
    for (const n of notes) {
      if (!n.parentId || n.isSection) continue;
      const title = (n.title || '').toLowerCase();
      const fieldText = Object.values(n.fields || {}).flat().join(' ').toLowerCase();
      const body = excerpt(n.body, 100000).toLowerCase();
      let score = 0;
      let all = true;
      for (const w of searchWords) {
        const inTitle = title.includes(w);
        const inFields = fieldText.includes(w);
        const inBody = body.includes(w);
        if (!inTitle && !inFields && !inBody) { all = false; break; }
        score += (inTitle ? 10 : 0) + (inFields ? 5 : 0) + (inBody ? 1 : 0);
        if (title.startsWith(w)) score += 4;
      }
      if (!all) continue;
      if (title === q) score += 20;
      out.push({ note: n, score });
    }
    return out.sort((a, b) => b.score - a.score || (a.note.title || '').localeCompare(b.note.title || ''));
  }, [notes, searchWords, q]);
  const hitIds = React.useMemo(() => new Set(hits.map((h) => h.note.id)), [hits]);
  const selfMatch = (n) => !q || hitIds.has(n.id);
  const treeMatch = React.useCallback(function treeMatch(n) {
    return selfMatch(n) || childrenOf(n.id).some(treeMatch);
  }, [childrenOf, hitIds, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = notes.filter((n) => !n.parentId).filter(treeMatch);

  // The rows the tree shows, top to bottom - what the arrow keys walk. The
  // same rule for open as SideRow's: remembered open, or open because the
  // search found something inside.
  const visible = [];
  (function walk(list, depth) {
    for (const n of list) {
      const kids = q ? childrenOf(n.id).filter(treeMatch) : childrenOf(n.id);
      const open = !!expanded[n.id] || (!!q && kids.length > 0);
      visible.push({ id: n.id, depth, parentId: n.parentId, hasKids: kids.length > 0, open });
      if (open && kids.length) walk(kids, depth + 1);
    }
  }(sections, 0));
  const tabId = visible.some((v) => v.id === focusId) ? focusId
    : visible.some((v) => v.id === selectedId) ? selectedId
      : visible.length ? visible[0].id : null;

  /* ------------------------------ Saving ------------------------------ *
   * Time-based, not per-keystroke: edits mark the note dirty; after 1.8s quiet
   * the interval diffs it against its last persisted snapshot and PATCHes only
   * the fields that actually changed - no change, no request.
   *
   * `force` skips the quiet period (and the back-off after a failure): it is
   * how an edit is sent before something that would leave it behind - opening
   * another page, going to Saves, the tab closing or hiding, the page being
   * left. `leaving` sends it with keepalive, so it outlives the page.
   *
   * A failed save waits before it tries again - 1s, 2s, 4s... up to 30s -
   * rather than every second; Retry tries now.
   *
   * A TITLE OF NOTHING BUT SPACES IS NEVER SENT. The old title stands in the
   * database, and the box is given it back when it is left (onTitleBlur).  */

  async function flush(opts = {}) {
    const force = !!opts.force;
    if (!force && Date.now() < retryAt.current) return;
    for (const id of Array.from(dirty.current)) {
      if (saving.current.has(id)) continue;
      if (!force && Date.now() - (dirtyAt.current.get(id) || 0) < QUIET_MS) continue;
      const n = notesRef.current.find((x) => x.id === id);
      if (!n) { dirty.current.delete(id); continue; } // deleted while dirty
      const prev = saved.current.get(id) || {};
      // The typed values are compared as their JSON, which is what makes an
      // autosave of a card the same cheap check as an autosave of prose: one
      // string against one string, with no walk of a shape that differs per
      // kind.
      const fieldsNow = JSON.stringify(n.fields || {});
      const titleNow = (n.title || '').trim() ? (n.title || '') : (prev.title || '');
      const patch = {};
      if (titleNow !== (prev.title || '')) patch.title = titleNow;
      if ((n.body || '') !== (prev.body || '')) patch.body = n.body || '';
      if (fieldsNow !== (prev.fields || '{}')) patch.fields = n.fields || {};
      if (!Object.keys(patch).length) { dirty.current.delete(id); continue; }
      const sent = { title: titleNow, body: n.body || '', fields: fieldsNow };
      const payload = JSON.stringify({ ...patch, id });
      try {
        saving.current.add(id);
        setSaveState('saving');
        const res = await fetch('/api/notebook', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: payload,
          // keepalive has a 64 KB budget; a longer page is sent the ordinary way.
          keepalive: !!opts.leaving && payload.length < 60000,
        });
        if (!res.ok) throw new Error('bad status');
        const { note: back } = await res.json();
        saved.current.set(id, sent);
        failCount.current = 0;
        retryAt.current = 0;
        // WHETHER IT IS SERVABLE IS THE SERVER'S ANSWER, not this page's. The
        // rules that decide live or draft live with the kind, and a browser
        // that worked it out for itself would be a second copy of them.
        const stamp = new Date().toISOString();
        setNotes((ns) => ns.map((x) => (x.id === id ? { ...x, ...(back && back.status ? { status: back.status } : {}), updatedAt: stamp } : x)));
        const latest = notesRef.current.find((x) => x.id === id);
        if (latest && (latest.title || '') === sent.title && (latest.body || '') === sent.body
          && JSON.stringify(latest.fields || {}) === sent.fields) {
          dirty.current.delete(id);
          dirtyAt.current.delete(id);
        }
        setSaveState(dirty.current.size ? 'pending' : 'saved');
      } catch (e) {
        failCount.current += 1;
        retryAt.current = Date.now() + Math.min(30000, 1000 * 2 ** (failCount.current - 1));
        setSaveState('error');
        break;
      } finally {
        saving.current.delete(id);
      }
    }
    // An edit that came to nothing (a letter typed and taken out again) has
    // nothing to send: it is saved as it was, so the caption says so rather
    // than "Saving..." for ever.
    if (!dirty.current.size && !saving.current.size) setSaveState((st) => (st === 'pending' ? 'saved' : st));
  }

  // flush() reads only refs, so the interval's first-render closure stays valid.
  React.useEffect(() => {
    const iv = setInterval(() => flush(), 1000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // LEAVING SENDS WHAT IS NOT SENT YET. The tab hiding or closing, and the
  // page going away (another tool in the bar), each send the edits still in
  // their quiet period; closing the tab with one unsent also asks first.
  React.useEffect(() => {
    const leave = () => { if (dirty.current.size) flush({ force: true, leaving: true }); };
    const onHidden = () => { if (document.visibilityState === 'hidden') leave(); };
    const onBefore = (e) => {
      if (!dirty.current.size && !saving.current.size) return;
      leave();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onBefore);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onBefore);
      leave();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function editSelected(patch) {
    if (isSection && 'body' in patch) return; // sections are name-only
    setNotes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, ...patch } : n)));
    dirty.current.add(selectedId);
    dirtyAt.current.set(selectedId, Date.now());
    // A failure stays said until a save gets through.
    setSaveState((s) => (s === 'error' ? s : 'pending'));
    if ('title' in patch) setTitleHint(null);
  }

  // The title box, left: trimmed, and never left empty - the last saved title
  // goes back in (or "Untitled page"), and the line under it says why.
  function onTitleBlur() {
    if (!selected) return;
    const now = selected.title || '';
    const trimmed = now.trim();
    if (!trimmed) {
      const back = fallbackTitle((saved.current.get(selected.id) || {}).title, isSection);
      editSelected({ title: back });
      setTitleHint({ id: selected.id, text: (isSection ? 'A section' : 'A page') + ' cannot be saved without a title, so “' + back + '” was put back.' });
    } else if (trimmed !== now) {
      editSelected({ title: trimmed });
    }
  }

  /* ------------------------ Formatting toolbar ------------------------ *
   * Buttons drive the TipTap editor directly, so formatting applies in
   * place (Notion-style) and undo/redo is the editor's own history.      */

  const chain = () => editor.chain().focus();
  const inTable = !!editor && editor.isActive('table');
  const listKind = () => (editor.isActive('taskItem') ? 'taskItem' : 'listItem');
  // The DOM normalises hex colours to rgb(...) on save, so match either form
  // when deciding whether a swatch is active (and should toggle off).
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
  };
  const colorActive = (hex) => {
    if (!editor) return false;
    const c = editor.getAttributes('textStyle').color;
    return c === hex || c === hexToRgb(hex);
  };

  // AI format: send the body off, then show the proposed change as a diff the
  // user must confirm - nothing is applied (or saved) until they accept.
  //
  // WITH QUESTION DATA. A page with answered questions on it asks first whether
  // to include them: if so, the answers go along and are written into the page,
  // and each one whose marker comes back gone is recorded as written in when
  // the change is applied. Open questions keep their markers either way.
  function startAiFormat() {
    if (aiFmt && aiFmt.status === 'loading') return;
    if (answeredOnPage.length) setAiFmt({ status: 'options', include: true });
    else runAiFormat(false);
  }

  async function runAiFormat(includeQuestions) {
    const original = (selected && selected.body) || '';
    if (aiFmt && aiFmt.status === 'loading') return;
    // An empty page has nothing to tidy: said, rather than a click that does nothing.
    if (!original.trim()) { setAiFmt({ status: 'error', message: 'There is nothing on this page to format yet. Write something first.' }); return; }
    const asked = includeQuestions ? answeredOnPage : [];
    setAiFmt({ status: 'loading' });
    try {
      const res = await fetch('/api/notebook/format', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: original,
          questions: asked.map((q) => ({ anchor: q.anchor, question: q.question, answer: q.answer, quote: q.quote })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Formatting failed.');
      const formatted = String(data.formatted || '');
      if (formatted.trim() === original.trim()) { setAiFmt({ status: 'error', message: 'Nothing to change: the note is already tidy.' }); return; }
      const written = asked.filter((q) => !hasQuestionAnchor(formatted, q.anchor));
      // Markers the model should have kept and did not: said, so nobody wonders
      // where a highlight went. The questions themselves are safe in the list.
      const lost = shownQs.filter((q) => !q.detached && !asked.includes(q) && !hasQuestionAnchor(formatted, q.anchor));
      setAiFmt({
        status: 'ready', formatted, written, lost, noteId: selected.id,
        diff: lineDiff(stripQuestionMarks(original), stripQuestionMarks(formatted)),
      });
    } catch (e) {
      setAiFmt({ status: 'error', message: String(e.message || e) });
    }
  }

  // AI organise applies only to the "Uncategorised" holding section - other
  // sections are already where their content belongs.
  const canOrganize = (n) => !!n && (!n.parentId || !!n.isSection) && /^\s*uncategori[sz]ed\s*$/i.test(n.title || '');

  async function runAiOrganize(id = selectedId) {
    const n = byId.get(id);
    if (!canOrganize(n)) return;
    if (aiOrg && (aiOrg.status === 'loading' || aiOrg.status === 'applying')) return;
    await selectNote(id, { focus: false }); // the plan is about this section, read once the edit being left is in
    setAiOrg({ status: 'loading' });
    try {
      const res = await fetch('/api/notebook/organize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Organise failed.');
      setAiOrg({ status: 'ready', plan: data.plan });
    } catch (e) {
      setAiOrg({ status: 'error', message: String(e.message || e) });
    }
  }

  async function applyAiOrganize() {
    if (!aiOrg || aiOrg.status !== 'ready') return;
    const plan = aiOrg.plan;
    setAiOrg({ status: 'applying' });
    try {
      const res = await fetch('/api/notebook/organize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: plan.sectionId, plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not apply the plan.');
      await reloadAll();
      setAiOrg({ status: 'done', applied: data.applied || {} });
    } catch (e) {
      setAiOrg({ status: 'error', message: String(e.message || e) });
    }
  }

  function applyAiFormat() {
    if (!aiFmt || aiFmt.status !== 'ready') return;
    // Load the formatted markdown into the editor; emitting the update runs
    // the normal onChange -> dirty -> interval-save path.
    if (editor) editor.commands.setContent(aiFmt.formatted, true);
    else {
      setNotes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, body: aiFmt.formatted } : n)));
      dirty.current.add(selectedId);
      setSaveState('pending');
    }
    // The answers now in the page's text: say so on their rows. Best-effort -
    // the page is what matters, and it is already applied.
    const written = (aiFmt.written || []).map((q) => q.id);
    if (written.length) {
      const stamp = new Date().toISOString();
      setQRows((rows) => rows.map((r) => (written.includes(r.id) ? { ...r, writtenAt: stamp } : r)));
      fetch('/api/notebook/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'written', noteId: aiFmt.noteId, ids: written }),
      }).catch(() => {});
    }
    setAiFmt(null);
  }
  /* --------------------------- Note actions --------------------------- */

  // Open a note. Edits to the one being left are sent first, whatever their
  // quiet period - sent, and not waited for: the page opens at once, with
  // "Saving..." in its bar until the save is in. Waiting made a click on a
  // row, a crumb or a section's page do nothing for as long as the server
  // took, and for ever if it never answered. The save's promise is returned
  // for a caller that must not go on until it is in (AI organise).
  // On a phone this is also the move from the list to the page, and focus
  // goes to the way back (unless the caller is putting it elsewhere).
  function selectNote(id, { focus = true } = {}) {
    const sending = flush({ force: true });
    setUploadErr('');
    setAiFmt(null);
    setAiOrg(null);
    setQOpen(null);
    setTableMenu(null);
    setPhoneList(false);
    setSelectedId(id);
    // Open the path to the selection so it is always visible in the tree.
    setExpanded((e) => {
      const next = { ...e };
      for (let cur = byId.get(id); cur && cur.parentId; cur = byId.get(cur.parentId)) next[cur.parentId] = true;
      return next;
    });
    if (focus && isPhone()) requestAnimationFrame(() => { if (backRef.current) backRef.current.focus({ preventScroll: true }); });
    return sending;
  }

  // Back to the list, on a phone: the open page's row has focus there.
  function showList() {
    setPhoneList(true);
    requestAnimationFrame(() => {
      const el = selectedId != null ? document.getElementById('nbk-ti-' + selectedId) : null;
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
    });
  }

  // Desktop: fold the list away (remembered). Phone: back to the list.
  const toggleSide = () => {
    if (isPhone()) { showList(); return; }
    setSideOpen((o) => {
      try { window.localStorage.setItem('nb-side', o ? '0' : '1'); } catch (e) { /* ignore */ }
      return !o;
    });
  };

  async function createNoteApi(title, parentId, kind = 'note') {
    const res = await fetch('/api/notebook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, parentId: parentId || null, kind }),
    });
    if (!res.ok) throw new Error('bad status');
    const { note } = await res.json();
    saved.current.set(note.id, { title: note.title || '', body: note.body || '', fields: JSON.stringify(note.fields || {}) });
    return note;
  }

  // A page just made: open it, and put the caret in its title with the
  // placeholder name selected, so typing names it.
  function openCreated(id) {
    pendingTitle.current = id;
    setPhoneList(false);
    setSelectedId(id);
  }
  React.useEffect(() => {
    if (pendingTitle.current == null || pendingTitle.current !== selectedId || !titleInput.current) return;
    pendingTitle.current = null;
    titleInput.current.focus();
    titleInput.current.select();
  });

  // New page under a parent - or, with no parent, a new section, which is
  // named in a dialog first (askNewSection). A section is a name-only
  // container, so it is always created together with its first page, and
  // the page (the writing surface) is what opens.
  //
  // THE KIND IS CHOSEN HERE, at the moment the page is made, which is the
  // whole point: a referral card is a referral card because somebody said so,
  // not because of the folder it landed in. It is named for what it is, so the
  // tree reads sensibly before anybody has typed a word into it.
  async function newNote(parentId, kind = 'note') {
    if (!parentId) { askNewSection(); return; }
    flush({ force: true }); // on its way, not waited for (see selectNote)
    const def = noteKind(kind);
    const name = isTypedKind(def.id) ? 'New ' + def.label.charAt(0).toLowerCase() + def.label.slice(1) : 'New page';
    try {
      const note = await createNoteApi(name, parentId, def.id);
      setNotes((ns) => ns.concat([note]));
      setExpanded((e) => ({ ...e, [parentId]: true }));
      openCreated(note.id);
    } catch (e) {
      say('The page could not be made. Nothing was saved - try again in a moment.');
    }
  }

  /* ------------------------- Naming a new section ---------------------- *
   * A section and its first page, both named before either exists: a
   * section called "New section" holding a page called "New page" is two
   * renames nobody remembers to do. Both are required, both stop at the
   * server's 200 characters, and a section name already in use is said
   * (not refused - two can share a name, but it is rarely meant).        */
  function askNewSection() {
    setNewSec({ name: '', page: '', touched: {}, tried: false, busy: false, error: '' });
  }
  const sectionTitles = notes.filter((n) => !n.parentId).map((n) => n.title || '');
  // A box is checked once it has been left for something else in the dialog
  // (validate on leaving, as the shared forms do) - not when focus is pulled
  // away from outside it, which is not the reader moving on.
  function leftField(e, key) {
    const panel = e.currentTarget.closest('.nbk-modal');
    if (!panel || !e.relatedTarget || !panel.contains(e.relatedTarget)) return;
    setNewSec((s) => (s ? { ...s, touched: { ...s.touched, [key]: true } } : s));
  }
  async function createSection(e) {
    if (e) e.preventDefault();
    if (!newSec || newSec.busy) return;
    const name = newSec.name.trim();
    const page = newSec.page.trim();
    if (!name || !page) {
      setNewSec((s) => ({ ...s, tried: true }));
      const bad = !name ? nameInput.current : pageInput.current;
      if (bad) bad.focus();
      return;
    }
    setNewSec((s) => ({ ...s, busy: true, error: '' }));
    await flush({ force: true });
    let section = null;
    try {
      section = await createNoteApi(name, null);
      const first = await createNoteApi(page, section.id, 'note');
      setNotes((ns) => ns.concat([section, first]));
      setExpanded((x) => ({ ...x, [section.id]: true }));
      setNewSec(null);
      // The page opens with the caret in its writing: it is already named.
      pendingBody.current = first.id;
      setSelectedId(first.id);
      setPhoneList(false);
    } catch (err) {
      if (section) {
        setNotes((ns) => ns.concat([section]));
        setExpanded((x) => ({ ...x, [section.id]: true }));
        setNewSec(null);
        setSelectedId(section.id);
        say('“' + name + '” was made, but its first page could not be. Add one with New page.');
      } else {
        setNewSec((s) => ({ ...s, busy: false, error: 'The section could not be made. Nothing was saved - try again in a moment.' }));
      }
    }
  }
  // A page just made in the dialog, already named: the caret goes into its
  // writing once its own editor is up (not the one of the page it replaced).
  const pendingBody = React.useRef(null);
  React.useEffect(() => {
    if (pendingBody.current == null || pendingBody.current !== selectedId || !editor) return;
    if (editor.isDestroyed || !editor.view || !editor.view.dom || !editor.view.dom.isConnected) return;
    pendingBody.current = null;
    editor.commands.focus('start');
  }, [editor, selectedId]);

  // DELETING SAYS WHAT GOES. The page by name; the pages under it and the
  // files on them, counted; and that the assistant stops answering from them,
  // which is the part that changes what reception is told tomorrow.
  function askRemoveNote(id) {
    const n = byId.get(id);
    const gone = descendantIds(id);
    const kids = gone.size - 1;
    const files = attachments.filter((a) => gone.has(a.noteId)).length;
    const sec = !!n && (!n.parentId || !!n.isSection);
    const name = n ? shownTitle(n.title) : 'this note';
    const what = kids
      ? 'The ' + (sec ? 'section' : 'page') + ' and the ' + plural(kids, 'page') + ' inside it are deleted'
      : 'The ' + (sec ? 'section' : 'page') + ' is deleted';
    setConfirm({
      title: 'Delete “' + name + '”?',
      message: what
        + (files ? ', with ' + (files === 1 ? 'the file attached' : 'the ' + files + ' files attached') : '')
        + ', and the assistant stops answering from ' + (kids ? 'them' : 'it') + '.\n\n'
        + 'This cannot be undone, except by loading a save taken before now.',
      confirmLabel: sec ? 'Delete section' : 'Delete page',
      onConfirm: () => { setConfirm(null); removeNote(id); },
    });
  }

  async function removeNote(id) {
    const n = byId.get(id);
    const gone = descendantIds(id);
    // Where the keys go if the row they were on goes: the next row down that
    // is not going with it, else the nearest one above.
    const at = visible.findIndex((v) => v.id === id);
    const stays = (v) => !gone.has(v.id);
    const near = at < 0 ? null : (visible.slice(at + 1).find(stays) || visible.slice(0, at).reverse().find(stays) || {}).id;
    try {
      const res = await fetch('/api/notebook?id=' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('bad status');
      // Drawn at once, so that whether focus went with the row can be seen.
      flushSync(() => {
        setNotes((ns) => ns.filter((x) => !gone.has(x.id)));
        setAttachments((as) => as.filter((a) => !gone.has(a.noteId)));
        if (gone.has(selectedId)) {
          // Prefer staying near the deleted note: its parent, else the first section.
          const parent = n && n.parentId && !gone.has(n.parentId) ? n.parentId : null;
          if (parent) setSelectedId(parent);
          else {
            const remaining = notes.filter((x) => !gone.has(x.id) && !x.parentId);
            setSelectedId(remaining.length ? remaining[0].id : null);
          }
        }
      });
      refocusTree(near);
      say('“' + shownTitle(n && n.title) + '” was deleted.');
    } catch (e) {
      // Kept on screen: it is still in the notebook, and still answered from.
      say('“' + shownTitle(n && n.title) + '” could not be deleted. Nothing was changed.');
    }
  }

  /* --------------------------- Attachments ---------------------------- */

  async function uploadFiles(files) {
    if (!selectedId || isSection || !files || !files.length) return;
    setUploading(true);
    setUploadErr('');
    // Every file that did not go, and why, said together - one failure used to
    // overwrite the last.
    const failed = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD) { failed.push('“' + file.name + '” is over the 20 MB limit.'); continue; }
      const form = new FormData();
      form.append('noteId', String(selectedId));
      form.append('file', file);
      try {
        const res = await fetch('/api/notebook/attachments', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed.');
        setAttachments((as) => as.concat([data.attachment]));
      } catch (e) {
        failed.push('“' + file.name + '” was not attached: ' + String(e.message || e));
      }
    }
    setUploadErr(failed.join(' '));
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  // A pasted image goes through the same attachments API (so the file is tied
  // to the note and its blob is cleaned up with it) and returns the URL the
  // editor embeds inline.
  async function uploadInlineImage(file) {
    if (!selectedId || isSection || !file) return null;
    if (file.size > MAX_UPLOAD) { setUploadErr('That picture is over the 20 MB limit, so it was not added.'); return null; }
    setUploading(true);
    setUploadErr('');
    try {
      const form = new FormData();
      form.append('noteId', String(selectedId));
      form.append('file', file, file.name || 'pasted-image.png');
      const res = await fetch('/api/notebook/attachments', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setAttachments((as) => as.concat([data.attachment]));
      return data.attachment.url;
    } catch (e) {
      setUploadErr(String(e.message || e));
      return null;
    } finally {
      setUploading(false);
    }
  }

  function askRemoveAttachment(a) {
    setConfirm({
      title: 'Remove “' + a.filename + '”?',
      message: 'It is taken off this page and deleted. This cannot be undone.',
      confirmLabel: 'Remove file',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const res = await fetch('/api/notebook/attachments?id=' + a.id, { method: 'DELETE' });
          if (!res.ok) throw new Error('bad status');
          setAttachments((as) => as.filter((x) => x.id !== a.id));
        } catch (e) {
          say('“' + a.filename + '” could not be removed. It is still attached.');
        }
      },
    });
  }

  // Drag-and-drop anywhere on the editor uploads to the open page.
  const dropHandlers = selected && !isSection ? {
    onDragEnter: (e) => { e.preventDefault(); if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { dragDepth.current++; setDragging(true); } },
    onDragOver: (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); uploadFiles(e.dataTransfer.files); },
  } : {};

  /* ------------------- Drag notes between sections --------------------- */

  // Whether the dragged note may land on this row: only sections receive
  // drops, never a note's own subtree (no cycles), never its current parent
  // (a no-op), and the result must stay within the depth cap.
  const canDropOn = React.useCallback((id, targetId) => {
    const drag = byId.get(id);
    const target = byId.get(targetId);
    if (!drag || !target || id === targetId) return false;
    if (!drag.parentId) return false;                            // root sections stay put
    if (target.parentId && !target.isSection) return false;      // pages aren't containers
    if (drag.parentId === target.id) return false;               // already there
    if (descendantIds(id).has(targetId)) return false;           // no cycles
    let depth = 0;
    for (let cur = byId.get(target.parentId); cur && depth < 12; cur = byId.get(cur.parentId)) depth++;
    // Height of the dragged subtree: longest parent chain inside it.
    let height = 0;
    const inTree = descendantIds(id);
    for (const x of notes) {
      if (!inTree.has(x.id)) continue;
      let d = 0;
      for (let cur = x; cur && cur.id !== id && d < 12; cur = byId.get(cur.parentId)) d++;
      if (d > height) height = d;
    }
    return depth + 1 + height <= MAX_DEPTH - 1;
  }, [byId, notes, descendantIds]);

  // Persist the move, reparent locally and open the target so the note is
  // visible in its new home. The same move is in the note's menu ("Move
  // to"), for a keyboard, a touch screen, or anybody who would rather not drag.
  async function moveNoteTo(id, parentId) {
    if (!canDropOn(id, parentId)) return;
    const n = byId.get(id);
    const to = byId.get(parentId);
    try {
      const res = await fetch('/api/notebook', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, parentId }),
      });
      if (!res.ok) throw new Error('bad status');
      const { note } = await res.json();
      // The row is drawn afresh under its new parent, and the old one - which
      // the keys may have been on - is gone: drawn at once, and focus follows.
      flushSync(() => {
        setNotes((ns) => ns.map((x) => (x.id === id ? { ...x, parentId: note.parentId } : x)));
        setExpanded((e) => ({ ...e, [parentId]: true }));
      });
      refocusTree(id);
      say('Moved “' + shownTitle(n && n.title) + '” to “' + shownTitle(to && to.title) + '”.');
    } catch (e) {
      say('“' + shownTitle(n && n.title) + '” could not be moved. It is where it was.');
    }
  }

  // Rename = select the note, then put the caret in the header title input.
  // Not after the save of the page being left: renaming does not need it in.
  function renameNote(id) {
    selectNote(id, { focus: false });
    setTimeout(() => { if (titleInput.current) { titleInput.current.focus(); titleInput.current.select(); } }, 0);
  }

  /**
   * Change what a page IS.
   *
   * A deliberate act, never an autosave and never something a folder does to
   * the pages inside it. The page's own writing is untouched: converting prose
   * into a card keeps the prose underneath, which is where the differences
   * from the standard process live.
   *
   * What the two kinds share is kept and the rest is dropped, by the server -
   * see setNoteKind in lib/notebook.js. So a card with values in it asks first
   * (askSetKind): that is a loss, and it is said before it happens.
   */
  async function setNoteKindApi(id, kind) {
    await flush({ force: true });
    try {
      const res = await fetch('/api/notebook', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, kind }),
      });
      if (!res.ok) throw new Error('bad status');
      const { note } = await res.json();
      saved.current.set(note.id, { title: note.title || '', body: note.body || '', fields: JSON.stringify(note.fields || {}) });
      setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, kind: note.kind, fields: note.fields || {}, status: note.status } : n)));
      setUploadErr('');
    } catch (e) {
      say('Could not change what this page is. Nothing was changed.');
    }
  }

  function askSetKind(id, kind) {
    const n = byId.get(id);
    if (!n) return;
    const from = String(n.kind || 'note');
    if (from === kind) return;
    if (!isTypedKind(from) || !hasValues(from, n.fields)) { setNoteKindApi(id, kind); return; }
    const label = noteKind(kind).label;
    setConfirm({
      title: 'Make “' + shownTitle(n.title) + '” ' + (/^[aeiou]/i.test(label) ? 'an ' : 'a ') + label + '?',
      message: 'Values that do not fit the new type are removed. The writing on the page is kept.',
      confirmLabel: 'Change type',
      icon: Icons.alertCircle,
      onConfirm: () => { setConfirm(null); setNoteKindApi(id, kind); },
    });
  }

  // Promote a note to a section (name-only container for sub-notes) or back.
  async function toggleSection(id, val) {
    const n = byId.get(id);
    try {
      const res = await fetch('/api/notebook', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isSection: val }),
      });
      if (!res.ok) throw new Error('bad status');
      const { note } = await res.json();
      setNotes((ns) => ns.map((x) => (x.id === id ? { ...x, isSection: !!note.isSection } : x)));
      if (val) setExpanded((e) => ({ ...e, [id]: true }));
    } catch (e) {
      say('“' + shownTitle(n && n.title) + '” could not be changed. Nothing was changed.');
    }
  }

  /* --------------------------- Backup ---------------------------------- */

  const importInput = React.useRef(null);

  async function reloadAll() {
    try {
      const res = await fetch('/api/notebook');
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      const list = Array.isArray(data.notes) ? data.notes : [];
      for (const n of list) if (!saved.current.has(n.id)) saved.current.set(n.id, { title: n.title || '', body: n.body || '' });
      setNotes(list);
      setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
    } catch (e) {
      say('The notes could not be reloaded. Reload the page to see the latest.');
    }
  }

  // Export: every note as a JSON file. Fetched rather than navigated to, so a
  // failure is said here instead of landing on a page of raw JSON.
  async function exportAll() {
    await flush({ force: true });
    try {
      const res = await fetch('/api/notebook/export');
      if (!res.ok) throw new Error('bad status');
      const blob = await res.blob();
      const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'notebook-backup.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      say('Downloaded ' + name + '.');
    } catch (e) {
      say('The notes could not be exported. Nothing was downloaded.');
    }
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (importInput.current) importInput.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (err) { data = null; }
      const count = data && Array.isArray(data.notes) ? data.notes.length : 0;
      if (!count) {
        setConfirm({ title: 'That is not a backup', message: '“' + file.name + '” has no notes in it, so nothing was imported. A backup is the .json file Export downloads.', confirmLabel: 'OK', tone: 'info', soleButton: true, onConfirm: () => setConfirm(null) });
        return;
      }
      setConfirm({
        title: 'Import ' + plural(count, 'note') + '?',
        message: 'From “' + file.name + '”. They are added alongside the notes already here. Nothing is overwritten.',
        confirmLabel: 'Import',
        tone: 'info',
        onConfirm: async () => {
          setConfirm(null);
          await runImport(data, count);
        },
      });
    };
    reader.readAsText(file);
  }

  /**
   * Post a backup and follow it, line by line, while it is restored.
   *
   * The route streams one JSON object per step (see /api/notebook/import). Two
   * of them change what is on screen rather than just the number: `ready` means
   * the pages are in and the tree can be reloaded - so the reader has their
   * notebook back before the indexing that follows it has finished - and
   * `error` is the failure, which arrives as a line because by then the
   * response has already started and cannot be a status code.
   */
  async function runImport(data, count) {
    setImporting({ phase: 'notes', done: 0, total: count });
    let failed = '';
    let reloaded = false;
    try {
      const res = await fetch('/api/notebook/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      await readProgress(res, (step) => {
        if (step.phase === 'ready') {
          // The notebook is usable now. Show it, and let the indexing that
          // follows run under a bar the reader is free to ignore.
          if (!reloaded) { reloaded = true; reloadAll(); }
          setImporting({ phase: 'indexing', done: 0, total: 0 });
          return;
        }
        if (step.phase === 'done') return;
        setImporting({ phase: step.phase, done: Number(step.done) || 0, total: Number(step.total) || 0 });
      });
    } catch (err) {
      failed = String(err.message || err);
    }
    if (!reloaded) await reloadAll();
    setImporting(null);
    if (failed) setConfirm({ title: 'The import did not finish', message: failed, confirmLabel: 'OK', tone: 'danger', icon: Icons.alertCircle, soleButton: true, onConfirm: () => setConfirm(null) });
  }

  /* ---------------------------- The note menu -------------------------- */

  // Right-click a row, or click the "..." on a row or in the page header:
  // one menu, opened at the pointer or under the button that asked for it.
  function openMenu(e, id, fromButton = false) {
    e.preventDefault();
    e.stopPropagation(); // keep the window-level close handler from eating the new menu
    // Where it would like to be, and where its bottom goes if there is no room
    // below. The menu measures itself against the window and does the rest.
    if (fromButton && e.currentTarget && e.currentTarget.getBoundingClientRect) {
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ id, x: r.right - 200, y: r.bottom + 6, flipY: r.top - 6 });
      return;
    }
    setMenu({ id, x: e.clientX, y: e.clientY, flipY: e.clientY });
  }
  // The same menu from the keyboard, under the row it is about.
  function openMenuAt(e, id, rect) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ id, x: rect.left + 28, y: rect.bottom + 4, flipY: rect.top - 4 });
  }

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  /* ------------------------- The tree's keys -------------------------- *
   * The WAI-ARIA tree: ↑ ↓ to move, → to open a folder (or go into it), ←
   * to close it (or go up to its parent), Home and End, Enter or Space to
   * open the page, F2 to rename, Delete to delete. ↑ from the first row
   * goes back to the search box, as ↓ from the box comes here.           */
  function focusRow(id) {
    if (id == null) return;
    setFocusId(id);
    const el = document.getElementById('nbk-ti-' + id);
    if (el) {
      el.focus({ preventScroll: true });
      if (el.firstElementChild) el.firstElementChild.scrollIntoView({ block: 'nearest' });
    }
  }
  // A row the keys were on, gone from under them - deleted, or drawn afresh
  // under a new parent by a move - drops focus to <body>, and a keyboard or a
  // screen reader loses its place. It goes back to the tree instead: to `id`'s
  // row, else to the tree's own stop. Only when it was lost: focus that is
  // somewhere else (the page's own menu, the writing) is left where it is.
  function refocusTree(id) {
    const a = document.activeElement;
    if (a && a !== document.body) return;
    if (id != null && document.getElementById('nbk-ti-' + id)) { focusRow(id); return; }
    const stop = treeBox.current && treeBox.current.querySelector('[role="treeitem"][tabindex="0"]');
    if (stop) stop.focus({ preventScroll: true });
  }
  function onTreeKey(e) {
    const item = e.target.closest && e.target.closest('[role="treeitem"]');
    if (!item || e.altKey || e.ctrlKey || e.metaKey) return;
    // Keys on the row itself (or on its name, after a click). The small
    // buttons inside a row keep theirs.
    if (e.target !== item && !(e.target.classList && e.target.classList.contains('nbk-row__btn'))) return;
    const id = Number(item.getAttribute('data-id'));
    const at = visible.findIndex((v) => v.id === id);
    if (at < 0) return;
    const row = visible[at];
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    switch (e.key) {
      case 'ArrowDown': stop(); if (visible[at + 1]) focusRow(visible[at + 1].id); break;
      case 'ArrowUp': stop(); if (at === 0) { if (searchInput.current) searchInput.current.focus(); } else focusRow(visible[at - 1].id); break;
      case 'Home': stop(); focusRow(visible[0].id); break;
      case 'End': stop(); focusRow(visible[visible.length - 1].id); break;
      case 'ArrowRight':
        stop();
        if (row.hasKids && !row.open) setExpanded((x) => ({ ...x, [id]: true }));
        else if (row.hasKids && visible[at + 1]) focusRow(visible[at + 1].id);
        break;
      case 'ArrowLeft':
        stop();
        if (row.hasKids && row.open && !q) setExpanded((x) => ({ ...x, [id]: false }));
        else if (row.parentId) focusRow(row.parentId);
        break;
      case 'Enter': case ' ': stop(); selectNote(id); break;
      case 'F2': stop(); renameNote(id); break;
      case 'Delete': stop(); askRemoveNote(id); break;
      default: break;
    }
  }

  const rowCtx = { selectedId, ancestors, expanded, setExpanded, q, childrenOf, treeMatch, attachments, selectNote, newNote, openMenu,
    dragId, setDragId, dropId, setDropId, canDropOn, moveNoteTo, tabId, setFocusId, openMenuAt };
  const sectionPages = isSection ? childrenOf(selected.id) : [];
  // The section's list is drawn only while a section is open: the glide
  // attaches to each one as it is.
  useGlide(pagesBox, pagesHl, '.nbk-prow', isSection && sectionPages.length ? selected.id : null);
  /* ---------------------------- Toolbar model -------------------------- */

  const toolbar = [
    { title: 'Undo (Ctrl+Z)', run: () => chain().undo().run(), icon: Icons.undo },
    { title: 'Redo (Ctrl+Y)', run: () => chain().redo().run(), icon: Icons.redo },
    null,
    { title: 'Heading 1', run: () => chain().toggleHeading({ level: 1 }).run(), icon: TIcons.h1, active: editor && editor.isActive('heading', { level: 1 }) },
    { title: 'Heading 2', run: () => chain().toggleHeading({ level: 2 }).run(), icon: TIcons.h2, active: editor && editor.isActive('heading', { level: 2 }) },
    { title: 'Heading 3', run: () => chain().toggleHeading({ level: 3 }).run(), icon: TIcons.h3, active: editor && editor.isActive('heading', { level: 3 }) },
    null,
    { title: 'Bold (Ctrl+B)', run: () => chain().toggleBold().run(), icon: TIcons.bold, active: editor && editor.isActive('bold') },
    { title: 'Italic (Ctrl+I)', run: () => chain().toggleItalic().run(), icon: TIcons.italic, active: editor && editor.isActive('italic') },
    { title: 'Strikethrough', run: () => chain().toggleStrike().run(), icon: TIcons.strike, active: editor && editor.isActive('strike') },
    { title: 'Inline code', run: () => chain().toggleCode().run(), icon: TIcons.code, active: editor && editor.isActive('code') },
    null,
    { title: 'Bulleted list', run: () => chain().toggleBulletList().run(), icon: TIcons.list, active: editor && editor.isActive('bulletList') },
    { title: 'Numbered list', run: () => chain().toggleOrderedList().run(), icon: TIcons.listOrdered, active: editor && editor.isActive('orderedList') },
    { title: 'Task list', run: () => chain().toggleTaskList().run(), icon: TIcons.listChecks, active: editor && editor.isActive('taskList') },
    null,
    { title: 'Decrease indent', run: () => chain().liftListItem(listKind()).run(), icon: TIcons.outdent },
    { title: 'Increase indent', run: () => chain().sinkListItem(listKind()).run(), icon: TIcons.indent },
    { title: 'Quote', run: () => chain().toggleBlockquote().run(), icon: TIcons.quote, active: editor && editor.isActive('blockquote') },
    { title: 'Divider', run: () => chain().setHorizontalRule().run(), icon: TIcons.divider },
    null,
    { title: 'Underline (Ctrl+U)', run: () => chain().toggleUnderline().run(), icon: TIcons.underline, active: editor && editor.isActive('underline') },
    { title: 'Highlight', run: () => chain().toggleHighlight().run(), icon: TIcons.highlighter, active: editor && editor.isActive('highlight') },
    ...TEXT_COLORS.map((c2) => ({
      title: c2.name + ' text',
      run: () => (colorActive(c2.hex) ? chain().unsetColor().run() : chain().setColor(c2.hex).run()),
      swatch: c2.hex,
      active: colorActive(c2.hex),
    })),
    // THE TABLE IS ONE BUTTON. Outside a table it puts one in; with the
    // caret in one it is on, and opens a menu of what can be done to the
    // table. The rows and columns used to be five more buttons, added to the
    // end of the strip as the caret went into a table: the centred strip slid
    // every button along under the pointer, and pushed the last ones off the
    // card. Now the strip is the same in a table as out of one.
    inTable
      ? { key: 'table', title: 'Table: rows and columns', icon: TIcons.table, active: true, popup: true, run: openTableMenu }
      : { key: 'table', title: 'Insert table', icon: TIcons.table, run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  ];
  const tbButtons = toolbar.filter(Boolean);
  const tbStop = Math.min(tbAt, tbButtons.length - 1);

  function openTableMenu(e) {
    e.stopPropagation(); // keep the window-level close handler from eating the new menu
    if (tableMenu) { setTableMenu(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setTableMenu({ x: r.right - 220, y: r.bottom + 6, flipY: r.top - 6 });
  }
  // A table action runs in the editor, which has the caret back.
  const tableAct = (fn) => { setTableMenu(null); fn(chain()).run(); };
  React.useEffect(() => {
    if (!tableMenu) return undefined;
    const close = () => setTableMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') setTableMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [tableMenu]);

  // ← → Home End along the strip, round at the ends; Tab goes on past it.
  function onToolbarKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const btns = Array.from(e.currentTarget.querySelectorAll('.nbk-tbtn'));
    const at = btns.indexOf(document.activeElement);
    if (at < 0) return;
    let next = null;
    if (e.key === 'ArrowRight') next = (at + 1) % btns.length;
    else if (e.key === 'ArrowLeft') next = (at - 1 + btns.length) % btns.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = btns.length - 1;
    if (next == null) return;
    e.preventDefault();
    btns[next].focus(); // its onFocus makes it the strip's stop
  }

  /* ------------------------------ Render ------------------------------- */

  const pageCount = notes.filter((n) => n.parentId && !n.isSection).length;
  const sectionCount = notes.length - pageCount;
  const fileCount = selected ? attachments.filter((a) => a.noteId === selected.id).length : 0;
  const ready = status === 'ready';
  const blank = ready && notes.length === 0;
  // What the title box says under it: empty (red), put back (plain), the same
  // as a neighbour's (amber) - one at a time, the most pressing first.
  const siblingTitles = selected
    ? notes.filter((n) => n.id !== selected.id && (n.parentId || null) === (selected.parentId || null)).map((n) => n.title || '')
    : [];
  const tcheck = selected ? checkTitle(selected.title || '', siblingTitles) : null;
  const parentName = ancestors.length ? shownTitle(ancestors[ancestors.length - 1].title) : '';
  let titleMsg = null;
  if (tcheck && tcheck.empty) {
    titleMsg = { tone: 'bad', icon: Icons.alertCircle, text: isSection
      ? 'A section needs a name - the list and the assistant’s answers go by it.'
      : 'A page needs a title - search, links and the assistant’s answers go by it.' };
  } else if (titleHint && selected && titleHint.id === selected.id) {
    titleMsg = { tone: 'hint', icon: Icons.infoCircle, text: titleHint.text };
  } else if (tcheck && tcheck.duplicate) {
    titleMsg = { tone: 'warn', icon: Icons.triangle, text: isSection
      ? 'Another section is already called this. A link by name cannot tell them apart.'
      : 'Another page in “' + parentName + '” is already called this. A link by name cannot tell them apart.' };
  }
  const titleMsgId = selected ? 'nbk-title-msg-' + selected.id : undefined;
  const recent = notes.filter((n) => n.parentId && !n.isSection)
    .slice().sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0)).slice(0, 6);

  // The head of the sheet: what this is and where it sits, then its name set
  // large - the title belongs to the text under it, so it scrolls with it.
  const docHead = selected ? (
    <div className="nbk-doc-head">
      <div className="nbk-kicker">
        <span>{isSection ? 'Section' : 'Page'}</span>
        {ancestors.length > 0 && (<><span className="nbk-kicker__dot" /><span>{'In ' + shownTitle(ancestors[ancestors.length - 1].title)}</span></>)}
        {isSection && (<><span className="nbk-kicker__dot" /><span>{plural(sectionPages.length, 'page')}</span></>)}
        {!isSection && fileCount > 0 && (<><span className="nbk-kicker__dot" /><span>{plural(fileCount, 'file')}</span></>)}
        {!isSection && <KindChip kind={selected.kind} draft={String(selected.status || 'live') === 'draft'} full />}
        {!isSection && <QuestionsChip questions={shownQs} onPick={pickQuestion} />}
      </div>
      {/* A textarea so a long title wraps rather than running off the sheet;
          a title is one line, so Enter goes on into the text instead. */}
      <textarea
        ref={titleInput}
        rows={1}
        className="nbk-doc-title"
        value={selected.title || ''}
        maxLength={TITLE_MAX}
        onChange={(e) => editSelected({ title: e.target.value.replace(/[\r\n]+/g, ' ') })}
        onBlur={onTitleBlur}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (!isSection && editor) editor.chain().focus('start').run();
        }}
        placeholder={isSection ? 'Section name' : 'Page title'}
        aria-label={isSection ? 'Section name' : 'Page title'}
        aria-invalid={tcheck && tcheck.empty ? 'true' : undefined}
        aria-describedby={titleMsg || tcheck.showCount ? titleMsgId : undefined}
        title="Click to rename"
      />
      {(titleMsg || tcheck.showCount) && (
        <div className="nbk-title-foot" id={titleMsgId}>
          {titleMsg ? (
            <p className={'nbk-title-msg is-' + titleMsg.tone} role={titleMsg.tone === 'bad' ? 'alert' : undefined}>
              <Svg w={15} sw={2.2}>{titleMsg.icon}</Svg><span>{titleMsg.text}</span>
            </p>
          ) : null}
          {tcheck.showCount && (
            <span className={'nbk-title-count' + (tcheck.long ? ' is-max' : '')}>
              {tcheck.length + ' / ' + TITLE_MAX}{tcheck.long ? ' - the limit' : ''}
            </span>
          )}
        </div>
      )}
      {isSection && (
        <p className="nbk-section__lede">
          Sections only have a name. They organise pages, and the assistant uses this grouping to navigate
          the notebook. Write the content in a page below.
        </p>
      )}
    </div>
  ) : null;

  const menuNote = menu ? byId.get(menu.id) : null;
  // Where the note in the menu can go: the sections a drag would be allowed onto.
  const moveTargets = menuNote && menuNote.parentId
    ? notes.filter((n) => (!n.parentId || n.isSection) && canDropOn(menuNote.id, n.id))
    : [];
  const nsName = newSec ? newSec.name.trim() : '';
  const nsPage = newSec ? newSec.page.trim() : '';
  const nsShowName = newSec && (newSec.tried || newSec.touched.name) && !nsName;
  const nsShowPage = newSec && (newSec.tried || newSec.touched.page) && !nsPage;
  const nsDupe = newSec && nsName && checkTitle(nsName, sectionTitles).duplicate;

  return (
    <MotionConfig reducedMotion="user">
    <div className="riva-page-fill nbk-shell">
      <NotebookStyles />
      {/* dangerouslySetInnerHTML: a plain text child is HTML-escaped on the
          server and not on the client, which is a hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <AppHeader subtitle="Practice notes" />

      {/* is-list only says anything on a phone (the 700px rules): the list
          card, not the page's. While the notes load at /notebook it is the
          list's skeleton that shows, so nothing is swapped when they come. */}
      <div className={'nbk-body' + (sideOpen ? '' : ' is-collapsed') + (phoneList || (status === 'loading' && atNotebook) ? ' is-list' : '') + (layoutReady ? ' is-ready' : '')}>
        {/* ------------------- The sections and pages, a card ------------------- */}
        <motion.aside id="nbk-side" className="nbk-sidebar" aria-label="Sections and pages"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
          <div className="nbk-sidebar__inner">
            <div className="nbk-sidebar__top">
              <div>
                <h1 className="nbk-h1">Practice <em>notes</em></h1>
                <p className="nbk-meta">
                  {ready
                    ? (blank ? 'Nothing written yet' : plural(sectionCount, 'section') + ' · ' + plural(pageCount, 'page'))
                    : status === 'error' ? 'Not loaded' : <span className="rv-skel" style={{ width: 130, height: 9 }} aria-hidden="true" />}
                </p>
              </div>
              {/* The Map (MapView, the treemap) is hidden: `view` stays 'pages'.
                  Its code is kept so it can come back as a tab. */}
              <div className="nbk-sidebar__row">
                <SearchField value={search} onChange={setSearch} placeholder="Search notes" label="Search the notes"
                  inputRef={searchInput} disabled={!ready || blank}
                  onEnter={() => { if (hits[0]) selectNote(hits[0].note.id); }}
                  onArrowDown={() => { if (visible.length) focusRow(visible[0].id); }} />
                <Button variant="primary" icon={Icons.plus} className="nbk-new" onClick={() => newNote(null)} disabled={!ready}
                  title="New section, with its first page">New</Button>
              </div>
              <span className="rv-sr" role="status">
                {q && ready ? (hits.length ? plural(hits.length, 'page') + ' match' : 'No page matches') : status === 'loading' ? 'Loading the notes' : ''}
              </span>
            </div>

            <div className="nbk-tree nbk-scroll">
              <div className="nbk-tree__inner" ref={treeBox}>
                <span className="nbk-tree__hl" ref={treeHl} aria-hidden="true" />
                {ready && sections.length > 0 && (
                  <div className="nbk-label nbk-tree__label" aria-hidden="true">
                    <span>{q ? plural(hits.length, 'page') + ' found' : 'Sections'}</span>
                  </div>
                )}
                {status === 'loading' && <SkeletonRows rows={7} indent />}
                {status === 'error' && <p className="nbk-tree__note">Nothing to list until the notes load.</p>}
                {ready && blank && <p className="nbk-tree__note">No sections yet. Start one with New.</p>}
                {ready && !blank && q && sections.length === 0 && (
                  <State compact icon={NBIcons.searchX} title={'No page matches “' + search.trim() + '”.'}
                    text="Try fewer words, or a word from the page itself.">
                    <Button size="sm" onClick={() => { setSearch(''); if (searchInput.current) searchInput.current.focus(); }}>Clear search</Button>
                  </State>
                )}
                {sections.length > 0 && (
                  <div role="tree" aria-label="Sections and pages" onKeyDown={onTreeKey}
                    style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {sections.map((n) => <SideRow key={n.id} n={n} depth={0} ctx={rowCtx} />)}
                  </div>
                )}
              </div>
            </div>

            <div className="nbk-sidebar__foot">
              <p className="nbk-foot-note"><Svg w={14} sw={2.2}>{Icons.sparkle}</Svg>Notes are used by the assistant automatically.</p>
              {/* Backup: export downloads every note as JSON; import restores it
                  alongside what is here. Saves is the whole notebook at a moment. */}
              <input ref={importInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onImportFile} />
              <div className="nbk-foot-row">
                <Button size="sm" icon={NBIcons.download} onClick={exportAll} disabled={!ready || blank}
                  title="Download all notes as a JSON backup">Export</Button>
                <Button size="sm" icon={NBIcons.upload} onClick={() => importInput.current && importInput.current.click()} disabled={!ready}
                  title="Restore notes from a JSON backup (added alongside existing notes)">Import</Button>
                <NextLink href={SAVES_HREF} className="rv-btn rv-btn--quiet rv-btn--sm" onClick={() => { flush({ force: true }); }}
                  title="Saves of the whole notebook - take one, or roll back to one">
                  <Svg w={14} sw={2.2}>{Icons.undo}</Svg>Saves
                </NextLink>
              </div>
            </div>
          </div>
        </motion.aside>

        {/* -------------------------- The page, a card ------------------------- */}
        <motion.main className="nbk-main" {...dropHandlers}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.07, ease: EASE }}>
          <div className="nbk-head">
            <div className="nbk-head__left">
              {/* Only where there is a list to go back to: loading, failed or
                  empty, the state in this card is the whole story. */}
              {ready && !blank && (
                <button ref={backRef} type="button" className="nbk-back" onClick={showList}>
                  <Svg w={16} sw={2.2}>{Icons.arrowLeft}</Svg>All notes
                </button>
              )}
              <IconButton icon={NBIcons.sidebar} on={sideOpen} className="nbk-side-toggle" aria-expanded={sideOpen} aria-controls="nbk-side"
                label={sideOpen ? 'Hide sections and pages' : 'Show sections and pages'} onClick={toggleSide} />
              {view === 'map' ? (
                <>
                  <span className="nbk-crumb nbk-crumb--here">Map</span>
                  <span className="nbk-map-lede">Every page, and whether the assistant can read it</span>
                </>
              ) : (
                <nav className="nbk-head__crumbs" aria-label="Where this page is">
                  {selected ? (
                    <>
                      {ancestors.map((a) => (
                        <React.Fragment key={a.id}>
                          <button type="button" className="nbk-crumb" onClick={() => selectNote(a.id)}>{shownTitle(a.title)}</button>
                          <span className="nbk-crumb-sep" aria-hidden="true"><Svg w={13} sw={2.2}>{Icons.chevronRight}</Svg></span>
                        </React.Fragment>
                      ))}
                      <span className="nbk-crumb nbk-crumb--here" aria-current="page">{shownTitle(selected.title)}</span>
                    </>
                  ) : (
                    <span className="nbk-crumb nbk-crumb--here">Practice notes</span>
                  )}
                </nav>
              )}
            </div>

            {view !== 'map' && (
              <div className="nbk-head__actions">
                {selected && <StatusPill state={saveState} at={selected.updatedAt} onRetry={() => flush({ force: true })} />}
                {selected && canOrganize(selected) && (
                  <Button variant="secondary" size="sm" icon={Icons.sitemap} onClick={() => runAiOrganize()}
                    disabled={!!aiOrg && (aiOrg.status === 'loading' || aiOrg.status === 'applying')}
                    title="AI organise: move every page's content in this section to the section it belongs in (you review the plan first)">
                    AI organise
                  </Button>
                )}
                {selected && !isSection && (
                  <>
                    <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={(e) => uploadFiles(e.target.files)} />
                    <IconButton icon={Icons.paperclip} label="Attach files" disabled={uploading}
                      onClick={() => fileInput.current && fileInput.current.click()} />
                  </>
                )}
                {selected && (
                  <IconButton icon={copied ? Icons.check : Icons.copy} label={copied ? 'Link copied' : 'Copy link to this page'} onClick={() => copyLink(selected.id)} />
                )}
                {selected && (
                  <IconButton icon={NBIcons.dots} label="More actions" aria-haspopup="menu" aria-expanded={!!menu && menu.id === selected.id}
                    onClick={(e) => openMenu(e, selected.id, true)} />
                )}
              </div>
            )}
          </div>

          {view === 'map' && (
            <MapView notes={notes} onOpenPage={(id) => { setView('pages'); selectNote(id); }} onChanged={reloadAll} />
          )}

          {view !== 'map' && (<>
            {/* Nothing open: why, in the middle of the card - still loading,
                could not load, nothing written, or simply nothing picked. */}
            {!selected && status === 'loading' && (
              <div className="nbk-docskel" aria-hidden="true">
                <span className="rv-skel" style={{ width: 140, height: 10 }} />
                <span className="rv-skel" style={{ width: '58%', height: 26, marginTop: 16, borderRadius: 9 }} />
                {['92%', '84%', '88%', '64%'].map((w, i) => <span key={i} className="rv-skel" style={{ width: w, marginTop: i ? 14 : 30 }} />)}
              </div>
            )}
            {!selected && status === 'error' && (
              <div className="nbk-void">
                <State icon={Icons.alertCircle} title="The notes could not be loaded."
                  text="Reload the page in a moment. Nothing in the notebook has been changed.">
                  <Button variant="primary" icon={Icons.refresh} onClick={() => window.location.reload()}>Reload</Button>
                  <NextLink href="/ask" className="rv-btn rv-btn--quiet"><Svg w={15} sw={2.2}>{Icons.chat}</Svg>Ask a question</NextLink>
                </State>
              </div>
            )}
            {!selected && blank && (
              <div className="nbk-void">
                <State icon={Icons.folder} title="Nothing written yet."
                  text="Sections hold pages, and every page is something the assistant answers from. Start with a section such as “Reception”.">
                  <Button variant="primary" icon={Icons.plus} onClick={askNewSection}>New section</Button>
                  <Button icon={NBIcons.upload} onClick={() => importInput.current && importInput.current.click()}>Import a backup</Button>
                </State>
              </div>
            )}
            {!selected && ready && !blank && (
              <div className="nbk-void">
                <State icon={Icons.fileLines} title="Pick a page to read or edit."
                  text={recent.length ? 'From the list, or one of the pages edited last:' : 'From the list, or start a new section.'} />
                {recent.length > 0 && (
                  <div className="nbk-pages">
                    <div className="nbk-pages__list">
                      {recent.map((p, i) => (
                        <PageRow key={p.id} p={p} sub={'In ' + shownTitle((byId.get(p.parentId) || {}).title)}
                          delay={0.1 + Math.min(i, 8) * 0.03} onOpen={() => selectNote(p.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Section view - name only; content lives in the pages beneath it,
                listed as rows. */}
            {selected && isSection && (
              <div className="nbk-section nbk-scroll" key={'sec' + selected.id}>
                {docHead}
                {sectionPages.length === 0 ? (
                  <State icon={Icons.fileLines} title="Nothing in this section yet."
                    text="Pages hold the writing. Add the first one, named for the question it answers.">
                    <Button variant="primary" icon={Icons.plus} onClick={() => newNote(selected.id)}>New page</Button>
                  </State>
                ) : (
                  <div className="nbk-pages">
                    <div className="nbk-pages__list" ref={pagesBox}>
                      <span className="nbk-glide" ref={pagesHl} aria-hidden="true" />
                      {sectionPages.map((p, i) => (
                        <PageRow key={p.id} p={p} delay={Math.min(i, 10) * 0.03} onOpen={() => selectNote(p.id)} />
                      ))}
                      <button type="button" className="nbk-prow nbk-prow--add" onClick={() => newNote(selected.id)}>
                        <span className="nbk-prow__icon" aria-hidden="true"><Svg w={18} sw={2.2}>{Icons.plus}</Svg></span>
                        <span className="nbk-prow__text">New page</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Page view - one strip of formatting over the sheet, and the
                title heads the text it names; files dock underneath. */}
            {selected && !isSection && (
              <>
                <div className="nbk-tools">
                  <div className="nbk-toolbar nbk-hide-scroll" role="toolbar" aria-label="Formatting"
                    onMouseDown={(e) => e.preventDefault() /* keep the editor selection */}
                    onKeyDown={onToolbarKey}>
                    {toolbar.map((btn, i) => {
                      if (btn === null) return <span key={'sep' + i} className="nbk-tsep" aria-hidden="true" />;
                      const at = tbButtons.indexOf(btn);
                      return (
                        <button key={btn.key || btn.title} type="button" aria-label={btn.title} title={btn.title} data-tb={btn.key}
                          tabIndex={at === tbStop ? 0 : -1} onFocus={() => setTbAt(at)}
                          aria-pressed={btn.active && !btn.popup ? true : undefined}
                          aria-haspopup={btn.popup ? 'menu' : undefined} aria-expanded={btn.popup ? !!tableMenu : undefined}
                          onClick={(e) => { if (!editor) return; btn.run(e); }}
                          className={'nbk-tbtn' + (btn.active ? ' nbk-tbtn--on' : '')}>
                          {btn.swatch
                            ? <span className="nbk-swatch" style={{ background: btn.swatch, boxShadow: '0 0 0 1px ' + (btn.active ? T.blue : T.line) }} />
                            : <Svg w={16} sw={2}>{btn.icon}</Svg>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Format with AI floats in the page's bottom-right corner:
                    always to hand, out of the way of the writing and the files. */}
                {/* THE CARD, ABOVE THE WRITING. The recorded values are what
                    the reader came for and what the assistant answers from;
                    the prose underneath is what is different about this one.
                    Both are saved the same way, by the same autosave, and sit
                    in the one scrolling sheet under the page's title. */}
                <div className="nbk-editor-wrap">
                  <PageEditor
                    key={selected.id}
                    initialBody={selected.body || ''}
                    onChange={(md) => editSelected({ body: md })}
                    onReady={setEditor}
                    uploadImage={uploadInlineImage}
                    header={(
                      <>
                        {docHead}
                        {isTypedKind(selected.kind) && (
                          <>
                            {selectedIssues.length > 0 && (
                              <div className="nbk-card-banner">
                                <Banner tone="warn" icon={Icons.alertCircle}>
                                  <strong>Not finished, so the assistant does not draw this card yet.</strong>{' '}
                                  {selectedIssues.map((i) => i.message).join(' ')}
                                </Banner>
                              </div>
                            )}
                            <div className="nbk-card-wrap">
                              {/* NOT NORMALISED ON EVERY KEYSTROKE. normaliseFields
                                  drops empty values, which is right for what is stored
                                  and wrong for what is being typed: an empty row added
                                  to a list was deleted before anybody could type into
                                  it. The server coerces on save (updateNote), which is
                                  the one place it has to be true. */}
                              <CardEditor kind={selected.kind} fields={selectedFields} issues={selectedIssues}
                                onChange={(next) => editSelected({ fields: next })} />
                            </div>
                            <div className="nbk-card__prose"><span>Differences from the standard process, and anything else worth saying</span></div>
                          </>
                        )}
                        {/* A PAGE THAT LOOKS LIKE A CARD. A deterministic check on
                            the words the practice already writes - no model, no
                            tokens - offering the conversion. It never converts
                            anything on its own. */}
                        {!isTypedKind(selected.kind) && suggested && (
                          <div className="nbk-card-banner">
                            <Banner tone="info" icon={Icons.sparkle}
                              actions={<Button variant="primary" size="sm" onClick={() => setNoteKindApi(selected.id, suggested)}>
                                Convert
                              </Button>}>
                              This page reads like {noteKind(suggested).label === 'e-RS referral' ? 'an' : 'a'}{' '}
                              <strong>{noteKind(suggested).label}</strong>. Converting it puts the values in their own
                              boxes and keeps everything written here underneath.
                            </Banner>
                          </div>
                        )}
                      </>
                    )}
                  />
                  <button type="button" className={'nbk-ai-fab' + (aiFmt && aiFmt.status === 'loading' ? ' nbk-ai-fab--busy' : '')}
                    onClick={startAiFormat}
                    onMouseDown={(e) => e.preventDefault() /* keep the editor selection */}
                    aria-label="Format with AI"
                    title="Format with AI: restructure this page into headings, lists, tables and highlights (you review the changes first)">
                    <Svg w={20} sw={1.9}>{TIcons.ai}</Svg>
                  </button>
                  <QuestionLayer editor={editor} noteId={selected.id} rows={qRows} setRows={setQRows}
                    open={qOpen} setOpen={setQOpen} jumpTo={jumpQ} onJumped={() => setJumpQ(null)} />
                </div>

                {(selectedFiles.length > 0 || uploadErr || uploading) && (
                  <div className="nbk-dock">
                    {selectedFiles.length > 0 && <span className="nbk-label nbk-dock__label">Files</span>}
                    {selectedFiles.map((a) => (
                      <span key={a.id} className="nbk-attach">
                        <Svg w={14} sw={2} style={{ flex: 'none' }}>{(a.contentType || '').startsWith('image/') ? Icons.image : Icons.file}</Svg>
                        <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.filename + (a.size ? ' - ' + fmtSize(a.size) : '')}>
                          {a.filename}
                        </a>
                        <IconButton size="sm" tone="danger" icon={Icons.close} label={'Remove ' + a.filename}
                          onClick={() => askRemoveAttachment(a)} />
                      </span>
                    ))}
                    {uploading && <span className="nbk-dock__busy" role="status"><Spinner w={13} />Uploading…</span>}
                    {uploadErr && (
                      <div className="nbk-dock__err">
                        <div className="rv-alert" role="alert">
                          <Svg w={15} sw={2.2} style={{ flex: 'none', marginTop: '2px' }}>{Icons.alertCircle}</Svg>
                          <span style={{ flex: 1, minWidth: 0 }}>{uploadErr}</span>
                        </div>
                        <IconButton size="sm" icon={Icons.close} label="Dismiss" onClick={() => setUploadErr('')} />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Drop overlay */}
            {dragging && selected && !isSection && (
              <div className="nbk-dropzone">
                <Svg w={28} sw={1.8}>{Icons.paperclip}</Svg>
                Drop files to attach to &ldquo;{shownTitle(selected.title)}&rdquo;
              </div>
            )}
          </>)}
        </motion.main>
      </div>
      {/* ---------------------------- The note menu --------------------------- */}
      {menu && menuNote && (
        <Menu x={menu.x} y={menu.y} flipY={menu.flipY} width={200} label={'Actions for ' + shownTitle(menuNote.title)}
          onClose={() => setMenu(null)}>
          {/* One line per action; the lists of kinds and of places sit behind
              a submenu each, so they are never on screen twice. The kind is
              still chosen at the moment a page is made - "Add page" asks
              which - and a page's kind can be changed under "Type", which
              keeps its writing and re-coerces its values. A section has no
              kind: it is a name-only container, so it gets no "Type". */}
          <MenuSub icon={Icons.plus} label="Add page">
            {CREATABLE_KINDS.map((k) => (
              <MenuChoice key={k.id} colour={k.colour} hollow={k.id === 'note'}
                onClick={() => { setMenu(null); newNote(menu.id, k.id); }}>
                {k.label}
              </MenuChoice>
            ))}
          </MenuSub>
          <MenuItem icon={Icons.edit} onClick={() => { setMenu(null); renameNote(menu.id); }}>Rename</MenuItem>
          <MenuItem icon={Icons.copy} onClick={() => { setMenu(null); copyLink(menu.id); }}>Copy link to page</MenuItem>
          {menuNote.parentId && !menuNote.isSection ? (
            <MenuSub icon={Icons.fileLines} label="Type"
              hint={(CREATABLE_KINDS.find((k) => k.id === String(menuNote.kind || 'note')) || {}).label}>
              {CREATABLE_KINDS.map((k) => (
                <MenuChoice key={k.id} colour={k.colour} hollow={k.id === 'note'}
                  selected={String(menuNote.kind || 'note') === k.id}
                  onClick={() => { setMenu(null); askSetKind(menu.id, k.id); }}>
                  {k.label}
                </MenuChoice>
              ))}
            </MenuSub>
          ) : null}
          {moveTargets.length > 0 ? (
            <MenuSub icon={Icons.arrow} label="Move to">
              {moveTargets.map((t) => (
                <MenuItem key={t.id} icon={Icons.folder} onClick={() => { setMenu(null); moveNoteTo(menu.id, t.id); }}>
                  {shownTitle(t.title)}
                </MenuItem>
              ))}
            </MenuSub>
          ) : null}
          {menuNote.parentId ? (
            <MenuItem icon={menuNote.isSection ? Icons.fileLines : Icons.folder}
              onClick={() => { setMenu(null); toggleSection(menu.id, !menuNote.isSection); }}>
              {menuNote.isSection ? 'Make a page' : 'Make a section'}
            </MenuItem>
          ) : null}
          {canOrganize(menuNote) && (
            <MenuItem icon={Icons.sitemap} tone="accent" onClick={() => { setMenu(null); runAiOrganize(menu.id); }}>AI organise</MenuItem>
          )}

          <MenuSeparator />
          <MenuItem icon={Icons.trash} tone="danger" onClick={() => { setMenu(null); askRemoveNote(menu.id); }}>Delete…</MenuItem>
        </Menu>
      )}

      {/* ------------------------- The table's actions ------------------------ */}
      {tableMenu && inTable && (
        <Menu x={tableMenu.x} y={tableMenu.y} flipY={tableMenu.flipY} width={220} label="Table" onClose={() => setTableMenu(null)}>
          <MenuItem icon={Icons.plus} onClick={() => tableAct((c) => c.addRowAfter())}>Add a row below</MenuItem>
          <MenuItem icon={Icons.plus} onClick={() => tableAct((c) => c.addColumnAfter())}>Add a column to the right</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Icons.close} onClick={() => tableAct((c) => c.deleteRow())}>Delete this row</MenuItem>
          <MenuItem icon={Icons.close} onClick={() => tableAct((c) => c.deleteColumn())}>Delete this column</MenuItem>
          <MenuItem icon={Icons.trash} tone="danger" onClick={() => tableAct((c) => c.deleteTable())}>Delete the table</MenuItem>
        </Menu>
      )}

      {/* --------------------------- A new section --------------------------- */}
      {newSec && (
        <Modal size="sm" title="New section" subtitle="A section groups pages. It starts with one page to write in."
          onClose={() => { if (!newSec.busy) setNewSec(null); }}
          footer={<>
            <Button variant="ghost" onClick={() => setNewSec(null)} disabled={newSec.busy}>Cancel</Button>
            <Button variant="primary" type="submit" form="nbk-newsec" loading={newSec.busy} disabled={newSec.busy}>
              {newSec.busy ? 'Creating…' : 'Create section'}
            </Button>
          </>}>
          <form id="nbk-newsec" className="nbk-form" onSubmit={createSection} noValidate>
            <div>
              <label className="ap-label" htmlFor="nbk-ns-name">Section name</label>
              <input ref={nameInput} id="nbk-ns-name" className="ap-field" data-autofocus="" value={newSec.name} maxLength={TITLE_MAX}
                placeholder="For example “Reception”" autoComplete="off"
                aria-invalid={nsShowName ? 'true' : undefined}
                aria-describedby={nsShowName || nsDupe ? 'nbk-ns-name-msg' : undefined}
                onChange={(e) => { const v = e.target.value.replace(/[\r\n]+/g, ' '); setNewSec((s) => ({ ...s, name: v })); }}
                onBlur={(e) => leftField(e, 'name')} />
              {nsShowName ? (
                <p className="rv-err" id="nbk-ns-name-msg"><Svg w={14} sw={2.2} style={{ flex: 'none', marginTop: '1px' }}>{Icons.alertCircle}</Svg>Give the section a name.</p>
              ) : nsDupe ? (
                <p className="rv-hint is-warn" id="nbk-ns-name-msg">There is already a section called “{nsName}”. Its pages might belong there instead.</p>
              ) : null}
            </div>
            <div>
              <label className="ap-label" htmlFor="nbk-ns-page">First page</label>
              <input ref={pageInput} id="nbk-ns-page" className="ap-field" value={newSec.page} maxLength={TITLE_MAX}
                placeholder="For example “How to book appointments”" autoComplete="off"
                aria-invalid={nsShowPage ? 'true' : undefined}
                aria-describedby={'nbk-ns-page-msg'}
                onChange={(e) => { const v = e.target.value.replace(/[\r\n]+/g, ' '); setNewSec((s) => ({ ...s, page: v })); }}
                onBlur={(e) => leftField(e, 'page')} />
              {nsShowPage ? (
                <p className="rv-err" id="nbk-ns-page-msg"><Svg w={14} sw={2.2} style={{ flex: 'none', marginTop: '1px' }}>{Icons.alertCircle}</Svg>Give its first page a title.</p>
              ) : (
                <p className="rv-hint" id="nbk-ns-page-msg">Name it for the question it answers - that is what search and the assistant go by.</p>
              )}
            </div>
            {newSec.error && <div className="rv-alert" role="alert">{newSec.error}</div>}
          </form>
        </Modal>
      )}

      {/* --------------------------- AI format review -------------------------- */}
      {aiFmt && aiFmt.status === 'loading' && (
        <Modal size="sm" title="Reformatting the page" dismissable={false} center
          subtitle="Restructuring it into headings, lists, tables and highlights. Nothing is saved until you have read it.">
          <div className="nbk-fmt" aria-hidden="true">
            <span className="nbk-fmt__h" />
            {['92%', '74%', '84%'].map((w, i) => (
              <div key={i} className="nbk-fmt__li" style={{ '--i': i }}>
                <span className="nbk-fmt__dot" />
                <span className="nbk-fmt__line" style={{ '--w': w }} />
              </div>
            ))}
            <div className="nbk-fmt__tbl">{Array.from({ length: 6 }, (_, i) => <span key={i} className={i < 3 ? 'nbk-fmt__th' : 'nbk-fmt__td'} />)}</div>
            <span className="nbk-fmt__scan" />
          </div>
          <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0 0 12px', fontSize: '13.5px', color: T.mut }}>
            <Spinner w={13} />Formatting…
          </div>
        </Modal>
      )}
      {aiFmt && aiFmt.status === 'options' && (
        <Modal size="sm" title="Format with AI" onClose={() => setAiFmt(null)}
          subtitle="Restructure this page into headings, lists, tables and highlights. You review the changes first."
          footer={<>
            <Button variant="ghost" onClick={() => setAiFmt(null)}>Cancel</Button>
            <Button variant="primary" icon={TIcons.ai} onClick={() => runAiFormat(aiFmt.include)}>Format</Button>
          </>}>
          <label className="nbk-qopt">
            <input type="checkbox" checked={aiFmt.include} onChange={(e) => setAiFmt({ ...aiFmt, include: e.target.checked })} />
            <span>
              <strong>Include question data</strong>
              {' - write the answer' + (answeredOnPage.length === 1 ? '' : 's') + ' to '
                + (answeredOnPage.length === 1 ? 'the answered question' : 'the ' + answeredOnPage.length + ' answered questions') + ' into the page.'}
              <small>Each answer becomes part of the page where it belongs, and its highlight comes off. Open questions keep theirs either way.</small>
            </span>
          </label>
        </Modal>
      )}
      {aiFmt && aiFmt.status === 'error' && (
        <Modal size="sm" title="Could not reformat" onClose={() => setAiFmt(null)} center
          footer={<Button variant="primary" onClick={() => setAiFmt(null)}>Close</Button>}>
          <p style={{ margin: 0 }}>{aiFmt.message}</p>
        </Modal>
      )}
      {aiFmt && aiFmt.status === 'ready' && (
        <Modal size="lg" title="Proposed reformat"
          subtitle={'Headings, lists, tables and highlights. Every fact is kept, and nothing is saved until you apply.'
            + (aiFmt.written && aiFmt.written.length
              ? ' ' + aiFmt.written.length + (aiFmt.written.length === 1 ? ' answer is' : ' answers are') + ' written in, and ' + (aiFmt.written.length === 1 ? 'its highlight comes' : 'their highlights come') + ' off.'
              : '')
            + (aiFmt.lost && aiFmt.lost.length
              ? ' ' + aiFmt.lost.length + (aiFmt.lost.length === 1 ? ' question highlight was' : ' question highlights were') + ' lost in the rewrite; the questions stay on the page\'s list.'
              : '')}
          onClose={() => setAiFmt(null)} flush
          footer={<>
            <Button variant="ghost" onClick={() => setAiFmt(null)}>Cancel</Button>
            <Button variant="success" icon={Icons.check} onClick={applyAiFormat}>Apply changes</Button>
          </>}>
          <div className="nbk-diff" style={{ padding: '12px 0' }}>
            {aiFmt.diff.map((l, i) => (
              <div key={i} className={'nbk-diff__line' + (l.t === '-' ? ' nbk-diff__line--del' : l.t === '+' ? ' nbk-diff__line--add' : '')}>
                <span className="nbk-diff__gutter">{l.t === ' ' ? '' : l.t}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{l.s || ' '}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* --------------------------- AI organise plan -------------------------- */}
      {aiOrg && (aiOrg.status === 'loading' || aiOrg.status === 'applying') && (
        <Modal size="sm" dismissable={false} center
          title={aiOrg.status === 'loading' ? 'Reading this section' : 'Moving the content'}
          subtitle={aiOrg.status === 'loading'
            ? 'Every page in it is read and each part is matched to the section it belongs in.'
            : 'Putting each part where the plan says, and moving its files with it.'}>
          <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '4px 0 12px', color: T.mut }}>
            <Spinner />Working…
          </div>
        </Modal>
      )}
      {aiOrg && aiOrg.status === 'error' && (
        <Modal size="sm" title="Could not organise" onClose={() => setAiOrg(null)} center
          footer={<Button variant="primary" onClick={() => setAiOrg(null)}>Close</Button>}>
          <p style={{ margin: 0 }}>{aiOrg.message}</p>
        </Modal>
      )}
      {aiOrg && aiOrg.status === 'done' && (
        <Modal size="sm" title="Organised" onClose={() => setAiOrg(null)} center
          footer={<Button variant="primary" onClick={() => setAiOrg(null)}>Done</Button>}>
          <p style={{ margin: 0 }}>
            {'Moved the content of ' + plural(aiOrg.applied.moved || 0, 'page')
              + ((aiOrg.applied.newSections || 0) ? ', created ' + plural(aiOrg.applied.newSections, 'section') : '')
              + ((aiOrg.applied.newPages || 0) ? ', created ' + plural(aiOrg.applied.newPages, 'page') : '')
              + ((aiOrg.applied.removed || 0) ? ', removed ' + plural(aiOrg.applied.removed, 'emptied page') : '') + '.'}
          </p>
        </Modal>
      )}
      {aiOrg && aiOrg.status === 'ready' && (
        <Modal size="lg" title="Where each page's content will go"
          subtitle="Every fact is kept; emptied pages are removed and their files move with the content. Nothing changes until you apply."
          onClose={() => setAiOrg(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setAiOrg(null)}>Cancel</Button>
            <Button variant="success" icon={Icons.check} onClick={applyAiOrganize}>Apply plan</Button>
          </>}>
          <div>
            {aiOrg.plan.allocations.map((a) => (
              <div key={a.noteId} className="nbk-plan__note">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14.5px', fontWeight: 650, color: T.ink }}>
                  <Svg w={15} sw={2} style={{ flex: 'none', color: T.dim }}>{Icons.fileLines}</Svg>
                  {shownTitle(a.noteTitle)}
                </div>
                {a.parts.map((p, i) => (
                  <div key={i} className="nbk-plan__part">
                    <Svg w={14} sw={2.2} style={{ flex: 'none', marginTop: '3px', color: T.blue }}>{Icons.arrow}</Svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: T.navy }}>
                        {p.section}{p.isNewSection ? ' (new section)' : ''}
                        <span style={{ color: T.mut, margin: '0 6px' }}>/</span>
                        {p.page || shownTitle(a.noteTitle)}{p.isNewPage ? ' (new page)' : ''}
                      </div>
                      {/* A title that names a container rather than a question.
                          Said here because renaming it now costs nothing, and
                          renaming it after the page has grown for six months
                          costs a morning. */}
                      {p.isVagueTitle && (
                        <div style={{ marginTop: '4px', fontSize: '12.5px', fontWeight: 600, color: '#8a5a08' }}>
                          Vague title - rename it to the question staff would ask, or search will never pick it precisely
                        </div>
                      )}
                      <div style={{ marginTop: '4px', fontSize: '13px', lineHeight: 1.55, color: T.mut, overflow: 'hidden',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {p.markdown.replace(/<[^>]+>/g, '').replace(/[#*>`|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* An import in progress. A modal rather than a corner toast: restoring a
          backup rewrites what is on the left of the screen, and clicking about
          in the tree while that happens is how a second import gets started. */}
      {importing && (
        <ProgressModal title="Restoring the notebook" message={phaseLabel(importing.phase)}
          done={Math.min(Number(importing.done) || 0, Number(importing.total) || Infinity)}
          total={Number(importing.total) || 0}
          unit={importing.phase === 'attachments' ? 'files' : 'pages'}
          footnote={importing.phase === 'indexing'
            ? 'Your pages are already back and the assistant can read them. This last step files them for the knowledge tools.'
            : null} />
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel}
          tone={confirm.tone || 'danger'} icon={confirm.icon} soleButton={confirm.soleButton} onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)} />
      )}

      {toast && <Toast key={toast.at} onClose={() => setToast(null)}>{toast.text}</Toast>}
    </div>
    </MotionConfig>
  );
}
