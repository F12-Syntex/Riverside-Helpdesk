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
 * its body is the answer, with nothing above or below competing for the
 * eye. Everything asked earlier is minimised into a single line, opened
 * only by someone who wants to go back to it.
 * ------------------------------------------------------------------ */

export default function ChatView({ v }) {
  const [openHistory, setOpenHistory] = React.useState(false);
  const turnKey = v.turn ? v.turn.key : -1;

  // Opening an earlier question closes the list behind it — the question
  // asked for is now the page, so the list has done its job.
  React.useEffect(() => { setOpenHistory(false); }, [turnKey]);

  return (
    <div style={s('max-width:820px;margin:0 auto;padding:28px 24px 28px;display:flex;flex-direction:column;gap:18px;')}>

      {v.isEmpty && (
        <div style={s('text-align:center;padding:12vh 0 0;animation:rivaAnswerIn .5s cubic-bezier(.2,.7,.3,1) both;')}>
          <h1 className="riva-hero-h1" style={s('font-size:38px;font-weight:700;letter-spacing:-0.02em;margin:0 0 10px;')}>Ask a question</h1>
          <p style={s('font-size:17px;color:#4c6272;max-width:44ch;margin:0 auto;text-wrap:pretty;')}>{v.welcome}</p>
        </div>
      )}

      {/* Minimised history: one quiet line, not a transcript. */}
      {v.hasHistory && (
        <div style={s('display:flex;align-items:center;gap:14px;flex-wrap:wrap;')}>
          <Hover tag="button" onClick={() => setOpenHistory((o) => !o)} aria-expanded={openHistory}
            base="display:inline-flex;align-items:center;gap:8px;background:none;border:none;padding:2px 0;font:inherit;font-size:13.5px;font-weight:600;color:#4c6272;cursor:pointer;"
            hover="color:#005eb8;">
            <span style={s('display:flex;transform:rotate(' + (openHistory ? 90 : 0) + 'deg);transition:transform .18s ease;')}>
              <Svg w={15} sw={2.4}>{Icons.chevronRight}</Svg>
            </span>
            {v.historyLabel}
          </Hover>
          {v.isViewingHistory && (
            <Hover tag="button" onClick={v.onLatest}
              base="display:inline-flex;align-items:center;gap:7px;background:none;border:none;padding:2px 0;font:inherit;font-size:13.5px;font-weight:600;color:#005eb8;cursor:pointer;"
              hover="color:#003087;">
              <Svg w={15} sw={2.4}>{Icons.arrow}</Svg>Back to the latest
            </Hover>
          )}
        </div>
      )}

      {v.hasHistory && openHistory && (
        <div style={s('display:flex;flex-direction:column;gap:6px;animation:rivaAnswerIn .22s ease both;')}>
          {v.history.map((t) => (
            <Hover key={t.key} tag="button" onClick={t.onOpen}
              base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:1px solid #e3e9ec;border-radius:10px;padding:10px 14px;font:inherit;font-size:15px;color:#212b32;cursor:pointer;"
              hover="border-color:#005eb8;color:#005eb8;">
              <span style={s('flex:none;color:#8a99a3;display:flex;')}><Svg w={15} sw={2.2}>{Icons.chat}</Svg></span>
              <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{t.question}</span>
            </Hover>
          ))}
        </div>
      )}

      {/* The active question. Keyed on the turn so switching questions
          remounts the block and it arrives the same way a new one does. */}
      {v.turn && (
        <div key={v.turn.key} style={s('display:flex;flex-direction:column;gap:18px;')}>
          <div style={s('animation:rivaAnswerIn .4s cubic-bezier(.2,.7,.3,1) both;')}>
            <h1 style={s('font-size:27px;font-weight:700;letter-spacing:-0.015em;line-height:1.25;margin:0;text-wrap:pretty;')}>{v.turn.question}</h1>
            {v.turn.imageNote && (
              <div style={s('font-size:13.5px;color:#4c6272;margin-top:8px;')}>{v.turn.imageNote}</div>
            )}
            {v.turn.hasImages && (
              <div style={s('display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;')}>
                {v.turn.images.map((src, j) => (
                  <img key={j} src={src} alt="Attached image" style={s('max-width:200px;max-height:160px;border-radius:10px;display:block;background:#fff;border:1px solid #e3e9ec;')} />
                ))}
              </div>
            )}
          </div>

          {v.turn.items.map((m, i) => (
            <div key={i} style={s('animation:rivaAnswerIn .45s cubic-bezier(.2,.7,.3,1) both;animation-delay:' + (0.06 + i * 0.05).toFixed(2) + 's;')}>
              {m.isAnswer && <GuideCard v={m} />}
              {m.isSuggest && <SuggestBubble v={m} />}
              {m.isAi && <AiAnswer v={m} />}
              {m.isTriage && <TriageAnswer v={m} />}
              {m.isDocFile && <DocFileAnswer v={m} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
