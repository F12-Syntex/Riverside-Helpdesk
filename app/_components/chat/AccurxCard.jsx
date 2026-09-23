'use client';

import React from 'react';
import { s, Svg, Icons } from '../ui';
import Rich from './Rich';
import { copyText } from '../templates/CopyButton';

/* ------------------------------------------------------------------ *
 * The AccurX card: where a pasted request goes, and the line to copy.
 *
 * Four things, and nothing else: where it goes, why (in the fixed terms of
 * lib/triage/criteria.mjs), the reason line to paste, and how to book it.
 * The reason is the only thing with a Copy. How to action a route, what a
 * service takes and the reading's full account are not drawn: staff do not
 * use them, and every line of them was a line between the reader and the
 * answer. The exception is a card that means now, whose steps are the
 * answer and are drawn in the open.
 *
 * It draws `answer.accurx`, built beside the card's blocks in
 * lib/templates/accurx.mjs, and decides nothing: every gate (a card that
 * means now books nothing and copies no reason, a quote only when the
 * patient wrote it, an unread message said out loud) was applied there.
 * ------------------------------------------------------------------ */

const AX_CSS = `
.ax{--ax-tone:#005eb8;--ax-tint:#eaf2fb;--ax-ink:#003087;background:#fff;border-radius:16px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(33,43,50,.09),0 1px 2px rgba(33,43,50,.05);}
.ax--now{--ax-tone:#d5281b;--ax-tint:#fdf2f1;--ax-ink:#8e1a10;}
.ax--today{--ax-tone:#b36200;--ax-tint:#fdf6ea;--ax-ink:#7a4300;}
.ax--routine{--ax-tone:#007f3b;--ax-tint:#ecf7f0;--ax-ink:#00532a;}

.ax-head{display:flex;align-items:flex-start;gap:12px;padding:16px 20px 0;}
.ax-head__text{flex:1;min-width:0;}
.ax-kicker{display:block;font-size:12.5px;font-weight:600;color:#5b7183;}
.ax-kicker::first-letter{text-transform:uppercase;}
.ax-dest{display:block;margin-top:2px;font-size:19px;font-weight:750;letter-spacing:-.015em;line-height:1.25;color:#212b32;}
.ax-tier{flex:none;margin-top:2px;padding:2px 9px;border-radius:6px;font-size:12px;font-weight:700;color:var(--ax-ink);background:var(--ax-tint);}

.ax-body{display:flex;flex-direction:column;gap:14px;padding:14px 20px 18px;}

.ax-strip{padding:9px 12px;border-radius:10px;font-size:14px;line-height:1.5;}
.ax-strip--now{background:#d5281b;color:#fff;font-weight:650;}
.ax-strip--warn{background:#fdf8ef;color:#6b4a00;box-shadow:inset 0 0 0 1px #efdcb7;}

/* Label-value rows: Why, Book, Note. */
.ax-row{display:grid;grid-template-columns:52px 1fr;gap:12px;font-size:14.5px;line-height:1.5;color:#212b32;}
.ax-row__k{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#768692;padding-top:2px;}
.ax-row__v{min-width:0;overflow-wrap:anywhere;}
.ax-sep{color:#aeb7bd;padding:0 7px;}
.ax-crit b{font-weight:650;}
.ax-quote{display:block;margin-top:2px;font-size:13.5px;color:#5b7183;}

.ax-reason{border-radius:12px;padding:12px 14px;background:#f5f9fc;box-shadow:inset 0 0 0 1px #dce8f2;}
.ax-reason__head{display:flex;align-items:center;gap:10px;margin-bottom:4px;}
.ax-reason__head .ax-row__k{flex:1;padding:0;}
.ax-reason__text{font-size:16.5px;line-height:1.5;font-weight:600;color:#212b32;overflow-wrap:anywhere;}
.ax-reason--handover{background:#fafbfc;box-shadow:inset 0 0 0 1px #e3e9ed;}
.ax-reason__text--empty{font-size:14.5px;font-weight:500;color:#5b7183;}

.ax-copy{flex:none;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid #004f9c;
  background:#005eb8;color:#fff;font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:background-color .15s ease;}
.ax-copy:hover{background:#0068c9;}
.ax-copy.is-done{background:#007f3b;border-color:#006631;}
.ax-copy.is-failed{background:#fff;color:#8a6100;border-color:#efdcb7;}

.ax-steps{margin:0;padding:0 0 0 20px;display:flex;flex-direction:column;gap:6px;font-size:14.5px;line-height:1.5;color:#212b32;}

.ax-reqs{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;}
.ax-req__who{color:#5b7183;}
.ax-req__goes{color:#5b7183;}
.ax-req__goes b{color:#212b32;font-weight:650;}
.ax-req__goes--open{color:#8a6100;}

@media (max-width:600px){
  .ax-head{padding:14px 16px 0;}
  .ax-body{padding:12px 16px 16px;}
  .ax-row{grid-template-columns:1fr;gap:2px;}
}
`;

const TIERS = {
  now: { label: 'Now', cls: 'ax--now' },
  today: { label: 'Today', cls: 'ax--today' },
  doctor: { label: 'Doctor', cls: '' },
  routine: { label: 'Routine', cls: 'ax--routine' },
};
const tierOf = (rank) => (rank >= 5 ? 'now' : rank === 4 ? 'today' : rank === 3 ? 'doctor' : 'routine');

