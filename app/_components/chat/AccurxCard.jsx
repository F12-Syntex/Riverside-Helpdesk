'use client';

import React from 'react';
import { s, Svg, Icons } from '../ui';
import Rich from './Rich';
import { copyText } from '../templates/CopyButton';

/* ------------------------------------------------------------------ *
 * The AccurX card: where a pasted request goes, and the line to copy.
 *
 * Reception comes to this card for three things, in this order: where it
 * goes, the reason line to paste, and which kind of slot. Those are drawn
 * large. Everything else the card knows (why, what else the message
 * asked for, how to action it, what the service takes) is either a chip
 * or folded away, so it is there to check but never between the reader
 * and the thing they came for.
 *
 * It draws `answer.accurx`, built beside the card's blocks in
 * lib/templates/accurx.mjs, and decides nothing: every gate (a card that
 * means now books nothing and copies no reason, a quote only when the
 * patient wrote it, an unread message said out loud) was applied there.
 * ------------------------------------------------------------------ */

const AX_CSS = `
.ax{--ax-tone:#005eb8;--ax-tint:#eaf2fb;--ax-ink:#003087;background:#fff;border-radius:22px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(33,43,50,.07),0 1px 2px rgba(33,43,50,.05),0 12px 32px -14px rgba(0,48,135,.22);}
.ax--now{--ax-tone:#d5281b;--ax-tint:#fdf2f1;--ax-ink:#8e1a10;}
.ax--today{--ax-tone:#b36200;--ax-tint:#fdf6ea;--ax-ink:#7a4300;}
.ax--routine{--ax-tone:#007f3b;--ax-tint:#ecf7f0;--ax-ink:#00532a;}

.ax-head{position:relative;display:flex;align-items:center;gap:14px;padding:18px 20px 16px;
  background:linear-gradient(180deg,var(--ax-tint),#fff);}
.ax-head::after{content:"";position:absolute;left:20px;right:20px;bottom:0;height:1px;background:rgba(33,43,50,.07);}
.ax-head__text{flex:1;min-width:0;}
.ax-head__side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:8px;}
.ax-kicker{display:block;font-size:12.5px;font-weight:650;color:#5b7183;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ax-dest{display:block;margin-top:1px;font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.2;color:#212b32;}
.ax-tier{flex:none;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:999px;
  font-size:12px;font-weight:750;letter-spacing:.02em;color:var(--ax-ink);background:#fff;box-shadow:0 0 0 1px color-mix(in srgb,var(--ax-tone) 30%,transparent);}
.ax-tier__dot{width:7px;height:7px;border-radius:50%;background:var(--ax-tone);}
.ax--now .ax-tier__dot{animation:axPulse 1.4s ease-in-out infinite;}
@keyframes axPulse{0%,100%{box-shadow:0 0 0 0 rgba(213,40,27,.5);}50%{box-shadow:0 0 0 5px rgba(213,40,27,0);}}

.ax-body{display:flex;flex-direction:column;gap:14px;padding:16px 20px 18px;}

/* The one-line strips: an act-now instruction, and anything that means
   the card should not simply be believed. */
.ax-strip{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.5;}
.ax-strip svg{flex:none;margin-top:2px;}
.ax-strip--now{background:#d5281b;color:#fff;font-weight:650;}
.ax-strip--warn{background:#fdf8ef;color:#6b4a00;box-shadow:inset 0 0 0 1px #efdcb7;}

/* Send to: a row, with its Copy. */
.ax-send{display:flex;align-items:center;gap:12px;}
.ax-label{flex:none;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#768692;}
.ax-send__value{flex:1;min-width:0;font-size:15px;font-weight:650;color:#212b32;overflow-wrap:anywhere;}

/* The reason line: the thing most people came for. */
.ax-reason{position:relative;border-radius:16px;padding:14px 16px 14px;background:#f5f9fc;box-shadow:inset 0 0 0 1px #dce8f2;}
.ax-reason__head{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
.ax-reason__head .ax-label{flex:1;}
.ax-reason__text{font-size:17px;line-height:1.5;font-weight:600;color:#212b32;overflow-wrap:anywhere;}
.ax-reason--handover{background:#fafbfc;box-shadow:inset 0 0 0 1px #e3e9ed;}
.ax-reason__text--empty{font-size:14.5px;font-weight:500;color:#5b7183;}

.ax-copy{flex:none;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:10px;border:1px solid #004f9c;
  background:#005eb8;color:#fff;font:inherit;font-size:13px;font-weight:650;cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -1px 0 rgba(0,0,0,.12),0 1px 2px rgba(0,48,135,.25);
  transition:background-color .15s ease,transform .12s ease;}
.ax-copy:hover{background:#0068c9;}
.ax-copy:active{transform:translateY(1px);}
.ax-copy.is-done{background:#007f3b;border-color:#006631;}
.ax-copy.is-failed{background:#fff;color:#8a6100;border-color:#efdcb7;box-shadow:none;}
.ax-copy--quiet{background:#fff;color:#005eb8;border-color:#d5dee2;box-shadow:0 1px 2px rgba(33,43,50,.06);}
.ax-copy--quiet:hover{background:#f7fbff;border-color:#aac7e0;}
.ax-copy--quiet.is-done{background:#ecf7f0;color:#00632f;border-color:#bfe0cb;}

/* Short things, as chips. */
.ax-chips{display:flex;flex-wrap:wrap;gap:6px;}
.ax-chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:3px 10px;border-radius:9px;
  font-size:13px;font-weight:600;line-height:1.35;color:#324554;background:#f2f6f9;box-shadow:inset 0 0 0 1px #e3e9ed;}
.ax-chip svg{flex:none;color:#768692;}
.ax-chip b{font-weight:750;color:#212b32;}
.ax-chip--blue{background:#eaf2fb;box-shadow:inset 0 0 0 1px #c9dcef;color:#003087;}
.ax-chip--blue svg{color:#005eb8;}
.ax-chip--amber{background:#fdf8ef;box-shadow:inset 0 0 0 1px #efdcb7;color:#6b4a00;}
.ax-chip--amber svg{color:#a4610a;}
.ax-chip--green{background:#ecf7f0;box-shadow:inset 0 0 0 1px #c6e4d1;color:#00532a;}
.ax-chip--green svg{color:#007f3b;}
.ax-chip--note{background:#fff;}

/* Everything else the message asked for. */
.ax-group__title{display:block;margin-bottom:7px;}
.ax-reqs{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px #e3e9ed;}
.ax-req{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:9px 12px;font-size:14px;color:#212b32;}
.ax-req + .ax-req{border-top:1px solid #eef1f2;}
.ax-req__what{flex:1 1 200px;min-width:0;font-weight:650;}
.ax-req__who{font-weight:500;color:#5b7183;}
.ax-req__goes{flex:none;display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:12.5px;font-weight:650;color:#003087;background:#eaf2fb;}
.ax-req__goes--open{color:#6b4a00;background:#fdf8ef;}
.ax-req__note{flex-basis:100%;font-size:12.5px;color:#5b7183;}

/* Why, in one line. */
.ax-why{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.55;color:#4c6272;}
.ax-why svg{flex:none;margin-top:2px;color:#768692;}
.ax-quote{color:#212b32;font-weight:600;}

/* The folds. */
.ax-folds{display:flex;flex-direction:column;border-top:1px solid #eef1f2;}
.ax-fold{border-bottom:1px solid #eef1f2;}
.ax-fold:last-child{border-bottom:none;}
.ax-fold__btn{display:flex;align-items:center;gap:10px;width:100%;padding:12px 20px;border:none;background:none;font:inherit;
  font-size:14px;font-weight:650;color:#324554;text-align:left;cursor:pointer;transition:background-color .15s ease,color .15s ease;}
.ax-fold__btn:hover{background:#f8fafc;color:#005eb8;}
.ax-fold__btn:focus-visible{outline:2px solid #005eb8;outline-offset:-2px;}
.ax-fold__chev{flex:none;display:flex;color:#8a99a3;transition:transform .25s cubic-bezier(.2,.8,.3,1);}
.ax-fold.is-open .ax-fold__chev{transform:rotate(90deg);}
.ax-fold__label{flex:1;min-width:0;}
.ax-fold__meta{flex:none;font-size:12px;font-weight:600;color:#8a99a3;}
.ax-fold__body{padding:0 20px 16px 44px;display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.55;color:#324554;animation:axFold .25s cubic-bezier(.2,.8,.3,1) both;}
@keyframes axFold{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
.ax-steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px;counter-reset:ax;}
.ax-steps li{position:relative;padding-left:32px;counter-increment:ax;}
.ax-steps li::before{content:counter(ax);position:absolute;left:0;top:0;width:22px;height:22px;border-radius:7px;display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:750;color:var(--ax-ink);background:var(--ax-tint);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ax-tone) 22%,transparent);}
.ax-list{margin:0;padding:0 0 0 16px;display:flex;flex-direction:column;gap:5px;}
.ax-sub{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#768692;margin-bottom:-4px;}

.ax-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:10px 20px 12px;background:#f8fafb;border-top:1px solid #eef1f2;
  font-size:12px;line-height:1.5;color:#768692;}
.ax-foot__src{margin-left:auto;}

@media (max-width:600px){
  .ax-head{padding:16px 16px 14px;gap:12px;}
  .ax-dest{font-size:18px;}
  .ax-body{padding:14px 16px 16px;}
  .ax-fold__btn{padding:12px 16px;}
  .ax-fold__body{padding:0 16px 14px 16px;}
  .ax-head{align-items:flex-start;}
  .ax-copy--quiet{padding:0 10px;}
  .ax-foot__src{margin-left:0;}
}
@media (prefers-reduced-motion:reduce){
  .ax--now .ax-tier__dot,.ax-fold__body{animation:none;}
}
`;

