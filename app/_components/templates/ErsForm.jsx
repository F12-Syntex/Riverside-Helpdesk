'use client';

// The e-RS "Search for a service" screen, drawn with the answer filled in.
//
// A referral is typed into that screen and nowhere else. The card used to show
// a table of labels — Speciality, Clinic type — and leave the reader to find
// the box each one goes in. Now the card IS the screen: the same headings, the
// same order, the same controls, with the practice's values already in them.
// The reader's eye lands on e-RS and on this in the same place.
//
// Nothing here is interactive. The radios and selects are pictures of the
// state the screen should end up in, not controls that do anything, and they
// are marked as such for a screen reader.
//
// Referring clinician is deliberately blank: it is whoever created the task,
// which this card cannot know.
import React from 'react';
import { s, Svg, Icons } from '../ui';
import CopyButton from './CopyButton';

const INK = '#212b32';
const LINE = '#4c6272';
const AMBER = '#8a6100';

// "2WW", "2 week wait", "two week" all tick the same radio.
function priorityOf(value) {
  const v = String(value || '').toLowerCase();
  if (/2\s*ww|two|2[\s-]*week/.test(v)) return '2-week wait';
  if (/urgent/.test(v)) return 'Urgent';
  return 'Routine';
}

function Label({ children }) {
  return <div style={s('font-size:15px;font-weight:700;color:' + INK + ';margin:0 0 6px;')}>{children}</div>;
}

function Step({ children }) {
  return <div style={s('font-size:17px;font-weight:700;color:' + INK + ';margin:0 0 12px;')}>{children}</div>;
}

// A select box in the state it should be left in. A value the practice does
// not record is said IN the box, in amber, so an empty box never reads as
// "leave this blank".
function Select({ value, missing, placeholder = 'Select an option', copy = false }) {
  const has = !!value;
  return (
    <div style={s('display:flex;align-items:center;gap:10px;')}>
      <div role="img" aria-label={has ? value : (missing || placeholder)}
        style={s('flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 10px 6px 12px;background:#fff;border:2px solid ' + (has || !missing ? LINE : '#b58500') + ';')}>
        {has ? (
          <span style={s('flex:1;min-width:0;font-size:16px;font-weight:700;color:' + INK + ';overflow-wrap:anywhere;')}>{value}</span>
        ) : missing ? (
          <span style={s('flex:1;min-width:0;display:flex;gap:7px;align-items:center;font-size:14.5px;font-weight:600;color:' + AMBER + ';')}>
            <Svg w={15} stroke="#b58500" sw={2.2} style={s('flex:none;')}>{Icons.alertCircle}</Svg>{missing}
          </span>
        ) : (
          <span style={s('flex:1;min-width:0;font-size:15px;color:#768692;')}>{placeholder}</span>
        )}
        <Svg w={16} stroke={INK} sw={2.4} style={s('flex:none;')}>{Icons.chevronDown}</Svg>
      </div>
      {has && copy && <CopyButton value={value} small />}
    </div>
  );
}

function Radio({ label, on }) {
  return (
    <div role="img" aria-label={label + (on ? ' (selected)' : '')} style={s('display:flex;align-items:center;gap:10px;')}>
      <span style={s('flex:none;width:24px;height:24px;border-radius:50%;border:2px solid ' + LINE + ';background:#fff;display:inline-flex;align-items:center;justify-content:center;')}>
        {on && <span style={s('width:12px;height:12px;border-radius:50%;background:' + INK + ';')} />}
      </span>
      <span style={s('font-size:16px;color:' + INK + ';font-weight:' + (on ? '700' : '400') + ';')}>{label}</span>
    </div>
  );
}

function Radios({ options, chosen }) {
  return (
    <div style={s('display:flex;flex-direction:column;gap:8px;')}>
      {options.map((o) => <Radio key={o} label={o} on={o === chosen} />)}
    </div>
  );
}

