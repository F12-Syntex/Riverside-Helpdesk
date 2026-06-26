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

            {/* Role selector — classic NHS underline tab nav, one consistent blue. */}
            <div style={s('display:flex;flex-wrap:wrap;gap:0 24px;border-bottom:1px solid #d8dde0;margin-bottom:4px;')}>
              {v.heroRoleTabs.map((t) => (t.active ? (
                <span key={t.id} style={s('font-size:16px;font-weight:700;color:#212b32;padding:10px 2px;border-bottom:3px solid #005eb8;margin-bottom:-1px;')}>{t.label}</span>
              ) : (
                <Hover key={t.id} tag="button" onClick={t.onClick} base="font:inherit;font-size:16px;font-weight:600;color:#005eb8;text-decoration:underline;text-underline-offset:.15em;background:none;border:none;padding:10px 2px;cursor:pointer;" hover="color:#003087;">{t.label}</Hover>
              )))}
            </div>

            {/* Prompts for the active role — classic NHS link lists: underlined blue
                links with a chevron, grouped under plain headings. */}
            {v.heroGroups.map((g, gi) => (
              <div key={gi} style={s('margin-top:24px;')}>
                <h3 style={s('font-size:15px;font-weight:700;color:#212b32;margin:0;')}>{g.title}</h3>
                <ul style={s('list-style:none;margin:6px 0 0;padding:0;')}>
                  {g.queries.map((q, qi) => (
                    <li key={qi}>
                      <Hover tag="button" onClick={q.onClick}
                        base="display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;text-align:left;background:none;border:none;border-top:1px solid #e8edee;padding:13px 4px;cursor:pointer;font:inherit;font-size:16px;line-height:1.4;color:#005eb8;text-decoration:underline;text-underline-offset:.15em;"
                        hover="color:#003087;background:#f0f4f5;">
                        <span>{q.question}</span>
                        <span style={s('flex:none;')}><Svg w={16} sw={2.4}>{Icons.chevronRight}</Svg></span>
                      </Hover>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