const TIERS = {
  now: { label: 'Now', cls: 'ax--now' },
  today: { label: 'Today', cls: 'ax--today' },
  doctor: { label: 'Doctor', cls: '' },
  routine: { label: 'Routine', cls: 'ax--routine' },
};
const tierOf = (rank) => (rank >= 5 ? 'now' : rank === 4 ? 'today' : rank === 3 ? 'doctor' : 'routine');

function Copy({ value, label = 'Copy', quiet = false }) {
  const [state, setState] = React.useState('');
  const run = async () => {
    const ok = await copyText(value);
    setState(ok ? 'done' : 'failed');
    setTimeout(() => setState(''), ok ? 2000 : 4000);
  };
  return (
    <button type="button" onClick={run} title={'Copy: ' + value}
      className={'ax-copy' + (quiet ? ' ax-copy--quiet' : '') + (state ? ' is-' + state : '')}>
      <Svg w={13} sw={2.3}>{state === 'done' ? Icons.check : Icons.copy}</Svg>
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Select and Ctrl+C' : label}
    </button>
  );
}

function Fold({ label, meta, open: startOpen = false, children }) {
  const [open, setOpen] = React.useState(startOpen);
  return (
    <div className={'ax-fold' + (open ? ' is-open' : '')}>
      <button type="button" className="ax-fold__btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="ax-fold__chev"><Svg w={14} sw={2.4}>{Icons.chevronRight}</Svg></span>
        <span className="ax-fold__label">{label}</span>
        {meta ? <span className="ax-fold__meta">{meta}</span> : null}
      </button>
      {open ? <div className="ax-fold__body">{children}</div> : null}
    </div>
  );
}

