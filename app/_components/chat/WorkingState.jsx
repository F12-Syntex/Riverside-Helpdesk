'use client';

import { s, Svg, Icons } from '../ui';

/* ------------------------------------------------------------------ *
 * What the assistant is doing, while it does it.
 *
 * Every lookup gets its own line: it arrives as it starts and ticks
 * over when it returns. One thing is moving at a time — the line being
 * worked on — so the wait reads as a list of work done rather than a
 * spinner racing a progress bar.
 * ------------------------------------------------------------------ */

export default function WorkingState({ steps = [], statusText = '' }) {
  const rows = steps.length
    ? steps.map((st, i) => ({
      key: st.id || i,
      done: st.status === 'done',
      label: st.label || st.detail || 'Working',
      detail: st.detail && st.detail !== st.label ? st.detail : '',
    }))
    : [{ key: 'start', done: false, label: statusText || 'Reading the practice documents', detail: '' }];

  // Between lookups the agent says what it is about to do; that belongs on
  // the end of the list, not on top of the line already there.
  const trailing = steps.length && statusText && !steps.some((st) => st.status === 'running')
    ? statusText
    : '';

  return (
    <ul style={s('list-style:none;margin:0;padding:16px 0 20px;display:flex;flex-direction:column;gap:12px;')}>
      {rows.map((r, i) => (
        <li key={r.key} style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaAnswerIn .34s cubic-bezier(.2,.7,.3,1) both;animation-delay:' + Math.min(i * 0.04, 0.2).toFixed(2) + 's;')}>
          <span style={s('flex:none;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;color:' + (r.done ? '#007f3b' : '#005eb8') + ';' + (r.done ? '' : 'animation:rivaSpin 1.1s linear infinite;'))}>
            <Svg w={r.done ? 17 : 20} sw={r.done ? 2.6 : 2.4}>{r.done ? Icons.check : Icons.spinner}</Svg>
          </span>
          <span style={s('flex:1;min-width:0;')}>
            <span style={s('display:block;font-size:16.5px;line-height:1.4;font-weight:' + (r.done ? 400 : 600) + ';color:' + (r.done ? '#4c6272' : '#212b32') + ';')}>{r.label}</span>
            {r.detail && (
              <span style={s('display:block;font-size:14.5px;line-height:1.4;color:#768692;margin-top:2px;overflow-wrap:anywhere;')}>{r.detail}</span>
            )}
          </span>
        </li>
      ))}

      {trailing && (
        <li style={s('display:flex;gap:12px;align-items:center;animation:rivaAnswerIn .34s cubic-bezier(.2,.7,.3,1) both;')}>
          <span style={s('flex:none;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;color:#005eb8;animation:rivaSpin 1.1s linear infinite;')}>
            <Svg w={20} sw={2.4}>{Icons.spinner}</Svg>
          </span>
          <span style={s('flex:1;min-width:0;font-size:16.5px;font-weight:600;color:#212b32;line-height:1.4;')}>{trailing}</span>
        </li>
      )}
    </ul>
  );
}
