'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';

/* ------------------------------------------------------------------ *
 * "Before you pull the duty doctor" — the questions that turn a guess
 * about urgency into an answer.
 *
 * Marking something urgent is not a label, it is a commitment: the duty
 * doctor is interrupted and owes this patient a call inside 2 hours,
 * and everyone else waits behind it. Appointments here are same day
 * anyway, so the question worth asking is never "today or not", it is
 * "does this need the duty doctor pulled off everything else". That is
 * a question about facts nobody on this card has, so the card does not
 * answer it: it hands over the questions to ask, says what each answer
 * would cost, and shows the guidance each one rests on.
 *
 * Nothing here is written by the model. Every question, threshold and
 * citation comes verbatim from lib/triage/urgency.js, the same
 * guarantee the contacts card gives for phone numbers.
 *
 * The card never downgrades anything. The last thing on it is the
 * practice's own standing rule that any doubt goes to the duty doctor,
 * and when the request is already on the 999 list the questions are
 * replaced by a plain instruction not to work through them.
 * ------------------------------------------------------------------ */

// How each answer's cost is drawn. Same NHS palette as the urgency bands
// on the card above, so a "999" here reads as the same thing a red
// emergency band does, and "today" reads as the ordinary blue booking.
const TONES = {
  emergency: { bg: '#fdf2f2', border: '#d5281b', fg: '#a5130b' },
  urgent: { bg: '#fff8e6', border: '#d9a300', fg: '#8a6100' },
  today: { bg: '#e8f1f8', border: '#005eb8', fg: '#003087' },
  pathway: { bg: '#eaf5ee', border: '#007f3b', fg: '#00602c' },
};

function LevelPill({ tone, label }) {
  const t = TONES[tone] || TONES.today;
  return (
    <span style={s('flex:none;display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.03em;border-radius:999px;padding:2px 9px;background:' + t.bg + ';color:' + t.fg + ';border:1px solid ' + t.border + ';')}>
      {label}
    </span>
  );
}

// The guidance behind a question. National guidance is a link, so the
// threshold can be checked rather than taken on trust; the practice's
// own protocols are named but not linked, because they live in the
// knowledge base rather than on the web.
function Evidence({ items }) {
  if (!items || !items.length) return null;
  return (
    <span style={s('display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:5px;')}>
      {items.map((e) => (
        e.url ? (
          <a key={e.id} href={e.url} target="_blank" rel="noreferrer"
            style={s('display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#005eb8;text-decoration:none;border-bottom:1px dotted #a8c6e2;overflow-wrap:anywhere;')}>
            <Svg w={11} sw={2.4} style={s('flex:none;opacity:.8;')}>{Icons.external}</Svg>{e.org} {e.label}
          </a>
        ) : (
          <span key={e.id} style={s('display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#8a99a3;overflow-wrap:anywhere;')}>
            <Svg w={11} sw={2.4} style={s('flex:none;opacity:.8;')}>{Icons.fileLines}</Svg>{e.label}
          </span>
        )
      ))}
    </span>
  );
}

function Question({ q, n }) {
  return (
    <li style={s('display:flex;gap:11px;align-items:flex-start;')}>
      <span style={s('flex:none;width:22px;height:22px;margin-top:2px;border-radius:50%;border:1.5px solid #c3ced4;background:#fff;color:#8a99a3;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;')}>{n}</span>
      <span style={s('flex:1;min-width:0;')}>
        <span style={s('display:flex;flex-wrap:wrap;gap:5px 10px;align-items:baseline;')}>
          <span style={s('flex:1 1 240px;min-width:0;font-size:16.5px;line-height:1.45;color:#212b32;font-weight:600;')}>{q.ask}</span>
          {q.levelLabel ? <LevelPill tone={q.tone} label={'Yes → ' + q.levelLabel} /> : null}
        </span>
        <span style={s('display:block;font-size:14.5px;line-height:1.5;color:#4c6272;margin-top:3px;')}>{q.means}</span>
        <Evidence items={q.evidence} />
      </span>
    </li>
  );
}

