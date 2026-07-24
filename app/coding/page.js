'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Code a document — paste the text of a medical document (or a
 * screenshot of it), with the patient's identifying details removed,
 * and get the one-line filing title back:
 *   (dd-Mmm-yyyy) SOURCE DEPARTMENT action items / short plan
 * with a copy button, ready to paste into the clinical system.
 * ------------------------------------------------------------------ */

const MAX_IMAGES = 4;

export default function Page() {
  const [text, setText] = React.useState('');
  const [images, setImages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const fileRef = React.useRef(null);

  function addFiles(files) {
    for (const f of Array.from(files || [])) {
      if (!/^image\//.test(f.type)) continue;
      const reader = new FileReader();
      reader.onload = () => setImages((cur) => cur.length >= MAX_IMAGES ? cur : cur.concat([reader.result]));
      reader.readAsDataURL(f);
    }
  }

  // A screenshot pasted straight into the textarea becomes an attachment.
  function onPaste(e) {
    const files = Array.from(e.clipboardData?.items || [])
      .filter((it) => it.kind === 'file' && /^image\//.test(it.type))
      .map((it) => it.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  async function code() {
    if (busy || (!text.trim() && !images.length)) return;
    setBusy(true);
    setError('');
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch('/api/docfile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), images }),
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

  async function copyTitle() {
    try {
      await navigator.clipboard.writeText(result.title);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) { /* clipboard unavailable — the title is still selectable */ }
  }

  const ready = !busy && (text.trim() || images.length);

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Code a document" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:32px 24px 56px;')}>
        <h1 style={s('font-size:28px;margin:0 0 4px;letter-spacing:-0.02em;')}>Code a document</h1>
        <p style={s('font-size:16px;color:#4c6272;margin:0 0 18px;')}>
          Paste the document text or a screenshot — <strong>remove the patient's name, NHS number and date of birth first</strong>.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder="Paste the document text here — or paste a screenshot straight in…"
          rows={9}
          style={s('width:100%;box-sizing:border-box;padding:14px 16px;font:inherit;font-size:16px;line-height:1.5;border:1px solid #d8e1e5;border-radius:12px;background:#fff;resize:vertical;outline-color:#005eb8;')}
        />

        {images.length > 0 && (
          <div style={s('display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;')}>
            {images.map((src, i) => (
              <div key={i} style={s('position:relative;')}>
                <img src={src} alt={'Attached screenshot ' + (i + 1)} style={s('height:72px;width:auto;max-width:140px;object-fit:cover;border-radius:8px;border:1px solid #d8e1e5;display:block;')} />
                <Hover tag="button" aria-label="Remove screenshot" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                  base="position:absolute;top:-7px;right:-7px;width:22px;height:22px;border-radius:50%;border:none;background:#212b32;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;"
                  hover="background:#d5281b;">
                  <Svg w={12} sw={2.6}>{Icons.close}</Svg>
                </Hover>
              </div>
            ))}
          </div>
        )}

        <div style={s('display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap;')}>
          <Hover tag="button" onClick={code} disabled={!ready}
            base={'display:inline-flex;align-items:center;gap:8px;border:none;border-radius:10px;padding:12px 22px;font:inherit;font-size:16px;font-weight:600;color:#fff;cursor:pointer;background:#005eb8;' + (ready ? '' : 'opacity:.55;cursor:default;')}
            hover={ready ? 'background:#00477e;' : ''}>
            <Svg w={18} sw={2.2}>{Icons.fileLines}</Svg>
            {busy ? 'Coding…' : 'Code this document'}
          </Hover>
          <Hover tag="button" onClick={() => fileRef.current && fileRef.current.click()} disabled={images.length >= MAX_IMAGES}
            base={'display:inline-flex;align-items:center;gap:8px;border:1px solid #d8e1e5;border-radius:10px;padding:11px 16px;font:inherit;font-size:15px;font-weight:600;color:#212b32;background:#fff;cursor:pointer;' + (images.length >= MAX_IMAGES ? 'opacity:.55;cursor:default;' : '')}
            hover={images.length >= MAX_IMAGES ? '' : 'border-color:#005eb8;background:#f0f6fb;'}>
            <Svg w={17} sw={2.2}>{Icons.paperclip}</Svg>
            Attach screenshot
          </Hover>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          {result && (
            <Hover tag="button" onClick={() => { setResult(null); setText(''); setImages([]); }}
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
              <div style={s('font-size:13px;font-weight:700;color:#4c6272;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;')}>Filing title</div>
              <div style={s('display:flex;align-items:flex-start;gap:12px;')}>
                <p style={s('flex:1;margin:0;font-size:18px;font-weight:700;color:#212b32;line-height:1.4;word-break:break-word;')}>{result.title}</p>
                <Hover tag="button" onClick={copyTitle}
                  base={'flex:none;display:inline-flex;align-items:center;gap:7px;border:1px solid #d8e1e5;border-radius:9px;padding:8px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;' + (copied ? 'background:#e6f4ea;border-color:#007f3b;color:#005a2a;' : 'background:#fff;color:#212b32;')}
                  hover={copied ? '' : 'border-color:#005eb8;background:#f0f6fb;'}>
                  <Svg w={15} sw={2.2}>{copied ? Icons.check : Icons.copy}</Svg>
                  {copied ? 'Copied' : 'Copy'}
                </Hover>
              </div>
            </div>
            <div style={s('padding:14px 20px;display:flex;flex-direction:column;gap:8px;font-size:15px;color:#212b32;')}>
              <div><span style={s('color:#4c6272;font-weight:600;')}>Date: </span>{result.date}</div>
              {result.source && <div><span style={s('color:#4c6272;font-weight:600;')}>Source: </span>{result.source}</div>}
              {result.department && <div><span style={s('color:#4c6272;font-weight:600;')}>Department: </span>{result.department}</div>}
              {result.actions.length > 0 && (
                <div>
                  <span style={s('color:#4c6272;font-weight:600;')}>Actions for the practice:</span>
                  <ul style={s('margin:4px 0 0;padding:0 0 0 20px;')}>
                    {result.actions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {!result.actions.length && result.note && <div><span style={s('color:#4c6272;font-weight:600;')}>Note: </span>{result.note}</div>}
              <p style={s('margin:6px 0 0;font-size:13.5px;color:#4c6272;border-top:1px solid #e8eef1;padding-top:10px;')}>
                Check the title against the document before filing — especially the date{result.date === 'dd-Mmm-yyyy' ? ' (none could be verified, fill it in)' : ''}.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
