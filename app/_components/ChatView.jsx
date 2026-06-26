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
            <div style={s('font-size:13px;font-weight:700;color:#768692;text-transform:uppercase;letter-spacing:.05em;margin:8px 0 10px;')}>Quick prompts — choose your role</div>

            {/* Role tabs: one tap to switch to the prompts that fit your role. */}
            <div style={s('display:flex;gap:8px;flex-wrap:wrap;')}>
              {v.heroRoleTabs.map((t) => (
                <Hover key={t.id} tag="button" onClick={t.onClick}
                  base={'display:flex;align-items:center;gap:10px;background:' + (t.active ? t.accent + '0f' : '#fff') + ';border:1.5px solid ' + (t.active ? t.accent : '#d8dde0') + ';border-radius:12px;padding:8px 14px 8px 9px;cursor:pointer;font:inherit;text-align:left;transition:border-color .12s,background .12s;'}
                  hover={'border-color:' + t.accent + ';'}>
                  <span style={s('flex:none;width:34px;height:34px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:' + (t.active ? t.accent : '#eef3f5') + ';')}>
                    <Svg w={18} stroke={t.active ? '#fff' : t.accent} sw={2.1}>{Icons[t.icon]}</Svg>
                  </span>
                  <span style={s('display:flex;flex-direction:column;line-height:1.2;')}>
                    <span style={s('font-size:15px;font-weight:700;color:' + (t.active ? t.accent : '#243b4a') + ';')}>{t.label}</span>
                    <span style={s('font-size:12px;color:#768692;font-weight:600;')}>{t.sub}</span>
                  </span>
                </Hover>
              ))}
            </div>

            {/* Subdivided topic blocks for the active role — each query is one tap. */}
            <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;margin-top:18px;')}>
              {v.heroGroups.map((g, gi) => (
                <div key={gi} style={s('background:#fff;border:1px solid #e3e9ec;border-radius:14px;padding:14px 14px 15px;')}>
                  <div style={s('display:flex;align-items:center;gap:8px;margin:0 0 11px;')}>
                    <span style={s('width:4px;height:15px;border-radius:2px;flex:none;background:' + g.accent + ';')} />
                    <span style={s('font-size:12.5px;font-weight:700;color:#425563;text-transform:uppercase;letter-spacing:.045em;')}>{g.title}</span>
                  </div>
                  <div style={s('display:flex;flex-direction:column;gap:7px;')}>
                    {g.queries.map((q, qi) => (
                      <Hover key={qi} tag="button" onClick={q.onClick}
                        base="display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:#fbfcfd;border:1px solid #e3e9ec;border-radius:9px;padding:9px 11px;cursor:pointer;font:inherit;font-size:14.5px;font-weight:600;color:#243b4a;line-height:1.35;transition:border-color .12s,background .12s,color .12s;"
                        hover={'border-color:' + g.accent + ';background:' + g.accent + '14;color:' + g.accent + ';'}>
                        <span style={s('flex:none;opacity:.55;')}><Svg w={15} stroke={g.accent} sw={2.2}>{Icons.arrow}</Svg></span>
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
