'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';

// The agent's plan, as a card that can be opened.
//
// A port of the shadcn/Tailwind "AgentPlanning" component onto this app's own
// conventions — the `s()` inline-style helper, the hand-drawn `Icons` set and
// the NHS palette — because the project has no Tailwind, no shadcn and no
// `cn()`. Same anatomy as the original: a collapsible card, a status header, a
// connected timeline, and a per-step drawer that opens onto what that step
// actually found.
//
// The one thing deliberately not carried over is the original's habit of
// standing fully open. A turn runs five or six lookups; opened by default, the
// card is taller than the answer it belongs to. So it opens on request.

/* ------------------------------------------------------------------ *
 * Status
 *
 * Four states, matching the original: a step that has not started, one that is
 * running, one that finished, and one that failed. The agent's stream only ever
 * produces the middle two on its own — `error` is set by the reducer when a
 * lookup reports it could not do its job, and `pending` is here for a caller
 * that knows its steps in advance.
 * ------------------------------------------------------------------ */

const STATUS = {
  pending: { ring: 'background:#eef1f2;color:#8a99a3;', title: 'color:#8a99a3;font-weight:500;', dim: true },
  active: { ring: 'background:#e8f1f8;color:#005eb8;', title: 'color:#212b32;font-weight:600;' },
  success: { ring: 'background:#eef7ee;color:#007f3b;', title: 'color:#212b32;font-weight:500;' },
  error: { ring: 'background:#fdf2f2;color:#d5281b;', title: 'color:#a5130b;font-weight:600;' },
};

const TOOL_ICON = {
  search_practice: Icons.search,
  list_practice_sources: Icons.book,
  open_practice_source: Icons.fileLines,
  search_web: Icons.globe,
  find_contact: Icons.phone,
  hand_off: Icons.sitemap,
  suggest_ers_referral_route: Icons.sitemap,
};

// How many of a step's findings are listed. Reading six web page titles is
// useful; reading forty is not.
const MAX_ITEMS = 5;

function statusOf(step) {
  // The stream says 'running'/'done'; the four-state vocabulary is this
  // component's. Anything already speaking it is passed through.
  if (STATUS[step.status]) return step.status;
  if (step.status === 'running') return 'active';
  return step.ok === false ? 'error' : 'success';
}

function StepIcon({ status, tool }) {
  if (status === 'active') return <Svg w={13} sw={2.4} style={s('animation:rivaSpin .9s linear infinite;')}>{Icons.spinner}</Svg>;
  if (status === 'success') return <Svg w={13} sw={2.4}>{Icons.check}</Svg>;
  if (status === 'error') return <Svg w={13} sw={2.4}>{Icons.triangle}</Svg>;
  return <Svg w={13} sw={2.2}>{TOOL_ICON[tool] || Icons.search}</Svg>;
}

