'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';

// What the assistant is doing, while it does it.
//
// The agent searches on its own initiative — sometimes twice with different
// words, sometimes out to the web — and that work used to be invisible behind
// a spinner. So it is shown. But it is shown QUIETLY: a turn can run six or
// seven lookups, and a full-height timeline of them, each with its own list of
// what it found, buries the answer it is supposed to be introducing.
//
// So there are two renderings of the same steps:
//   live — one dim line per lookup, no detail lists, and only the last few
//          kept on screen. Bounded height, so the chat does not jump about
//          while the agent works.
//   done — a single collapsed line ("Looked in 5 places"). Everything is still
//          there, and opening it shows each lookup in full, with what it found.

const TOOL_ICON = {
  search_practice: Icons.search,
  list_practice_sources: Icons.book,
  open_practice_source: Icons.fileLines,
  search_web: Icons.globe,
  find_contact: Icons.phone,
  hand_off: Icons.sitemap,
  suggest_ers_referral_route: Icons.sitemap,
};

// How many finished lookups stay on screen while the agent is still working.
// Older ones roll into a single counted line rather than scrolling the answer
// off the top of the chat.
const LIVE_WINDOW = 3;

// How many of a lookup's findings are listed when the timeline is opened.
// Reading six web pages' titles is useful; reading forty is not.
const MAX_ITEMS = 5;

/* ------------------------------------------------------------------ *
 * Live: one quiet line per lookup
 * ------------------------------------------------------------------ */

function LiveRow({ step }) {
  const running = step.status === 'running';
  // The line the agent is on is the only one that carries any weight; the ones
  // behind it are receipts, not news.
  const icon = running ? (TOOL_ICON[step.tool] || Icons.search) : Icons.check;
  return (
    <div style={s('display:flex;gap:9px;align-items:center;min-width:0;padding:3px 0;')}>
      <span style={s('flex:none;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
        + (running ? 'background:#e8f1f8;color:#005eb8;' : 'background:#eef1f2;color:#8a99a3;'))}>
        <Svg w={12} sw={2.4} style={running ? s('animation:rivaBlink 1.4s infinite;') : undefined}>{icon}</Svg>
      </span>
      <span style={s('flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px;line-height:1.4;'
        + (running ? 'color:#212b32;font-weight:600;' : 'color:#768692;'))}>
        {step.label}
        {step.detail ? <span style={s('font-weight:400;color:#8a99a3;')}>{' · ' + step.detail}</span> : null}
        {!running && step.summary ? <span style={s('color:#a3aeb5;')}>{' · ' + step.summary}</span> : null}
      </span>
    </div>
  );
}

