'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Signpost an AccurX request — paste the consultation text (with the
 * patient's identifying details removed) and get a concise routing
 * suggestion: who in the team should handle it, how urgently, and the
 * next step or two. A hint for staff to sanity-check, not a decision.
 * ------------------------------------------------------------------ */

const URGENCY_STYLE = {
  emergency: { label: 'Emergency', bg: '#fde8e9', border: '#d5281b', color: '#8a1509' },
  'same-day': { label: 'Same day', bg: '#fff4d9', border: '#b58900', color: '#6e5300' },
  routine: { label: 'Routine', bg: '#e6f4ea', border: '#007f3b', color: '#005a2a' },
};

export default function Page() {
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState(null);

  async function suggest() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/signpost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setResult(data);
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const urgency = result ? (URGENCY_STYLE[result.urgency] || URGENCY_STYLE['same-day']) : null;

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Signpost an AccurX request" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:32px 24px 56px;')}>
        <h1 style={s('font-size:28px;margin:0 0 4px;letter-spacing:-0.02em;')}>Signpost an AccurX request</h1>
        <p style={s('font-size:16px;color:#4c6272;margin:0 0 18px;')}>
          Paste the consultation text below — <strong>remove the patient's name, date of birth and contact details first</strong>.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the AccurX consultation text here…"
          rows={9}
          style={s('width:100%;box-sizing:border-box;padding:14px 16px;font:inherit;font-size:16px;line-height:1.5;border:1px solid #d8e1e5;border-radius:12px;background:#fff;resize:vertical;outline-color:#005eb8;')}
        />

        <div style={s('display:flex;align-items:center;gap:12px;margin-top:12px;')}>
          <Hover tag="button" onClick={suggest} disabled={busy || !text.trim()}
            base={'display:inline-flex;align-items:center;gap:8px;border:none;border-radius:10px;padding:12px 22px;font:inherit;font-size:16px;font-weight:600;color:#fff;cursor:pointer;background:#005eb8;' + (busy || !text.trim() ? 'opacity:.55;cursor:default;' : '')}
            hover={busy || !text.trim() ? '' : 'background:#00477e;'}>
            <Svg w={18} sw={2.2}>{Icons.arrow}</Svg>
            {busy ? 'Thinking…' : 'Suggest a pathway'}
          </Hover>
          {result && (
            <Hover tag="button" onClick={() => { setResult(null); setText(''); }}
              base="border:none;background:none;font:inherit;font-size:15px;font-weight:600;color:#4c6272;cursor:pointer;padding:12px 6px;"
              hover="color:#212b32;">
              Clear
            </Hover>
          )}
        </div>

        {error && (
          <div style={s('margin-top:16px;padding:14px 16px;background:#fde8e9;border:1px solid #d5281b;border-radius:10px;color:#8a1509;font-size:15px;')}>
            {error}
          </div>
        )}

        {result && (
          <section style={s('margin-top:20px;background:#fff;border:1px solid #d8e1e5;border-radius:12px;overflow:hidden;')}>
            <div style={s('display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid #e8eef1;')}>
              <span style={s('font-size:20px;font-weight:700;color:#212b32;')}>{result.whoLabel}</span>
              <span style={s(`font-size:13.5px;font-weight:700;padding:4px 12px;border-radius:999px;background:${urgency.bg};border:1px solid ${urgency.border};color:${urgency.color};`)}>
                {urgency.label}
              </span>
            </div>
            <div style={s('padding:16px 20px;display:flex;flex-direction:column;gap:14px;')}>
              {result.reason && <p style={s('margin:0;font-size:16px;color:#212b32;')}>{result.reason}</p>}

              {result.flags.length > 0 && (
                <div style={s('padding:12px 14px;background:#fde8e9;border:1px solid #f5b5b0;border-radius:10px;')}>
                  <div style={s('display:flex;align-items:center;gap:8px;font-weight:700;color:#8a1509;font-size:14.5px;margin-bottom:4px;')}>
                    <Svg w={17} sw={2.2}>{Icons.triangle}</Svg>Red flags
                  </div>
                  <ul style={s('margin:0;padding:0 0 0 20px;color:#8a1509;font-size:15px;')}>
                    {result.flags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}

              {result.steps.length > 0 && (
                <ol style={s('margin:0;padding:0 0 0 22px;display:flex;flex-direction:column;gap:6px;font-size:16px;color:#212b32;')}>
                  {result.steps.map((step, i) => <li key={i}>{step}</li>)}
                </ol>
              )}

              <p style={s('margin:0;font-size:13.5px;color:#4c6272;border-top:1px solid #e8eef1;padding-top:12px;')}>
                AI suggestion only — check against the practice's own protocols. If in doubt, ask the duty GP.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
