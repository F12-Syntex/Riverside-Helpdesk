'use client';

/* ------------------------------------------------------------------ *
 * /questions — the questions nobody has an answer for yet.
 *
 * TWO HALVES, ONE LIST. The box at the top is for a question the
 * assistant cannot answer because nothing in the practice's material
 * covers it — the thing that, before this page, was asked across the
 * back office and answered from memory or not at all. Underneath it is
 * the same list, plus every question the assistant was actually asked
 * and could not answer: those arrive on their own, off the question log,
 * so nobody has to notice them and write them down (lib/questions/gaps.mjs).
 *
 * WHY THE TWO BELONG TOGETHER. They are the same list read from two
 * ends. A gap somebody hits at the desk and a gap the assistant reports
 * are both "the practice has not written this down yet", and the only
 * useful thing to do with either is write the Notebook page. Splitting
 * them into two pages would have meant the half that writes itself is
 * the half nobody opens.
 *
 * AN ANSWER HERE IS NOT THE RECORD. The Notebook is. So an answered
 * question still says to write the page, and the answer sits under the
 * question where the next person to ask it can read it this afternoon —
 * which is the whole of what it is for.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { gapReason } from '../../lib/questions/gaps.mjs';
import { machineCode } from '../../lib/audit/machine';

const BOX = 'background:#fff;border:1px solid #dde4e7;border-radius:12px;';
const INPUT = 'width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;font-size:16px;border:2px solid #d8dde0;border-radius:8px;background:#fff;color:#212b32;';
const PRIMARY = 'display:inline-flex;align-items:center;gap:8px;background:#005eb8;border:1px solid #005eb8;border-radius:8px;padding:9px 18px;font:inherit;font-size:15px;font-weight:600;color:#fff;cursor:pointer;';
const PRIMARY_HOVER = 'background:#003087;border-color:#003087;';
const QUIET = 'display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #d8e1e5;border-radius:8px;padding:7px 13px;font:inherit;font-size:13.5px;font-weight:600;color:#4c6272;cursor:pointer;';
const QUIET_HOVER = 'border-color:#005eb8;color:#005eb8;';

const FILTERS = [
  { id: 'open', label: 'Open', match: (r) => r.status === 'open' },
  { id: 'answered', label: 'Answered', match: (r) => r.status === 'answered' },
  { id: 'assistant', label: 'From the assistant', match: (r) => r.origin === 'assistant' },
  { id: 'asked', label: 'Asked here', match: (r) => r.origin === 'asked' },
  { id: 'all', label: 'All', match: () => true },
];

function when(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* The small grey line under a question that says where it came from: who
   asked, how many times, and — for a question the assistant could not
   answer — which of the three ways it could not. */
function Provenance({ row }) {
  const reason = gapReason(row.reason);
  const bits = [when(row.lastAt || row.at)];
  if (row.askedCount > 1) bits.push('asked ' + row.askedCount + ' times');
  if (row.origin === 'asked' && row.machineId) bits.push('from machine ' + machineCode(row.machineId));
  return (
    <div style={s('margin-top:6px;font-size:12.5px;color:#768692;')}>
      {bits.join(' · ')}
      {reason && <span style={s('display:block;margin-top:2px;')}>{reason.note}</span>}
    </div>
  );
}

/* Where a row came from, as a badge. The assistant's own are the ones
   somebody maintaining the Notebook should read first — a question that
   was actually put to the app and came back empty — so they are the ones
   that carry a colour. */
function OriginBadge({ row }) {
  const fromBot = row.origin === 'assistant';
  const reason = gapReason(row.reason);
  const label = fromBot ? (reason ? reason.label : 'The assistant could not answer') : 'Asked by staff';
  return (
    <span style={s('display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;'
      + (fromBot ? 'background:#fff3ed;color:#a13a00;' : 'background:#eef4f8;color:#4c6272;'))}>
      {label}
    </span>
  );
}

/* One question, with whatever has been written under it. The answer box
   is closed until somebody presses Answer: an open textarea on every row
   makes a list of twenty questions unreadable. */