function LiveView({ steps, statusText }) {
  const hidden = Math.max(0, steps.length - LIVE_WINDOW);
  const shown = hidden ? steps.slice(hidden) : steps;
  return (
    <div style={s('display:flex;flex-direction:column;')}>
      {hidden > 0 && (
        <div style={s('font-size:12.5px;color:#a3aeb5;padding:2px 0 4px 29px;')}>
          {hidden} earlier lookup{hidden === 1 ? '' : 's'}
        </div>
      )}
      {shown.map((st, i) => <LiveRow key={st.id || i} step={st} />)}
      {statusText ? (
        <div style={s('display:flex;gap:9px;align-items:center;padding:3px 0;')}>
          <span style={s('flex:none;width:20px;height:20px;border-radius:50%;background:#e8f1f8;color:#005eb8;display:flex;align-items:center;justify-content:center;')}>
            <Svg w={12} sw={2.4} style={s('animation:rivaBlink 1.4s infinite;')}>{Icons.sparkle}</Svg>
          </span>
          <span style={s('font-size:13.5px;font-weight:600;color:#212b32;')}>{statusText}&hellip;</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Done: collapsed to a line, opened on request
 * ------------------------------------------------------------------ */

// What the collapsed line says it looked at. A count of tool calls is the
// assistant's business; where it looked is the reader's, so the summary counts
// places — the practice's own material, the web, the phone book — not calls.
const WEB_TOOLS = new Set(['search_web', 'find_contact']);

function summarise(steps) {
  let practice = 0;
  let web = 0;
  for (const st of steps) (WEB_TOOLS.has(st.tool) ? (web += 1) : (practice += 1));
  const parts = [];
  if (practice) parts.push(practice + ' in the practice’s documents');
  if (web) parts.push(web + ' on the web');
  return parts.join(', ');
}

function Step({ step, last }) {
  const items = step.items || [];
  const extra = items.length - MAX_ITEMS;
  return (
    <div style={s('display:flex;gap:11px;align-items:flex-start;')}>
      <div style={s('flex:none;display:flex;flex-direction:column;align-items:center;align-self:stretch;')}>
        <span style={s('flex:none;width:24px;height:24px;border-radius:50%;background:#eef7ee;color:#00532a;display:flex;align-items:center;justify-content:center;')}>
          <Svg w={13} sw={2.2}>{Icons.check}</Svg>
        </span>
        {!last && <span style={s('flex:1;width:2px;background:#e4e9eb;margin:3px 0 0;min-height:8px;')} />}
      </div>
      <div style={s('flex:1;min-width:0;padding-bottom:10px;')}>
        <div style={s('font-size:14px;font-weight:600;color:#212b32;line-height:1.35;')}>
          {step.label}
          {step.detail ? <span style={s('font-weight:400;color:#4c6272;')}>{' — ' + step.detail}</span> : null}
        </div>
        {step.summary ? <div style={s('font-size:12.5px;color:#768692;margin-top:2px;')}>{step.summary}</div> : null}
        {items.length ? (
          <ul style={s('margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px;')}>
            {items.slice(0, MAX_ITEMS).map((it, i) => (
              <li key={i} style={s('font-size:13px;color:#4c6272;line-height:1.35;overflow-wrap:anywhere;')}>
                <span style={s('color:#8a99a3;')}>• </span>
                {it.url
                  ? <a href={it.url} target="_blank" rel="noreferrer" style={s('color:#005eb8;text-decoration:underline;')}>{it.label}</a>
                  : it.label}
                {it.sub && !it.url ? <span style={s('color:#8a99a3;')}>{' — ' + it.sub}</span> : null}
              </li>
            ))}
            {extra > 0 && (
              <li style={s('font-size:12.5px;color:#8a99a3;line-height:1.35;padding-left:11px;')}>
                and {extra} more
              </li>
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ToolTimeline({ steps = [], statusText = '', live = false }) {
  const [open, setOpen] = React.useState(false);
  if (!steps.length && (!live || !statusText)) return null;

  // Live, the card is the answer bubble's own surface — a second bordered box
  // inside it only makes the working state look heavier than the answer.
  if (live) return <LiveView steps={steps} statusText={statusText} />;

  const detail = summarise(steps);
  return (
    <div style={s('border:1px solid #e4e9eb;background:#f7fafb;border-radius:12px;padding:' + (open ? '10px 14px 4px' : '8px 12px') + ';')}>
      <Hover tag="button" type="button" onClick={() => setOpen(!open)}
        base="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;padding:0;font:inherit;font-size:13px;color:#768692;cursor:pointer;text-align:left;"
        hover="color:#005eb8;">
        <Svg w={13} sw={2.2}>{Icons.search}</Svg>
        <span style={s('min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
          <span style={s('font-weight:600;')}>
            {steps.length === 0 ? 'No lookups were needed' : 'Looked in ' + steps.length + ' place' + (steps.length === 1 ? '' : 's')}
          </span>
          {detail ? <span style={s('color:#a3aeb5;')}>{' · ' + detail}</span> : null}
        </span>
        <span style={s('margin-left:auto;flex:none;display:flex;transform:rotate(' + (open ? '90deg' : '0deg') + ');transition:transform .15s;')}>
          <Svg w={14} sw={2.2}>{Icons.chevronRight}</Svg>
        </span>
      </Hover>

      {open && (
        <div style={s('margin-top:12px;')}>
          {steps.map((st, i) => <Step key={st.id || i} step={st} last={i === steps.length - 1} />)}
        </div>
      )}
    </div>
  );
}