export default function UrgencyChecks({ check }) {
  // Long by nature: five questions a set, and up to three sets. Open on
  // the first set and closed on the rest, so the card is a page someone
  // works down rather than a wall they scroll past.
  const [open, setOpen] = React.useState(null);
  if (!check) return null;

  const isEmergency = check.level === 'emergency';
  const openKey = open == null ? ((check.sets[0] || {}).key || null) : open;

  return (
    <div style={s('margin:18px 22px 4px;border:1px solid ' + (isEmergency ? '#f0c9c5' : '#e3d3a4') + ';border-radius:12px;background:' + (isEmergency ? '#fdf2f2' : '#fffdf5') + ';overflow:hidden;')}>
      <div style={s('display:flex;gap:10px;align-items:flex-start;padding:13px 16px;border-bottom:1px solid ' + (isEmergency ? '#f0c9c5' : '#f0e3c2') + ';')}>
        <span style={s('flex:none;margin-top:1px;color:' + (isEmergency ? '#a5130b' : '#8a6100') + ';')}>
          <Svg w={18} sw={2.2}>{isEmergency ? Icons.triangle : Icons.helpCircle}</Svg>
        </span>
        <div style={s('flex:1;min-width:0;')}>
          <div style={s('font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + (isEmergency ? '#a5130b' : '#8a6100') + ';')}>
            {isEmergency ? 'Do not work through questions' : 'Verify before you pull the duty doctor'}
          </div>
          <div style={s('margin-top:4px;font-size:15px;line-height:1.5;color:#212b32;')}>
            {isEmergency
              ? 'This request already matches the practice’s emergency call list. Dial 999 now and tell the duty doctor. The questions below are for deciding whether something is urgent, and this is past that.'
              : check.cost}
          </div>
        </div>
      </div>

      {/* Already an emergency: what matched, and nothing else. */}
      {isEmergency && check.emergencyHits.length ? (
        <div style={s('padding:12px 16px;')}>
          <ul style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;')}>
            {check.emergencyHits.map((h, i) => (
              <li key={i} style={s('font-size:16px;line-height:1.45;color:#212b32;')}>
                <span style={s('color:#a5130b;font-weight:700;margin-right:6px;')}>&bull;</span>{h.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!isEmergency ? (
        <div style={s('padding:14px 16px 4px;')}>
          {/* What the request already says about itself. Shown only when it
              is genuinely an old, stable problem, so it reads as a note
              about this patient rather than as general advice. */}
          {check.settledNote ? (
            <div style={s('display:flex;gap:10px;align-items:flex-start;margin-bottom:16px;padding:11px 13px;background:#e8f1f8;border:1px solid #cfe1f0;border-radius:8px;')}>
              <span style={s('flex:none;margin-top:2px;color:#005eb8;')}><Svg w={16} sw={2.2}>{Icons.clock}</Svg></span>
              <span style={s('font-size:15px;line-height:1.5;color:#212b32;')}>{check.settledNote}</span>
            </div>
          ) : null}

          <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:10px;')}>Ask every time</div>
          <ul style={s('margin:0 0 18px;padding:0;list-style:none;display:flex;flex-direction:column;gap:13px;')}>
            {check.always.map((q, i) => <Question key={i} q={q} n={i + 1} />)}
          </ul>

          {/* The presentation-specific sets. One open at a time: nobody
              works down thirty questions, and the set that matches what
              the patient actually said is the one that is open. */}
          {check.sets.map((set) => {
            const isOpen = set.key === openKey;
            return (
              <div key={set.key} style={s('border-top:1px solid #f0e3c2;')}>
                <Hover tag="button" type="button" onClick={() => setOpen(isOpen ? '' : set.key)}
                  aria-expanded={isOpen}
                  base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;background:none;padding:13px 0;font:inherit;cursor:pointer;color:#212b32;"
                  hover="color:#005eb8;">
                  <span style={s('flex:none;display:flex;transition:transform .18s ease;' + (isOpen ? 'transform:rotate(90deg);' : ''))}>
                    <Svg w={15} sw={2.4}>{Icons.chevronRight}</Svg>
                  </span>
                  <span style={s('flex:1;min-width:0;font-size:15.5px;font-weight:700;')}>{set.label}</span>
                  <span style={s('flex:none;font-size:12.5px;color:#8a99a3;')}>{set.questions.length} to ask</span>
                </Hover>
                {isOpen ? (
                  <ul style={s('margin:0 0 16px;padding:0;list-style:none;display:flex;flex-direction:column;gap:14px;animation:rivaAnswerIn .22s cubic-bezier(.2,.7,.3,1) both;')}>
                    {set.questions.map((q, i) => <Question key={i} q={q} n={i + 1} />)}
                  </ul>
                ) : null}
              </div>
            );
          })}

          {/* How to read the answers. Rules rather than a verdict: the
              answers are in reception's hands, not this card's. */}
          <div style={s('border-top:1px solid #f0e3c2;padding-top:14px;margin-top:2px;')}>
            <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:10px;')}>Then decide</div>
            <div style={s('display:flex;flex-direction:column;gap:12px;')}>
              {check.decision.map((d, i) => (
                <div key={i} style={s('font-size:15.5px;line-height:1.5;color:#212b32;')}>
                  <strong>{d.when}</strong>
                  <span style={s('display:block;color:#4c6272;margin-top:2px;')}>{d.then}</span>
                  <Evidence items={d.evidence} />
                </div>
              ))}
            </div>
          </div>

          {/* The floor. Asking is not the same as downgrading, and this is
              the last word on the card for exactly that reason. */}
          <div style={s('margin:16px 0 14px;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;background:#fff;border:1px solid #d8dde0;border-left:4px solid #007f3b;border-radius:0 8px 8px 0;')}>
            <span style={s('flex:none;margin-top:2px;color:#007f3b;')}><Svg w={16} sw={2.4}>{Icons.shield}</Svg></span>
            <span style={s('min-width:0;')}>
              <span style={s('display:block;font-size:15px;line-height:1.5;color:#212b32;')}>{check.floor.text}</span>
              <Evidence items={check.floor.evidence} />
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
