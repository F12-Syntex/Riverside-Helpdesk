'use client';

import { s, Svg, Icons } from '../ui';

/* ------------------------------------------------------------------ *
 * What the assistant is doing, while it does it.
 *
 * Every lookup gets its own line, arriving as it starts and ticking
 * over when it returns, so the work reads as a list of things done
 * rather than one row that keeps rewriting itself. At the size of the
 * answer it becomes, not the 12px grid it replaced.
 * ------------------------------------------------------------------ */

function StepRow({ step, index }) {
  const done = step.status === 'done';
  const label = step.label || step.detail || 'Working';
  const detail = step.detail && step.detail !== step.label ? step.detail : '';
  return (
    <li style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaAnswerIn .34s cubic-bezier(.2,.7,.3,1) both;animation-delay:' + Math.min(index * 0.04, 0.2).toFixed(2) + 's;')}>
      <span style={s('flex:none;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;color:' + (done ? '#007f3b' : '#005eb8') + ';' + (done ? '' : 'animation:rivaSpin 1.1s linear infinite;'))}>
        <Svg w={done ? 17 : 20} sw={done ? 2.6 : 2.4}>{done ? Icons.check : Icons.spinner}</Svg>
      </span>
      <span style={s('flex:1;min-width:0;')}>
        <span style={s('display:block;font-size:16.5px;line-height:1.4;font-weight:' + (done ? 400 : 600) + ';color:' + (done ? '#4c6272' : '#212b32') + ';')}>{label}</span>
        {detail && (
          <span style={s('display:block;font-size:14.5px;line-height:1.4;color:#768692;margin-top:2px;overflow-wrap:anywhere;')}>{detail}</span>
        )}
      </span>
    </li>
  );
}

export default function WorkingState({ steps = [], statusText = '' }) {
  const waiting = !steps.length;

  return (
    <div style={s('padding:16px 0 20px;')}>
      <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;')}>
        {waiting ? (
          <StepRow index={0} step={{ status: 'running', label: statusText || 'Reading the practice documents' }} />
        ) : (
          steps.map((st, i) => <StepRow key={st.id || i} step={st} index={i} />)
        )}
        {/* Whatever the agent says it is doing between lookups, on its own
            line under them rather than replacing one. */}
        {!waiting && statusText && (
          <StepRow index={steps.length} step={{ status: 'running', label: statusText }} />
        )}
      </ul>

      {/* An indeterminate bar: the wait has no percentage to report, and a
          fake one would be a lie about how long is left. */}
      <div style={s('margin:18px 0 0;height:3px;border-radius:2px;background:#e3e9ec;overflow:hidden;')}>
        <div style={s('width:38%;height:100%;border-radius:2px;background:#005eb8;animation:rivaBar 1.25s cubic-bezier(.5,0,.5,1) infinite;')} />
      </div>
    </div>
  );
}
