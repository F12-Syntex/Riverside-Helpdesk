'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';
import GuideCard from './chat/GuideCard';
import SuggestBubble from './chat/SuggestBubble';
import AiAnswer from './chat/AiAnswer';
import TriageAnswer from './chat/TriageAnswer';

export default function ChatView({ v }) {
  return (
    <div style={s('max-width:820px;margin:0 auto;padding:32px 24px 28px;display:flex;flex-direction:column;gap:20px;')}>

      {v.isEmpty && (
        <>
          <div style={s('text-align:center;padding:20px 0 4px;')}>
            <div style={s('width:72px;height:72px;border-radius:18px;background:#fff;border:1px solid #d8dde0;box-shadow:0 1px 3px rgba(33,43,50,.08);display:inline-flex;align-items:center;justify-content:center;')}>
              <img src="/assets/logo.png" alt="The Riverside Practice" style={s('width:44px;height:44px;display:block;')} />
            </div>
            <h1 className="riva-hero-h1" style={s('font-size:34px;margin:18px 0 8px;letter-spacing:-0.01em;')}>{v.botName}</h1>
            <p style={s('font-size:19px;color:#4c6272;max-width:540px;margin:0 auto;text-wrap:pretty;')}>{v.welcome}</p>
            <p style={s('font-size:15px;color:#768692;max-width:540px;margin:14px auto 0;text-wrap:pretty;font-weight:600;')}>Never enter patient information. Ask about the process only.</p>
          </div>

          <button onClick={v.onLoadTriageExample} style={s('display:block;width:100%;text-align:left;background:#e8f1f8;border:1px solid #cfe1f0;border-radius:12px;padding:16px 18px;cursor:pointer;font:inherit;')}>
            <div style={s('display:flex;align-items:center;gap:10px;color:#003087;font-size:16px;font-weight:700;')}>
              <Svg w={18} sw={2.2}>{Icons.fileLines}</Svg>Triage a patient request
            </div>
            <p style={s('margin:6px 0 0;font-size:15px;color:#4c6272;line-height:1.5;')}>Paste an Accurx-style request and get grounded action notes — urgency, what to do, who to route it to, and what to watch for. Tap to load an example.</p>
          </button>

          <div>
            <div style={s('font-size:14px;font-weight:600;color:#768692;text-transform:uppercase;letter-spacing:.04em;margin:8px 0 12px;')}>Popular questions</div>
            <div style={s('display:flex;flex-direction:column;gap:8px;')}>
              {v.popular.map((p, i) => (
                <Hover key={i} tag="button" onClick={p.onClick} base="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#fff;border:1px solid #d8dde0;border-radius:10px;padding:13px 16px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#005eb8;" hover="border-color:#005eb8;background:#f7fbff;">
                  <span style={s('flex:none;')}><Svg w={18}>{Icons.arrow}</Svg></span><span>{p.question}</span>
                </Hover>
              ))}
            </div>
          </div>
        </>
      )}

      {v.messages.map((m, i) => (
        <React.Fragment key={i}>
          {m.isUser && (
            <div style={s('display:flex;justify-content:flex-end;animation:rivaUp .25s ease;')}>
              <div style={s('max-width:75%;background:#005eb8;color:#fff;border-radius:16px 16px 4px 16px;padding:12px 16px;font-size:17px;line-height:1.45;')}>{m.text}</div>
            </div>
          )}
          {m.isAnswer && <GuideCard v={m} />}
          {m.isSuggest && <SuggestBubble v={m} />}
          {m.isAi && <AiAnswer v={m} />}
          {m.isTriage && <TriageAnswer v={m} />}
        </React.Fragment>
      ))}
    </div>
  );
}
