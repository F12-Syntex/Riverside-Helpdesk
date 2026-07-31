'use client';

import { s, Svg, Icons } from '../ui';
import AgentPlanning from './AgentPlanning';

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
//          while the agent works. Owned by this file.
//   done — the AgentPlanning card: collapsed to one line, and opening it gives
//          the full timeline with a drawer per lookup onto what it found.
//
// The live view stays deliberately plainer than the card. While the agent is
// working the reader is waiting for an answer, not reading an audit; the audit
// is what the card is for, once there is an answer to audit.

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

/* ------------------------------------------------------------------ *
 * Live: one quiet line per lookup
 * ------------------------------------------------------------------ */

function LiveRow({ step }) {
  const running = step.status === 'running';
  const failed = !running && step.ok === false;
  // The line the agent is on is the only one that carries any weight; the ones
  // behind it are receipts, not news. A lookup that failed is the exception —
  // it keeps its colour, because the reader needs to know the answer was
  // written without it.
  const icon = running ? (TOOL_ICON[step.tool] || Icons.search) : (failed ? Icons.triangle : Icons.check);
  const tone = running ? 'background:#e8f1f8;color:#005eb8;'
    : failed ? 'background:#fdf2f2;color:#d5281b;'
      : 'background:#eef1f2;color:#8a99a3;';
  const text = running ? 'color:#212b32;font-weight:600;'
    : failed ? 'color:#a5130b;font-weight:600;'
      : 'color:#768692;';
  return (
    <div style={s('display:flex;gap:9px;align-items:center;min-width:0;padding:3px 0;')}>
      <span style={s('flex:none;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;' + tone)}>
        {/* Running keeps its own tool icon rather than a generic spinner: at
            this size the icon is the fastest read of what is happening. */}
        <Svg w={12} sw={2.4} style={running ? s('animation:rivaBlink 1.4s infinite;') : undefined}>{icon}</Svg>
      </span>
      <span style={s('flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px;line-height:1.4;' + text)}>
        {step.label}
        {step.detail ? <span style={s('font-weight:400;color:#8a99a3;')}>{' · ' + step.detail}</span> : null}
        {!running && step.summary ? <span style={s(failed ? 'font-weight:400;color:#a5130b;' : 'color:#a3aeb5;')}>{' · ' + step.summary}</span> : null}
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

/* ------------------------------------------------------------------ */

export default function ToolTimeline({ steps = [], statusText = '', live = false }) {
  if (!steps.length && (!live || !statusText)) return null;

  // Live, the card is the answer bubble's own surface — a second bordered box
  // inside it only makes the working state look heavier than the answer.
  if (live) return <LiveView steps={steps} statusText={statusText} />;

  return (
    <AgentPlanning
      title={'Looked in ' + steps.length + ' place' + (steps.length === 1 ? '' : 's')}
      subtitle={summarise(steps)}
      steps={steps}
    />
  );
}
