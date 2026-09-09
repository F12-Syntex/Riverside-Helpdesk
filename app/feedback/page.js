'use client';

// /feedback — every question that was judged, and what the reader said.
//
// The point of the buttons under each answer is that this page exists: a
// verdict nobody reads is a button nobody should have been asked to press. So
// the counts sit at the top and the log below is the actual wording people
// typed, which is the part that says what to build next.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { VERDICTS, isGoodVerdict, verdictLabel } from '../../lib/feedback.mjs';

function when(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Page() {
  const [state, setState] = useState({ loading: true, rows: [], counts: [], error: '' });
  const [only, setOnly] = useState('all');

  useEffect(() => {
    fetch('/api/feedback')
      .then((r) => r.json())
      .then((d) => setState({ loading: false, rows: d.rows || [], counts: d.counts || [], error: d.error || '' }))
      .catch((e) => setState({ loading: false, rows: [], counts: [], error: String(e) }));
  }, []);

  const countOf = (id) => (state.counts.find((c) => c.verdict === id) || {}).n || 0;
  const rows = only === 'all' ? state.rows : state.rows.filter((r) => r.verdict === only);

  return (
    <div style={s('min-height:100vh;background:#0b0b0c;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Answer feedback" />

      <main style={s('flex:1;width:100%;max-width:900px;margin:0 auto;padding:36px 24px 64px;')}>
        <Hover tag={Link} href="/" base="display:inline-flex;align-items:center;gap:7px;background:#141416;border:1px solid #2a2a2e;border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600;color:#e0554f;text-decoration:none;margin-bottom:20px;" hover="border-color:#e0554f;background:#151518;">
          <Svg w={15} sw={2.4}>{Icons.arrowLeft}</Svg>Back
        </Hover>

        <h1 style={s('font-size:32px;margin:0 0 6px;letter-spacing:-0.02em;')}>Answer feedback</h1>
        <p style={s('font-size:17px;color:#9a9aa3;margin:0 0 24px;')}>
          Every answer somebody judged, newest first. A question marked wrong is the next thing to fix.
        </p>

        <div style={s('display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px;')}>
          {[{ id: 'all', label: 'All' }].concat(VERDICTS).map((v) => (
            <Hover key={v.id} tag="button" type="button" onClick={() => setOnly(v.id)}
              base={'border-radius:999px;padding:7px 15px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:1px solid '
                + (only === v.id ? '#e0554f;background:#e0554f;color:#ffffff;' : '#26262a;background:#141416;color:#9a9aa3;')}
              hover={only === v.id ? '' : 'border-color:#e0554f;color:#e0554f;'}>
              {v.label}
              <span style={s('margin-left:7px;opacity:.75;font-weight:500;')}>
                {v.id === 'all' ? state.rows.length : countOf(v.id)}
              </span>
            </Hover>
          ))}
        </div>

        {state.loading && <p style={s('color:#9a9aa3;')}>Loading…</p>}
        {state.error && <p style={s('color:#ff9d96;')}>{state.error}</p>}
        {!state.loading && !state.error && !rows.length && (
          <p style={s('color:#9a9aa3;')}>Nothing yet. Feedback appears here as soon as anyone presses a button under an answer.</p>
        )}

        <div style={s('display:flex;flex-direction:column;gap:10px;')}>
          {rows.map((r) => (
            <div key={r.id} style={s('background:#141416;border:1px solid #26262a;border-left:4px solid ' + (isGoodVerdict(r.verdict) ? '#56c98a' : '#ff7b72') + ';border-radius:0 12px 12px 0;padding:12px 16px;')}>
              <div style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;')}>
                <span style={s('font-size:13px;font-weight:700;color:' + (isGoodVerdict(r.verdict) ? '#56c98a' : '#ff9d96') + ';')}>
                  {verdictLabel(r.verdict)}
                </span>
                <span style={s('font-size:12.5px;color:#74747d;')}>{when(r.at)}</span>
                <span style={s('font-size:12.5px;color:#74747d;')}>· {r.template || 'no template'}</span>
              </div>
              <div style={s('margin-top:5px;font-size:16px;line-height:1.45;color:#e9e9ec;overflow-wrap:anywhere;')}>{r.question}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
