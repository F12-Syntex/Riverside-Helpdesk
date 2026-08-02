'use client';

import { s } from '../ui';

/* ------------------------------------------------------------------ *
 * What the assistant is doing, while it does it.
 *
 * The old timeline listed every lookup in 12px type — a grid nobody
 * could read while waiting with a patient at the desk. This says one
 * thing at a time, at the size of the answer it will become: what is
 * being done now, and how many places have been checked so far.
 * ------------------------------------------------------------------ */

export default function WorkingState({ steps = [], statusText = '' }) {
  const done = steps.filter((st) => st.status === 'done').length;
  const running = steps.slice().reverse().find((st) => st.status === 'running');
  const line = (running && (running.label || running.detail))
    || statusText
    || 'Reading the practice documents';
  const detail = running && running.detail && running.detail !== running.label ? running.detail : '';

  return (
    <div style={s('padding:20px 24px 22px;')}>
      <div style={s('display:flex;align-items:center;gap:12px;')}>
        <span style={s('flex:none;width:22px;height:22px;display:inline-flex;color:#005eb8;animation:rivaSpin 1.1s linear infinite;')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </svg>
        </span>
        <span style={s('flex:1;min-width:0;font-size:18px;font-weight:600;color:#212b32;line-height:1.35;')}>{line}</span>
      </div>

      {detail && (
        <div style={s('margin:8px 0 0 34px;font-size:15px;color:#4c6272;line-height:1.45;overflow-wrap:anywhere;')}>{detail}</div>
      )}

      {/* An indeterminate bar: the wait has no percentage to report, and a
          fake one would be a lie about how long is left. */}
      <div style={s('margin:16px 0 0;height:3px;border-radius:2px;background:#e3e9ec;overflow:hidden;')}>
        <div style={s('width:38%;height:100%;border-radius:2px;background:#005eb8;animation:rivaBar 1.25s cubic-bezier(.5,0,.5,1) infinite;')} />
      </div>

      {done > 0 && (
        <div style={s('margin:10px 0 0;font-size:14px;color:#768692;')}>
          {done} {done === 1 ? 'source' : 'sources'} checked so far
        </div>
      )}
    </div>
  );
}
