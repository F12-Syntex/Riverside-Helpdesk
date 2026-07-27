'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';

// What the assistant is doing, while it does it.
//
// The agent searches on its own initiative — sometimes twice with different
// words, sometimes out to the web — and that work used to be invisible behind
// a spinner. Each tool call appears here the moment it starts, then fills in
// with what it found. Once the answer is written the timeline collapses to a
// single line, so a finished answer stays clean but the reader can always open
// it and see exactly where each part came from.

const TOOL_ICON = {
  search_practice: Icons.search,
  list_practice_sources: Icons.book,
  open_practice_source: Icons.fileLines,
  search_web: Icons.globe,
  find_contact: Icons.phone,
  hand_off: Icons.sitemap,
};

function Step({ step, last }) {
  const running = step.status === 'running';
  return (
    <div style={s('display:flex;gap:11px;align-items:flex-start;')}>
      <div style={s('flex:none;display:flex;flex-direction:column;align-items:center;align-self:stretch;')}>
        <span style={s('flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
          + (running ? 'background:#e8f1f8;color:#005eb8;animation:rivaBlink 1.4s infinite;' : 'background:#eef7ee;color:#00532a;'))}>
          <Svg w={14} sw={2.2}>{running ? (TOOL_ICON[step.tool] || Icons.search) : Icons.check}</Svg>
        </span>
        {!last && <span style={s('flex:1;width:2px;background:#e4e9eb;margin:3px 0 0;min-height:8px;')} />}
      </div>
      <div style={s('flex:1;min-width:0;padding-bottom:10px;')}>
        <div style={s('font-size:14.5px;font-weight:600;color:#212b32;line-height:1.35;')}>
          {step.label}
          {step.detail ? <span style={s('font-weight:400;color:#4c6272;')}>{' — ' + step.detail}</span> : null}
        </div>
        {step.summary ? <div style={s('font-size:13px;color:#4c6272;margin-top:2px;')}>{step.summary}</div> : null}
        {step.items && step.items.length ? (
          <ul style={s('margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px;')}>
            {step.items.map((it, i) => (
              <li key={i} style={s('font-size:13px;color:#4c6272;line-height:1.35;overflow-wrap:anywhere;')}>
                <span style={s('color:#8a99a3;')}>• </span>
                {it.url
                  ? <a href={it.url} target="_blank" rel="noreferrer" style={s('color:#005eb8;text-decoration:underline;')}>{it.label}</a>
                  : it.label}
                {it.sub && !it.url ? <span style={s('color:#8a99a3;')}>{' — ' + it.sub}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export default function ToolTimeline({ steps = [], statusText = '', live = false }) {
  const [open, setOpen] = React.useState(false);
  if (!steps.length && (!live || !statusText)) return null;

  const expanded = live || open;
  const toolCount = steps.length;

  return (
    <div style={s('border:1px solid #e4e9eb;background:#f7fafb;border-radius:12px;padding:' + (expanded ? '12px 14px 4px' : '8px 12px') + ';')}>
      {!live && (
        <Hover tag="button" type="button" onClick={() => setOpen(!open)}
          base="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;padding:0;font:inherit;font-size:13px;font-weight:600;color:#4c6272;cursor:pointer;text-align:left;"
          hover="color:#005eb8;">
          <Svg w={14} sw={2.2}>{Icons.search}</Svg>
          <span>{toolCount === 0 ? 'No lookups were needed' : 'Looked in ' + toolCount + ' place' + (toolCount === 1 ? '' : 's')}</span>
          <span style={s('margin-left:auto;display:flex;transform:rotate(' + (open ? '90deg' : '0deg') + ');transition:transform .15s;')}>
            <Svg w={14} sw={2.2}>{Icons.chevronRight}</Svg>
          </span>
        </Hover>
      )}

      {expanded && (
        <div style={s(live ? '' : 'margin-top:12px;')}>
          {steps.map((st, i) => <Step key={st.id || i} step={st} last={i === steps.length - 1 && !(live && statusText)} />)}
          {live && statusText ? (
            <div style={s('display:flex;gap:11px;align-items:center;padding-bottom:8px;')}>
              <span style={s('flex:none;width:26px;height:26px;border-radius:50%;background:#e8f1f8;color:#005eb8;display:flex;align-items:center;justify-content:center;animation:rivaBlink 1.4s infinite;')}>
                <Svg w={14} sw={2.2}>{Icons.sparkle}</Svg>
              </span>
              <span style={s('font-size:14.5px;font-weight:600;color:#4c6272;')}>{statusText}&hellip;</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
