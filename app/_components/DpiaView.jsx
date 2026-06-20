'use client';

import { s, Hover, Svg, Icons } from './ui';
import { DPIA } from '../../lib/dpia';

export default function DpiaView() {
  const d = DPIA;
  const STATUS = {
    complete: { label: 'Done', color: '#007f3b', bg: '#e6f3ec' },
    'in-progress': { label: 'In progress', color: '#946200', bg: '#fff6cc' },
    pending: { label: 'To do', color: '#637381', bg: '#eef2f4' },
  };
  const RISK = { High: '#d5281b', Medium: '#946200', Low: '#007f3b' };
  const dot = (st) => {
    const c = STATUS[st] || STATUS.pending;
    if (st === 'complete') return <span style={s('flex:none;width:24px;height:24px;border-radius:50%;background:' + c.color + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={14} stroke="#fff" sw={3}>{Icons.check}</Svg></span>;
    if (st === 'in-progress') return <span style={s('flex:none;width:24px;height:24px;border-radius:50%;background:' + c.color + ';')} />;
    return <span style={s('flex:none;width:24px;height:24px;border-radius:50%;border:2px solid #aeb7bd;background:#fff;box-sizing:border-box;')} />;
  };
  const tag = (st) => { const c = STATUS[st] || STATUS.pending; return <span style={s('flex:none;font-size:12px;font-weight:700;color:' + c.color + ';background:' + c.bg + ';border-radius:999px;padding:3px 10px;')}>{c.label}</span>; };
  const sectionLabel = s('font-size:13px;font-weight:700;color:#768692;text-transform:uppercase;letter-spacing:.05em;padding:16px 20px 8px;');
  const card = 'background:#fff;border:1px solid #d8dde0;border-radius:14px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;';

  return (
    <div style={s('max-width:760px;margin:0 auto;padding:32px 24px 48px;display:flex;flex-direction:column;gap:18px;')}>

      <div style={s('text-align:center;')}>
        <div style={s('width:64px;height:64px;border-radius:16px;background:#fff;border:1px solid #d8dde0;box-shadow:0 1px 3px rgba(33,43,50,.08);display:inline-flex;align-items:center;justify-content:center;color:#005eb8;')}>
          <Svg w={32} sw={1.8}>{Icons.shield}</Svg>
        </div>
        <h1 style={s('font-size:34px;font-weight:800;margin:16px 0 8px;letter-spacing:-0.02em;')}>{d.title}</h1>
        <p style={s('font-size:18px;color:#4c6272;max-width:560px;margin:0 auto;line-height:1.5;text-wrap:pretty;')}>{d.subtitle}</p>
      </div>

      <div style={s('background:#fff6cc;border:1px solid #ffd97a;border-left:6px solid #ffb81c;border-radius:12px;padding:16px 20px;display:flex;gap:14px;align-items:flex-start;')}>
        <Svg w={26} stroke="#946200" sw={2} style={s('flex:none;margin-top:1px;')}>{Icons.triangle}</Svg>
        <div>
          <div style={s('font-size:18px;font-weight:800;color:#212b32;')}>{d.status}</div>
          <div style={s('font-size:15px;color:#4c6272;line-height:1.5;margin-top:3px;')}>{d.stage}</div>
        </div>
      </div>

      <div style={s(card)}>
        {d.plain.map((row, i) => (
          <div key={i} style={s('display:grid;grid-template-columns:160px 1fr;gap:16px;padding:14px 20px;' + (i ? 'border-top:1px solid #eef2f4;' : ''))}>
            <div style={s('font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#768692;')}>{row.label}</div>
            <div style={s('font-size:16px;line-height:1.5;color:' + (row.danger ? '#a8071a' : '#212b32') + ';font-weight:' + (row.danger ? '600' : '400') + ';text-wrap:pretty;')}>{row.value}</div>
          </div>
        ))}
      </div>

      <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:16px;')}>
        <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:14px;padding:16px 18px;')}>
          <div style={s('font-size:14px;font-weight:700;color:#007f3b;margin-bottom:10px;')}>Protecting data now</div>
          <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;')}>
            {d.inPlace.map((t, i) => (<li key={i} style={s('display:flex;gap:9px;align-items:flex-start;font-size:15px;line-height:1.45;')}><Svg w={16} stroke="#007f3b" sw={2.6} style={s('flex:none;margin-top:2px;')}>{Icons.check}</Svg><span>{t}</span></li>))}
          </ul>
        </div>
        <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:14px;padding:16px 18px;')}>
          <div style={s('font-size:14px;font-weight:700;color:#946200;margin-bottom:10px;')}>Still to do before approval</div>
          <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;')}>
            {d.todo.map((t, i) => (<li key={i} style={s('display:flex;gap:9px;align-items:flex-start;font-size:15px;line-height:1.45;')}><span style={s('flex:none;width:7px;height:7px;border-radius:50%;background:#ffb81c;margin-top:7px;')} /><span>{t}</span></li>))}
          </ul>
        </div>
      </div>

      <div style={s(card)}>
        <div style={sectionLabel}>The seven steps</div>
        {d.steps.map((st, i) => (
          <div key={st.n} style={s('display:flex;gap:13px;align-items:flex-start;padding:13px 20px;' + (i ? 'border-top:1px solid #eef2f4;' : ''))}>
            {dot(st.status)}
            <div style={s('flex:1;min-width:0;')}>
              <div style={s('display:flex;gap:10px;align-items:center;flex-wrap:wrap;')}>
                <span style={s('font-size:16px;font-weight:700;')}>{st.n}. {st.title}</span>
                {tag(st.status)}
              </div>
              <div style={s('font-size:14.5px;color:#4c6272;line-height:1.45;margin-top:2px;text-wrap:pretty;')}>{st.summary}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={s(card)}>
        <div style={sectionLabel}>Risks at a glance</div>
        {d.risks.map((r, i) => (
          <div key={i} style={s('display:flex;gap:12px;align-items:center;padding:12px 20px;' + (i ? 'border-top:1px solid #eef2f4;' : ''))}>
            <span style={s('flex:1;min-width:0;font-size:15px;line-height:1.45;text-wrap:pretty;')}>{r.risk}</span>
            <span style={s('flex:none;font-size:12px;font-weight:800;color:#fff;background:' + (RISK[r.overall] || '#637381') + ';border-radius:999px;padding:3px 11px;')}>{r.overall}</span>
          </div>
        ))}
      </div>

      <div style={s('display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:13px;color:#768692;')}>
        <span>Last updated {d.updated}</span>
        <span>·</span>
        <span>Controller: {d.controller.name}</span>
        <span>·</span>
        <span>Responsible: {d.controller.responsible}</span>
        <span>·</span>
        <Hover tag="a" href={'/' + d.templateUrl} base="color:#005eb8;text-decoration:underline;text-underline-offset:.12em;" hover="color:#003087;text-decoration-thickness:2px;">Open the blank ICO template</Hover>
      </div>
      <p style={s('font-size:12.5px;color:#aeb7bd;text-align:center;line-height:1.5;max-width:560px;margin:0 auto;text-wrap:pretty;')}>A working self-assessment to support the practice’s data protection process — not a substitute for review and sign-off by the Data Protection Officer.</p>
    </div>
  );
}
