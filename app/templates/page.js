'use client';

// /templates — the debug page for the answer templates.
//
// Every template rendered with a real question, so the shape of each category
// can be judged side by side before any of it is wired to the assistant. This
// page calls no API and reads no database: a template is a pure function from a
// small input to a block list, which is the property that makes the answers
// consistent, instant and free.
//
// It is a working tool, not a staff page — deliberately absent from the tools
// index.
import { useState } from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import TemplateView from '../_components/templates/TemplateView';
import { TEMPLATES, TEMPLATE_GROUPS } from '../../lib/templates/library.mjs';

export default function Page() {
  const [group, setGroup] = useState('All');
  const shown = group === 'All' ? TEMPLATES : TEMPLATES.filter((t) => t.group === group);

  return (
    <div style={s('min-height:100vh;background:#0b0b0c;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Answer templates" />

      <main style={s('flex:1;width:100%;max-width:880px;margin:0 auto;padding:36px 24px 64px;')}>
        <h1 style={s('font-size:32px;margin:0 0 6px;letter-spacing:-0.02em;')}>Answer templates</h1>
        <p style={s('font-size:17px;line-height:1.55;color:#9a9aa3;margin:0 0 8px;max-width:62ch;')}>
          Every category of question the notebook can answer, rendered from a template rather than written by a model.
          Each one is a pure function: same question, same answer, every time, with no model call.
        </p>
        <p style={s('font-size:14.5px;color:#74747d;margin:0 0 24px;')}>
          {TEMPLATES.length} templates across {TEMPLATE_GROUPS.length} groups. Debug page — not linked from the tools index.
        </p>

        <div style={s('display:flex;flex-wrap:wrap;gap:8px;margin:0 0 28px;')}>
          {['All', ...TEMPLATE_GROUPS].map((g) => (
            <Hover key={g} tag="button" type="button" onClick={() => setGroup(g)}
              base={'border-radius:999px;padding:7px 15px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:1px solid '
                + (group === g ? '#e0554f;background:#e0554f;color:#ffffff;' : '#26262a;background:#141416;color:#9a9aa3;')}
              hover={group === g ? '' : 'border-color:#e0554f;color:#e0554f;'}>
              {g}
              <span style={s('margin-left:7px;opacity:.7;font-weight:500;')}>
                {g === 'All' ? TEMPLATES.length : TEMPLATES.filter((t) => t.group === g).length}
              </span>
            </Hover>
          ))}
        </div>

        <div style={s('display:flex;flex-direction:column;gap:34px;')}>
          {shown.map((t) => (
            <section key={t.id}>
              <div style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;margin-bottom:5px;')}>
                <h2 style={s('font-size:19px;font-weight:700;margin:0;letter-spacing:-0.01em;')}>{t.label}</h2>
                <code style={s('font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#9a9aa3;background:#1a1a1d;border-radius:5px;padding:2px 7px;')}>{t.id}</code>
              </div>
              <p style={s('font-size:14.5px;line-height:1.5;color:#9a9aa3;margin:0 0 12px;max-width:64ch;')}>{t.why}</p>

              {/* The question a staff member types, above the answer it produces. */}
              <div style={s('display:flex;gap:10px;align-items:center;margin-bottom:10px;padding:9px 14px;background:#1a1a1d;border-radius:10px;')}>
                <Svg w={15} sw={2.2} style={s('flex:none;color:#9a9aa3;')}>{Icons.chat}</Svg>
                <span style={s('font-size:14.5px;font-weight:600;color:#e9e9ec;')}>{t.sample}</span>
              </div>

              <TemplateView answer={t.render()} />
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
