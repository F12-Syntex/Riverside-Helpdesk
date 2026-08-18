'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';
import GuideCard from './chat/GuideCard';
import SuggestBubble from './chat/SuggestBubble';
import AiAnswer from './chat/AiAnswer';
import TriageAnswer from './chat/TriageAnswer';
import DocFileAnswer from './chat/DocFileAnswer';

/* ------------------------------------------------------------------ *
 * One question at a time.
 *
 * The question being asked IS the page: its heading is the question and
 * its body is the answer. Every other question asked in this session is
 * minimised to a single numbered line above it — 01, 02, in the order
 * they were asked — with Show answer to bring one back.
 * ------------------------------------------------------------------ */

/* ---------------------------------------------------------------- *
 * A question, or a wall of pasted text.
 *
 * Both arrive the same way and they are not the same thing. "How do I
 * refer for an ECG" is a heading and reads like one. A consultation
 * pasted in for triage is six hundred words of somebody else's message,
 * and setting THAT at heading size pushes the answer — the thing that
 * was asked for — clean off the screen.
 *
 * So a long one is treated as what it is: a short line saying what was
 * asked, and the message itself below it in reading type, folded to a
 * few lines with the rest one press away. Nothing is thrown away; the
 * whole text is on the page and can be opened, because it is the only
 * record of what the answer was given about.
 * ---------------------------------------------------------------- */

// Roughly two lines at heading size. Past this, a heading is the wrong shape.
const HEADING_LIMIT = 120;

// The opening of a long message, cut at a sentence or a word rather than
// mid-syllable.
function opening(text, max = 96) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentence = cut.search(/[.!?](?=[^.!?]*$)/);
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : cut) + '…';
}

function TurnQuestion({ question }) {
  const [open, setOpen] = React.useState(false);
  const text = String(question || '');

  if (text.length <= HEADING_LIMIT) {
    return (
      <h1 className="riva-turn-q" style={s('font-size:32px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;margin:8px 0 0;text-wrap:pretty;animation:rivaHeadIn .5s cubic-bezier(.2,.7,.3,1) both;')}>
        {text}
      </h1>
    );
  }

  return (
    <div style={s('animation:rivaHeadIn .5s cubic-bezier(.2,.7,.3,1) both;')}>
      <h1 className="riva-turn-q" style={s('font-size:22px;font-weight:700;letter-spacing:-0.015em;line-height:1.3;margin:8px 0 0;text-wrap:pretty;')}>
        {opening(text)}
      </h1>
      <div style={s('margin-top:10px;background:#fff;border:1px solid #dde4e7;border-radius:12px;padding:12px 14px;')}>
        <div style={s('font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a99a3;margin-bottom:6px;')}>
          What was pasted
        </div>
        <div style={s('font-size:14.5px;line-height:1.55;color:#4c6272;white-space:pre-wrap;overflow-wrap:anywhere;'
          + (open ? '' : 'max-height:104px;overflow:hidden;-webkit-mask-image:linear-gradient(to bottom,#000 60%,transparent);mask-image:linear-gradient(to bottom,#000 60%,transparent);'))}>
          {text}
        </div>
        <Hover tag="button" type="button" onClick={() => setOpen(!open)}
          base="margin-top:8px;background:none;border:none;padding:0;font:inherit;font-size:13.5px;font-weight:600;color:#005eb8;text-decoration:underline;cursor:pointer;"
          hover="color:#003087;">
          {open ? 'Show less' : 'Show the whole message'}
        </Hover>
      </div>
    </div>
  );
}

