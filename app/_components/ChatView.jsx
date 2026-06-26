'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';
import GuideCard from './chat/GuideCard';
import SuggestBubble from './chat/SuggestBubble';
import AiAnswer from './chat/AiAnswer';

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

          <div>
            <div style={s('font-size:13px;font-weight:600;color:#768692;letter-spacing:.01em;margin:8px 0 12px;')}>Quick prompts — choose your role</div>

            {/* Role tabs: soft pills, one tap to switch to the prompts for your role. */}
            <div style={s('display:flex;gap:8px;flex-wrap:wrap;')}>
              {v.heroRoleTabs.map((t) => (
                <Hover key={t.id} tag="button" onClick={t.onClick}
                  base={'display:inline-flex;align-items:center;gap:8px;border:none;border-radius:999px;padding:9px 16px 9px 13px;cursor:pointer;font:inherit;font-size:14.5px;font-weight:600;transition:background .14s,color .14s;background:' + (t.active ? t.accent : '#eef2f4') + ';color:' + (t.active ? '#fff' : '#52646f') + ';'}
                  hover={t.active ? '' : 'background:' + t.accent + '14;color:' + t.accent + ';'}>
                  <Svg w={17} stroke={t.active ? '#fff' : t.accent} sw={2.1}>{Icons[t.icon]}</Svg>
                  <span>{t.label}</span>
                </Hover>
              ))}
            </div>

            {/* Topic groups for the active role — a soft heading then wrapping pill
                chips, no boxes, so it reads light rather than blocky. */}
            <div style={s('margin-top:8px;')}>
              {v.heroGroups.map((g, gi) => (
                <div key={gi} style={s('margin-top:22px;')}>
                  <div style={s('font-size:13px;font-weight:700;letter-spacing:.02em;margin:0 0 10px;color:' + g.accent + ';')}>{g.title}</div>
                  <div style={s('display:flex;flex-wrap:wrap;gap:9px;')}>
                    {g.queries.map((q, qi) => (
                      <Hover key={qi} tag="button" onClick={q.onClick}
                        base="display:inline-flex;align-items:center;gap:8px;text-align:left;background:#fff;border:none;border-radius:999px;padding:10px 16px;cursor:pointer;font:inherit;font-size:14.5px;font-weight:600;color:#243b4a;line-height:1.3;box-shadow:0 1px 2px rgba(33,43,50,.08),0 0 0 1px rgba(33,43,50,.05);transition:box-shadow .14s,color .14s,background .14s;"
                        hover={'color:' + g.accent + ';background:' + g.accent + '0a;box-shadow:0 2px 8px ' + g.accent + '2e,0 0 0 1px ' + g.accent + '55;'}>
                        <span style={s('flex:none;opacity:.6;')}><Svg w={14} stroke={g.accent} sw={2.4}>{Icons.arrow}</Svg></span>
                        <span>{q.question}</span>
                      </Hover>
                    ))}
                  </div>
                </div>
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
        </React.Fragment>
      ))}
    </div>
  );
}
