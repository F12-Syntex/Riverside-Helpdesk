'use client';

import React from 'react';
import { Svg, Icons } from '../ui';
import { copyText } from '../templates/CopyButton';

/* ------------------------------------------------------------------ *
 * Spell it out: a string drawn as tiles to read off during a call.
 *
 * Each character is a tile, big letter over its word, grouped the way
 * the string is said ("nelondonicb" · dot · "theriversidepractice" …),
 * with the whole thing said naturally above it for the first read.
 *
 * Tapping a tile marks where you have got to: everything before it
 * dims, so after "sorry, can you repeat that?" you know where to start
 * again. It draws `answer.spell`, built in lib/spell.mjs, and decides
 * nothing.
 * ------------------------------------------------------------------ */

const CSS = `
.sp{background:#fff;border-radius:22px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(33,43,50,.07),0 1px 2px rgba(33,43,50,.05),0 12px 32px -14px rgba(0,48,135,.22);}
.sp-head{display:flex;align-items:flex-start;gap:12px;padding:16px 20px 14px;background:#eaf2fb;}
.sp-head__text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.sp-kicker{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#005eb8;}
.sp-value{font-size:18px;font-weight:700;color:#003087;overflow-wrap:anywhere;}
.sp-body{display:flex;flex-direction:column;gap:14px;padding:16px 20px 18px;}
.sp-label{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#768692;}
.sp-say{font-size:16px;line-height:1.5;color:#212b32;}
.sp-say b{font-weight:650;}
.sp-groups{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;}
.sp-group{display:flex;flex-wrap:wrap;gap:6px;}
.sp-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:64px;padding:8px 8px 7px;
  border-radius:12px;border:none;background:#f5f9fc;box-shadow:inset 0 0 0 1px #dce8f2;cursor:pointer;font:inherit;
  transition:opacity .15s ease,background-color .15s ease;}
.sp-tile:hover{background:#eef5fb;}
.sp-tile__ch{font-size:22px;line-height:1.1;font-weight:700;color:#003087;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
.sp-tile__say{font-size:12px;font-weight:600;color:#425563;white-space:nowrap;}
.sp-tile--digit .sp-tile__ch{color:#007f3b;}
.sp-tile--capital{box-shadow:inset 0 0 0 1.5px #005eb8;}
.sp-tile--sep{min-width:52px;background:#fff8e6;box-shadow:inset 0 0 0 1px #efdcb7;}
.sp-tile--sep .sp-tile__ch{color:#8a6100;}
.sp-tile.is-read{opacity:.35;}
.sp-tile.is-here{background:#005eb8;box-shadow:none;}
.sp-tile.is-here .sp-tile__ch,.sp-tile.is-here .sp-tile__say{color:#fff;}
.sp-hint{font-size:13px;color:#5b7183;}
.sp-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.sp-copy{flex:none;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:10px;border:1px solid #d5dee2;
  background:#fff;color:#005eb8;font:inherit;font-size:13px;font-weight:650;cursor:pointer;box-shadow:0 1px 2px rgba(33,43,50,.06);}
.sp-copy:hover{background:#f7fbff;border-color:#aac7e0;}
.sp-copy.is-done{background:#007f3b;border-color:#006631;color:#fff;}
.sp-warn{font-size:13.5px;color:#6b4a00;background:#fdf8ef;border-radius:10px;padding:8px 12px;box-shadow:inset 0 0 0 1px #efdcb7;}
`;

function Copy({ value, label }) {
  const [state, setState] = React.useState('');
  const run = async () => {
    const ok = await copyText(value);
    setState(ok ? 'done' : 'failed');
    setTimeout(() => setState(''), ok ? 2000 : 4000);
  };
  return (
    <button type="button" className={'sp-copy' + (state === 'done' ? ' is-done' : '')} onClick={run} title={'Copy: ' + value}>
      <Svg w={14} sw={2.3}>{state === 'done' ? Icons.check : Icons.copy}</Svg>
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : label}
    </button>
  );
}

export default function SpellCard({ answer }) {
  const sp = answer.spell;
  const [here, setHere] = React.useState(-1);
  let n = -1;

  return (
    <div className="sp">
      <style data-sp="1" dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="sp-head">
        <span className="sp-head__text">
          <span className="sp-kicker">{sp.email ? 'Spelling an email address' : 'Spelling it out'}</span>
          <span className="sp-value">{sp.text}</span>
        </span>
        <Copy value={sp.text} label="Copy" />
      </div>

      <div className="sp-body">
        <div>
          <div className="sp-label">Say it as</div>
          <div className="sp-say">{sp.spoken}</div>
        </div>

        <div>
          <div className="sp-row" style={{ marginBottom: 8 }}>
            <span className="sp-label" style={{ flex: 1 }}>Letter by letter</span>
            <Copy value={sp.letterByLetter} label="Copy spelling" />
          </div>
          <div className="sp-groups" data-audit-skip="">
            {sp.groups.map((g, gi) => (
              <div key={gi} className="sp-group">
                {g.chars.map((c) => {
                  n += 1;
                  const i = n;
                  const cls = 'sp-tile'
                    + (g.sep ? ' sp-tile--sep' : c.kind === 'digit' ? ' sp-tile--digit' : c.kind === 'capital' ? ' sp-tile--capital' : '')
                    + (here >= 0 && i < here ? ' is-read' : '')
                    + (i === here ? ' is-here' : '');
                  return (
                    <button key={i} type="button" className={cls} onClick={() => setHere(i === here ? -1 : i)}
                      aria-label={c.ch === ' ' ? 'space' : c.ch + ', ' + c.say}>
                      <span className="sp-tile__ch">{c.show}</span>
                      <span className="sp-tile__say">{c.say}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="sp-hint" style={{ marginTop: 8 }}>Tap a letter to mark where you are up to.</div>
        </div>

        {sp.truncated ? <div className="sp-warn">Only the first part is spelled — it was longer than a card can sensibly hold.</div> : null}
      </div>
    </div>
  );
}
