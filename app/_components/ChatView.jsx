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

export default function ChatView({ v }) {
  return (
    <div style={s('max-width:820px;margin:0 auto;padding:28px 24px 28px;display:flex;flex-direction:column;')}>

      {v.isEmpty && (
        <div style={s('text-align:center;padding:12vh 0 0;animation:rivaAnswerIn .5s cubic-bezier(.2,.7,.3,1) both;')}>
          <h1 className="riva-hero-h1" style={s('font-size:38px;font-weight:700;letter-spacing:-0.02em;margin:0 0 10px;')}>Ask a question</h1>
          <p style={s('font-size:17px;color:#4c6272;max-width:44ch;margin:0 auto;text-wrap:pretty;')}>{v.welcome}</p>
        </div>
      )}

      {/* Minimised history — one numbered line per question, not a transcript. */}
      {v.hasHistory && (
        <div style={s('display:flex;flex-direction:column;margin-bottom:14px;')}>
          {v.history.map((t) => (
            <div key={t.key} style={s('display:flex;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid #dde4e7;')}>
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
          <div style={s('animation:rivaAnswerIn .4s cubic-bezier(.2,.7,.3,1) both;')}>
            <h1 style={s('font-size:32px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;margin:8px 0 0;text-wrap:pretty;')}>{v.turn.question}</h1>
            <div style={s('width:68px;height:4px;border-radius:2px;background:#005eb8;margin:14px 0 0;')} />
            {v.turn.imageNote && (
              <div style={s('font-size:13.5px;color:#4c6272;margin-top:12px;')}>{v.turn.imageNote}</div>
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
            <div key={i} style={s('animation:rivaAnswerIn .45s cubic-bezier(.2,.7,.3,1) both;animation-delay:' + (0.06 + i * 0.05).toFixed(2) + 's;')}>
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
