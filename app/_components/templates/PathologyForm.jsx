'use client';

// The EMIS "Test Requests" screen, drawn with the blood form filled in.
//
// A blood form is raised on that one screen, and the card used to be a list of
// test names the reader then had to go and find tick boxes for. Now the card IS
// the screen: the same two halves, in the same places. The tick boxes sit on
// the left under the screen's own section headings, and the Ordered Items list
// and the Clinical Details box sit on the right, where they are on EMIS.
//
// ONLY THE BOXES THAT GET TICKED ARE DRAWN. The real form is a wall of a
// hundred tests and redrawing all of them would put ninety-six things on the
// card that the reader is being told to leave alone. What is here is what
// changes: the ticks, the list they produce, and the line under it.
//
// Nothing is interactive. The boxes are pictures of the state the screen should
// end up in, not controls, and they are marked as such for a screen reader.
import React from 'react';
import { s, Svg, Icons } from '../ui';
import CopyButton from './CopyButton';

const INK = '#212b32';
const LINE = '#4c6272';
const AMBER = '#8a6100';

function Label({ children }) {
  return <div style={s('font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:' + LINE + ';margin:0 0 6px;')}>{children}</div>;
}

// A ticked box, exactly as the form shows one: the box, then the test.
function Ticked({ test }) {
  return (
    <div role="img" aria-label={test + ' (ticked)'} style={s('display:flex;align-items:flex-start;gap:9px;padding:5px 0;')}>
      <span style={s('flex:none;width:19px;height:19px;border:2px solid ' + LINE + ';background:#fff;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}>
        <Svg w={13} stroke="#007f3b" sw={3.2}>{Icons.check}</Svg>
      </span>
      <span style={s('flex:1;min-width:0;font-size:15px;font-weight:700;color:' + INK + ';overflow-wrap:anywhere;')}>{test}</span>
    </div>
  );
}

// A part of the screen the practice has not recorded, said inside the box it
// belongs to. An empty box otherwise reads as "nothing to do here", which on a
// blood form is the difference between a sample the laboratory can run and one
// it queries.
function Missing({ text }) {
  return (
    <div style={s('display:flex;gap:7px;align-items:flex-start;font-size:14px;line-height:1.45;font-weight:600;color:' + AMBER + ';')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={14} stroke="#b58500" sw={2.2}>{Icons.alertCircle}</Svg></span>
      <span>{text}</span>
    </div>
  );
}

// `block` is the pathology block from lib/templates/blocks.mjs, or anything
// with the same keys.
export default function PathologyForm({ block }) {
  const b = block || {};
  const groups = (b.groups || []).filter((g) => g && (g.tests || []).length);
  const ordered = (b.ordered || []).filter(Boolean);
  const details = String(b.clinicalDetails || '').trim();

  return (
    <div style={s('border:1px solid #d8e1e5;border-radius:12px;background:#fff;overflow:hidden;')}>
      <div style={s('display:flex;align-items:center;gap:8px;padding:8px 16px;background:#005eb8;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>
        <Svg w={14} stroke="#fff" sw={2.4}>{Icons.check}</Svg>On the blood form
      </div>
      <div style={s('padding:16px 18px 18px;background:#f0f4f5;')}>
        <div style={s('font-size:20px;font-weight:700;color:' + INK + ';margin:0 0 3px;')}>Test Requests</div>
        <div style={s('font-size:13.5px;color:' + LINE + ';margin:0 0 14px;')}>Order tab → {b.section || 'Pathology'}</div>

        <div style={s('display:flex;flex-wrap:wrap;gap:16px;')}>
          {/* The tick boxes, under the screen's own section headings so the
              reader can find each one without scrolling the whole form. */}
          <div style={s('flex:1 1 240px;min-width:0;')}>
            <Label>Tick these</Label>
            {groups.length ? groups.map((g) => (
              <div key={g.heading} style={s('margin:0 0 10px;background:#fff;border:2px solid ' + LINE + ';padding:8px 12px 10px;')}>
                <div style={s('font-size:13.5px;font-weight:700;color:' + LINE + ';margin:0 0 2px;')}>{g.heading}</div>
                {(g.tests || []).map((t) => <Ticked key={t} test={t} />)}
              </div>
            )) : (
              <div style={s('background:#fff;border:2px solid #b58500;padding:10px 12px;')}>
                <Missing text={b.ticksMissing || 'Not recorded — tick what the request asks for'} />
              </div>
            )}
          </div>

          {/* The right-hand side of the screen: what is actually sent, and the
              line the laboratory reads. */}
          <div style={s('flex:1 1 240px;min-width:0;')}>
            <Label>Ordered items</Label>
            <div style={s('background:#fff;border:2px solid ' + (ordered.length ? LINE : '#b58500') + ';padding:9px 12px;min-height:96px;margin:0 0 12px;')}>
              {ordered.length ? ordered.map((t) => (
                <div key={t} style={s('font-size:15px;line-height:1.5;color:#005eb8;font-weight:700;overflow-wrap:anywhere;')}>{t}</div>
              )) : <Missing text={b.orderedMissing || 'Nothing ordered yet — the list fills as the boxes are ticked'} />}
            </div>

            <Label>Clinical details</Label>
            <div style={s('display:flex;align-items:flex-start;gap:8px;')}>
              <div role="img" aria-label={'Clinical details: ' + (details || b.detailsMissing || 'empty')}
                style={s('flex:1 1 auto;min-width:0;background:#fff;border:2px solid ' + (details ? LINE : '#b58500') + ';padding:9px 12px;min-height:44px;')}>
                {details
                  ? <span style={s('font-size:16px;font-weight:700;color:' + INK + ';overflow-wrap:anywhere;')}>{details}</span>
                  : <Missing text={b.detailsMissing || 'The type of health check'} />}
              </div>
              {/* It gets typed into a box on another screen, so it carries its
                  own Copy — the same argument every other copied value makes. */}
              {details && <CopyButton value={details} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
