'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Reason for appointment — paste an AccurX consultation (with the
 * patient's identifying details removed) and get a concise clinical
 * reason for the appointment back, in medical terms, for the doctor
 * who will see or process the request. A copy button drops it straight
 * into the clinical system. It summarises only what the patient wrote —
 * no diagnosis, no management.
 * ------------------------------------------------------------------ */

export default function Page() {
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  async function summarise() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch('/api/reason', {
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

  async function copyReason() {
    if (!result) return;
    // Copy the reason plus any details, so the whole clinical summary pastes in.
    const parts = [result.reason].concat(result.details || []).filter(Boolean);
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) { /* clipboard unavailable — the text is still selectable */ }
  }

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Reason for appointment" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:32px 24px 56px;')}>
        <h1 style={s('font-size:28px;margin:0 0 4px;letter-spacing:-0.02em;')}>Reason for appointment</h1>
        <p style={s('font-size:16px;color:#4c6272;margin:0 0 18px;')}>
          Paste the AccurX consultation below — <strong>remove the patient's name, date of birth and contact details first</strong>. You'll get a concise clinical reason for the doctor.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the AccurX consultation text here…"
          rows={9}
          style={s('width:100%;box-sizing:border-box;padding:14px 16px;font:inherit;font-size:16px;line-height:1.5;border:1px solid #d8e1e5;border-radius:12px;background:#fff;resize:vertical;outline-color:#005eb8;')}
        />

        <div style={s('display:flex;align-items:center;gap:12px;margin-top:12px;')}>
          <Hover tag="button" onClick={summarise} disabled={busy || !text.trim()}
            base={'display:inline-flex;align-items:center;gap:8px;border:none;border-radius:10px;padding:12px 22px;font:inherit;font-size:16px;font-weight:600;color:#fff;cursor:pointer;background:#005eb8;' + (busy || !text.trim() ? 'opacity:.55;cursor:default;' : '')}
            hover={busy || !text.trim() ? '' : 'background:#00477e;'}>
            <Svg w={18} sw={2.2}>{Icons.stethoscope}</Svg>
            {busy ? 'Summarising…' : 'Summarise the reason'}
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
            <div style={s('padding:16px 20px;border-bottom:1px solid #e8eef1;')}>
              <div style={s('font-size:13px;font-weight:700;color:#4c6272;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;')}>Reason for appointment</div>
              <div style={s('display:flex;align-items:flex-start;gap:12px;')}>
                <p style={s('flex:1;margin:0;font-size:18px;font-weight:700;color:#212b32;line-height:1.4;word-break:break-word;')}>{result.reason || '—'}</p>
                <Hover tag="button" onClick={copyReason}
                  base={'flex:none;display:inline-flex;align-items:center;gap:7px;border:1px solid #d8e1e5;border-radius:9px;padding:8px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;' + (copied ? 'background:#e6f4ea;border-color:#007f3b;color:#005a2a;' : 'background:#fff;color:#212b32;')}
                  hover={copied ? '' : 'border-color:#005eb8;background:#f0f6fb;'}>
                  <Svg w={15} sw={2.2}>{copied ? Icons.check : Icons.copy}</Svg>
                  {copied ? 'Copied' : 'Copy'}
                </Hover>
              </div>
            </div>
            {result.details && result.details.length > 0 && (
              <div style={s('padding:14px 20px;')}>
                <div style={s('font-size:13px;font-weight:700;color:#4c6272;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;')}>Detail</div>
                <ul style={s('margin:0;padding:0 0 0 20px;display:flex;flex-direction:column;gap:6px;font-size:16px;color:#212b32;')}>
                  {result.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
            <div style={s('padding:12px 20px 16px;')}>
              <p style={s('margin:0;font-size:13.5px;color:#4c6272;border-top:1px solid #e8eef1;padding-top:12px;')}>
                A summary of the patient's own words only — no diagnosis or advice. Check it against the consultation before relying on it.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
