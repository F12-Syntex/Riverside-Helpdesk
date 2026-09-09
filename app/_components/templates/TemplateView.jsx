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

// One copy button, used by every block that has something worth copying.
//
// Two ways of doing it, because one of them is not always available: the
// clipboard API needs a secure context, and a practice reaching this over plain
// HTTP on the local network would otherwise get a button that silently does
// nothing — which is worse than no button, because the reader believes it
// worked and pastes the last thing they copied onto a document.
async function copyText(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (e) { /* fall through to the old way */ }
  try {
    const box = document.createElement('textarea');
    box.value = value;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(box);
    return ok;
  } catch (e) {
    return false;
  }
}

// Says what happened, including when it did not work. "Press Ctrl+C" is a worse
// outcome than a copy, and a far better one than a button that lies.
function CopyButton({ value, label = 'Copy', small = false }) {
  const [state, setState] = useState('');
  const run = async () => {
    const ok = await copyText(value);
    setState(ok ? 'done' : 'failed');
    setTimeout(() => setState(''), ok ? 2000 : 4000);
  };
  const text = state === 'done' ? 'Copied' : state === 'failed' ? 'Select and press Ctrl+C' : label;
  return (
    <Hover tag="button" type="button" onClick={run} title={'Copy: ' + value}
      base={'flex:none;display:inline-flex;align-items:center;gap:6px;background:#141416;border:1px solid '
        + (state === 'done' ? '#56c98a' : '#2a2a2e')
        + ';border-radius:999px;padding:' + (small ? '4px 10px' : '5px 12px')
        + ';font:inherit;font-size:' + (small ? '12.5px' : '13px')
        + ';font-weight:600;color:' + (state === 'done' ? '#7fdcaa' : '#e0554f') + ';cursor:pointer;'}
      hover="border-color:#e0554f;background:#151518;">
      <Svg w={small ? 12 : 13} sw={2.2}>{state === 'done' ? Icons.check : Icons.copy}</Svg>{text}
    </Hover>
  );
}