function Copy({ value, label = 'Copy' }) {
  const [state, setState] = React.useState('');
  const run = async () => {
    const ok = await copyText(value);
    setState(ok ? 'done' : 'failed');
    setTimeout(() => setState(''), ok ? 2000 : 4000);
  };
  return (
    <button type="button" onClick={run} title={'Copy: ' + value}
      className={'ax-copy' + (state ? ' is-' + state : '')}>
      <Svg w={13} sw={2.3}>{state === 'done' ? Icons.check : Icons.copy}</Svg>
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Select and Ctrl+C' : label}
    </button>
  );
}

// Items on one line, dot-separated.
const Line = ({ items }) => items.map((it, i) => (
  <React.Fragment key={i}>{i ? <span className="ax-sep">·</span> : null}{it}</React.Fragment>
));

const Row = ({ k, children }) => (
  <div className="ax-row"><span className="ax-row__k">{k}</span><div className="ax-row__v">{children}</div></div>
);

export default function AccurxCard({ answer }) {
  const a = answer.accurx;
  const t = TIERS[tierOf(a.rank)];
  const bookable = !a.urgent;
  const crit = a.criteria || [];
  const seen = a.seen;
  // "The duty doctor — today" already says Today; a pill beside it says it twice.
  const tierInLabel = String(a.label || '').toLowerCase().includes(t.label.toLowerCase());

  const book = [];
  if (bookable && a.appointment) book.push(<b key="m">{a.appointment.label}{a.appointment.hedged ? ' (not clear from message)' : ''}</b>);
  if (seen && seen.here && bookable) book.push(<span key="w">With {seen.who || 'whoever saw it before'}</span>);
  if (seen && !(seen.here && bookable)) book.push(<span key="s">Seen before{seen.who ? ' by ' + seen.who : ''}{seen.when ? ', ' + seen.when : ''}{seen.here ? '' : ' (elsewhere)'}</span>);
  a.clinics.forEach((c) => book.push(<span key={'c' + c.label}>{c.label} could do this</span>));
  a.booking.forEach((n, i) => book.push(<span key={'b' + i}><Rich text={n} /></span>));

  return (
    <div className={'ax ' + t.cls}>
      <style data-ax="1" dangerouslySetInnerHTML={{ __html: AX_CSS }} />

      <div className="ax-head">
        <span className="ax-head__text">
          {answer.title ? <span className="ax-kicker">{answer.title}</span> : null}
          <span className="ax-dest">{a.label}</span>
        </span>
        {tierInLabel ? null : <span className="ax-tier">{t.label}</span>}
      </div>

      <div className="ax-body">
        {answer.warn ? <div className="ax-strip ax-strip--now" role="alert">{answer.warn}</div> : null}
        {a.urgent ? (
          <div className="ax-strip ax-strip--now" role="alert">Not an appointment. Act on these steps now.</div>
        ) : null}
        {a.urgent && a.steps.length ? (
          <ol className="ax-steps">{a.steps.map((st, i) => <li key={i}><Rich text={st} /></li>)}</ol>
        ) : null}
        {a.unread ? (
          <div className="ax-strip ax-strip--warn">The message couldn’t be read, so nothing decided this. It is with the <b>duty doctor</b> by default.</div>
        ) : null}
        {a.conflicts.length ? (
          <div className="ax-strip ax-strip--warn"><b>Won’t book the usual way:</b> {a.conflicts.map((c) => String(c).replace(/[.;,\s]+$/, '')).join(' · ')}.</div>
        ) : null}

        {crit.length || a.reasoning || a.because ? (
          <Row k="Why">
            {crit.length
              ? <span className="ax-crit"><Line items={crit.map((c) => <span key={c.id}><b>{c.label}</b>{c.value ? ': ' + c.value : ''}</span>)} /></span>
              : (a.reasoning ? <Rich text={a.reasoning} /> : null)}
            {a.because ? <span className="ax-quote">“{a.because}”</span> : null}
          </Row>
        ) : null}

        <div className={'ax-reason' + (bookable ? '' : ' ax-reason--handover')}>
          <div className="ax-reason__head">
            <span className="ax-row__k">{bookable ? 'Reason' : 'For the handover'}</span>
            {a.reason && bookable ? <Copy value={a.reason} label="Copy reason" /> : null}
          </div>
          {a.reason
            ? <div className="ax-reason__text">{a.reason}</div>
            : <div className="ax-reason__text ax-reason__text--empty">The message doesn’t say what an appointment would be for.</div>}
        </div>

        {book.length ? <Row k="Book"><Line items={book} /></Row> : null}
        {a.flags.length ? <Row k="Note"><Line items={a.flags.map((f, i) => <Rich key={i} text={f} />)} /></Row> : null}

        {a.requests.length ? (
          <Row k="Also">
            <ul className="ax-reqs">
              {a.requests.map((r, i) => (
                <li key={i}>
                  {r.what}{r.who ? <span className="ax-req__who"> (for {r.who})</span> : null}
                  {r.goes
                    ? <span className="ax-req__goes"> → <b>{r.goes}</b></span>
                    : <span className="ax-req__goes ax-req__goes--open"> → your call</span>}
                </li>
              ))}
            </ul>
          </Row>
        ) : null}
      </div>
    </div>
  );
}