export default function AccurxCard({ answer }) {
  const a = answer.accurx;
  const tier = tierOf(a.rank);
  const t = TIERS[tier];
  const bookable = !a.urgent;
  const notes = [...a.booking, ...(bookable ? [] : a.details)];
  const seen = a.seen;
  const same = String(a.sendTo || '').trim() === String(a.label || '').trim();
  const seenText = seen ? [seen.who || 'Not said who', seen.when].filter(Boolean).join(' · ') : '';

  return (
    <div className={'ax ' + t.cls}>
      <style data-ax="1" dangerouslySetInnerHTML={{ __html: AX_CSS }} />

      <div className="ax-head">
        <span className="ax-head__text">
          <span className="ax-kicker">{answer.title}</span>
          <span className="ax-dest">{a.label}</span>
        </span>
        <span className="ax-head__side">
          <span className="ax-tier"><span className="ax-tier__dot" />{t.label}</span>
          {a.copySendTo && same ? <Copy value={a.sendTo} quiet /> : null}
        </span>
      </div>

      <div className="ax-body">
        {answer.warn ? (
          <div className="ax-strip ax-strip--now" role="alert">
            <Svg w={16} sw={2.4}>{Icons.alertCircle}</Svg><span>{answer.warn}</span>
          </div>
        ) : null}
        {a.urgent ? (
          <div className="ax-strip ax-strip--now" role="alert">
            <Svg w={16} sw={2.4}>{Icons.alertCircle}</Svg>
            <span>Not an appointment. Nobody books from this card: act on the steps below now.</span>
          </div>
        ) : null}

        {a.unread ? (
          <div className="ax-strip ax-strip--warn">
            <Svg w={16} sw={2.2}>{Icons.alertCircle}</Svg>
            <span>The message couldn’t be read this time. It’s with the <b>duty doctor</b> because that’s where anything unplaced goes, not because it was assessed.</span>
          </div>
        ) : null}

        {a.conflicts.length ? (
          <div className="ax-strip ax-strip--warn">
            <Svg w={16} sw={2.2}>{Icons.alertCircle}</Svg>
            <span><b>Won’t book the usual way.</b> {a.conflicts.map((c) => String(c).replace(/[.;,\s]+$/, '')).join(' · ')}.</span>
          </div>
        ) : null}

        {/* Only when it says more than the heading does. */}
        {same ? null : (
          <div className="ax-send">
            <span className="ax-label">Send to</span>
            <span className="ax-send__value">{a.sendTo}</span>
            {a.copySendTo ? <Copy value={a.sendTo} quiet /> : null}
          </div>
        )}

        <div className={'ax-reason' + (bookable ? '' : ' ax-reason--handover')}>
          <div className="ax-reason__head">
            <span className="ax-label">{bookable ? 'Reason' : 'For the handover'}</span>
            {a.reason && bookable ? <Copy value={a.reason} label="Copy reason" /> : null}
          </div>
          {a.reason
            ? <div className="ax-reason__text">{a.reason}</div>
            : <div className="ax-reason__text ax-reason__text--empty">Nothing in the message says what an appointment would be for.</div>}
        </div>

        {(a.appointment || seen || a.clinics.length || notes.length) ? (
          <div className="ax-chips">
            {a.appointment ? (
              <span className={'ax-chip ' + (a.appointment.hedged ? 'ax-chip--amber' : 'ax-chip--blue')}
                title={[a.appointment.why, a.appointment.rule].filter(Boolean).join(' ')}>
                <span><b>{a.appointment.label}</b>{a.appointment.hedged ? ' · nothing decided it' : ''}</span>
              </span>
            ) : null}
            {seen ? (
              <span className={'ax-chip ' + (seen.here && bookable ? 'ax-chip--blue' : '')}
                title={seen.quote ? 'The patient’s words: “' + seen.quote + '”. From the message, not the record.' : 'From the message, not the record.'}>
                <span>
                  {seen.here && bookable ? <>Book with <b>{seen.who || 'whoever saw it'}</b></> : <>Seen before: <b>{seenText}</b></>}
                  {!seen.here ? ' · elsewhere' : ''}
                </span>
              </span>
            ) : null}
            {a.clinics.map((c) => (
              <span key={c.label} className="ax-chip ax-chip--green" title={c.because ? 'The patient’s words: “' + c.because + '”' : ''}>
                <span><b>{c.label}</b> could do this</span>
              </span>
            ))}
            {notes.map((n, i) => (
              <span key={'n' + i} className="ax-chip ax-chip--note">
                <Rich text={n} />
              </span>
            ))}
          </div>
        ) : null}

        {a.requests.length ? (
          <div>
            <span className="ax-label ax-group__title">Also in this message</span>
            <div className="ax-reqs">
              {a.requests.map((r, i) => (
                <div key={i} className="ax-req">
                  <span className="ax-req__what">{r.what}{r.who ? <span className="ax-req__who"> · for {r.who}</span> : null}</span>
                  <span className={'ax-req__goes' + (r.goes ? '' : ' ax-req__goes--open')}>{r.goes || 'Your call'}</span>
                  {r.note && r.goes ? <span className="ax-req__note">{r.note}</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {(a.reasoning || a.because) ? (
          <div className="ax-why">
            <span>
              {a.reasoning ? <Rich text={a.reasoning} /> : null}
              {a.because ? <> {a.reasoning ? '' : 'Decided by '}<span className="ax-quote">“{a.because}”</span></> : null}
            </span>
          </div>
        ) : null}
      </div>

      <div className="ax-folds">
        {a.steps.length ? (
          <Fold label={a.urgent ? 'What to do now' : 'How to action it'} meta={a.steps.length + ' steps'} open={a.urgent}>
            <ol className="ax-steps">{a.steps.map((st, i) => <li key={i}><Rich text={st} /></li>)}</ol>
          </Fold>
        ) : null}
        {(!bookable ? [] : a.details).length || a.flags.length ? (
          <Fold label="For the clinician" meta={(a.details.length + a.flags.length) + ''}>
            {bookable && a.details.length ? <ul className="ax-list">{a.details.map((d, i) => <li key={i}><Rich text={d} /></li>)}</ul> : null}
            {a.flags.length ? (
              <>
                <div className="ax-sub">Also true of this patient</div>
                <ul className="ax-list">{a.flags.map((f, i) => <li key={i}><Rich text={f} /></li>)}</ul>
              </>
            ) : null}
          </Fold>
        ) : null}
        <Fold label="What this service takes" meta={a.ruledOut.length ? a.ruledOut.length + ' considered' : ''}>
          {a.covers ? <><div className="ax-sub">Takes</div><div>{a.covers}</div></> : null}
          {a.refuses ? <><div className="ax-sub">Doesn’t take</div><div>{a.refuses}</div></> : null}
          {a.ruledOut.length ? (
            <>
              <div className="ax-sub">Considered and not chosen</div>
              <ul className="ax-list">{a.ruledOut.map((r, i) => <li key={i}><b>{r.label}</b> — {r.why}</li>)}</ul>
            </>
          ) : null}
        </Fold>
      </div>

      <div className="ax-foot">
        <span>Routed by reading the whole message, not keywords. If it has misread the patient, route it yourself.</span>
        {answer.source && answer.source.length ? <span className="ax-foot__src">From: {answer.source.join(' · ')}</span> : null}
      </div>
    </div>
  );
}
