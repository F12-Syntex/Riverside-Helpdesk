'use client';

// Renders a template's block list.
//
// This is the whole presentation layer for a templated answer, and it is
// deliberately dumb: it draws blocks and makes no decisions. Every judgement —
// which route a referral takes, whether a clinic type is recorded, what counts
// as critical — was made in JavaScript before the blocks reached here.
//
// The look follows the answer card in the chat so a templated answer and a
// written one do not read as two different products: NHS blue for the thing to
// act on, amber for a caveat, red for a rule that causes harm if missed.
import React, { useState } from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import Rich from '../chat/Rich';
import Md from '../chat/Md';

const TONE = {
  info: { bar: '#005eb8', bg: '#f0f6fb', ink: '#1c3d5a', icon: Icons.infoCircle },
  warn: { bar: '#ecd39a', bg: '#fffdf5', ink: '#8a6100', icon: Icons.alertCircle },
  critical: { bar: '#d5281b', bg: '#fdf4f3', ink: '#a51b0f', icon: Icons.alertCircle },
};

// The values the reader has to type, and nothing else.
//
// Every value is the same size on purpose. An earlier version set the important
// ones larger, which read as two different kinds of thing sharing one table and
// made the panel harder to scan rather than easier. What makes a value
// important is that it is IN here — the panel is titled with where the values
// go, and anything the reader does not type at that moment lives behind a
// disclosure instead.
//
// A value the practice does not record says so rather than rendering blank: a
// blank reads as "nothing to set", and a guess sends a referral to the wrong
// service.
function Fields({ title, items }) {
  return (
    <div style={s('border:1px solid #d8e1e5;border-radius:12px;background:#fff;overflow:hidden;')}>
      {title && (
        <div style={s('padding:8px 16px;background:#005eb8;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>
          {title}
        </div>
      )}
      {items.map((f, i) => (
        <div key={i} style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;padding:11px 16px;' + (i ? 'border-top:1px solid #eef1f2;' : ''))}>
          <span style={s('flex:none;min-width:104px;font-size:13.5px;color:#4c6272;')}>{f.label}</span>
          {f.value ? (
            <span style={s('flex:1 1 auto;min-width:0;overflow-wrap:anywhere;font-size:16px;font-weight:700;color:#212b32;')}>{f.value}</span>
          ) : (
            <span style={s('flex:1 1 auto;display:flex;gap:7px;align-items:center;font-size:15px;font-weight:600;color:#8a6100;')}>
              <Svg w={15} stroke="#b58500" sw={2.2} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
              {f.missing || 'Not recorded'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Note({ tone, text }) {
  const t = TONE[tone] || TONE.info;
  return (
    <div style={s('display:flex;gap:9px;align-items:flex-start;border-left:4px solid ' + t.bar + ';background:' + t.bg + ';border-radius:0 10px 10px 0;padding:10px 14px;')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={15} stroke={t.bar} sw={2.2}>{t.icon}</Svg></span>
      <span style={s('font-size:14.5px;line-height:1.5;color:' + t.ink + ';')}><Rich text={text} /></span>
    </div>
  );
}

// The procedure a reader usually does not need. Shut by default: the doctor has
// normally already made the referral letter, and putting those steps in front
// of a receptionist sends them to redo work that already exists.
function Expand({ label, hint, blocks }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={s('border:1px solid #d8e1e5;border-radius:12px;background:#fff;overflow:hidden;')}>
      <Hover tag="button" type="button" onClick={() => setOpen(!open)}
        base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;padding:12px 16px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;"
        hover="background:#f7fbff;">
        <Svg w={16} sw={2.4} style={s('flex:none;transition:transform .15s ease;' + (open ? 'transform:rotate(90deg);' : ''))}>{Icons.arrow}</Svg>
        <span style={s('flex:1;min-width:0;')}>{label}</span>
      </Hover>
      {open && (
        <div style={s('padding:2px 16px 14px;display:flex;flex-direction:column;gap:12px;border-top:1px solid #eef1f2;')}>
          {hint && <div style={s('font-size:13px;color:#768692;padding-top:10px;')}>{hint}</div>}
          <Blocks blocks={blocks} />
        </div>
      )}
    </div>
  );
}

// The label is optional and usually absent: on a contact lookup the card is
// already titled with the service, so repeating the name inside it said the
// same thing twice. It is only rendered when a card carries several contacts
// and they need telling apart.
function Contacts({ items }) {
  return (
    <div style={s('display:flex;flex-direction:column;gap:10px;')}>
      {items.map((c, i) => (
        <div key={i} style={s('border:1px solid #d8e1e5;border-left:4px solid #005eb8;border-radius:0 12px 12px 0;background:#fff;padding:12px 16px;')}>
          {c.label && <div style={s('font-size:15px;font-weight:700;color:#212b32;margin-bottom:5px;')}>{c.label}</div>}
          {c.tel && <div style={s('font-size:26px;font-weight:700;letter-spacing:-0.01em;color:#005eb8;')}>{c.tel}</div>}
          {c.email && <div style={s('margin-top:3px;font-size:14.5px;font-weight:600;color:#212b32;overflow-wrap:anywhere;')}>{c.email}</div>}
          {c.note && <div style={s('margin-top:5px;font-size:13.5px;color:#4c6272;')}>{c.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function Blocks({ blocks }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'fields') return <Fields key={i} title={b.title} items={b.items} />;
        if (b.type === 'note') return <Note key={i} tone={b.tone} text={b.text} />;
        if (b.type === 'expand') return <Expand key={i} label={b.label} hint={b.hint} blocks={b.blocks} />;
        if (b.type === 'contacts') return <Contacts key={i} items={b.items} />;
        if (b.type === 'steps') {
          return (
            <ol key={i} style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;')}>
              {b.items.map((it, n) => (
                <li key={n} style={s('display:flex;gap:12px;align-items:flex-start;')}>
                  <span style={s('flex:none;width:24px;height:24px;border-radius:50%;background:#005eb8;color:#fff;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}>{n + 1}</span>
                  <span style={s('flex:1;min-width:0;font-size:15.5px;line-height:1.5;color:#212b32;')}><Rich text={it} /></span>
                </li>
              ))}
            </ol>
          );
        }
        if (b.type === 'bullets') {
          return (
            <ul key={i} style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;')}>
              {b.title && (
                <li style={s('font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4c6272;margin-bottom:1px;')}>{b.title}</li>
              )}
              {b.items.map((it, n) => (
                <li key={n} style={s('display:flex;gap:10px;align-items:flex-start;')}>
                  <span style={s('flex:none;width:5px;height:5px;border-radius:50%;background:#005eb8;margin-top:9px;')} />
                  <span style={s('flex:1;min-width:0;font-size:15.5px;line-height:1.5;color:#212b32;')}><Rich text={it} /></span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === 'table') {
          return (
            <div key={i} style={s('overflow-x:auto;border:1px solid #d8e1e5;border-radius:12px;background:#fff;')}>
              <table style={s('width:100%;border-collapse:collapse;font-size:14.5px;')}>
                <thead>
                  <tr>{b.head.map((h, n) => <th key={n} style={s('text-align:left;padding:9px 14px;background:#f0f4f5;font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#4c6272;')}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, n) => (
                    <tr key={n}>{r.map((c, m) => <td key={m} style={s('padding:9px 14px;border-top:1px solid #eef1f2;color:#212b32;')}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.type === 'ask') {
          return (
            <div key={i} style={s('border:1px solid #cfe1f0;border-left:4px solid #005eb8;border-radius:0 12px 12px 0;background:#fff;padding:14px 16px;')}>
              <div style={s('font-size:16px;font-weight:600;color:#212b32;margin-bottom:10px;')}>{b.question}</div>
              <div style={s('display:flex;flex-wrap:wrap;gap:8px;')}>
                {b.options.map((o, n) => (
                  <span key={n} style={s('background:#f0f6fb;border:1px solid #cfe1f0;border-radius:999px;padding:8px 15px;font-size:14.5px;font-weight:600;color:#005eb8;')}>{o}</span>
                ))}
              </div>
            </div>
          );
        }
        return <div key={i} className="riva-md"><Md text={b.markdown} /></div>;
      })}
    </>
  );
}

export default function TemplateView({ answer }) {
  return (
    <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:14px;overflow:hidden;')}>
      <div style={s('padding:16px 20px 14px;border-bottom:1px solid #eef1f2;')}>
        <div style={s('font-size:21px;font-weight:700;letter-spacing:-0.015em;color:#212b32;')}>{answer.title}</div>
        {answer.subtitle && <div style={s('margin-top:2px;font-size:14px;font-weight:600;color:#4c6272;')}>{answer.subtitle}</div>}
      </div>
      {answer.warn && (
        <div style={s('display:flex;gap:9px;align-items:center;padding:10px 20px;background:#fdf4f3;border-bottom:1px solid #f0c2bd;')}>
          <Svg w={16} stroke="#d5281b" sw={2.4} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
          <span style={s('font-size:14px;font-weight:700;color:#a51b0f;')}>{answer.warn}</span>
        </div>
      )}
      <div style={s('padding:16px 20px 18px;display:flex;flex-direction:column;gap:14px;')}>
        <Blocks blocks={answer.blocks} />
      </div>
      {!!answer.source.length && (
        <div style={s('padding:9px 20px 12px;border-top:1px solid #eef1f2;font-size:12.5px;color:#768692;')}>
          From: {answer.source.join(' · ')}
        </div>
      )}
    </div>
  );
}
