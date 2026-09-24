'use client';

// The EMIS "Test Requests" screen, drawn with the blood form filled in.
//
// A blood form is raised on that one screen, and the card used to be a list of
// test names the reader then had to go and find tick boxes for. Now the card IS
// the screen: the same two halves, in the same places. The tick boxes sit on
// the left under the screen's own section headings, and the Ordered Items list
// and the Clinical Details box sit on the right, where they are on EMIS.
//
// WHICH BOXES ARE DRAWN DEPENDS ON WHETHER THE CARD COULD TICK THEM. Where it
// could — a form the practice has recorded — only the ticked ones are here:
// redrawing the other ninety would put ninety things on the card that the
// reader is being told to leave alone. Where it could not, `offered` carries
// the form's own list and all of them are drawn, ticked and unticked, because
// then "which items do I select" is the question and the boxes are the answer.
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

// A box, exactly as the form shows one: the box, then the test. An unticked one
// is quieter but never greyed out — it is not disabled, it is a box the reader
// may be about to tick, and half the point of showing it is that they can read
// its exact wording.
function Box({ test, on }) {
  return (
    <div role="img" aria-label={test + (on ? ' (ticked)' : '')} style={s('display:flex;align-items:flex-start;gap:9px;padding:4px 0;')}>
      <span style={s('flex:none;width:19px;height:19px;border:2px solid ' + LINE + ';background:#fff;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}>
        {on && <Svg w={13} stroke="#007f3b" sw={3.2}>{Icons.check}</Svg>}
      </span>
      <span style={s('flex:1;min-width:0;font-size:' + (on ? '15px' : '14px') + ';font-weight:' + (on ? '700' : '400') + ';color:' + (on ? INK : LINE) + ';overflow-wrap:anywhere;')}>{test}</span>
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
  const ticked = (b.groups || []).filter((g) => g && (g.tests || []).length);
  const ordered = (b.ordered || []).filter(Boolean);
  const details = String(b.clinicalDetails || '').trim();

  // The sections to draw. The form's own list when the card has one — every
  // box, with the ticked ones ticked — and otherwise just what was ticked.
  const on = new Set(ticked.flatMap((g) => g.tests));
  const offered = (b.offered || []).filter((g) => g && (g.tests || []).length);
  const sections = offered.length
    ? offered.map((g) => ({
      heading: g.heading,
      // The form's own order, ticked in place. Floating the ticked ones to the
      // top would put the card's boxes in a different order from the screen's,
      // which is the one thing this block exists not to do. A ticked box the
      // list does not carry goes on the end rather than being dropped.
      tests: [...g.tests, ...(ticked.find((t) => t.heading === g.heading)?.tests || []).filter((t) => !g.tests.includes(t))],
    }))
    : ticked;

  return (
    <div style={s('border:1px solid #d8e1e5;border-radius:12px;background:#fff;overflow:hidden;')}>
      <div style={s('padding:8px 16px;background:#005eb8;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>
        On the blood form
      </div>
      <div style={s('padding:16px 18px 18px;background:#f0f4f5;')}>
        <div style={s('font-size:20px;font-weight:700;color:' + INK + ';margin:0 0 3px;')}>Test Requests</div>
        <div style={s('font-size:13.5px;color:' + LINE + ';margin:0 0 14px;')}>Order tab → {b.section || 'Pathology'}</div>

        <div style={s('display:flex;flex-wrap:wrap;gap:16px;')}>
          {/* The tick boxes, under the screen's own section headings so the
              reader can find each one without scrolling the whole form. */}
          <div style={s('flex:1 1 240px;min-width:0;')}>
            <Label>{offered.length ? (on.size ? 'Tick these' : 'The boxes on the form') : 'Tick these'}</Label>
            {sections.length ? sections.map((g) => (
              <div key={g.heading} style={s('margin:0 0 10px;background:#fff;border:2px solid ' + LINE + ';padding:8px 12px 10px;')}>
                <div style={s('font-size:13.5px;font-weight:700;color:' + LINE + ';margin:0 0 2px;')}>{g.heading}</div>
                {(g.tests || []).map((t) => <Box key={t} test={t} on={on.has(t)} />)}
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
