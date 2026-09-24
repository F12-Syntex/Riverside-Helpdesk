'use client';

// Renders a template's block list.
//
// This is the whole presentation layer for a templated answer, and it is
// deliberately dumb: it draws blocks and makes no decisions. Every judgement —
// which route a referral takes, whether a clinic type is recorded, what counts
// as critical — was made in JavaScript before the blocks reached here.
//
// THE ONE THING IT DOES DO IS GROUP, and only for looks. The order of the
// blocks is never changed and nothing is dropped:
//
//   - an INFO note straight after a set of fields is that set's explanation
//     ("Why here", "What decided it"), so it is drawn as the panel's footnote
//     rather than as a separate box — the card reads as a few panels instead
//     of a stack of alternating boxes. A caution or a critical note is never
//     folded in: those stand on their own, at full weight;
//   - a run of disclosures ("How the reason was written", …) is one list with
//     dividers rather than five separate boxes.
//
// The first set of fields on a card is its LEAD — where it goes, the form to
// use — and is drawn a size up with the theme's colours along its edge, so
// the decision is the first thing read.
//
// NHS blue for the thing to act on, amber for a caveat, red for a rule that
// causes harm if missed. The shapes live in globals.css (.riva-tv-*).
import React, { useState } from 'react';
import { s, Svg, Icons } from '../ui';
import Rich from '../chat/Rich';
import Md from '../chat/Md';
import CopyButton from './CopyButton';
import ErsForm from './ErsForm';
import ProfMessage from './ProfMessage';
import PathologyForm from './PathologyForm';

const TONES = ['info', 'warn', 'critical'];
const toneOf = (tone) => (TONES.includes(tone) ? tone : 'info');
const NOTE_ICON = { info: Icons.infoCircle, warn: Icons.alertCircle, critical: Icons.alertCircle };

// The values the reader has to type, and nothing else.
//
// Every value in a panel is the same size on purpose: what makes a value
// important is that it is IN here. A value the practice does not record says
// so rather than rendering blank: a blank reads as "nothing to set", and a
// guess sends a referral to the wrong service.
function Fields({ title, items, footnote, lead }) {
  return (
    <section className={'riva-tv-panel' + (lead ? ' is-lead' : '')}>
      {title && (
        <div className="riva-tv-panel-head">
          <span className="riva-tv-panel-dot" />
          {title}
        </div>
      )}
      <div className="riva-tv-rows">
        {items.map((f, i) => (
          <div key={i} className="riva-tv-row">
            <span className="riva-tv-label">{f.label}</span>
            {f.value ? (
              <>
                <span className="riva-tv-value">
                  {f.value}
                  {/* What goes with the value without being part of it — a
                      medication's directions under the drug that gets copied.
                      Quieter, and never inside the Copy. */}
                  {f.hint && <span className="riva-tv-hint">{f.hint}</span>}
                </span>
                {/* Only on the values that get typed somewhere else. */}
                {f.copy && <CopyButton value={f.value} small />}
              </>
            ) : (
              <span className="riva-tv-missing">
                <Svg w={15} sw={2.2} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
                {f.missing || 'Not recorded'}
              </span>
            )}
          </div>
        ))}
      </div>
      {footnote && (
        <div className="riva-tv-foot">
          <Svg w={15} sw={2.2} style={s('flex:none;margin-top:2px;')}>{Icons.infoCircle}</Svg>
          <span><Rich text={footnote} /></span>
        </div>
      )}
    </section>
  );
}

function Note({ tone, text }) {
  const t = toneOf(tone);
  return (
    <div className={'riva-tv-note is-' + t} role={t === 'critical' ? 'alert' : undefined}>
      <span className="riva-tv-note-ico"><Svg w={15} sw={2.4}>{NOTE_ICON[t]}</Svg></span>
      <span className="riva-tv-note-text"><Rich text={text} /></span>
    </div>
  );
}

// The procedure a reader usually does not need. Shut by default: putting those
// steps in front of a receptionist sends them to redo work that already exists.
function ExpandRow({ label, hint, blocks }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'riva-tv-more-item' + (open ? ' is-open' : '')}>
      <button type="button" className="riva-tv-more-btn" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen(!open)}>
        <span className="riva-tv-more-chev"><Svg w={15} sw={2.4}>{Icons.chevronRight}</Svg></span>
        <span className="riva-tv-more-label">{label}</span>
      </button>
      {open && (
        <div className="riva-tv-more-body">
          {hint && <div className="riva-tv-more-hint">{hint}</div>}
          <Blocks blocks={blocks} />
        </div>
      )}
    </div>
  );
}

function ExpandGroup({ items }) {
  return (
    <div className="riva-tv-more">
      {items.map((b, i) => <ExpandRow key={i} label={b.label} hint={b.hint} blocks={b.blocks} />)}
    </div>
  );
}

// Wording to be pasted somewhere else, so it carries its own Copy.
function Message({ label, text }) {
  return (
    <div>
      <div style={s('display:flex;align-items:center;gap:12px;margin-bottom:6px;')}>
        <div style={s('flex:1;min-width:0;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#4c6272;')}>{label}</div>
        <CopyButton value={text} />
      </div>
      <div style={s('padding:13px 16px;background:#fff;border:1px solid #dde4e7;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;font-size:16px;line-height:1.6;white-space:pre-wrap;color:#212b32;')}>{text}</div>
    </div>
  );
}

