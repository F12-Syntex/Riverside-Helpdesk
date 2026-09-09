'use client';

// Everything the message asked for, and what happened to each of them.
//
// THE CARD ANSWERS ONE REQUEST. This says how many there were. A message with
// five things in it produced a single knee appointment card, and the card ended
// on "book the patient in" — which reads, correctly, as the job being finished.
// Four requests had gone, including a hoarse voice with a stone of weight loss
// on it, and nothing on screen said so.
//
// So this sits beside whatever card is showing and never goes away on its own.
// It costs nothing to produce — it is a list of what the model already returned
// — and it is the backstop for every pattern in lib/safety that misses, because
// a regex cannot match a paraphrase and this does not have to: it lists what was
// written, whether or not anything recognised it.
//
// AN UNANSWERED ITEM IS TAPPABLE and asks that one item on its own, through the
// same re-ask the clarify options use. Answering the fifth thing somebody wrote
// should be one press, not retyping it.
//
// DISMISSAL IS EXPLICIT AND RECORDED, AND IT DOES NOT BLOCK ANYTHING. A
// receptionist who cannot close a panel learns to ignore panels, and an ignored
// panel is worse than no panel at all — so pressing Done writes a row and
// changes nothing else.
import React, { useState } from 'react';
import { s, Hover, Svg, Icons } from '../ui';

// Three states, and they have to be told apart at a glance from three feet away
// with a patient at the desk.
const TONE = {
  urgent: { bar: '#ff7b72', chip: '#261619', ink: '#ff9d96' },
  open: { bar: '#4b3d1f', chip: '#1b1a15', ink: '#e0b85f' },
  done: { bar: '#56c98a', chip: '#161618', ink: '#7fdcaa' },
};

function Item({ item, onAsk, onDismiss }) {
  const [closed, setClosed] = useState(false);
  const tone = TONE[closed ? 'done' : item.tone] || TONE.open;
  const label = closed ? 'Dealt with' : item.statusLabel;

  return (
    <li style={s('display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-top:1px solid #1c1c1f;')}>
      <span style={s('flex:none;width:4px;align-self:stretch;border-radius:2px;background:' + tone.bar + ';')} />
      <span style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;')}>
        <span style={s('display:flex;flex-wrap:wrap;align-items:center;gap:8px;')}>
          <span style={s('font-size:15.5px;font-weight:700;color:#e9e9ec;overflow-wrap:anywhere;')}>{item.label}</span>
          <span style={s('flex:none;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700;background:' + tone.chip + ';color:' + tone.ink + ';')}>{label}</span>
        </span>
        {/* The patient's own words, never a rewrite of them. When the gist and
            the span are the same thing there is nothing to add. */}
        {item.text && item.text !== item.label && (
          <span style={s('font-size:13.5px;line-height:1.45;color:#9a9aa3;overflow-wrap:anywhere;')}>“{item.text}”</span>
        )}
        {(item.askable && !closed) && (
          <span style={s('display:flex;flex-wrap:wrap;gap:8px;margin-top:2px;')}>
            <Hover tag="button" type="button" className="riva-lift" onClick={() => onAsk(item)}
              base="background:#1b1b1f;border:1px solid #3a2b2a;border-radius:999px;padding:6px 14px;font:inherit;font-size:14px;font-weight:600;color:#e0554f;cursor:pointer;"
              hover="background:#e0554f;border-color:#e0554f;color:#ffffff;">
              Answer this one
            </Hover>
            <Hover tag="button" type="button" onClick={() => { setClosed(true); onDismiss(item); }}
              base="background:#141416;border:1px solid #2a2a2e;border-radius:999px;padding:6px 14px;font:inherit;font-size:14px;font-weight:600;color:#9a9aa3;cursor:pointer;"
              hover="border-color:#56c98a;color:#7fdcaa;background:#161618;">
              I have dealt with it
            </Hover>
          </span>
        )}
      </span>
    </li>
  );
}

export default function UnresolvedPanel({ panel, onAsk, onDismiss }) {
  if (!panel || !panel.items || panel.items.length < 2) return null;

  return (
    <div style={s('margin:16px 0 0;background:#141416;border:1px solid #26262a;border-radius:14px;overflow:hidden;')}>
      <div style={s('padding:13px 18px 12px;border-bottom:1px solid #1c1c1f;')}>
        <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:9px;')}>
          <Svg w={16} stroke="#9a9aa3" sw={2.2} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
          <span style={s('flex:1;min-width:0;font-size:17px;font-weight:700;color:#e9e9ec;')}>{panel.title}</span>
          {panel.open > 0 && (
            <span style={s('flex:none;border-radius:999px;padding:3px 11px;font-size:12.5px;font-weight:700;background:#1b1a15;color:#e0b85f;border:1px solid #4b3d1f;')}>
              {panel.open} not answered
            </span>
          )}
        </div>
        <div style={s('margin-top:3px;font-size:13.5px;color:#9a9aa3;')}>{panel.subtitle}</div>
      </div>
      <ul style={s('margin:0;padding:0 18px 6px;list-style:none;')}>
        {panel.items.map((item) => (
          <Item key={item.id} item={item} onAsk={onAsk} onDismiss={onDismiss} />
        ))}
      </ul>
      {panel.note && (
        <div style={s('padding:9px 18px 12px;border-top:1px solid #1c1c1f;font-size:12.5px;color:#74747d;')}>{panel.note}</div>
      )}
    </div>
  );
}
