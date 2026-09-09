'use client';

// Renders the practice's DPIA as the ICO "sample DPIA template" document: a
// white A4-style sheet with the submitting-controller box, the seven numbered
// steps (each showing the template's own guidance prompt above the practice's
// answer) and the step 5–7 tables. Content comes from lib/dpia.js.

import { s, Hover, Svg, Icons } from './ui';
import DpiaFlow from './DpiaFlow';
import { DPIA } from '../../lib/dpia';

const STATUS = {
  complete: { label: 'Done', color: '#56c98a', bg: '#12211a' },
  'in-progress': { label: 'In progress', color: '#d9ab52', bg: '#241f12' },
  pending: { label: 'To do', color: '#82828b', bg: '#18181a' },
};
const RISK = { High: '#ff7b72', Medium: '#d9ab52', Low: '#56c98a' };

export default function DpiaView() {
  const d = DPIA;

  // Shared document styling — kept close to a printed form.
  const sheet = 'background:#141416;border:1px solid #2c2c31;box-shadow:0 1px 4px rgba(0,0,0,.10);border-radius:4px;padding:48px 56px 56px;';
  const stepHead = 'font-size:19px;font-weight:800;padding:9px 16px;background:#e0554f;color:#ffffff;border-radius:3px;margin:0;';
  const guidance = 'font-size:14.5px;font-style:italic;color:#82828b;line-height:1.5;margin:14px 0 10px;text-wrap:pretty;';
  const answer = 'font-size:15.5px;color:#e9e9ec;line-height:1.6;margin:0;text-wrap:pretty;';
  const answerBox = 'border:1px solid #26262a;border-left:3px solid #e0554f;border-radius:3px;padding:14px 18px;display:flex;flex-direction:column;gap:10px;';

  const dot = (st) => {
    const c = STATUS[st] || STATUS.pending;
    if (st === 'complete') return <span style={s('flex:none;width:22px;height:22px;border-radius:50%;background:' + c.color + ';display:inline-flex;align-items:center;justify-content:center;')}><Svg w={13} stroke="#ffffff" sw={3}>{Icons.check}</Svg></span>;
    if (st === 'in-progress') return <span style={s('flex:none;width:22px;height:22px;border-radius:50%;background:' + c.color + ';')} />;
    return <span style={s('flex:none;width:22px;height:22px;border-radius:50%;border:2px solid #55555e;background:#141416;box-sizing:border-box;')} />;
  };
  const tag = (st) => { const c = STATUS[st] || STATUS.pending; return <span style={s('flex:none;font-size:12px;font-weight:700;color:' + c.color + ';background:' + c.bg + ';border-radius:999px;padding:3px 11px;')}>{c.label}</span>; };
  const chip = (level, map) => <span style={s('display:inline-block;font-size:12px;font-weight:800;color:#ffffff;background:' + ((map && map[level]) || '#82828b') + ';border-radius:999px;padding:2px 10px;white-space:nowrap;')}>{level}</span>;

  // Bordered tables that mirror the form's grids (steps 5–7).
  const th = 'text-align:left;font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#ffffff;background:#8e8e97;padding:9px 12px;border:1px solid #2c2c31;vertical-align:top;';
  const td = 'font-size:14.5px;color:#e9e9ec;line-height:1.5;padding:10px 12px;border:1px solid #26262a;vertical-align:top;text-wrap:pretty;';
  const hint = 'font-size:12px;font-style:italic;color:#52525b;font-weight:400;display:block;margin-top:3px;text-transform:none;letter-spacing:0;';

  return (
    <div style={s('max-width:880px;margin:0 auto;padding:28px 20px 56px;')}>
      <div className="riva-dpia-sheet" style={s(sheet)}>

        {/* Masthead */}
        <div style={s('display:flex;gap:16px;align-items:flex-start;border-bottom:3px solid #e0554f;padding-bottom:22px;')}>
          <span style={s('flex:none;width:52px;height:52px;border-radius:10px;background:#221a1a;display:inline-flex;align-items:center;justify-content:center;color:#e0554f;')}>
            <Svg w={28} sw={1.8}>{Icons.shield}</Svg>
          </span>
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:13px;font-weight:700;color:#74747d;text-transform:uppercase;letter-spacing:.06em;')}>{d.program} · Sample DPIA template</div>
            <h1 className="riva-hero-h1" style={s('font-size:30px;font-weight:800;margin:4px 0 8px;letter-spacing:-0.02em;')}>{d.title}</h1>
            <p style={s('font-size:16px;color:#9a9aa3;line-height:1.5;margin:0;text-wrap:pretty;')}>{d.subtitle}</p>
          </div>
        </div>

        <p style={s('font-size:14.5px;color:#82828b;line-height:1.55;margin:18px 0 0;text-wrap:pretty;')}>{d.preamble}</p>

        {/* Draft / status banner */}
        <div style={s('margin-top:20px;background:#241f12;border:1px solid #51442a;border-left:6px solid #d9a441;border-radius:4px;padding:14px 18px;display:flex;gap:13px;align-items:flex-start;')}>
          <Svg w={24} stroke="#d9ab52" sw={2} style={s('flex:none;margin-top:1px;')}>{Icons.triangle}</Svg>
          <div>
            <div style={s('font-size:16px;font-weight:800;color:#e9e9ec;')}>{d.status}</div>
            <div style={s('font-size:14.5px;color:#9a9aa3;line-height:1.5;margin-top:3px;')}>{d.stage}</div>
          </div>
        </div>

        {/* Submitting controller details */}
        <h2 style={s('font-size:15px;font-weight:800;color:#e9e9ec;text-transform:uppercase;letter-spacing:.04em;margin:30px 0 12px;')}>Submitting controller details</h2>
        <div style={s('border:1px solid #26262a;border-radius:3px;overflow:hidden;')}>
          {[
            ['Name of controller', d.controller.name],
            ['Subject / title of DPO', d.controller.dpoTitle],
            ['Name of controller contact / DPO', d.controller.contact],
          ].map((row, i) => (
            <div key={i} className="riva-grid-label" style={s('display:grid;grid-template-columns:240px 1fr;' + (i ? 'border-top:1px solid #18181a;' : ''))}>
              <div style={s('font-size:13.5px;font-weight:700;color:#8e8e97;background:#151517;padding:12px 16px;border-right:1px solid #1d1d20;')}>{row[0]}</div>
              <div style={s('font-size:15px;color:#e9e9ec;padding:12px 16px;line-height:1.5;')}>{row[1]}</div>
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

            {/* Step 2 — the data-flow diagram the written description maps onto */}
            {st.n === 2 && (
              <figure style={s('margin:16px 0 0;')}>
                <div style={s('border:1px solid #26262a;border-radius:3px;padding:14px 16px;background:#141416;overflow-x:auto;')}>
                  <DpiaFlow />
                </div>
                <figcaption style={s('font-size:12.5px;color:#74747d;line-height:1.5;margin-top:8px;text-wrap:pretty;')}>
                  Figure 1 — the data flow described above: what staff put in, what the server does with it,
                  what is stored, and every recipient outside the practice.
                </figcaption>
              </figure>
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
                      <td style={s(td + 'font-weight:700;color:#8e8e97;background:#141416;')}>{r.item}</td>
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
        <div style={s('margin-top:38px;padding-top:20px;border-top:1px solid #1d1d20;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:13px;color:#74747d;')}>
          <span>Last updated {d.updated}</span>
          <span>·</span>
          <span>Controller: {d.controller.name}</span>
          <span>·</span>
          <Hover tag="a" href={'/' + d.templateUrl} base="color:#e0554f;text-decoration:underline;text-underline-offset:.12em;" hover="color:#f0817c;text-decoration-thickness:2px;">Open the blank ICO template</Hover>
        </div>
        <p style={s('font-size:12.5px;color:#55555e;text-align:center;line-height:1.5;max-width:600px;margin:12px auto 0;text-wrap:pretty;')}>A working self-assessment to support the practice’s data protection process. It is not a substitute for review and sign-off by the Data Protection Officer.</p>
      </div>
    </div>
  );
}