const TONE = {
  info: { bar: '#e0554f', bg: '#1b1b1f', ink: '#8fb4d6', icon: Icons.infoCircle },
  warn: { bar: '#4b3d1f', bg: '#1b1a15', ink: '#e0b85f', icon: Icons.alertCircle },
  critical: { bar: '#ff7b72', bg: '#261619', ink: '#ff9d96', icon: Icons.alertCircle },
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
    <div style={s('border:1px solid #26262a;border-radius:12px;background:#141416;overflow:hidden;')}>
      {title && (
        <div style={s('padding:8px 16px;background:#e0554f;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>
          {title}
        </div>
      )}
      {items.map((f, i) => (
        <div key={i} style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;padding:11px 16px;' + (i ? 'border-top:1px solid #1c1c1f;' : ''))}>
          <span style={s('flex:none;min-width:104px;font-size:13.5px;color:#9a9aa3;')}>{f.label}</span>
          {f.value ? (
            <>
              <span style={s('flex:1 1 auto;min-width:0;overflow-wrap:anywhere;font-size:16px;font-weight:700;color:#e9e9ec;')}>
                {f.value}
                {/* What goes with the value without being part of it — a
                    medication's directions and quantity under the drug that
                    gets copied. Quieter, and never inside the Copy. */}
                {f.hint && <span style={s('display:block;font-size:13.5px;font-weight:400;color:#9a9aa3;margin-top:2px;')}>{f.hint}</span>}
              </span>
              {/* Only on the values that get typed somewhere else. A Copy on
                  every row would be four buttons on a referral card and no
                  signal about which one the reader actually needs. */}
              {f.copy && <CopyButton value={f.value} small />}
            </>
          ) : (
            <span style={s('flex:1 1 auto;display:flex;gap:7px;align-items:center;font-size:15px;font-weight:600;color:#e0b85f;')}>
              <Svg w={15} stroke="#e0b85f" sw={2.2} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
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
    <div style={s('border:1px solid #26262a;border-radius:12px;background:#141416;overflow:hidden;')}>
      <Hover tag="button" type="button" onClick={() => setOpen(!open)}
        base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;padding:12px 16px;font:inherit;font-size:15px;font-weight:600;color:#e0554f;cursor:pointer;"
        hover="background:#151518;">
        <Svg w={16} sw={2.4} style={s('flex:none;transition:transform .15s ease;' + (open ? 'transform:rotate(90deg);' : ''))}>{Icons.arrow}</Svg>
        <span style={s('flex:1;min-width:0;')}>{label}</span>
      </Hover>
      {open && (
        <div style={s('padding:2px 16px 14px;display:flex;flex-direction:column;gap:12px;border-top:1px solid #1c1c1f;')}>
          {hint && <div style={s('font-size:13px;color:#74747d;padding-top:10px;')}>{hint}</div>}
          <Blocks blocks={blocks} />
        </div>
      )}
    </div>
  );
}

// Wording to be pasted somewhere else, so it carries its own Copy. Taking text
// out of an answer by hand is the one thing the reader should never have to do.
function Message({ label, text }) {
  return (
    <div>
      <div style={s('display:flex;align-items:center;gap:12px;margin-bottom:6px;')}>
        <div style={s('flex:1;min-width:0;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#9a9aa3;')}>{label}</div>
        <CopyButton value={text} />
      </div>
      <div style={s('padding:13px 16px;background:#141416;border:1px solid #26262a;border-left:4px solid #e0554f;border-radius:0 8px 8px 0;font-size:16px;line-height:1.6;white-space:pre-wrap;color:#e9e9ec;')}>{text}</div>
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
        <div key={i} style={s('border:1px solid #26262a;border-left:4px solid #e0554f;border-radius:0 12px 12px 0;background:#141416;padding:12px 16px;')}>
          {c.label && <div style={s('font-size:15px;font-weight:700;color:#e9e9ec;margin-bottom:5px;')}>{c.label}</div>}
          {c.tel && <div style={s('font-size:26px;font-weight:700;letter-spacing:-0.01em;color:#e0554f;')}>{c.tel}</div>}
          {c.email && <div style={s('margin-top:3px;font-size:14.5px;font-weight:600;color:#e9e9ec;overflow-wrap:anywhere;')}>{c.email}</div>}
          {c.note && <div style={s('margin-top:5px;font-size:13.5px;color:#9a9aa3;')}>{c.note}</div>}
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
        if (b.type === 'message') return <Message key={i} label={b.label} text={b.text} />;
        if (b.type === 'steps') {
          return (
            <ol key={i} style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;')}>
              {b.items.map((it, n) => (
                <li key={n} style={s('display:flex;gap:12px;align-items:flex-start;')}>
                  <span style={s('flex:none;width:24px;height:24px;border-radius:50%;background:#e0554f;color:#ffffff;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}>{n + 1}</span>
                  <span style={s('flex:1;min-width:0;font-size:15.5px;line-height:1.5;color:#e9e9ec;')}><Rich text={it} /></span>
                </li>
              ))}
            </ol>
          );
        }
        if (b.type === 'bullets') {
          return (
            <ul key={i} style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;')}>
              {b.title && (
                <li style={s('font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9a9aa3;margin-bottom:1px;')}>{b.title}</li>
              )}
              {b.items.map((it, n) => (
                <li key={n} style={s('display:flex;gap:10px;align-items:flex-start;')}>
                  <span style={s('flex:none;width:5px;height:5px;border-radius:50%;background:#e0554f;margin-top:9px;')} />
                  <span style={s('flex:1;min-width:0;font-size:15.5px;line-height:1.5;color:#e9e9ec;')}><Rich text={it} /></span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === 'table') {
          return (
            <div key={i} style={s('overflow-x:auto;border:1px solid #26262a;border-radius:12px;background:#141416;')}>
              <table style={s('width:100%;border-collapse:collapse;font-size:14.5px;')}>
                <thead>
                  <tr>{b.head.map((h, n) => <th key={n} style={s('text-align:left;padding:9px 14px;background:#0b0b0c;font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9a9aa3;')}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, n) => (
                    <tr key={n}>{r.map((c, m) => <td key={m} style={s('padding:9px 14px;border-top:1px solid #1c1c1f;color:#e9e9ec;')}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.type === 'images') {
          if (!b.items || !b.items.length) return null;
          // Shown at a size worth looking at rather than as thumbnails: these
          // are screenshots of the screen being described, and a screenshot too
          // small to read is decoration. Opening one gives the full picture.
          return (
            <div key={i} style={s('display:flex;flex-direction:column;gap:8px;')}>
              {b.caption && (
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9a9aa3;')}>{b.caption}</div>
              )}
              {/* Never stretched. Several of these are small icons cropped out
                  of a screen, and blowing one up to fill a column turns a
                  legible 70px icon into a blurred smear. Big screenshots are
                  bounded instead, and opening one gives the full picture. */}
              <div style={s('display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;')}>
                {b.items.map((img, n) => (
                  <a key={n} href={img.url} target="_blank" rel="noreferrer"
                    style={s('display:inline-flex;max-width:100%;border:1px solid #26262a;border-radius:10px;overflow:hidden;background:#141416;')}>
                    <img src={img.url} alt={img.alt || 'Picture from the practice’s own page'} loading="lazy"
                      style={s('display:block;max-width:100%;width:auto;height:auto;max-height:420px;background:#141416;')} />
                  </a>
                ))}
              </div>
            </div>
          );
        }
        if (b.type === 'ask') {
          return (
            <div key={i} style={s('border:1px solid #3a2b2a;border-left:4px solid #e0554f;border-radius:0 12px 12px 0;background:#141416;padding:14px 16px;')}>
              <div style={s('font-size:16px;font-weight:600;color:#e9e9ec;margin-bottom:10px;')}>{b.question}</div>
              <div style={s('display:flex;flex-wrap:wrap;gap:8px;')}>
                {b.options.map((o, n) => (
                  <span key={n} style={s('background:#1b1b1f;border:1px solid #3a2b2a;border-radius:999px;padding:8px 15px;font-size:14.5px;font-weight:600;color:#e0554f;')}>{o}</span>
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
    <div style={s('background:#141416;border:1px solid #26262a;border-radius:14px;overflow:hidden;')}>
      <div style={s('padding:16px 20px 14px;border-bottom:1px solid #1c1c1f;')}>
        <div style={s('font-size:21px;font-weight:700;letter-spacing:-0.015em;color:#e9e9ec;')}>{answer.title}</div>
        {answer.subtitle && <div style={s('margin-top:2px;font-size:14px;font-weight:600;color:#9a9aa3;')}>{answer.subtitle}</div>}
      </div>
      {answer.warn && (
        <div style={s('display:flex;gap:9px;align-items:center;padding:10px 20px;background:#261619;border-bottom:1px solid #502624;')}>
          <Svg w={16} stroke="#ff7b72" sw={2.4} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
          <span style={s('font-size:14px;font-weight:700;color:#ff9d96;')}>{answer.warn}</span>
        </div>
      )}
      <div style={s('padding:16px 20px 18px;display:flex;flex-direction:column;gap:14px;')}>
        <Blocks blocks={answer.blocks} />
      </div>
      {!!answer.source.length && (
        <div style={s('padding:9px 20px 12px;border-top:1px solid #1c1c1f;font-size:12.5px;color:#74747d;')}>
          From: {answer.source.join(' · ')}
        </div>
      )}
    </div>
  );
}