function Row({ row, onAnswer, onRemove, busy }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(row.answer || '');
  const answered = row.status === 'answered';
  // Asked again since it was answered: the answer is here but the gap is
  // evidently still being hit, which usually means it never reached the
  // Notebook. Worth saying, quietly, rather than showing a tick.
  const stale = answered && row.answeredAt && new Date(row.lastAt) > new Date(row.answeredAt);

  return (
    <div style={s(BOX + 'border-left:4px solid ' + (answered ? '#007f3b' : '#ed8b00') + ';border-radius:0 12px 12px 0;padding:14px 16px;')}>
      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;')}>
        <OriginBadge row={row} />
        {answered && (
          <span style={s('display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:#007f3b;')}>
            <Svg w={13} sw={2.6}>{Icons.check}</Svg>Answered
          </span>
        )}
      </div>

      <div style={s('margin-top:8px;font-size:17px;line-height:1.45;color:#212b32;font-weight:600;overflow-wrap:anywhere;')}>
        {row.question}
      </div>

      {row.detail && (
        <div style={s('margin-top:6px;font-size:15px;line-height:1.5;color:#4c6272;white-space:pre-wrap;overflow-wrap:anywhere;')}>
          {row.detail}
        </div>
      )}

      <Provenance row={row} />

      {answered && row.answer && !open && (
        <div style={s('margin-top:10px;background:#f0f7f2;border:1px solid #cce4d6;border-radius:8px;padding:10px 12px;')}>
          <div style={s('font-size:12px;font-weight:700;color:#007f3b;letter-spacing:.02em;')}>
            THE ANSWER{row.answeredBy ? ' · from machine ' + machineCode(row.answeredBy) : ''}
          </div>
          <div style={s('margin-top:4px;font-size:15.5px;line-height:1.5;color:#212b32;white-space:pre-wrap;overflow-wrap:anywhere;')}>
            {row.answer}
          </div>
          {stale && (
            <div style={s('margin-top:6px;font-size:12.5px;color:#a13a00;')}>
              Asked again since this was written — it may not have reached the Notebook yet.
            </div>
          )}
        </div>
      )}

      {open && (
        <div style={s('margin-top:10px;')}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
            aria-label="The answer" placeholder="What is the answer? Write it as you would tell somebody at the desk."
            style={s(INPUT + 'font-size:15.5px;resize:vertical;')} />
          <div style={s('margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;')}>
            <Hover tag="button" type="button" disabled={busy}
              onClick={() => onAnswer(row, draft).then((saved) => { if (saved) setOpen(false); })}
              base={PRIMARY + (busy ? 'opacity:.6;cursor:default;' : '')} hover={busy ? '' : PRIMARY_HOVER}>
              Save the answer
            </Hover>
            <Hover tag="button" type="button" onClick={() => { setDraft(row.answer || ''); setOpen(false); }}
              base={QUIET} hover={QUIET_HOVER}>Cancel</Hover>
            <span style={s('font-size:12.5px;color:#768692;')}>
              Then write it into the Notebook, so the assistant can answer it next time.
            </span>
          </div>
        </div>
      )}

      {!open && (
        <div style={s('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;')}>
          <Hover tag="button" type="button" onClick={() => setOpen(true)} base={QUIET} hover={QUIET_HOVER}>
            {answered ? 'Change the answer' : 'Answer this'}
          </Hover>
          <Hover tag={Link} href="/notebook" base={QUIET + 'text-decoration:none;'} hover={QUIET_HOVER}>
            Write the page
          </Hover>
          {answered && (
            <Hover tag="button" type="button" disabled={busy} onClick={() => onAnswer(row, '')}
              base={QUIET} hover={QUIET_HOVER}>
              Not settled after all
            </Hover>
          )}
          <Hover tag="button" type="button" disabled={busy} onClick={() => onRemove(row)}
            base={QUIET + 'color:#a51b0f;'} hover="border-color:#a51b0f;color:#a51b0f;">
            Remove
          </Hover>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [filter, setFilter] = useState('open');
  const [question, setQuestion] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [asking, setAsking] = useState('');

  const load = useCallback(() => {
    // The whole list, filtered in the browser: it is a list of gaps in one
    // practice's notes, which is tens of rows, and a filter that redraws
    // instantly is worth more here than a query per pill.
    fetch('/api/questions/open?limit=200')
      .then((r) => r.json())
      .then((d) => setState({ loading: false, rows: d.rows || [], error: d.error || '' }))
      .catch((e) => setState({ loading: false, rows: [], error: String(e) }));
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const out = {};
    for (const f of FILTERS) out[f.id] = state.rows.filter(f.match).length;
    return out;
  }, [state.rows]);

  const rows = useMemo(() => {
    const active = FILTERS.find((f) => f.id === filter) || FILTERS[0];
    return state.rows.filter(active.match);
  }, [state.rows, filter]);

  async function ask(e) {
    e.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setAsking('');
    try {
      const res = await fetch('/api/questions/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, detail: detail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAsking(data.error || 'The question could not be saved.'); return; }
      // Only cleared once it is actually stored: a box emptied by a failed
      // save is a question somebody has to type twice.
      setQuestion('');
      setDetail('');
      setNotice(data.repeat
        ? 'Somebody has already asked that — it is now recorded as asked again.'
        : 'Asked. It is on the list below until somebody answers it.');
      setFilter('open');
      load();
    } catch (err) {
      setAsking('The question could not be saved — nothing was stored. ' + String(err));
    } finally {
      setBusy(false);
    }
  }

  async function answer(row, text) {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/questions/open', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, answer: text }),
      });
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || 'The answer could not be saved.'); return false; }
      load();
      return true;
    } catch (err) {
      setNotice('The answer could not be saved. ' + String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (typeof window !== 'undefined'
      && !window.confirm('Remove this question from the list? Answering it is what closes it — this deletes it.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/questions/open?id=' + row.id, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || 'The question could not be removed.'); return; }
      load();
    } catch (err) {
      setNotice('The question could not be removed. ' + String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Questions" />

      <main style={s('flex:1;width:100%;max-width:900px;margin:0 auto;padding:36px 24px 64px;')}>
        <h1 style={s('font-size:32px;margin:0 0 6px;letter-spacing:-0.02em;')}>Questions</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 24px;max-width:70ch;')}>
          For the questions the assistant cannot answer, because the practice has not written the answer down
          anywhere yet. Ask one here, and every question the assistant was asked and could not answer joins the
          same list on its own.
        </p>

        <form onSubmit={ask} style={s(BOX + 'padding:16px;margin:0 0 24px;')}>
          <label htmlFor="rq-question" style={s('display:block;font-size:14px;font-weight:700;color:#212b32;margin:0 0 6px;')}>
            Ask a question
          </label>
          <input id="rq-question" value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Who covers the phones when both receptionists are on lunch?"
            style={s(INPUT)} />
          <label htmlFor="rq-detail" style={s('display:block;font-size:14px;font-weight:700;color:#212b32;margin:14px 0 6px;')}>
            Anything else worth knowing <span style={s('font-weight:500;color:#768692;')}>— optional</span>
          </label>
          <textarea id="rq-detail" value={detail} onChange={(e) => setDetail(e.target.value)} rows={3}
            placeholder="What you have already tried, who might know, why it came up."
            style={s(INPUT + 'font-size:15.5px;resize:vertical;')} />
          <p style={s('margin:10px 0 0;font-size:13px;color:#768692;')}>
            No patient information. This is a question about how the practice works, and it is stored as it is typed.
          </p>
          <div style={s('margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;')}>
            <Hover tag="button" type="submit" disabled={busy || !question.trim()}
              base={PRIMARY + (busy || !question.trim() ? 'opacity:.55;cursor:default;' : '')}
              hover={busy || !question.trim() ? '' : PRIMARY_HOVER}>
              Add the question
            </Hover>
            {asking && <span style={s('font-size:14px;color:#a51b0f;')}>{asking}</span>}
          </div>
        </form>

        {notice && (
          <p style={s('margin:0 0 18px;font-size:14.5px;color:#005eb8;background:#eef4f8;border:1px solid #cfe0ee;border-radius:8px;padding:9px 12px;')}>
            {notice}
          </p>
        )}

        <div style={s('display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;')}>
          {FILTERS.map((f) => (
            <Hover key={f.id} tag="button" type="button" onClick={() => setFilter(f.id)}
              base={'border-radius:999px;padding:7px 15px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:1px solid '
                + (filter === f.id ? '#005eb8;background:#005eb8;color:#fff;' : '#d8e1e5;background:#fff;color:#4c6272;')}
              hover={filter === f.id ? '' : 'border-color:#005eb8;color:#005eb8;'}>
              {f.label}
              <span style={s('margin-left:7px;opacity:.75;font-weight:500;')}>{counts[f.id] || 0}</span>
            </Hover>
          ))}
        </div>

        {state.loading && <p style={s('color:#4c6272;')}>Loading…</p>}
        {state.error && <p style={s('color:#a51b0f;')}>{state.error}</p>}
        {!state.loading && !state.error && !rows.length && (
          <p style={s('color:#4c6272;')}>
            Nothing here. Questions appear as soon as somebody asks one above, or as soon as the assistant is
            asked something the practice’s own material does not cover.
          </p>
        )}

        <div style={s('display:flex;flex-direction:column;gap:12px;')}>
          {rows.map((row) => (
            <Row key={row.id} row={row} onAnswer={answer} onRemove={remove} busy={busy} />
          ))}
        </div>
      </main>
    </div>
  );
}
