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
 * THE LIST IS THE PAGE. Asking is a button that opens a box, not a form
 * that is always there; each question is one quiet row, with its answer
 * under it and its actions on hover.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { gapReason } from '../../lib/questions/gaps.mjs';
import { machineCode } from '../../lib/audit/machine';
import { notebookHref } from '../../lib/notebook/links.mjs';
import { lineDiff } from '../../lib/notebook/diff.mjs';
import { stripQuestionMarks } from '../../lib/notebook/questions.mjs';

const STATUS = [
  { id: 'open', label: 'Open', match: (r) => r.status === 'open' },
  { id: 'answered', label: 'Answered', match: (r) => r.status === 'answered' },
  { id: 'all', label: 'All', match: () => true },
];

const SOURCES = [
  { id: '', label: 'Every source' },
  { id: 'asked', label: 'Asked by staff' },
  { id: 'notebook', label: 'On Notebook pages' },
  { id: 'assistant', label: 'The assistant could not answer' },
];

// Lucide "sparkles", the mark the Notebook's Format with AI button uses, so
// the AI actions in the app read as the same kind of thing.
const AI_ICON = (<><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></>);
const DOTS = (<><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>);

const CSS = `
.rq{flex:1;width:100%;max-width:760px;margin:0 auto;padding:40px 20px 72px;color:#212b32;}
.rq-head{display:flex;align-items:flex-end;gap:16px;margin:0 0 22px;}
.rq-head__text{flex:1;min-width:0;}
.rq-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.15;}
.rq-head p{margin:5px 0 0;font-size:15px;color:#4c6272;}
.rq-head__actions{flex:none;display:flex;align-items:center;gap:8px;}

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
.rq-primary:focus-visible,.rq-ghost:focus-visible,.rq-icon:focus-visible,.rq-link:focus-visible,.rq-tab:focus-visible,.rq-act:focus-visible{
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
.rq-found{display:flex;flex-direction:column;gap:6px;}
.rq-found__item{display:flex;align-items:center;gap:10px;}
.rq-found__item input[type=checkbox]{flex:none;width:17px;height:17px;margin:0;accent-color:#005eb8;cursor:pointer;}
.rq-found__item .rq-input{height:38px;font-size:15px;}
.rq-found__item--off .rq-input{opacity:.5;}
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
.rq-select{margin-left:auto;max-width:48%;height:30px;padding:0 26px 0 10px;border:1px solid transparent;border-radius:8px;
  font:inherit;font-size:13px;font-weight:600;color:#4c6272;cursor:pointer;appearance:none;-webkit-appearance:none;
  background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234c6272' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center;}
.rq-select:hover,.rq-select:focus{border-color:#dde4e7;background-color:#fff;outline:none;}

.rq-notice{margin:10px 0 0;font-size:13.5px;color:#005eb8;}
.rq-empty{padding:44px 12px;text-align:center;font-size:14.5px;line-height:1.55;color:#768692;}

/* ---- the list ---- */
.rq-list{list-style:none;margin:12px 0 0;padding:0 18px 0 16px;background:#fff;border:1px solid #e3e9ec;border-radius:16px;
  box-shadow:0 1px 2px rgba(33,43,50,.04);}
.rq-list:empty{display:none;}
.rq-row{position:relative;display:flex;gap:12px;padding:16px 0;border-bottom:1px solid #edf1f3;}
.rq-row:last-child{border-bottom:none;}
.rq-dot{flex:none;width:8px;height:8px;margin-top:8px;border-radius:50%;background:#e0a12b;box-shadow:0 0 0 3px #fff3d6;}
.rq-row--done .rq-dot{background:#2f9a5e;box-shadow:0 0 0 3px #e3f3ea;}
.rq-main{flex:1;min-width:0;}
.rq-q{font-size:16px;font-weight:650;line-height:1.4;overflow-wrap:anywhere;}
.rq-quote{margin-top:4px;padding-left:9px;border-left:2px solid #f0c674;font-size:13.5px;line-height:1.45;color:#4c6272;overflow-wrap:anywhere;}
.rq-detail{margin-top:4px;font-size:14px;line-height:1.5;color:#4c6272;white-space:pre-wrap;overflow-wrap:anywhere;}
.rq-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0 6px;margin-top:5px;font-size:12.5px;color:#768692;}
.rq-meta > * + *::before{content:"·";margin-right:6px;color:#b6c2c9;}
.rq-meta a{color:#005eb8;font-weight:600;text-decoration:none;}
.rq-meta a:hover{text-decoration:underline;}
.rq-src--bot{color:#a13a00;font-weight:600;}
.rq-answer{margin-top:9px;padding:1px 0 1px 11px;border-left:2px solid #7cc49b;font-size:14.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;}
.rq-answer__note{display:block;margin-top:3px;font-size:12.5px;white-space:normal;}
.rq-edit{margin-top:9px;}
.rq-edit .rq-compose__bar{margin-top:8px;}

.rq-acts{flex:none;position:relative;display:flex;align-items:flex-start;gap:2px;opacity:0;transition:opacity .12s ease;}
.rq-row:hover .rq-acts,.rq-row:focus-within .rq-acts,.rq-acts--held{opacity:1;}
@media (hover:none){.rq-acts{opacity:1;}}
.rq-act{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:30px;min-width:30px;padding:0 9px;border:none;border-radius:8px;
  background:none;font:inherit;font-size:13px;font-weight:650;color:#4c6272;cursor:pointer;text-decoration:none;white-space:nowrap;}
.rq-act:hover{background:rgba(33,43,50,.06);color:#212b32;}
.rq-act--blue{color:#005eb8;}
.rq-act--blue:hover{background:#eaf2fb;color:#003087;}
.rq-menu{position:absolute;right:0;top:34px;z-index:20;min-width:170px;padding:5px;background:#fff;border:1px solid #e1e8ec;border-radius:12px;
  box-shadow:0 8px 16px -4px rgba(33,43,50,.1),0 24px 48px -12px rgba(33,43,50,.2);animation:rq-in .14s ease;}
.rq-menu .rq-act{display:flex;justify-content:flex-start;width:100%;height:34px;}
.rq-menu .rq-act--red{color:#a51b0f;}
.rq-menu .rq-act--red:hover{background:#fdeeec;}

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
.rq-done{display:flex;align-items:flex-start;gap:9px;padding:9px 0;font-size:14.5px;line-height:1.45;}
.rq-done a{color:#005eb8;font-weight:650;text-decoration:none;}
.rq-done a:hover{text-decoration:underline;}

@media (max-width:560px){
  .rq-soft span{display:none;}
  .rq{padding-top:26px;}
  .rq-head{align-items:center;}
  .rq-head h1{font-size:25px;}
  .rq-head p{display:none;}
  .rq-hint{display:none;}
  .rq-list{padding:0 14px;}
  /* No room beside the words: the actions go under them, always shown. */
  .rq-row{flex-wrap:wrap;row-gap:4px;}
  .rq-main{flex-basis:calc(100% - 20px);}
  .rq-acts{opacity:1;width:100%;padding-left:12px;}
  .rq-menu{left:12px;right:auto;}
}
@media (prefers-reduced-motion:reduce){.rq-compose,.rq-menu,.rq-scan i,.rq-overlay,.rq-modal{animation:none;}}
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
  const [question, setQuestion] = useState('');
  const [detail, setDetail] = useState('');
  const [withDetail, setWithDetail] = useState(false);
  const [paste, setPaste] = useState('');
  const [found, setFound] = useState([]);            // [{ question, detail, keep, failed }]
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
      const { ok, data } = await send('POST', { question: text, detail: detail.trim() });
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
      setFound(data.questions.map((q) => ({ question: q.question || '', detail: q.detail || '', keep: true, failed: '' })));
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
        const { ok, data } = await send('POST', { question: q.question.trim(), detail: q.detail.trim() });
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
        <input className="rq-input" autoFocus value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="What do you need to know?" aria-label="Your question" maxLength={400} />
        {withDetail && (
          <textarea className="rq-area" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={2000}
            placeholder="Anything that helps — what you have tried, who might know." aria-label="Detail" />
        )}
        {error && <div className="rq-err">{error}</div>}
        <div className="rq-compose__bar">
          {!withDetail && <button type="button" className="rq-link" onClick={() => setWithDetail(true)}>Add detail</button>}
          <button type="button" className="rq-link" onClick={() => { setMode('paste'); setError(''); }}>
            <Svg w={14} sw={2}>{AI_ICON}</Svg>Paste lots of text
          </button>
          <span className="rq-grow" />
          <span className="rq-hint">No patient information</span>
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
              <label className={'rq-found__item' + (q.keep ? '' : ' rq-found__item--off')}>
                <input type="checkbox" checked={q.keep} disabled={saving} onChange={(e) => edit(i, { keep: e.target.checked })}
                  aria-label={'Keep: ' + q.question} />
                <input className="rq-input" value={q.question} disabled={saving}
                  onChange={(e) => edit(i, { question: e.target.value })} aria-label="Question" />
              </label>
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

/* Where a question came from, as the first thing in its grey line. */
function Source({ row }) {
  if (row.origin === 'notebook') {
    if (!row.noteTitle) return <span>On a deleted Notebook page</span>;
    return <span>On <Link href={pageHref(row)} title="Go to the words it was asked about">{row.noteTitle}</Link></span>;
  }
  if (row.origin === 'assistant') {
    const reason = gapReason(row.reason);
    return (
      <span className="rq-src--bot" title={reason ? reason.note : ''}>
        {reason ? 'Assistant: ' + reason.label.toLowerCase() : 'Assistant could not answer'}
      </span>
    );
  }
  return <span>Asked by staff</span>;
}

/* One question: the words, where it came from, its answer, and - on
   hover - what can be done with it. */
function Row({ row, onAnswer, onRemove, busy }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.answer || '');
  const [menu, setMenu] = useState(false);
  const actsRef = useRef(null);
  const answered = row.status === 'answered';
  const onPage = row.origin === 'notebook';
  // Asked again since it was answered: the answer evidently never reached
  // the Notebook. Worth saying, quietly.
  const stale = answered && row.answeredAt && new Date(row.lastAt) > new Date(row.answeredAt);
  const href = pageHref(row);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!actsRef.current || !actsRef.current.contains(e.target)) setMenu(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);

  const cancel = () => { setDraft(row.answer || ''); setEditing(false); };
  const save = (text) => onAnswer(row, text).then((ok) => { if (ok) setEditing(false); });

  return (
    <li className={'rq-row' + (answered ? ' rq-row--done' : '')}>
      <span className="rq-dot" title={answered ? 'Answered' : 'Open'} />
      <div className="rq-main">
        <div className="rq-q">{row.question}</div>
        {row.quote && <div className="rq-quote">“{row.quote}”</div>}
        {row.detail && <div className="rq-detail">{row.detail}</div>}
        <div className="rq-meta">
          <Source row={row} />
          <span>{when(row.lastAt || row.at)}</span>
          {row.askedCount > 1 && <span>asked {row.askedCount} times</span>}
          {row.origin !== 'assistant' && row.machineId && <span>machine {machineCode(row.machineId)}</span>}
        </div>

        {answered && row.answer && !editing && (
          <div className="rq-answer">
            {row.answer}
            {onPage && row.writtenAt && <span className="rq-answer__note" style={{ color: '#007f3b' }}>Written into the page.</span>}
            {stale && <span className="rq-answer__note" style={{ color: '#a13a00' }}>Asked again since — it may not be in the Notebook yet.</span>}
          </div>
        )}

        {editing && (
          <div className="rq-edit">
            <textarea className="rq-area" autoFocus rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
              aria-label="The answer" placeholder="The answer, as you would tell somebody at the desk." maxLength={4000}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancel();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim()) save(draft);
              }} />
            <div className="rq-compose__bar">
              <span className="rq-hint">
                {onPage ? 'Format with AI on the page can then write it in.' : 'Then write it into the Notebook.'}
              </span>
              <span className="rq-grow" />
              <button type="button" className="rq-ghost" onClick={cancel}>Cancel</button>
              <button type="button" className="rq-primary rq-primary--sm" disabled={busy || !draft.trim()} onClick={() => save(draft)}>
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {!editing && (
        <div className={'rq-acts' + (menu ? ' rq-acts--held' : '')} ref={actsRef}>
          <button type="button" className="rq-act rq-act--blue" onClick={() => { setDraft(row.answer || ''); setEditing(true); }}>
            {answered ? 'Edit' : 'Answer'}
          </button>
          <button type="button" className="rq-act" aria-label="More" aria-haspopup="menu" aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}>
            <Svg w={16} sw={2.2}>{DOTS}</Svg>
          </button>
          {menu && (
            <div className="rq-menu" role="menu">
              {onPage
                ? href && <Link role="menuitem" className="rq-act" href={href}>Go to the text</Link>
                : <Link role="menuitem" className="rq-act" href="/notebook">Write the page</Link>}
              {answered && (
                <button type="button" role="menuitem" className="rq-act" disabled={busy}
                  onClick={() => { setMenu(false); onAnswer(row, ''); }}>Reopen</button>
              )}
              <button type="button" role="menuitem" className="rq-act rq-act--red" disabled={busy}
                onClick={() => { setMenu(false); onRemove(row); }}>Remove</button>
            </div>
          )}
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

export default function Page() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [status, setStatus] = useState('open');
  const [source, setSource] = useState('');
  const [composing, setComposing] = useState(false);
  const [writing, setWriting] = useState(false);
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
    const text = rows.map((r, i) => (i + 1) + '. ' + String(r.question || '').replace(/\s+/g, ' ').trim()).join('\n');
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
        <div className="rq-head">
          <div className="rq-head__text">
            <h1>Questions</h1>
            <p>What the practice has not written down yet.</p>
          </div>
          <div className="rq-head__actions">
            <button type="button" className={'rq-icon' + (copied ? ' rq-icon--done' : '')} disabled={!rows.length} onClick={copyList}
              aria-label="Copy these questions as a list" title="Copy these questions as a numbered list">
              <Svg w={17} sw={2}>{copied ? Icons.check : Icons.copy}</Svg>
            </button>
            {unwritten > 0 && (
              <button type="button" className="rq-soft" onClick={() => setWriting(true)}
                title="Write the answered questions into the Notebook pages they belong on — you check every change first">
                <Svg w={16} sw={1.9}>{AI_ICON}</Svg><span>Add to Notebook</span><b>{unwritten}</b>
              </button>
            )}
            {!composing && (
              <button type="button" className="rq-primary" onClick={() => setComposing(true)}>
                <Svg w={17} sw={2.4}>{Icons.plus}</Svg>Ask
              </button>
            )}
          </div>
        </div>

        {composing && (
          <Composer onClose={closeComposer}
            onAdded={(msg, keepOpen) => {
              setNotice(msg);
              setStatus('open');
              if (!keepOpen) setComposing(false);
              load();
            }} />
        )}

        <div className="rq-bar">
          <div className="rq-tabs" role="tablist" aria-label="Which questions">
            {STATUS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={status === f.id}
                className={'rq-tab' + (status === f.id ? ' rq-tab--on' : '')} onClick={() => setStatus(f.id)}>
                {f.label}<span>{counts[f.id] || 0}</span>
              </button>
            ))}
          </div>
          <select className="rq-select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Where the questions came from">
            {SOURCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
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

        {state.loading && <div className="rq-empty">Loading…</div>}
        {state.error && <div className="rq-empty" style={{ color: '#a51b0f' }}>{state.error}</div>}
        {!state.loading && !state.error && !rows.length && (
          <div className="rq-empty">
            {status === 'open'
              ? (source ? 'Nothing open from ' + sourceLabel.toLowerCase() + '.' : 'Nothing open. Everything asked so far has an answer.')
              : 'Nothing here yet.'}
          </div>
        )}

        <ul className="rq-list">
          {rows.map((row) => (
            <Row key={row.id + ':' + row.status + ':' + (row.answer || '').length} row={row} onAnswer={answer} onRemove={remove} busy={busy} />
          ))}
        </ul>
      </main>

      {writing && <WriteIn onClose={closeWriting} onDone={load} />}
    </div>
  );
}