export default function ChatView({ v }) {
  return (
    <div className="riva-column" style={s('max-width:820px;margin:0 auto;padding:28px 24px 28px;display:flex;flex-direction:column;')}>

      {v.isEmpty && (
        // Sits a fixed margin above the dock, which is centred while nothing
        // has been asked. Where that is on the page is worked out from the
        // dock's own geometry in globals.css (.riva-hero-block), so the gap
        // between this text and the field holds on every screen size.
        <div className="riva-hero-block" style={s('text-align:center;animation:rivaAnswerIn .5s cubic-bezier(.2,.7,.3,1) both;')}>
          <h1 className="riva-hero-h1" style={s('font-size:38px;font-weight:700;letter-spacing:-0.02em;margin:0;')}>What do you need?</h1>
          {/* Only when the host page sets one. The default is nothing: a line
              explaining what can be asked is read once and then sits there. */}
          {v.welcome && <p style={s('font-size:17px;color:#4c6272;max-width:52ch;margin:10px auto 0;text-wrap:pretty;')}>{v.welcome}</p>}
        </div>
      )}

      {/* Minimised history — one numbered line per question, not a transcript. */}
      {v.hasHistory && (
        <div style={s('display:flex;flex-direction:column;margin-bottom:14px;')}>
          {v.history.map((t) => (
            <div key={t.key} className="riva-history-row" style={s('display:flex;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid #dde4e7;')}>
              <span style={s('flex:none;font-size:13px;font-weight:600;color:#8a99a3;font-variant-numeric:tabular-nums;')}>{t.num}</span>
              <span style={s('flex:1;min-width:0;font-size:15px;color:#4c6272;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{t.question}</span>
              <Hover tag="button" onClick={t.onOpen}
                base="flex:none;background:none;border:none;padding:0;font:inherit;font-size:14.5px;font-weight:600;color:#005eb8;cursor:pointer;"
                hover="color:#003087;text-decoration:underline;">
                Show answer
              </Hover>
            </div>
          ))}
        </div>
      )}

      {/* The active question. Keyed on the turn so switching questions
          remounts the block and it arrives the same way a new one does. */}
      {v.turn && (
        <div key={v.turn.key} style={s('display:flex;flex-direction:column;gap:20px;')}>
          <div>
            {/* The question lands from below as the bar leaves the dock, and
                the rule under it wipes out from the left a beat later. A
                pasted consultation is not a heading — see TurnQuestion. */}
            <TurnQuestion question={v.turn.question} />
            <div style={s('width:68px;height:4px;border-radius:2px;background:#005eb8;margin:14px 0 0;transform-origin:left center;animation:rivaRuleIn .5s cubic-bezier(.2,.7,.3,1) .12s both;')} />
            {/* WHICH KIND OF ANSWER THIS WAS ASKED FOR, when it was chosen with
                a button rather than typed. A typed "/form knee" stays in the
                reader's own words above; this is the same record for the other
                way of saying it, and without it a wrong answer has nothing on
                screen explaining which list it came from. */}
            {v.turn.askedAs && (
              <div style={s('display:inline-flex;align-items:center;gap:6px;margin-top:12px;background:#e8f1f8;border:1px solid #bcd9f0;border-radius:999px;padding:4px 11px;font-size:12.5px;font-weight:700;color:#005eb8;')}>
                <span>Asked as {v.turn.askedAs}</span>
              </div>
            )}
            {v.turn.imageNote && (
              <div style={s('font-size:13.5px;color:#4c6272;margin-top:12px;')}>{v.turn.imageNote}</div>
            )}
            {/* What the local identifier check took out of this question
                before it was sent. The toast that said so has gone by now;
                the question on screen has a hole in it and this is the only
                thing that explains it. It counts what went and quotes none of
                it — see lib/safety/identifiers.mjs. */}
            {v.turn.redactedNote && (
              <div style={s('display:flex;align-items:flex-start;gap:9px;margin-top:14px;background:#fff6cc;border:1px solid #f0dfa0;border-radius:10px;padding:9px 12px;font-size:13.5px;line-height:1.45;color:#5c4a00;')}>
                <Svg w={15} sw={2.2} style={s('flex:none;margin-top:2px;color:#946800;')}>{Icons.triangle}</Svg>
                <span>{v.turn.redactedNote}</span>
              </div>
            )}
            {/* The documents this question was asked about. Named, because an
                answer about "the letter" has to say which letter — and because
                nothing here is stored, so this is the only record of it. */}
            {v.turn.hasDocs && (
              <div style={s('display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;')}>
                {v.turn.docNames.map((name, j) => (
                  <span key={j} style={s('display:inline-flex;align-items:center;gap:7px;max-width:100%;background:#fff;border:1px solid #dde4e7;border-radius:999px;padding:6px 14px;font-size:13.5px;font-weight:600;color:#4c6272;')}>
                    <Svg w={14} sw={2} style={s('flex:none;color:#005eb8;')}>{Icons.file}</Svg>
                    <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{name}</span>
                  </span>
                ))}
              </div>
            )}
            {v.turn.hasImages && (
              <div style={s('display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;')}>
                {v.turn.images.map((src, j) => (
                  <img key={j} src={src} alt="Attached image" style={s('max-width:200px;max-height:160px;border-radius:10px;display:block;background:#fff;border:1px solid #e3e9ec;')} />
                ))}
              </div>
            )}
          </div>

          {v.turn.items.map((m, i) => (
            <div key={i} style={s('animation:rivaAnswerIn .45s cubic-bezier(.2,.7,.3,1) both;animation-delay:' + (0.12 + i * 0.09).toFixed(2) + 's;')}>
              {m.isAnswer && <GuideCard v={m} />}
              {m.isSuggest && <SuggestBubble v={m} />}
              {m.isAi && <AiAnswer v={m} />}
              {m.isTriage && <TriageAnswer v={m} />}
              {m.isDocFile && <DocFileAnswer v={m} />}
            </div>
          ))}

          {v.isViewingHistory && (
            <Hover tag="button" onClick={v.onLatest}
              base="align-self:flex-start;display:inline-flex;align-items:center;gap:8px;background:none;border:none;padding:2px 0;font:inherit;font-size:14.5px;font-weight:600;color:#005eb8;cursor:pointer;"
              hover="color:#003087;">
              <Svg w={16} sw={2.4}>{Icons.arrow}</Svg>Back to the latest question
            </Hover>
          )}
        </div>
      )}
    </div>
  );
}
