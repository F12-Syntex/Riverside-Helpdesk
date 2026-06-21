'use client';

// Renders the practice's DPIA as the ICO "sample DPIA template" document: a
// white A4-style sheet with the submitting-controller box, the seven numbered
// steps (each showing the template's own guidance prompt above the practice's
// answer) and the step 5–7 tables. Content comes from lib/dpia.js.

import { s, Hover, Svg, Icons } from './ui';
import { DPIA } from '../../lib/dpia';

const STATUS = {
  complete: { label: 'Done', color: '#007f3b', bg: '#e6f3ec' },
  'in-progress': { label: 'In progress', color: '#946200', bg: '#fff6cc' },
  pending: { label: 'To do', color: '#637381', bg: '#eef2f4' },
};
const RISK = { High: '#d5281b', Medium: '#946200', Low: '#007f3b' };

export default function DpiaView() {
  const d = DPIA;

  // Shared document styling — kept close to a printed form.
  const sheet = 'background:#fff;border:1px solid #c9d1d6;box-shadow:0 1px 4px rgba(33,43,50,.10);border-radius:4px;padding:48px 56px 56px;';
  const stepHead = 'font-size:19px;font-weight:800;padding:9px 16px;background:#005eb8;color:#fff;border-radius:3px;margin:0;';
  const guidance = 'font-size:14.5px;font-style:italic;color:#637381;line-height:1.5;margin:14px 0 10px;text-wrap:pretty;';
  const answer = 'font-size:15.5px;color:#212b32;line-height:1.6;margin:0;text-wrap:pretty;';
  const answerBox = 'border:1px solid #d8dde0;border-left:3px solid #005eb8;border-radius:3px;padding:14px 18px;display:flex;flex-direction:column;gap:10px;';

  const dot = (st) => {
    const c = STATUS[st] || STATUS.pending;
    if (st === 'complete') return <span style={s('flex:none;width:22px;height:22px;border-radius:50%;background:' + c.color + ';display:inline-flex;align-items:center;justify-content:center;')}><Svg w={13} stroke="#fff" sw={3}>{Icons.check}</Svg></span>;
    if (st === 'in-progress') return <span style={s('flex:none;width:22px;height:22px;border-radius:50%;background:' + c.color + ';')} />;
    return <span style={s('flex:none;width:22px;height:22px;border-radius:50%;border:2px solid #aeb7bd;background:#fff;box-sizing:border-box;')} />;
  };
  const tag = (st) => { const c = STATUS[st] || STATUS.pending; return <span style={s('flex:none;font-size:12px;font-weight:700;color:' + c.color + ';background:' + c.bg + ';border-radius:999px;padding:3px 11px;')}>{c.label}</span>; };
  const chip = (level, map) => <span style={s('display:inline-block;font-size:12px;font-weight:800;color:#fff;background:' + ((map && map[level]) || '#637381') + ';border-radius:999px;padding:2px 10px;white-space:nowrap;')}>{level}</span>;

  // Bordered tables that mirror the form's grids (steps 5–7).
  const th = 'text-align:left;font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#fff;background:#425563;padding:9px 12px;border:1px solid #c9d1d6;vertical-align:top;';
  const td = 'font-size:14.5px;color:#212b32;line-height:1.5;padding:10px 12px;border:1px solid #d8dde0;vertical-align:top;text-wrap:pretty;';
  const hint = 'font-size:12px;font-style:italic;color:#9aa7b0;font-weight:400;display:block;margin-top:3px;text-transform:none;letter-spacing:0;';

  return (
    <div style={s('max-width:880px;margin:0 auto;padding:28px 20px 56px;')}>
      <div className="riva-dpia-sheet" style={s(sheet)}>

        {/* Masthead */}
        <div style={s('display:flex;gap:16px;align-items:flex-start;border-bottom:3px solid #005eb8;padding-bottom:22px;')}>
          <span style={s('flex:none;width:52px;height:52px;border-radius:10px;background:#e8f1f8;display:inline-flex;align-items:center;justify-content:center;color:#005eb8;')}>
            <Svg w={28} sw={1.8}>{Icons.shield}</Svg>
          </span>
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:13px;font-weight:700;color:#768692;text-transform:uppercase;letter-spacing:.06em;')}>{d.program} · Sample DPIA template</div>
            <h1 className="riva-hero-h1" style={s('font-size:30px;font-weight:800;margin:4px 0 8px;letter-spacing:-0.02em;')}>{d.title}</h1>
            <p style={s('font-size:16px;color:#4c6272;line-height:1.5;margin:0;text-wrap:pretty;')}>{d.subtitle}</p>
          </div>
        </div>

        <p style={s('font-size:14.5px;color:#637381;line-height:1.55;margin:18px 0 0;text-wrap:pretty;')}>{d.preamble}</p>

        {/* Draft / status banner */}
        <div style={s('margin-top:20px;background:#fff6cc;border:1px solid #ffd97a;border-left:6px solid #ffb81c;border-radius:4px;padding:14px 18px;display:flex;gap:13px;align-items:flex-start;')}>
          <Svg w={24} stroke="#946200" sw={2} style={s('flex:none;margin-top:1px;')}>{Icons.triangle}</Svg>
          <div>
            <div style={s('font-size:16px;font-weight:800;color:#212b32;')}>{d.status}</div>
            <div style={s('font-size:14.5px;color:#4c6272;line-height:1.5;margin-top:3px;')}>{d.stage}</div>
          </div>
        </div>

        {/* Submitting controller details */}
        <h2 style={s('font-size:15px;font-weight:800;color:#212b32;text-transform:uppercase;letter-spacing:.04em;margin:30px 0 12px;')}>Submitting controller details</h2>
        <div style={s('border:1px solid #d8dde0;border-radius:3px;overflow:hidden;')}>
          {[
            ['Name of controller', d.controller.name],
            ['Subject / title of DPO', d.controller.dpoTitle],
            ['Name of controller contact / DPO', d.controller.contact],
          ].map((row, i) => (
            <div key={i} className="riva-grid-label" style={s('display:grid;grid-template-columns:240px 1fr;' + (i ? 'border-top:1px solid #eef2f4;' : ''))}>
              <div style={s('font-size:13.5px;font-weight:700;color:#425563;background:#f4f7f8;padding:12px 16px;border-right:1px solid #e3e8eb;')}>{row[0]}</div>
              <div style={s('font-size:15px;color:#212b32;padding:12px 16px;line-height:1.5;')}>{row[1]}</div>
            </div>
          ))}
        </div>

        {/* The seven steps */}
        {d.steps.map((st) => (
          <section key={st.n} style={s('margin-top:34px;')}>
            <div style={s('display:flex;gap:12px;align-items:center;flex-wrap:wrap;')}>
              <h2 style={s(stepHead + 'flex:1;min-width:0;')}>Step {st.n}: {st.title}</h2>
              <span style={s('display:inline-flex;gap:8px;align-items:center;')}>{dot(st.status)}{tag(st.status)}</span>
            </div>

            <p style={s(guidance)}>{st.guidance}</p>

            {st.body && (
              <div style={s(answerBox)}>
                {st.body.map((p, i) => <p key={i} style={s(answer)}>{p}</p>)}
              </div>
            )}

            {/* Step 5 — risk register */}
            {st.n === 5 && st.table && (
              <div style={s('overflow-x:auto;margin-top:4px;')}>
                <table style={s('width:100%;border-collapse:collapse;min-width:560px;')}>
                  <thead><tr>{st.table.cols.map((c, i) => (
                    <th key={i} style={s(th + (i ? 'width:140px;' : ''))}>{c}{st.table.hints[i] ? <span style={s(hint)}>{st.table.hints[i]}</span> : null}</th>
                  ))}</tr></thead>
                  <tbody>{st.table.rows.map((r, i) => (
                    <tr key={i}>
                      <td style={s(td)}>{r.source}</td>
                      <td style={s(td)}>{r.likelihood}</td>
                      <td style={s(td)}>{r.severity}</td>
                      <td style={s(td)}>{chip(r.overall, RISK)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* Step 6 — measures */}
            {st.n === 6 && st.table && (
              <div style={s('overflow-x:auto;margin-top:4px;')}>
                <table style={s('width:100%;border-collapse:collapse;min-width:640px;')}>
                  <thead><tr>{st.table.cols.map((c, i) => (
                    <th key={i} style={s(th + (i >= 2 ? 'width:120px;' : ''))}>{c}{st.table.hints[i] ? <span style={s(hint)}>{st.table.hints[i]}</span> : null}</th>
                  ))}</tr></thead>
                  <tbody>{st.table.rows.map((r, i) => (
                    <tr key={i}>
                      <td style={s(td)}>{r.risk}</td>
                      <td style={s(td)}>{r.options}</td>
                      <td style={s(td)}>{r.effect}</td>
                      <td style={s(td)}>{chip(r.residual, RISK)}</td>
                      <td style={s(td)}>{r.approved}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* Step 7 — sign-off */}
            {st.n === 7 && st.table && (
              <div style={s('overflow-x:auto;margin-top:4px;')}>
                <table style={s('width:100%;border-collapse:collapse;min-width:560px;')}>
                  <thead><tr>{st.table.cols.map((c, i) => (
                    <th key={i} style={s(th + (i === 0 ? 'width:220px;' : ''))}>{c}</th>
                  ))}</tr></thead>
                  <tbody>{st.table.rows.map((r, i) => (
                    <tr key={i}>
                      <td style={s(td + 'font-weight:700;color:#425563;background:#f9fbfb;')}>{r.item}</td>
                      <td style={s(td)}>{r.who}</td>
                      <td style={s(td)}>{r.notes}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        {/* Footer */}
        <div style={s('margin-top:38px;padding-top:20px;border-top:1px solid #e3e8eb;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:13px;color:#768692;')}>
          <span>Last updated {d.updated}</span>
          <span>·</span>
          <span>Controller: {d.controller.name}</span>
          <span>·</span>
          <Hover tag="a" href={'/' + d.templateUrl} base="color:#005eb8;text-decoration:underline;text-underline-offset:.12em;" hover="color:#003087;text-decoration-thickness:2px;">Open the blank ICO template</Hover>
        </div>
        <p style={s('font-size:12.5px;color:#aeb7bd;text-align:center;line-height:1.5;max-width:600px;margin:12px auto 0;text-wrap:pretty;')}>A working self-assessment to support the practice’s data protection process — not a substitute for review and sign-off by the Data Protection Officer.</p>
      </div>
    </div>
  );
}
