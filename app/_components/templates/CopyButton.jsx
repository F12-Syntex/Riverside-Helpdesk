'use client';

// One copy button, used by every block that has something worth copying.
//
// Two ways of doing it, because one of them is not always available: the
// clipboard API needs a secure context, and a practice reaching this over plain
// HTTP on the local network would otherwise get a button that silently does
// nothing — which is worse than no button, because the reader believes it
// worked and pastes the last thing they copied onto a document.
import React, { useState } from 'react';
import { s, Hover, Svg, Icons } from '../ui';

export async function copyText(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (e) { /* fall through to the old way */ }
  try {
    const box = document.createElement('textarea');
    box.value = value;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(box);
    return ok;
  } catch (e) {
    return false;
  }
}

// Says what happened, including when it did not work. "Press Ctrl+C" is a worse
// outcome than a copy, and a far better one than a button that lies.
export default function CopyButton({ value, label = 'Copy', small = false }) {
  const [state, setState] = useState('');
  const run = async () => {
    const ok = await copyText(value);
    setState(ok ? 'done' : 'failed');
    setTimeout(() => setState(''), ok ? 2000 : 4000);
  };
  const text = state === 'done' ? 'Copied' : state === 'failed' ? 'Select and press Ctrl+C' : label;
  return (
    <Hover tag="button" type="button" onClick={run} title={'Copy: ' + value}
      base={'flex:none;display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid '
        + (state === 'done' ? '#007f3b' : '#d5dee2')
        + ';border-radius:999px;padding:' + (small ? '4px 10px' : '5px 12px')
        + ';font:inherit;font-size:' + (small ? '12.5px' : '13px')
        + ';font-weight:600;color:' + (state === 'done' ? '#00632f' : '#005eb8') + ';cursor:pointer;'}
      hover="border-color:#005eb8;background:#f7fbff;">
      <Svg w={small ? 12 : 13} sw={2.2}>{state === 'done' ? Icons.check : Icons.copy}</Svg>{text}
    </Hover>
  );
}