// A rule the practice records against a field: "Extended Scope only when the
// doctor has asked for it". Against the box it applies to.
function Condition({ text }) {
  return (
    <div style={s('display:flex;gap:7px;align-items:flex-start;margin-top:7px;font-size:13.5px;line-height:1.45;font-weight:500;color:' + AMBER + ';')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={14} stroke="#b58500" sw={2.2}>{Icons.alertCircle}</Svg></span>
      <span>{text}</span>
    </div>
  );
}

// `block` is the ers block from lib/templates/blocks.mjs, or anything with the
// same keys. `below` is rendered inside the screen's frame, under the form —
// the provenance of a determined pairing, on the prose path.
export default function ErsForm({ block, below = null }) {
  const b = block || {};
  const options = (b.clinicTypeOptions || []).filter(Boolean);
  const priority = priorityOf(b.priority);
  const requestType = /advice/i.test(String(b.requestType || '')) ? 'Advice' : 'Referral';
  const more = !!(b.hospital || b.pathway);
  const missing = b.missing || 'Not recorded — take it from the doctor’s task';

  return (
    <div style={s('border:1px solid #d8e1e5;border-radius:12px;background:#fff;overflow:hidden;')}>
      <div style={s('display:flex;align-items:center;gap:8px;padding:8px 16px;background:#005eb8;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>
        <Svg w={14} stroke="#fff" sw={2.4}>{Icons.check}</Svg>Set on e-RS
      </div>
      <div style={s('padding:16px 18px 18px;background:#f0f4f5;')}>
        <div style={s('font-size:20px;font-weight:700;color:' + INK + ';margin:0 0 14px;')}>Search for a service</div>

        <Step>Step 1: Confirm request details</Step>
        <div style={s('margin:0 0 14px;')}>
          <Label>Referring clinician</Label>
          <Select value="" placeholder="Select an option" />
          <div style={s('margin-top:5px;font-size:13px;color:#4c6272;')}>The doctor who created the task. Dr Goel if it came from someone who is not a doctor.</div>
        </div>
        <div style={s('margin:0 0 14px;')}>
          <Label>Request type</Label>
          <Radios options={['Referral', 'Advice']} chosen={requestType} />
        </div>
        <div style={s('margin:0 0 18px;')}>
          <Label>Priority</Label>
          <Radios options={['Routine', 'Urgent', '2-week wait']} chosen={priority} />
        </div>

        <Step>Step 2: Select service details</Step>
        <div style={s('margin:0 0 14px;')}>
          <Label>Specialty</Label>
          <Select value={b.specialty} missing={missing} copy />
        </div>
        <div style={s('margin:0 0 ' + (more ? '14px' : '4px') + ';')}>
          <Label>Clinic type</Label>
          {options.length > 1 ? (
            // The practice records a choice. Picking one for the reader is
            // exactly the thing that cannot be done safely, so both are shown.
            <div style={s('display:flex;flex-direction:column;gap:6px;')}>
              {options.map((o, i) => (
                <div key={o} style={s('display:flex;align-items:center;gap:8px;')}>
                  {i > 0 && <span style={s('flex:none;font-size:13px;font-weight:600;color:#768692;width:18px;')}>or</span>}
                  <div style={s('flex:1;min-width:0;')}><Select value={o} copy /></div>
                </div>
              ))}
            </div>
          ) : (
            <Select value={b.clinicType} missing={missing} copy />
          )}
          {b.clinicTypeCondition && <Condition text={b.clinicTypeCondition} />}
        </div>

        {more && (
          <div style={s('margin:0 0 4px;border-top:1px solid #d8e1e5;padding-top:12px;')}>
            <div style={s('display:flex;align-items:center;justify-content:space-between;font-size:17px;font-weight:700;color:' + INK + ';margin:0 0 12px;')}>
              <span>Add more search detail</span>
              <span style={s('font-size:22px;line-height:1;color:#005eb8;')}>&minus;</span>
            </div>
            {b.hospital && (
              <div style={s('margin:0 0 14px;')}>
                <Label>Organisation or site</Label>
                <Select value={b.hospital} copy />
              </div>
            )}
            {b.pathway && (
              <div style={s('margin:0 0 4px;')}>
                <Label>Service name</Label>
                <Select value={b.pathway} copy />
              </div>
            )}
          </div>
        )}

        <div style={s('display:flex;gap:10px;margin-top:16px;')} aria-hidden="true">
          <span style={s('display:inline-flex;align-items:center;padding:9px 18px;background:#007f3b;color:#fff;font-size:15px;font-weight:700;box-shadow:0 4px 0 #00401e;')}>Search</span>
          <span style={s('display:inline-flex;align-items:center;padding:9px 18px;background:#4c6272;color:#fff;font-size:15px;font-weight:700;box-shadow:0 4px 0 #263139;')}>Reset</span>
        </div>
      </div>
      {below}
    </div>
  );
}