// The expand/collapse the original does with `grid-rows-[1fr]` → `grid-rows-[0fr]`.
// The trick is worth keeping — it animates to the content's real height without
// anyone having to measure it — and it needs no Tailwind to express.
function Drawer({ open, children }) {
  return (
    <div style={s('display:grid;grid-template-rows:' + (open ? '1fr' : '0fr')
      + ';opacity:' + (open ? '1' : '0') + ';transition:grid-template-rows .3s ease,opacity .2s ease;')}>
      <div style={s('overflow:hidden;min-height:0;')}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * What a step found
 * ------------------------------------------------------------------ */

function Findings({ step, status }) {
  const items = step.items || [];
  const extra = items.length - MAX_ITEMS;
  if (!items.length && !step.summary) return null;

  // A failure explains itself in its own panel; a success lists its sources.
  if (status === 'error') {
    return (
      <div style={s('margin-top:8px;border:1px solid #f4c7c3;background:#fdf2f2;border-radius:10px;padding:10px 12px;')}>
        <div style={s('display:flex;gap:7px;align-items:flex-start;font-size:13px;line-height:1.45;color:#a5130b;')}>
          <span style={s('flex:none;margin-top:2px;')}><Svg w={14} sw={2.2}>{Icons.alertCircle}</Svg></span>
          <span>{step.summary || 'This lookup could not be completed.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={s('margin-top:8px;border:1px solid #e4e9eb;background:#fbfdfd;border-radius:10px;padding:10px 12px;')}>
      {step.summary ? (
        <div style={s('font-size:12px;font-weight:600;color:#007f3b;letter-spacing:.01em;')}>{step.summary}</div>
      ) : null}
      {items.length ? (
        <ul style={s('margin:' + (step.summary ? '7px' : '0') + ' 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;')}>
          {items.slice(0, MAX_ITEMS).map((it, i) => (
            <li key={i} style={s('display:flex;gap:7px;align-items:flex-start;font-size:13px;line-height:1.4;color:#4c6272;overflow-wrap:anywhere;')}>
              <span style={s('flex:none;width:4px;height:4px;border-radius:50%;background:#a3aeb5;margin-top:7px;')} />
              <span style={s('min-width:0;')}>
                {it.url
                  ? <a href={it.url} target="_blank" rel="noreferrer" style={s('color:#005eb8;text-decoration:underline;')}>{it.label}</a>
                  : <span style={s('color:#212b32;')}>{it.label}</span>}
                {it.sub && !it.url ? <span style={s('color:#8a99a3;')}>{' — ' + it.sub}</span> : null}
              </span>
            </li>
          ))}
          {extra > 0 && (
            <li style={s('font-size:12.5px;color:#8a99a3;padding-left:11px;')}>and {extra} more</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One step
 * ------------------------------------------------------------------ */

function Step({ step, index, last, open, onToggle }) {
  const status = statusOf(step);
  const look = STATUS[status];
  const openable = !!((step.items && step.items.length) || step.summary);

  return (
    <div style={s('position:relative;display:flex;gap:12px;'
      + (look.dim ? 'opacity:.55;' : '')
      + 'animation:rivaStepIn .35s ease both;animation-delay:' + (index * 60) + 'ms;')}>
      {/* The line joining one step to the next, behind the icons. */}
      {!last && <span style={s('position:absolute;left:12px;top:26px;bottom:-6px;width:2px;background:#e4e9eb;')} />}

      <div style={s('position:relative;flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
        + 'box-shadow:0 0 0 4px #fff;' + look.ring)}>
        <StepIcon status={status} tool={step.tool} />
      </div>

      <div style={s('flex:1;min-width:0;padding-bottom:' + (last ? '2px' : '16px') + ';')}>
        <Hover
          tag={openable ? 'button' : 'div'}
          type={openable ? 'button' : undefined}
          onClick={openable ? onToggle : undefined}
          aria-expanded={openable ? (open ? 'true' : 'false') : undefined}
          base={'display:flex;align-items:center;gap:10px;width:100%;margin:-3px -6px 0;padding:3px 6px;border:none;background:none;font:inherit;text-align:left;border-radius:7px;'
            + (openable ? 'cursor:pointer;' : '')}
          hover={openable ? 'background:#f0f4f5;' : ''}>
          <span style={s('flex:1;min-width:0;font-size:14px;line-height:1.4;letter-spacing:-.005em;' + look.title)}>
            {step.label}
            {step.detail ? <span style={s('font-weight:400;color:#768692;')}>{' — ' + step.detail}</span> : null}
          </span>
          {step.duration ? (
            <span style={s('flex:none;font-size:11.5px;color:#8a99a3;font-variant-numeric:tabular-nums;')}>{step.duration}</span>
          ) : null}
          {openable ? (
            <span style={s('flex:none;display:flex;color:#a3aeb5;transform:rotate(' + (open ? '90deg' : '0deg') + ');transition:transform .2s;')}>
              <Svg w={14} sw={2.2}>{Icons.chevronRight}</Svg>
            </span>
          ) : null}
        </Hover>

        {openable && (
          <Drawer open={open}>
            <Findings step={step} status={status} />
          </Drawer>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The card
 * ------------------------------------------------------------------ */

export default function AgentPlanning({
  title = 'What the assistant checked',
  subtitle = '',
  steps = [],
  defaultExpanded = false,
}) {
  const [open, setOpen] = React.useState(defaultExpanded);
  const [openSteps, setOpenSteps] = React.useState(() => {
    const seed = {};
    for (const st of steps) if (st.defaultExpanded) seed[st.id] = true;
    return seed;
  });

  if (!steps.length) return null;

  const toggleStep = (id) => setOpenSteps((prev) => Object.assign({}, prev, { [id]: !prev[id] }));

  const statuses = steps.map(statusOf);
  const hasActive = statuses.includes('active');
  const hasError = statuses.includes('error');
  const headIcon = hasActive
    ? <Svg w={14} sw={2.3} style={s('animation:rivaSpin .9s linear infinite;')}>{Icons.spinner}</Svg>
    : hasError ? <Svg w={14} sw={2.3}>{Icons.triangle}</Svg>
      : <Svg w={14} sw={2.3}>{Icons.check}</Svg>;
  const headTone = hasActive ? 'background:#e8f1f8;color:#005eb8;'
    : hasError ? 'background:#fdf2f2;color:#d5281b;'
      : 'background:#eef7ee;color:#007f3b;';

  return (
    <div style={s('border:1px solid #e4e9eb;background:#fff;border-radius:12px;overflow:hidden;')}>
      <Hover tag="button" type="button" onClick={() => setOpen(!open)} aria-expanded={open ? 'true' : 'false'}
        base={'display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:none;font:inherit;text-align:left;cursor:pointer;'
          + (open ? 'background:#f7fafb;border-bottom:1px solid #e4e9eb;' : 'background:#fff;')}
        hover="background:#f0f4f5;">
        <span style={s('flex:none;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;' + headTone)}>
          {headIcon}
        </span>
        <span style={s('flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px;color:#4c6272;')}>
          <span style={s('font-weight:600;color:#212b32;')}>{title}</span>
          {subtitle ? <span style={s('color:#8a99a3;')}>{' · ' + subtitle}</span> : null}
        </span>
        <span style={s('flex:none;display:flex;color:#8a99a3;transform:rotate(' + (open ? '90deg' : '0deg') + ');transition:transform .2s;')}>
          <Svg w={15} sw={2.2}>{Icons.chevronRight}</Svg>
        </span>
      </Hover>

      <Drawer open={open}>
        <div style={s('padding:16px 16px 12px;display:flex;flex-direction:column;')}>
          {steps.map((st, i) => (
            <Step
              key={st.id || i}
              step={st}
              index={i}
              last={i === steps.length - 1}
              open={!!openSteps[st.id]}
              onToggle={() => toggleStep(st.id)}
            />
          ))}
        </div>
      </Drawer>
    </div>
  );
}