// The label is only rendered when a card carries several contacts and they
// need telling apart.
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

// Grouping for looks only — see the head of this file. Order is kept.
function group(blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'fields') {
      const next = blocks[i + 1];
      if (next && next.type === 'note' && toneOf(next.tone) === 'info') {
        out.push({ ...b, footnote: next.text });
        i += 1;
      } else {
        out.push(b);
      }
      continue;
    }
    if (b.type === 'expand') {
      const last = out[out.length - 1];
      if (last && last.type === 'expandGroup') last.items.push(b);
      else out.push({ type: 'expandGroup', items: [b] });
      continue;
    }
    out.push(b);
  }
  return out;
}

export function Blocks({ blocks, leadFirst = false }) {
  const grouped = group(blocks);
  const lead = leadFirst ? grouped.findIndex((b) => b.type === 'fields') : -1;
  return (
    <>
      {grouped.map((b, i) => {
        if (b.type === 'fields') return <Fields key={i} title={b.title} items={b.items} footnote={b.footnote} lead={i === lead} />;
        if (b.type === 'ers') return <ErsForm key={i} block={b} />;
        if (b.type === 'profMessage') return <ProfMessage key={i} block={b} />;
        if (b.type === 'pathology') return <PathologyForm key={i} block={b} />;
        if (b.type === 'note') return <Note key={i} tone={b.tone} text={b.text} />;
        if (b.type === 'expandGroup') return <ExpandGroup key={i} items={b.items} />;
        if (b.type === 'contacts') return <Contacts key={i} items={b.items} />;
        if (b.type === 'message') return <Message key={i} label={b.label} text={b.text} />;
        if (b.type === 'steps') {
          return (
            <ol key={i} className="riva-tv-steps">
              {b.items.map((it, n) => (
                <li key={n} className="riva-tv-step">
                  <span className="riva-tv-step-num">{n + 1}</span>
                  <span className="riva-tv-step-text"><Rich text={it} /></span>
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
            <div key={i} style={s('overflow-x:auto;border:1px solid #e1e8ec;border-radius:14px;background:#fff;')}>
              <table style={s('width:100%;border-collapse:collapse;font-size:14.5px;')}>
                <thead>
                  <tr>{b.head.map((h, n) => <th key={n} style={s('text-align:left;padding:9px 14px;background:#f5f8fa;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#4c6272;')}>{h}</th>)}</tr>
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
        if (b.type === 'images') {
          if (!b.items || !b.items.length) return null;
          // Shown at a size worth looking at, never stretched: several of these
          // are small icons cropped out of a screen.
          return (
            <div key={i} style={s('display:flex;flex-direction:column;gap:8px;')}>
              {b.caption && (
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4c6272;')}>{b.caption}</div>
              )}
              <div style={s('display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;')}>
                {b.items.map((img, n) => (
                  <a key={n} href={img.url} target="_blank" rel="noreferrer"
                    style={s('display:inline-flex;max-width:100%;border:1px solid #d8e1e5;border-radius:10px;overflow:hidden;background:#fff;')}>
                    <img src={img.url} alt={img.alt || 'Picture from the practice’s own page'} loading="lazy"
                      style={s('display:block;max-width:100%;width:auto;height:auto;max-height:420px;background:#fff;')} />
                  </a>
                ))}
              </div>
            </div>
          );
        }
        if (b.type === 'ask') {
          return (
            <div key={i} className="riva-tv-panel" style={s('padding:14px 16px;')}>
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
    <div className={'riva-tv' + (answer.warn ? ' is-warn' : '')}>
      <header className="riva-tv-head">
        <div className="riva-tv-title">{answer.title}</div>
        {answer.subtitle && (
          <div className="riva-tv-sub">
            <Svg w={14} sw={2.4} style={s('flex:none;')}>{Icons.arrow}</Svg>
            <span>{answer.subtitle}</span>
          </div>
        )}
        {/* A gap the practice should hear about. It is also written into the
            question log under this flag, so the chip is the reader's half of
            the same record. */}
        {answer.flag && (
          <div className="riva-tv-flag">
            <Svg w={13} sw={2.4}>{Icons.alertCircle}</Svg>Flagged for the practice
          </div>
        )}
      </header>
      {answer.warn && (
        <div className="riva-tv-warn" role="alert">
          <Svg w={16} sw={2.4} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
          <span>{answer.warn}</span>
        </div>
      )}
      <div className="riva-tv-body">
        <Blocks blocks={answer.blocks} leadFirst />
      </div>
      {!!answer.source.length && (
        <footer className="riva-tv-src">
          <Svg w={13} sw={2.2} style={s('flex:none;')}>{Icons.book}</Svg>
          <span>From</span>
          {answer.source.map((x, i) => <span key={i} className="riva-tv-src-chip">{x}</span>)}
        </footer>
      )}
    </div>
  );
}
