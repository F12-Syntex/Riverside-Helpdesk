'use client';

// What the contacts search shows while it looks: how many contacts it is
// looking through, counted up with rolling digits, over a thin sweeping bar.
// The number is the register's real size from /api/cqc, never a round
// figure typed in here.
import React from 'react';
import RollingDigits from './RollingDigits';

let cachedSize = 0;
let pending = null;

/** The register's size, fetched once per page load and shared. */
export function useRegisterSize(known = 0) {
  const [size, setSize] = React.useState(known || cachedSize);
  React.useEffect(() => {
    if (known) { cachedSize = known; setSize(known); return; }
    if (cachedSize) { setSize(cachedSize); return; }
    pending = pending || fetch('/api/cqc', { cache: 'no-store' }).then((r) => r.json()).then((d) => (cachedSize = d.total || 0)).catch(() => 0);
    let live = true;
    pending.then((n) => { if (live) setSize(n); });
    return () => { live = false; };
  }, [known]);
  return size;
}

const CSS = `
.csl{display:flex;flex-direction:column;gap:10px;padding:18px 20px;border-radius:16px;background:#fff;
  box-shadow:0 0 0 1px rgba(33,43,50,.08),0 1px 2px rgba(33,43,50,.04);animation:cslIn .3s cubic-bezier(.2,.8,.3,1) both;}
.csl--compact{padding:12px 4px 6px;background:none;box-shadow:none;gap:8px;}
.csl-line{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px;font-size:15px;color:#4c6272;}
.csl-num{font-size:26px;font-weight:750;letter-spacing:-.02em;color:#212b32;}
.csl--compact .csl-num{font-size:17px;}
.csl--compact .csl-line{font-size:14px;}
.csl-sub{font-size:12.5px;color:#8a99a3;}
.csl-bar{position:relative;height:3px;border-radius:999px;background:#e8eef3;overflow:hidden;}
.csl-bar::after{content:"";position:absolute;inset:0 auto 0 0;width:38%;border-radius:inherit;
  background:linear-gradient(90deg,rgba(0,94,184,0),#005eb8 55%,rgba(0,94,184,0));animation:cslSweep 1.25s cubic-bezier(.45,0,.25,1) infinite;}
@keyframes cslSweep{from{transform:translateX(-100%);}to{transform:translateX(265%);}}
@keyframes cslIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){.csl{animation:none;}.csl-bar::after{animation-duration:3s;}}
`;

export default function ContactSearchLoader({ total = 0, query = '', compact = false, sub = 'Every CQC-registered service in England' }) {
  const size = useRegisterSize(total);
  return (
    <div className={'csl' + (compact ? ' csl--compact' : '')} role="status" aria-live="polite">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="csl-line">
        <span>Searching</span>
        {size ? <RollingDigits value={size} className="csl-num" /> : <span className="csl-num">…</span>}
        <span>contacts{query ? <> for <b style={{ color: '#212b32' }}>“{query}”</b></> : null}</span>
      </div>
      <div className="csl-bar" />
      {compact || !sub ? null : <div className="csl-sub">{sub}</div>}
    </div>
  );
}
